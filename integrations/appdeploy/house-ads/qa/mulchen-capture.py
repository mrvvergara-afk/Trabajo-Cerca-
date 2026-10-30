import urllib.request, urllib.robotparser, json, hashlib, pathlib, datetime
out=pathlib.Path('qa-output/mulchen');out.mkdir(parents=True,exist_ok=True)
origin='https://www.munimulchen.cl'
paths={'source':'/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/','index':'/pagina-central-ofertas-laborales/','metadata':'/wp-json/wp/v2/pages/17979'}
report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'platformWrites':0,'sources':{}}
try:
 r=urllib.request.urlopen(urllib.request.Request(origin+'/robots.txt',headers={'User-Agent':'TrabajoCercaVerifierQA/1.0'}),timeout=15)
 policy=urllib.robotparser.RobotFileParser();policy.parse(r.read(100000).decode().splitlines())
 for key,path in paths.items():
  url=origin+path
  if not policy.can_fetch('TrabajoCercaVerifierQA',url):raise RuntimeError('robots_disallow '+path)
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'TrabajoCercaVerifierQA/1.0'}),timeout=20) as response:
    data=response.read(600001)
    if len(data)>600000:raise RuntimeError('byte_budget')
    if not response.url.startswith(origin+'/'):raise RuntimeError('redirect_origin')
    text=data.decode('utf-8')
    report['sources'][key]={'url':url,'finalUrl':response.url,'status':response.status,'raw':text,'sha256':hashlib.sha256(data).hexdigest()}
  except Exception as error:report['sources'][key]={'url':url,'error':str(error)}
except Exception as error:report['error']=str(error)
(out/'official-live.json').write_text(json.dumps(report,ensure_ascii=False))
compact={**report,'sources':{key:{field:value for field,value in item.items() if field!='raw'} for key,item in report['sources'].items()}}
if report['sources'].get('metadata',{}).get('raw'):
 m=json.loads(report['sources']['metadata']['raw']);compact['originalMetadata']={k:m.get(k) for k in ['id','type','status','link','date_gmt','modified_gmt']}
print('MULCHEN_OFFICIAL_LIVE '+json.dumps(compact,ensure_ascii=False))
