"""Send Motor C review candidates to Trabajo Cerca with GitHub Actions OIDC.
No long-lived tokens, paid providers, public repository or direct publishing.
"""
import json,os,pathlib,urllib.parse,urllib.request,urllib.error,base64
OUT=pathlib.Path(__file__).resolve().parents[1]/'output'
TARGET='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/api/internal/motor-c/import'
AUDIENCE='trabajo-cerca-motor-c-import'
def main():
 try:
  records=json.loads((OUT/'review_queue.json').read_text(encoding='utf8'))['items']
 except (OSError,ValueError,KeyError,TypeError):
  print('Motor C transfer: export not available');return
 oidc_url=os.getenv('ACTIONS_ID_TOKEN_REQUEST_URL','')
 oidc_auth=os.getenv('ACTIONS_ID_TOKEN_REQUEST_TOKEN','')
 if not oidc_url or not oidc_auth:
  print('Motor C transfer: GitHub OIDC unavailable');return
 request=urllib.request.Request(oidc_url+'&'+urllib.parse.urlencode({'audience':AUDIENCE}),
    headers={'Authorization':'Bearer '+oidc_auth,'Accept':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=12) as resp:token=json.load(resp)['value']
  totals={'submitted':0,'inserted':0,'duplicates':0,'rejected':0}
  for n in range(0,len(records),35):
   payload=json.dumps({'items':records[n:n+35]}).encode('utf8')
   upload=urllib.request.Request(TARGET,data=payload,method='POST',headers={
    'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
   with urllib.request.urlopen(upload,timeout=22) as resp:data=json.load(resp)
   totals['submitted']+=len(records[n:n+35])
   for key in ('inserted','duplicates','rejected'):totals[key]+=int(data.get(key,0))
  (OUT/'transfer_report.json').write_text(json.dumps({'status':'ok',**totals,'published':0},indent=2),encoding='utf8')
  print('Motor C transfer:',totals)
 except urllib.error.HTTPError as exc:
  detail=exc.read(400).decode('utf8','replace')
  try:
   p=token.split('.')[1]
   claims=json.loads(base64.urlsafe_b64decode(p+'='*((-len(p))%4)))
   diagnostics={k:claims.get(k) for k in ('iss','aud','repository','ref','workflow_ref')}
  except Exception: diagnostics={}
  (OUT/'transfer_report.json').write_text(json.dumps({'status':'http_rejected','http_code':exc.code,'detail':detail[:300],'claims_diagnostic':diagnostics,'published':0},indent=2),encoding='utf8')
  print('Motor C transfer rejected:',exc.code,detail[:180])
 except Exception as exc:
  (OUT/'transfer_report.json').write_text(json.dumps({'status':'error','reason':str(exc)[:200],'published':0},indent=2),encoding='utf8')
  print('Motor C transfer failed:',str(exc)[:160])
if __name__=='__main__':main()
