"""Bounded, unpaid public-source audit. Evidence is preserved; this module never publishes."""
import csv
import hashlib
import html
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

try:
    from .common import Budget, canonical_url, communes, parse_date, safe_error, utcnow, write_json
    from .observe_laboratory import ProofElement
except ImportError:
    from common import Budget, canonical_url, communes, parse_date, safe_error, utcnow, write_json
    from observe_laboratory import ProofElement

HIRING = re.compile(r'ofertas? laboral(?:es)?|vacantes?|se (?:busca|necesita|requiere)|buscamos personal|enviar? (?:cv|curr[ií]culum)|postulaci[oó]n|concurso.{0,25}(?:cargo|p[uú]blico)|omil', re.I)
NON_JOB = re.compile(r'capacitaci[oó]n|curso gratuito|subsidio|beca|licitaci[oó]n|bases de licitaci[oó]n', re.I)
MEDIA = re.compile(r'\.(?:pdf|png|jpe?g|webp)(?:\?|$)', re.I)
EMAIL = re.compile(r'[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,15}', re.I)
PHONE = re.compile(r'(?<!\d)(?:\+?56[\s-]*)?(?:9(?:[\s-]*\d){8}|(?:43|45)(?:[\s-]*\d){7})(?!\d)')
APP_URL = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/'


def public_medium_url(value):
    """Recognize media paths and Lumaco's public Joomla download endpoint.

    A download query is media work, never a new offer identity or a date.
    """
    try:
        url = urllib.parse.urlsplit(canonical_url(value))
        if MEDIA.search(url.path):return True
        pairs = urllib.parse.parse_qsl(url.query, keep_blank_values=True)
        query = dict(pairs)
        return (url.hostname.removeprefix('www.') == 'munilumaco.cl'
                and url.path == '/index.php/component/phocadownload/category/1-concursos'
                and len(pairs) == len(query)
                and set(query) <= {'Itemid', 'download'}
                and bool(re.fullmatch(r'[1-9]\d{0,8}(?::[a-z0-9-]+)?', query.get('download', ''), re.I))
                and ('Itemid' not in query or bool(re.fullmatch(r'[1-9]\d{0,8}', query['Itemid']))))
    except (ValueError, TypeError, AttributeError):return False


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.body, self.links, self.images, self.dates = '', [], [], [], []
        self.embedded_documents = []
        self.image_labels = {}
        self.in_title, self.skip, self.href, self.label = False, [], None, []
        self.ld, self.script, self.schemas = False, [], []
        self.article_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article': self.article_depth += 1
        if tag == 'time' and self.article_depth and attrs.get('datetime'): self.dates.append(attrs['datetime'])
        if tag == 'script':
            self.ld = attrs.get('type','').lower() == 'application/ld+json'
            self.script = []
        if tag in ('p','div','br','li','tr','h1','h2','h3','section','article') and not self.skip: self.body.append('\n')
        if tag == 'title': self.in_title = True
        if tag in ('script','style','nav','footer','header','aside'): self.skip.append(tag)
        if tag == 'meta':
            key = (attrs.get('property') or attrs.get('name') or '').lower()
            if key in ('article:published_time','datepublished','date') and attrs.get('content'):
                self.dates.append(attrs['content'])
            if key == 'og:image' and attrs.get('content'): self.images.append(attrs['content'])
        if tag == 'a': self.href, self.label = attrs.get('href'), []
        if tag in ('iframe','embed','object'):
            for key in ('data-emsrc','data-src','data','src'):
                value = attrs.get(key)
                if not value:continue
                try:
                    parsed = urllib.parse.urlsplit(value)
                    if parsed.path.lower().endswith('/viewer.html'):
                        value = urllib.parse.parse_qs(parsed.query).get('file',[''])[0]
                        parsed = urllib.parse.urlsplit(value)
                    if not parsed.path.lower().endswith('.pdf'):continue
                except ValueError:continue
                self.embedded_documents.append(value)
                self.links.append((value, attrs.get('title') or 'Documento PDF incrustado'))
        if tag == 'iframe' and attrs.get('src'):
            try:
                embedded = urllib.parse.urlsplit(attrs['src'])
                if (embedded.hostname or '').removeprefix('www.') in ('facebook.com','web.facebook.com','m.facebook.com') and embedded.path == '/plugins/page.php':
                    self.links.append((attrs['src'],'Facebook'))
            except ValueError: pass
        if tag == 'img' and not self.skip:
            image = attrs.get('data-src') or attrs.get('data-lazy-src') or attrs.get('src')
            if image:
                self.images.append(image)
                self.image_labels[image] = attrs.get('alt') or ''
            if self.href and attrs.get('alt'): self.label.append(attrs['alt'])

    def handle_endtag(self, tag):
        if tag == 'script' and self.ld:
            self.schemas.append(''.join(self.script));self.ld = False
        if tag == 'article': self.article_depth = max(0,self.article_depth-1)
        if tag == 'title': self.in_title = False
        if tag in ('p','div','li','tr','h1','h2','h3','section','article') and not self.skip: self.body.append('\n')
        if tag == 'a' and self.href:
            self.links.append((self.href, ' '.join(self.label).strip()))
            self.href, self.label = None, []
        if self.skip and self.skip[-1] == tag: self.skip.pop()

    def handle_data(self, value):
        if self.ld:self.script.append(value)
        if self.in_title: self.title += value
        if not self.skip and not self.in_title: self.body.append(value)
        if self.href: self.label.append(value)


