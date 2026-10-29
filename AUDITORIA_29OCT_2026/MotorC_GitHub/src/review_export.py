"""Export candidates for Trabajo Cerca private review import. Never mark published/verified."""
import pathlib,json,hashlib,urllib.parse,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'output';OUT.mkdir(exist_ok=True)
ALLOWED={'chiletrabajos.cl','kitempleo.cl','traiguencity.cl','malleco7.cl','munimulchen.cl','municipalidadcollipulli.cl','municipalidadrenaico.cl','muninegrete.cl','mtraiguen.cl','munilumaco.cl','munipuren.cl','muniercilla.cl','victoriachile.cl','nacimiento.cl','munilossauces.cl','noticias.angol.cl','radionativa.cl','radioviaducto.cl','lasnoticiasdemalleco.cl','bne.gob.cl','empleospublicos.cl','sence.gob.cl','ssan.redsalud.gob.cl'}
TOWNS={'angol':'Angol','collipulli':'Collipulli','ercilla':'Ercilla','renaico':'Renaico','mininco':'Mininco','los sauces':'Los Sauces','puren':'Purén','purén':'Purén','traiguen':'Traiguén','traiguén':'Traiguén','lumaco':'Lumaco','nacimiento':'Nacimiento','negrete':'Negrete','mulchen':'Mulchén','mulchén':'Mulchén','victoria':'Victoria'}
def read(name):
 try:
  a=json.loads((OUT/name).read_text(encoding='utf-8'))
  return a if isinstance(a,list) else []
 except (ValueError,OSError):return []
def valid(url):
 try:
  p=urllib.parse.urlsplit(url)
  return p.scheme=='https' and p.hostname and p.hostname.lower().removeprefix('www.') in ALLOWED and not (p.username or p.password or p.port)
 except ValueError:return False
def main():
 rows=[];seen=set();skipped={};unresolved=[]
 for file in ('candidates.json','rss_candidates.json','social_intake_candidates.json'):
  for cand in read(file):
   url=str(cand.get('url') or cand.get('source_url') or '')
   if not valid(url):
    skipped['source_not_in_approved_inbox_allowlist']=skipped.get('source_not_in_approved_inbox_allowlist',0)+1;continue
   label=str(cand.get('title_hint') or cand.get('job_title') or '').casefold()
   town=str(cand.get('workplace') or cand.get('town_query') or '').casefold().strip()
   if not town:
    confirmed=cand.get('workplace_candidates') or []
    confirmed=[name for name in confirmed if isinstance(name,str) and name in TOWNS]
    if len(set(confirmed))==1:town=confirmed[0]
   if not town:
    matching=[name for token,name in TOWNS.items() if token in label]
    town=matching[0].casefold() if len(set(matching))==1 else ''
   if town not in TOWNS:
    skipped['workplace_unconfirmed']=skipped.get('workplace_unconfirmed',0)+1
    unresolved.append({'source_url':url,'title_hint':label,'source_file':file,'workplace_candidates':cand.get('workplace_candidates',[])})
    continue
   key=hashlib.sha256(('motor-c|'+url+'|'+label).encode()).hexdigest()[:22]
   if key in seen:continue
   seen.add(key)
   date=cand.get('date_original') or cand.get('original_date')
   if not isinstance(date,str) or len(date)!=10:date=None
   rows.append({'candidate_key':key,'url':url,'source_id':'motor-c:'+file.replace('.json',''),
     'status':'revision_obligatoria','reported_territories':[TOWNS[town]],
     'published_date_evidence':date,'deadline_evidence':None})
 (OUT/'unresolved_workplace.json').write_text(json.dumps(unresolved,ensure_ascii=False,indent=2),encoding='utf8')
 (OUT/'review_queue.json').write_text(json.dumps({'items':rows},ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'review_export_report.json').write_text(json.dumps({'prepared_for_private_import':len(rows),'skipped':skipped,'auto_published':0,'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'review_export':len(rows),'skipped':skipped}))
if __name__=='__main__':main()
