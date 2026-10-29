"""Instagram oficial: Business Discovery autorizado; nunca accede a historias ajenas ni elude bloqueos."""
import datetime as dt, hashlib, json, os, pathlib, urllib.parse, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/"output";OUT.mkdir(exist_ok=True)
PROFILES=[
 ("OMIL Victoria","omil_victoria"),("OMIL Nacimiento","omilnacimiento"),
 ("Hospital Angol","hospital_angol"),("Salud Araucania Norte","saludaraucanianorte")
]
KEYWORDS=("oferta laboral","postulaci","buscamos","trabaja con","se requiere","reclutamiento","vacantes","cosecha","packing","reemplazos","concurso")
START=dt.datetime(2026,9,12,tzinfo=dt.timezone.utc)
def run():
 now=dt.datetime.now(dt.timezone.utc).isoformat()
 token=os.environ.get("META_ACCESS_TOKEN","").strip()
 account=os.environ.get("META_IG_BUSINESS_ACCOUNT_ID","").strip()
 report={"checked_at":now,"source":"official_meta_business_discovery","profiles":len(PROFILES),
         "status":"configured" if token and account else "needs_meta_authorization",
         "posts_accessible":0,"candidates":0,"missing_access":[],"errors":[]}
 candidates=[]
 if token and account:
  for name,user in PROFILES:
   fields=f"business_discovery.username({user}){{username,media.limit(50){{id,caption,timestamp,permalink,media_type}}}}"
   url="https://graph.facebook.com/v24.0/"+urllib.parse.quote(account,safe="")+"/?"+urllib.parse.urlencode({"fields":fields})
   req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token,"User-Agent":"TrabajoCerca-MotorC/1.0"})
   try:
    with urllib.request.urlopen(req,timeout=18) as response:data=json.load(response)
    media=data.get("business_discovery",{}).get("media",{}).get("data",[])
    report["posts_accessible"]+=len(media)
    for post in media:
     stamp=post.get("timestamp","")
     try:published=dt.datetime.fromisoformat(stamp.replace("Z","+00:00"))
     except ValueError:continue
     if published<START or published>dt.datetime.now(dt.timezone.utc):continue
     caption=post.get("caption") or ""
     if not any(word in caption.lower() for word in KEYWORDS):continue
     link=post.get("permalink","")
     if not link.startswith("https://www.instagram.com/"):continue
     candidates.append({"id":hashlib.sha256((user+post.get("id","")).encode()).hexdigest()[:24],
       "source":name,"username":user,"url":link,"original_date":published.date().isoformat(),
       "text":caption[:3500],"type":post.get("media_type"),"status":"needs_worksite_and_open_application_verification",
       "publicable":False})
   except Exception as exc:
    report["missing_access"].append(user)
    report["errors"].append({"source":name,"reason":str(exc)[:150]})
 else:
  report["missing_access"]=[user for _,user in PROFILES]
 report["candidates"]=len(candidates)
 (OUT/"instagram_candidates.json").write_text(json.dumps(candidates,ensure_ascii=False,indent=2),encoding="utf-8")
 (OUT/"instagram_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps({"instagram_status":report["status"],"posts":report["posts_accessible"],"candidates":len(candidates)}))
if __name__=="__main__":run()
