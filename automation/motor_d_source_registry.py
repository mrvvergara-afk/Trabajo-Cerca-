"""Fuente única de planificación; 100% de fuentes rastreables, sin top-N.

Los avisos históricos individuales son referencias, no portales nuevos.
Las redes sociales sin API autorizada NO se consideran revisadas.
"""
import hashlib,json,re,unicodedata
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,quote

HERE=Path(__file__).resolve().parent
COMMUNES=("Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento")
MALLECO=COMMUNES[:9]

def canon(value):
    try:
        v=urlsplit(value.strip())
        host=(v.hostname or "").lower().removeprefix("www.")
        if v.scheme!="https" or "." not in host or v.username or v.password or v.port:
            return None
        return urlunsplit(("https",host,v.path.rstrip("/") or "/",v.query,""))
    except (TypeError,ValueError,AttributeError):return None

def scope(row):
    names=row.get("work_cities") or row.get("communes") or [row.get("territory") or row.get("commune")]
    if isinstance(names,str): names=[names]
    if "Chile" in names or "Región" in names:return list(COMMUNES)
    if "Malleco" in names:return list(MALLECO)
    if not names or any(x not in COMMUNES for x in names):raise ValueError("invalid_commune_scope")
    return list(dict.fromkeys(names))

def load_data(path,required=False):
    if not path.exists():
        if required:raise ValueError("missing_source_inventory")
        return {}
    data=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data,dict):raise ValueError("invalid_source_inventory")
    return data

def plan(base,indeed,config=None,audit=None,social_refs=None,portals=None):
    use_real_inventory=config is None
    config=config if config is not None else load_data(HERE/"trabajo_cerca/fuentes_diarias.json",True)
    portals=portals if portals is not None else (load_data(HERE/"motor_d_portal_families.json",True) if use_real_inventory else {})
    audit=audit if audit is not None else load_data(HERE/"motor_d_audit_sources.json")
    if set(config.get("territories",[]))!=set(COMMUNES):raise ValueError("inventory_not_12_communes")
    public={};social={};added=[]
    def register(target,url,communes,name,kind,origin):
        key=canon(url)
        if not key:raise ValueError("invalid_source_url")
        if key in target:
            target[key]["communes"]=list(dict.fromkeys(target[key]["communes"]+list(communes)))
            target[key]["origins"]=list(dict.fromkeys(target[key]["origins"]+[origin]))
        else:
            target[key]={"id":hashlib.sha256(key.encode()).hexdigest()[:20],
                         "url":url,"name":name,"communes":list(communes),
                         "anchor":communes[0],"kind":kind,"origins":[origin]}
            if target is public and origin not in ("motor_d","indeed"):
                added.append((communes[0],name,url))
    for town,name,url in base:register(public,url,[town],name,"motor_d","motor_d")
    for town,name,url in indeed:register(public,url,[town],name,"critical","indeed")
    for row in config.get("discovery",[]):
        register(public,row["url"],scope(row),"Inventario "+str(row.get("id","")) ,
                 str(row.get("type","public")),"daily")
    for row in audit.get("seed_pages",[]):
        if canon(row.get("url","")):
            # Audit reference publisher name/URL may mention a local town.
            # Never assign an unscoped national portal to Angol by default.
            label=unicodedata.normalize("NFD",str(row.get("name",""))+" "+row["url"]).lower()
            label="".join(c for c in label if unicodedata.category(c)!="Mn")
            places=[town for town in COMMUNES if re.search(r"(?<!\w)"+re.escape("".join(c for c in unicodedata.normalize("NFD",town.lower()) if unicodedata.category(c)!="Mn"))+r"(?!\w)",label)]
            target=places or (list(MALLECO) if "malleco" in label else list(COMMUNES))
            register(public,row["url"],target,"Auditoría "+str(row.get("name","")),
                     str(row.get("category","audit")),"audit")
    # A's 7 configured job portal families are explicitly mirrored into D.
    # Each locality gets its own geographic search, including blocked providers.
    for family in portals.get("providers",[]):
        template=str(family["pattern"])
        for town in COMMUNES:
            plain="".join(c for c in unicodedata.normalize("NFD",town.lower()) if unicodedata.category(c)!="Mn")
            slug=re.sub(r"[^a-z0-9]+","-",plain).strip("-")
            region="biobio" if town in ("Mulchén","Negrete","Nacimiento") else "araucania"
            url=template.format(place=quote(town),slug=slug,region=region)
            register(public,url,[town],"Portal "+str(family["name"])+" · "+town,"portal","a_portal")
    for entry in portals.get("indexes",[]):
        register(public,entry["url"],scope(entry),str(entry["name"]),"institutional","a_index")
    for row in config.get("social_reference",[]):
        register(social,row["url"],scope(row),str(row.get("id","Social")),"social","daily_social")
    for row in social_refs or []:
        register(social,row["url"],scope(row),str(row.get("name","Social")),"social","motor_d_social")
    if set(public)&set(social):raise ValueError("source_class_conflict")
    hosts={urlsplit(key).hostname for key in public}
    leads={}
    for row in config.get("seed_urls",[]):
        key=canon(row.get("url",""))
        if not key:raise ValueError("invalid_historical_job_url")
        host=urlsplit(key).hostname
        if host not in hosts:
            x=leads.setdefault(host,{"host":host,"example":row["url"],"known_links":0,
                                     "status":"requires_search_index_onboarding"})
            x["known_links"]+=1
    return {"public":list(public.values()),"social":list(social.values()),
            "added":added,"historical_job_links":len(config.get("seed_urls",[])),
            "unregistered_publishers":sorted(leads.values(),key=lambda x:-x["known_links"])}

