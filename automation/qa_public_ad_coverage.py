#!/usr/bin/env python3
"""Read-only territorial advertising inventory audit. Never creates campaign/metric events."""
import json, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone

API = "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro"
COMMUNES=["Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico",
          "Traiguén","Victoria","Mulchén","Negrete","Nacimiento"]
PLACES=["Todas",*COMMUNES,"Mininco"]
SLOTS={"search","listing","featured","form"}
results=[]
def check(place):
    url=API+"/api/growth/advertising?"+urllib.parse.urlencode({"place":place,"page":"home","turn":0})
    request=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"Trabajo-Cerca-readonly-commercial-audit/1.0"})
    try:
        with urllib.request.urlopen(request,timeout=25) as res:
            status=res.status
            data=json.load(res)
        house=data.get("house",[])
        commercial=data.get("commercial",[])
        eligible=[]
        for c in commercial:
            if not isinstance(c,dict):continue
            cplaces=c.get("communes") or []
            current=c.get("status")=="active"
            correct_place=("Todas" in cplaces or place in cplaces or
               (place=="Mininco" and "Collipulli" in cplaces) or
               (place=="Collipulli" and "Mininco" in cplaces))
            valid_slot=bool(set(c.get("placements") or []).intersection(SLOTS))
            valid_date=False
            try:
                start=datetime.fromisoformat(c["startAt"].replace("Z","+00:00"))
                end=datetime.fromisoformat(c["endAt"].replace("Z","+00:00"))
                valid_date=start<=datetime.now(timezone.utc)<end
            except (ValueError,KeyError,TypeError):
                pass
            eligible.append(current and correct_place and valid_slot and valid_date)
        ok=(status==200 and data.get("complete") is True and
            isinstance(house,list) and len(house)>0 and isinstance(commercial,list) and
            all(eligible))
        row={"place":place,"pass":ok,"http_status":status,
             "house_campaigns":len(house),"commercial_selected":len(commercial),
             "commercial_eligibility_checks_passed":all(eligible)}
    except Exception as e:
        row={"place":place,"pass":False,"error":str(e)[:180]}
    results.append(row)
    print("TC_AD_COVERAGE "+json.dumps(row,ensure_ascii=False),flush=True)

def main():
    for place in PLACES:
        check(place)
        time.sleep(0.25)
    passed=sum(int(x["pass"]) for x in results)
    report={"checked":len(results),"passed":passed,"failed":[x["place"] for x in results if not x["pass"]],
      "note":"Public inventory only. Does not prove placement visibility, campaign conversions, or traffic capacity."}
    print("TRABAJO_CERCA_AD_COVERAGE "+json.dumps(report,ensure_ascii=False),flush=True)
    if passed!=len(results):sys.exit(1)

if __name__=="__main__":
    main()