def same_publisher(left, right):
    return urllib.parse.urlsplit(left).hostname.lower().removeprefix('www.') == urllib.parse.urlsplit(right).hostname.lower().removeprefix('www.')


def public_social_url(value):
    try:
        url = urllib.parse.urlsplit(canonical_url(value))
    except ValueError:
        return False
    host = url.hostname.lower().removeprefix('www.')
    return (host in ('facebook.com','web.facebook.com','m.facebook.com','instagram.com') and not re.search(r'/sharer|/share\.php|/dialog|/login|/accounts|/plugins', url.path, re.I))


def institutional_social_link(value, label):
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.hostname.removeprefix('www.') in ('facebook.com','web.facebook.com','m.facebook.com') and parsed.path == '/plugins/page.php':
            embedded = urllib.parse.parse_qs(parsed.query).get('href',[])
            if len(embedded) != 1: return None
            value = canonical_url(embedded[0])
        return value if public_social_url(value) and re.search(r'facebook|instagram|omil|municipalidad|radio|diario',label,re.I) else None
    except (ValueError,AttributeError): return None


def source_error(exc):
    if isinstance(exc,ValueError) and str(exc) in ('redirect_outside_publisher','source_byte_budget_exceeded','media_publisher_not_allowed','unsupported_media_type','unexpected_seed_type'):
        return str(exc)
    return safe_error(exc)


def discover(raw, url):
    parser = Document(); parser.feed(raw)
    candidates, social = {}, set()
    embedded = set()
    for value in parser.embedded_documents:
        try:embedded.add(canonical_url(urllib.parse.urljoin(url,value)))
        except ValueError:continue
    for href, label in parser.links:
        try: target = canonical_url(urllib.parse.urljoin(url, href))
        except ValueError: continue
        channel = institutional_social_link(target,label)
        if channel: social.add(channel)
        document = public_medium_url(target)
        document_label = document and re.search(r'\bbases?\b|decreto|concurso|convocatoria|descargar\s+pdf', label, re.I)
        if same_publisher(url,target) and (target in embedded or HIRING.search(label + ' ' + target) or document_label) and not NON_JOB.search(label):
            candidates[target] = {'url':target,'title':label[:300],'kind':'document' if document else 'page'}
    source_dates = list(parser.dates)
    for schema in parser.schemas:
        try:nodes = [json.loads(schema)]
        except (ValueError,TypeError):continue
        visited = 0
        while nodes and visited<2000:
            node = nodes.pop();visited += 1
            if isinstance(node,list):nodes.extend(node)
            elif isinstance(node,dict):
                types = node.get('@type',[])
                types = types if isinstance(types,list) else [types]
                entity = node.get('mainEntityOfPage')
                entity = entity.get('@id') if isinstance(entity,dict) else entity
                for candidate in [node.get('url'),entity]:
                    try:matched = candidate and canonical_url(urllib.parse.urljoin(url,candidate))==canonical_url(url)
                    except (ValueError,TypeError):matched = False
                    if matched and any(kind in types for kind in ('Article','NewsArticle','BlogPosting','JobPosting')):
                        source_dates.append(node.get('datePublished') or node.get('datePosted'));break
                nodes.extend(value for value in node.values() if isinstance(value,(dict,list)))
    dates = {value.isoformat() for value in (parse_date(date) for date in source_dates) if value}
    body=re.sub(r'[ \t\r\f\v]+',' ', ''.join(parser.body))
    body=re.sub(r'\n[ \t]*\n+','\n',body).strip()
    return {'title':parser.title.strip()[:300],'text':body[:14000],
            'candidates':list(candidates.values())[:12], 'public_social_links':sorted(social)[:12],
            'images':list(dict.fromkeys(urllib.parse.urljoin(url,image) for image in parser.images))[:20],
            'image_labels':{urllib.parse.urljoin(url,image):label for image,label in list(parser.image_labels.items())[:20]},
            'source_published_at':next(iter(dates)) if len(dates)==1 else None}