def performance_key(url):
    key=canon(url)
    return hashlib.sha256(key.encode()).hexdigest()[:20] if key else ""

def score(src,stats):
    x=stats.get(src["id"],{})
    base=30 if src["kind"] in ("municipal","ats","institutional") else 20
    return 100*min(100,int(x.get("ready",0)))+10*min(100,int(x.get("individual",0)))+base-2*min(30,int(x.get("blocked",0)))

def ranked(plan,stats):
    return sorted(plan["public"],key=lambda x:(-score(x,stats),x["id"]))

def learn(stats,rows,at):
    result=dict(stats)
    for row in rows:
        key=performance_key(row.get("url",""))
        if not key:continue
        old=dict(result.get(key,{}))
        candidates=row.get("candidates") or []
        # A source only earns points for NEW observed job identities. Re-reading
        # the same ad four times a day must not inflate its ranking.
        seen=list(old.get("seen_candidate_ids") or [])[-60:]
        known=set(seen);fresh=[]
        for candidate in candidates:
            if not isinstance(candidate,dict):continue
            identity=str(candidate.get("id") or performance_key(candidate.get("url","")))
            if not identity or identity in known:continue
            known.add(identity);seen.append(identity);fresh.append(candidate)
        success=str(row.get("status","")).startswith(("scanned","fallback_"))
        old.update({"at":at,"status":row.get("status"),
                    "attempts":int(old.get("attempts",0))+1,
                    "blocked":int(old.get("blocked",0))+int(not success),
                    "seen_candidate_ids":seen[-60:],
                    "individual":int(old.get("individual",0))+
                       sum(x.get("evidence")=="individual_page_with_job_terms" for x in fresh),
                    "ready":int(old.get("ready",0))+
                       sum(x.get("express_ready") is True for x in fresh)})
        result[key]=old
    return result

def assess(plan,rows,stats):
    by={performance_key(r["url"]):r for r in rows}
    records=[]
    for src in ranked(plan,stats):
        observed=by.get(src["id"])
        state=str(observed.get("status","")) if observed else ""
        worked=state.startswith(("scanned","fallback_"))
        # An HTML response from a national jobs homepage is not proof that
        # all twelve locality searches were covered.
        label=("needs_territorial_filter" if worked and src["kind"]=="portal_unfiltered_requires_geofilter"
               else "accessible" if worked else
               "blocked_or_failed" if observed else "unvisited")
        records.append({**src,"status":label,"reader_status":state or None,
                        "checked_at":observed.get("checked_at") if observed else None,
                        "rank_score":score(src,stats)})
    for src in plan["social"]:
        records.append({**src,"status":"requires_authorized_reader",
                        "reader_status":"not_accessed","checked_at":None})
    per={}
    for town in COMMUNES:
        group=[x for x in records if town in x["communes"]]
        per[town]={"registered":len(group),
                   "accessible":sum(x["status"]=="accessible" for x in group),
                   "blocked":sum(x["status"]=="blocked_or_failed" for x in group),
                   "needs_geofilter":sum(x["status"]=="needs_territorial_filter" for x in group),
                   "social_unread":sum(x["status"]=="requires_authorized_reader" for x in group),
                   "unvisited":sum(x["status"]=="unvisited" for x in group)}
    unvisited=[x for x in records if x["status"]=="unvisited"]
    pending=[x for x in records if x["status"]!="accessible"]
    if len(rows)!=len(plan["public"])-len(unvisited):raise ValueError("incomplete_source_execution_receipts")
    return {"registered_total":len(records),"automatic_registered":len(plan["public"]),
            "automatic_attempted":len(plan["public"])-len(unvisited),
            "social_registered":len(plan["social"]),"not_attempted":len(unvisited),
            "unresolved_total":len(pending),
            "all_automatic_sources_attempted":not unvisited,
            "all_registered_sources_accessible":not pending,
            "historical_job_links_separate":plan["historical_job_links"],
            "new_publisher_leads_for_onboarding":plan["unregistered_publishers"],
            "per_commune":per,
            "pending":[{k:x[k] for k in ("id","name","url","communes","status")} for x in pending],
            "ranked_first":[{k:x[k] for k in ("name","url","communes","rank_score")} for x in records[:15]],
            "ranking_all":[{k:x[k] for k in ("id","name","url","communes","rank_score","status")}
                           for x in records if x.get("rank_score") is not None],
            "source_identities":[x["id"] for x in records]}
