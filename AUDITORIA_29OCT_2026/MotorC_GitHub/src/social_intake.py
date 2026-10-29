"""Intake for job leads supplied lawfully by source accounts or administrators.
No Instagram login, scraping or copying third-party media.
"""
import datetime as dt, hashlib, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
IN=ROOT/"input"/"social_submissions.json"
OUT=ROOT/"output";OUT.mkdir(exist_ok=True)
TOWNS={"angol","collipulli","ercilla","renaico","mininco","los sauces","purén","puren","traiguén","traiguen","lumaco","nacimiento","negrete","mulchén","mulchen","victoria"}
START=dt.date(2026,9,12)
def run():
 received=[];review=[];outside=[];past=[]
 try:
  incoming=json.loads(IN.read_text(encoding="utf-8")) if IN.exists() else []
  if not isinstance(incoming,list):raise ValueError("input must be array")
 except (ValueError, OSError) as error:
  (OUT/"social_intake_report.json").write_text(json.dumps({"status":"invalid_input","error":str(error)},ensure_ascii=False),encoding="utf-8")
  return
 for item in incoming:
  if not isinstance(item,dict):continue
  url=str(item.get("source_url") or "")
  title=str(item.get("job_title") or "").strip()
  town=str(item.get("workplace") or "").strip().casefold()
  date=str(item.get("original_date") or "")
  ident=hashlib.sha256((url+"|"+title+"|"+town).encode()).hexdigest()[:22]
  row={"id":ident,"source":str(item.get("source") or ""), "source_url":url,
       "job_title":title,"workplace":item.get("workplace"),"original_date":date or None,
       "application":str(item.get("application") or ""),"evidence_type":item.get("evidence_type"),
       "status":"needs_editorial_verification","publicable":False}
  try: parsed=dt.date.fromisoformat(date)
  except (ValueError,TypeError):parsed=None
  if parsed and (parsed<START or parsed>dt.date.today()):row["flag"]="date_outside_search_window"
  if town and town not in TOWNS:row["flag"]="workplace_outside_territory";outside.append(row)
  elif item.get("event_date") and str(item["event_date"])<dt.date.today().isoformat():row["flag"]="past_recruitment_event";past.append(row)
  else:review.append(row)
  received.append(row)
 (OUT/"social_intake_candidates.json").write_text(json.dumps(received,ensure_ascii=False,indent=2),encoding="utf-8")
 (OUT/"social_intake_report.json").write_text(json.dumps({
  "status":"ok","inputs":len(incoming),"needs_review":len(review),"outside_territory":len(outside),
  "past_recruitment_events":len(past),"automatically_published":0},ensure_ascii=False,indent=2),encoding="utf-8")
 print("Social authorized submissions processed:",len(received))
if __name__=="__main__":run()