class PublisherRedirectGuard(urllib.request.HTTPRedirectHandler):
    def __init__(self, original):
        super().__init__(); self.original = original

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not same_publisher(self.original,newurl) or urllib.parse.urlsplit(newurl).scheme not in ('http','https'):
            raise ValueError('redirect_outside_publisher')
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def fetch_public(url, budget, max_bytes=900000):
    url = canonical_url(url)
    timeout = min(8,budget.remaining())
    if timeout <= 0: raise TimeoutError('audit budget exhausted')
    opener = urllib.request.build_opener(PublisherRedirectGuard(url))
    request = urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; TrabajoCercaLocalAudit/1.0)',
      'Accept':'text/html,application/pdf,image/jpeg,image/png,image/webp'})
    with opener.open(request,timeout=timeout) as response:
        data = response.read(max_bytes+1)
        if len(data)>max_bytes: raise ValueError('source_byte_budget_exceeded')
        return data,response.geturl(),response.headers.get_content_type(),response.status


def evidence_fields(text, published_at=None):
    contacts = sorted(set(EMAIL.findall(text)))
    phones = sorted(set(value.strip() for value in PHONE.findall(text) if len(re.sub(r'\D','',value)) in (8,9,11)))
    def labeled(pattern):
        match = re.search(pattern,text,re.I | re.M)
        return match.group(1).strip()[:300] if match else None
    role = labeled(r'(?:^|\n)\s*(?:cargo|puesto|vacante|se (?:necesita|requiere|busca)|buscamos)\s*[:\-]?\s*([^\n]{3,120})')
    company = labeled(r'(?:^|\n)\s*(?:empresa|empleador|empresa ofertante)\s*[:\-]\s*([^\n]{3,120})')
    workplace = labeled(r'(?:lugar de trabajo|ubicaci[oó]n de (?:la )?faena|trabajo en|faena en)\s*[:\-]?\s*([^\n]{3,140})')
    place = communes(workplace or '')
    date = parse_date(published_at)
    missing = [name for name,value in [('cargo',role),('empresa',company),('lugar_real',place),('contacto',contacts or phones),('fecha_original',date)] if not value]
    return {'role':role,'company':company,'workplace_evidence':workplace,'work_communes':place,
            'emails':contacts[:5],'phones':phones[:5], 'source_published_at':date.isoformat() if date else None,
            'missing':missing, 'hiring_language':bool(HIRING.search(text)), 'published':False}


