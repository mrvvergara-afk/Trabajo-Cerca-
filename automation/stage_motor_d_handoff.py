"""Validate and stage a reviewed Motor D batch for the AppDeploy GitHub bridge."""
import argparse,hashlib,json,re,copy
from urllib.parse import urlsplit
from datetime import date,datetime,timezone
from pathlib import Path
COMMUNES={"Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"}
ALIASES={"Mininco":"Collipulli","Coihue":"Negrete","Coigüe":"Negrete"}
def prepare(payload,index,day=None):
    if payload.get("approval")!="approved_for_publication" or payload.get("producer")!="motor_d_territorial": raise ValueError("approval_or_producer_invalid")
    offers=payload.get("offers")
    if not isinstance(offers,list) or not 1<=len(offers)<=15: raise ValueError("invalid_batch_size")
    offers=copy.deepcopy(offers)
    seen=set(index.get("seen_offer_ids",[]));unique=set()
    for offer in offers:
        key=offer.get("id_fuente")
        if not isinstance(key,str) or not re.fullmatch(r"d_[a-f0-9]{20}",key) or key in seen or key in unique: raise ValueError("duplicate_or_invalid_source_id")
        unique.add(key)
        for field in ("cargo","empresa","url_original","fecha_publicacion","fecha_descubrimiento"):
            if not isinstance(offer.get(field),str) or not offer[field].strip(): raise ValueError("missing_"+field)
        parsed=urlsplit(offer["url_original"])
        if parsed.scheme!="https" or not parsed.hostname or parsed.username or parsed.password or any(c.isspace() for c in offer["url_original"]): raise ValueError("invalid_url")
        if parsed.hostname in ("localhost","127.0.0.1","::1") or parsed.hostname.endswith((".localhost",".local",".internal")): raise ValueError("unsafe_url")
        places=offer.get("comunas")
        if not isinstance(places,list) or not places: raise ValueError("missing_territory")
        normalized=list(dict.fromkeys(ALIASES.get(p,p) for p in places))
        if any(p not in COMMUNES for p in normalized): raise ValueError("outside_territory")
        offer["comunas"]=normalized
        for field in ("fecha_publicacion","fecha_descubrimiento"):
            try:
                parsed_date=date.fromisoformat(offer[field])
                if parsed_date>datetime.now(timezone.utc).date(): raise ValueError("future_date")
            except (ValueError,TypeError): raise ValueError("invalid_"+field)
    if index.get("schema_version")!=1: raise ValueError("invalid_index")
    day=day or datetime.now(timezone.utc).strftime("%Y%m%d")
    if not re.fullmatch(r"20[0-9]{6}",day): raise ValueError("invalid_batch_day")
    suffix=hashlib.sha256(json.dumps(offers,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:18]
    batch_id=f"motor-d-{day}-{suffix}"
    relative=f"{day}/{batch_id}.json"
    if any(x.get("batch_id")==batch_id for x in index.get("batches",[])): raise ValueError("already_indexed")
    batch={"schema_version":1,"approval":"approved_for_publication","producer":"motor_d_territorial","batch_id":batch_id,"batch_type":payload.get("batch_type","daily"),"offers":offers}
    updated={**index,"batches":[*index.get("batches",[]),{"batch_id":batch_id,"file":relative,"count":len(offers),"batch_type":batch["batch_type"]}],"seen_offer_ids":sorted(seen|unique)}
    return relative,batch,updated
def main():
    p=argparse.ArgumentParser()
    p.add_argument("reviewed_json",type=Path)
    p.add_argument("--root",type=Path,default=Path("automation/motor_d_ready"))
    a=p.parse_args()
    index_path=a.root/"index.json"
    relative,batch,index=prepare(json.loads(a.reviewed_json.read_text(encoding="utf-8")),json.loads(index_path.read_text(encoding="utf-8")))
    target=a.root/relative
    if target.exists(): raise SystemExit("batch_exists")
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(batch,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    index_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"batch_file":str(target),"batch_id":batch["batch_id"],"count":len(batch["offers"]),"requires_commit_of_both_files":True}))
if __name__=="__main__": main()
