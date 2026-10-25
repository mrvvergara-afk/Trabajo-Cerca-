"""Capture bounded primary HTML and its explicitly advertised public date metadata.

No PDF/OCR, credentials, remote job writer or inferred dates from upload paths.
"""
import json
import os
import re
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path

from .common import Budget, decode_public_html, parse_date, utcnow, write_json
from .document_queue_reader import restore_checkpoint, publish_evidence
from .local_source_audit import discover, same_publisher
from .public_document_http import PublicCapture, public_error
from .observe_site_inventory import main as observe_inventory
from .ssan_primary_index import parse_index

ROOTS = [
    'https://www.munimulchen.cl/oferta-laboral-profesional-area-construccion-oficina-tecnica-mulchen/',
    'https://www.munimulchen.cl/oferta-laboral-conductores-profesionales-con-corma/',
    'https://www.munimulchen.cl/oferta-laboral-labores-de-campo-y-cuidado-de-parcela/',
    'https://ssan.redsalud.gob.cl/trabaje-con-nosotros/',
    'https://ssan.redsalud.gob.cl/trabaje-con-nosotros/?e-page-c179c1f=2',
    'https://ssan.redsalud.gob.cl/trabaje-con-nosotros/?e-page-c179c1f=3',
]


class MetadataLinks(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='link' and a.get('type')=='application/json' and 'alternate' in a.get('rel','').split():
            self.links.append(a.get('href',''))


def metadata_address(raw, origin):
    parser=MetadataLinks();parser.feed(decode_public_html(raw))
    values=[]
    for href in parser.links:
        value=urllib.parse.urljoin(origin,href);parts=urllib.parse.urlsplit(value)
        if same_publisher(origin,value) and re.fullmatch(r'/wp-json/wp/v2/(?:pages|posts)/[1-9]\d*',parts.path) and not parts.query:
            values.append(value)
    return values[0] if len(set(values))==1 else None


def original_metadata(value,origin):
    if not isinstance(value,dict) or value.get('status')!='publish' or not same_publisher(origin,value.get('link','')):
        return None
    left=urllib.parse.urlsplit(origin);right=urllib.parse.urlsplit(value['link'])
    if left.path.rstrip('/')!=right.path.rstrip('/'):return None
    stamp=parse_date(str(value.get('date_gmt') or '')+'Z')
    return stamp.isoformat() if stamp and stamp<=utcnow() else None


def capture_sources(output, *, fetcher=None, budget=None):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    capture=fetcher or PublicCapture(output);budget=budget or Budget(180)
    rows=[]
    for url in ROOTS:
        if budget.remaining()<2:break
        row={'url':url,'verified':False,'published':0}
        try:
            raw,final,mime,status=capture(url,budget)
            if 'html' not in mime:raise ValueError('primary_page_not_html')
            page=discover(decode_public_html(raw),final)
            row.update(html_sha256=capture.put(raw),http=status,text=page['text'],
                       source_published_at=page.get('source_published_at'),images=page['images'],
                       candidates=page['candidates'])
            if urllib.parse.urlsplit(final).hostname=='ssan.redsalud.gob.cl':
                row['individual_notices']=parse_index(decode_public_html(raw),final,row['html_sha256'])
                meta=None
            else:meta=metadata_address(raw,final)
            if meta:
                try:
                    data,address,mime,status=capture(meta,budget)
                    original=original_metadata(json.loads(data),final)
                    row.update(metadata_url=address,metadata_sha256=capture.put(data),
                               metadata_original_published_at=original)
                except Exception as exc:row['metadata_error']=public_error(exc)
        except Exception as exc:row['error']=public_error(exc)
        rows.append(row)
    report={'schema':'trabajo-cerca.primary-source-discovery.v1','checked_at':utcnow().isoformat(),
            'sources':rows,'requests':capture.requests,'new_offers_confirmed':0,'published':0,'paid_provider_calls':0}
    write_json(output/'primary-source-proof.json',report)
    return report


def main():
    if (os.environ.get('GITHUB_REPOSITORY')!='mrvvergara-afk/Trabajo-Cerca-' or
        os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17'):
        raise ValueError('authorized_repair_branch_required')
    observe_inventory()
    output=Path('output/primary-source-discovery')
    report=capture_sources(output)
    parent,checkpoint=restore_checkpoint()
    for path in Path('output/site-inventory').glob('*.json'):
        (output/path.name).write_bytes(path.read_bytes())
    run=os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    commit=publish_evidence(output,checkpoint,parent,run)
    print('PRIMARY_SOURCE_PROOF '+json.dumps({**report,'data_commit':commit},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