def tesseract_text(path, budget, *, segmentation=6):
    if segmentation not in (4,6):raise ValueError('unsupported_ocr_segmentation')
    if not shutil.which('tesseract'): raise RuntimeError('local_ocr_not_installed')
    languages = subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True,timeout=5,check=True).stdout
    available=set(languages.splitlines())
    language='+'.join(value for value in ('spa','eng') if value in available)
    if not language:raise RuntimeError('local_ocr_language_unavailable')
    result = subprocess.run(['tesseract',str(path),'stdout','-l',language,'--psm',str(segmentation),'-c','tessedit_create_tsv=1'],
      capture_output=True,text=True,timeout=min(18,max(1,budget.remaining())),check=True)
    groups,confidence = {},[]
    # Tesseract TSV is not CSV-quoted. A literal quote in a word must never absorb
    # later rows (and turn bounding-box coordinates into apparent phone numbers).
    reader=csv.DictReader(io.StringIO(result.stdout),delimiter='\t',quoting=csv.QUOTE_NONE)
    if not reader.fieldnames or not {'level','text','conf','page_num','block_num','par_num','line_num'}<=set(reader.fieldnames):
        raise RuntimeError('local_ocr_tsv_unavailable')
    for row in reader:
        if row.get('level')!='5' or None in row:continue
        word = row.get('text','').strip()
        try: score = float(row.get('conf','-1'))
        except ValueError: continue
        if word and 0<=score<=100:
            key = tuple(row.get(name) for name in ('page_num','block_num','par_num','line_num'))
            groups.setdefault(key,[]).append(word);confidence.append(score)
    full_text = '\n'.join(' '.join(words) for words in groups.values())
    return {'text':full_text[:18000],'textTruncated':len(full_text)>18000,'textOriginalLength':len(full_text),
            'mean_confidence':round(sum(confidence)/len(confidence),1) if confidence else None,'language':language,'engine':'tesseract-local','parser':'tesseract-tsv-literal-v2',
            'segmentation':segmentation}


def read_medium(url, source_url, budget):
    host = urllib.parse.urlsplit(url).hostname or ''
    if not same_publisher(url,source_url) and not re.search(r'\.(fbcdn\.net|cdninstagram\.com)$',host):
        raise ValueError('media_publisher_not_allowed')
    data,final,mime,status = fetch_public(url,budget,max_bytes=8*1024*1024)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)/('evidence.pdf' if mime=='application/pdf' else 'evidence.image')
        path.write_bytes(data)
        if mime=='application/pdf':
            if not shutil.which('pdftotext'): raise RuntimeError('local_pdf_reader_not_installed')
            result = subprocess.run(['pdftotext','-f','1','-l','4','-layout',str(path),'-'],
              capture_output=True,text=True,timeout=min(15,max(1,budget.remaining())),check=True)
            page_count = None
            if shutil.which('pdfinfo'):
                info = subprocess.run(['pdfinfo',str(path)],capture_output=True,text=True,timeout=min(5,max(1,budget.remaining())),check=True)
                count = re.search(r'^Pages:\s*(\d+)',info.stdout,re.M)
                page_count = int(count[1]) if count else None
            extracted = {'text':result.stdout[:18000],'textTruncated':len(result.stdout)>18000,
                         'textOriginalLength':len(result.stdout),'engine':'pdftotext-local','pages_limit':4,
                         'page_count':page_count,'complete_document':bool(page_count and page_count<=4)}
            if len(extracted['text'].strip())<100:
                if not shutil.which('pdftoppm'): raise RuntimeError('local_pdf_rasterizer_not_installed')
                prefix = Path(directory)/'page'
                raster_pages = page_count if page_count and page_count <= 4 else 1
                subprocess.run(['pdftoppm','-f','1','-l',str(raster_pages),'-scale-to','1800','-png',str(path),str(prefix)],
                  capture_output=True,timeout=min(15,max(1,budget.remaining())),check=True)
                images=sorted(Path(directory).glob('page-*.png'))
                if not images: raise ValueError('pdf_image_unavailable')
                pages=[tesseract_text(image,budget) for image in images]
                text='\n'.join(page['text'] for page in pages)
                extracted={'text':text[:18000],'textTruncated':len(text)>18000 or any(page['textTruncated'] for page in pages),
                  'textOriginalLength':sum(page['textOriginalLength'] for page in pages),
                  'engine':'tesseract-local','mean_confidence':min(page['mean_confidence'] or 0 for page in pages),
                  'pages_limit':raster_pages,'page_count':page_count,'pages_read':len(pages),
                  'complete_document':bool(page_count and page_count<=4 and len(pages)==page_count)}
        elif mime in ('image/jpeg','image/png','image/webp'):
            extracted=tesseract_text(path,budget);extracted['complete_document']=not extracted['textTruncated']
        else: raise ValueError('unsupported_media_type')
    return {**extracted,'url':url,'final_url':final,'mime':mime,'http_status':status,
            'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


def saved_social_evidence(output, *, max_pages=6, cursor=None):
    browser=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not browser: raise RuntimeError('readonly_browser_unavailable')
    all_items,pages=[],[]
    for page in range(max_pages):
        suffix='&local-cursor='+urllib.parse.quote(cursor,safe='') if cursor else ''
        url=APP_URL+'?radar-local-proof=1'+suffix+'#operacion'
        with tempfile.TemporaryDirectory() as directory:
            environment={key:value for key,value in os.environ.items() if key not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')}
            result=subprocess.run([browser,'--headless','--disable-gpu','--no-first-run','--disable-background-networking',
              '--user-data-dir='+directory,'--virtual-time-budget=15000','--dump-dom',url],
              capture_output=True,text=True,timeout=75,env=environment,check=True)
        parser=ProofElement('radar-local-check');parser.feed(result.stdout)
        if not parser.parts: raise RuntimeError('existing_evidence_read_unavailable')
        value=json.loads(''.join(parser.parts))
        if value.get('schema')!='trabajo-cerca.existing-local-evidence.v1' or value.get('readOnly') is not True or value.get('providerCalls')!=0:
            raise ValueError('untrusted_existing_evidence_result')
        write_json(output/('social-evidence-page-'+str(page+1)+'.json'),value)
        all_items.extend(value['items']);pages.append({'page':page+1,**value['stats'],'hasMore':value['hasMore'],
          'runs':[{'source':row['sourceName'],'status':row['status'],'posts':row['posts'],'imagesRead':row['imagesRead'],
                   'jobNotices':row['jobNotices'],'findingsKnown':row['findingsKnown']} for row in value['items']]})
        print('LOCAL_CAPTURE_PAGE '+json.dumps(pages[-1]),flush=True)
        cursor=value.get('nextCursor')
        write_json(output/'social-checkpoint.json',{'schema':'trabajo-cerca.local-evidence-checkpoint.v1',
          'nextCursor':cursor,'checked_at':utcnow().isoformat(),'complete':not cursor})
        if not cursor: break
    return {'items':all_items,'pages':pages,'remaining_pages':bool(cursor),'coverage_complete':not cursor}


def run(output, *, fetcher=fetch_public, config=None):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    config=config or json.loads(Path('config/local-source-priorities.json').read_text())
    budget=Budget(240);sources,candidates=[],[]
    for source in config['sources']:
        if budget.remaining()<=0:
            sources.append({**source,'access':'deferred','reason':'bounded_budget_exhausted'});continue
        try:
            raw,final,mime,status=fetcher(source['url'],budget)
            if mime not in ('text/html','application/xhtml+xml'): raise ValueError('unexpected_seed_type')
            page=discover(raw.decode('utf-8','replace'),final)
            access='public_page_read'
            if source['family']=='social' and not page['candidates'] and re.search(r'log in|iniciar sesi[oó]n|inicia sesi[oó]n|registrarte|sign up',page['text'],re.I):
                access='login_or_public_content_unavailable'
            record={**source,'access':access,'http':status,'final_url':final,'page_title':page['title'],
              'candidate_links':page['candidates'],'social_links_from_page':page['public_social_links'],
              'source_published_at':page['source_published_at']}
            sources.append(record)
            for candidate in page['candidates']:candidates.append({**candidate,'source':source['name'],'source_key':source['key'],
              'family':source['family'],'territory_hint':source['territory'],'published':False})
            write_json(output/('seed-'+source['key']+'.json'),page)
        except Exception as exc:
            sources.append({**source,'access':'unavailable','reason':source_error(exc)})
        print('LOCAL_SOURCE_ACCESS '+json.dumps(sources[-1],ensure_ascii=False),flush=True)
    evidence=[]
    specific=[row for row in candidates if not re.search(r'/concursos-publicos/?$|intermediacion-laboral|fiestas-patrias|feria-navidena',row['url'],re.I)]
    for candidate in list({row['url']:row for row in specific}.values())[:6]:
        if budget.remaining()<5:break
        try:
            if MEDIA.search(candidate['url']):
                extracted=read_medium(candidate['url'],candidate['url'],budget)
                fields=evidence_fields(extracted['text'])
                item={**candidate,**extracted,'fields':fields}
            else:
                raw,final,mime,status=fetcher(candidate['url'],budget)
                page=discover(raw.decode('utf-8','replace'),final)
                item={**candidate,'final_url':final,'http':status,'page':page,
                  'fields':evidence_fields(page['text'],page['source_published_at'])}
            evidence.append(item)
            print('LOCAL_SOURCE_EVIDENCE '+json.dumps({'url':candidate['url'],'source':candidate['source'],
              'fields':item['fields'],'text':item.get('page',item).get('text','')[:10000],
              'images':item.get('page',{}).get('images',[])[:6]},ensure_ascii=False),flush=True)
        except Exception as exc:evidence.append({**candidate,'read_error':source_error(exc)})
    attachment_reads=0
    for item in evidence:
        if attachment_reads>=2 or budget.remaining()<20:break
        images=item.get('page',{}).get('images',[])
        targets=[url for url in images if re.search(r'afiches?|concurso|oferta|vacante',url,re.I) and not re.search(r'logo|banner|searchbutton',url,re.I)]
        for url in targets[:1]:
            attachment_reads+=1
            try:
                extracted=read_medium(url,item['url'],budget)
                fields=evidence_fields(extracted['text'],item['page']['source_published_at'])
                item.setdefault('public_attachments',[]).append({**extracted,'fields':fields})
                print('LOCAL_PUBLIC_POSTER_READ '+json.dumps({'source':item['source'],'post_url':item['url'],
                  'media_url':url,'engine':extracted['engine'],'mean_confidence':extracted.get('mean_confidence'),
                  'fields':fields,'text':extracted['text'][:4000]},ensure_ascii=False),flush=True)
            except Exception as exc:item.setdefault('public_attachments',[]).append({'url':url,'read_error':source_error(exc)})
    summary={'schema':'trabajo-cerca.local-source-audit.v1','checked_at':utcnow().isoformat(),
      'source_access':sources,'candidates':candidates,'evidence':evidence,'coverage_complete':False,
      'published':0,'paid_provider_calls':0,'unresolved_requested_sources':config['unresolved_requested_sources']}
    write_json(output/'local-source-audit.json',summary)
    return summary


def main():
    output=Path('output/local-source-audit');output.mkdir(parents=True,exist_ok=True)
    checkpoint=Path('state/local-social-checkpoint.json')
    previous=json.loads(checkpoint.read_text()) if checkpoint.exists() else None
    if previous and previous.get('schema')!='trabajo-cerca.local-evidence-checkpoint.v1':
        raise ValueError('invalid_local_evidence_checkpoint')
    captured=saved_social_evidence(output,cursor=previous.get('nextCursor') if previous else None)
    write_json(output/'existing-social-evidence.json',captured)
    summary=run(output)
    budget=Budget(90);media=[]
    findings=[(run,finding) for run in captured['items'] for finding in run.get('findings',[]) if finding.get('mediaUrl') and finding.get('postUrl')]
    findings.sort(key=lambda pair:pair[1].get('postDate') or '',reverse=True)
    for source,finding in findings[:3]:
        try:
            extracted=read_medium(finding['mediaUrl'],finding['postUrl'],budget)
            row={'source':source['sourceName'],'post_url':finding['postUrl'],'post_date':finding['postDate'],
              'original_saved_text_length':len(finding.get('text','')),'ocr':extracted,
              'fields':evidence_fields(extracted['text'],finding['postDate'])}
            media.append(row)
            print('LOCAL_POSTER_READ '+json.dumps({k:v for k,v in row.items() if k!='ocr'},ensure_ascii=False),flush=True)
        except Exception as exc:media.append({'source':source['sourceName'],'post_url':finding['postUrl'],'read_error':safe_error(exc)})
    write_json(output/'existing-posters-ocr.json',media)
    print('LOCAL_SOURCE_AUDIT '+json.dumps({'sources_checked':len(summary['source_access']),
      'candidate_links':len(summary['candidates']),'captured_runs_read':len(captured['items']),
      'captured_pages_remaining':captured['remaining_pages'],'media_read':sum('ocr' in row for row in media),
      'municipal_media_read':sum(bool(row.get('engine'))+sum(bool(medium.get('engine')) for medium in row.get('public_attachments',[])) for row in summary['evidence']),
      'paid_provider_calls':0,'published':0}),flush=True)


if __name__=='__main__':main()
