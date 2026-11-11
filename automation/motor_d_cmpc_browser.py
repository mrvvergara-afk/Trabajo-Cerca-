"""Motor D: lectura oficial CMPC por navegador; aprobación y publicación son pasos separados."""
import json, os, re
from datetime import datetime,timezone, date
from urllib.parse import parse_qs
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout

OUT="automation/motor_d_discovery"
LOCAL={"Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"}
URL="https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc"
def run():
 os.makedirs(OUT,exist_ok=True)
 report={"fuente":"CMPC Cornerstone","checked_at":datetime.now(timezone.utc).isoformat(),
         "url":URL,"state":"not_started","individual_urls":[],"errors":[]}
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True)
   page=browser.new_page(user_agent="Mozilla/5.0 (compatible; TrabajoCercaMotorE/1.0)")
   try:
    page.goto(URL,wait_until="domcontentloaded",timeout=30000)
    page.wait_for_timeout(6500)
    report["final_url"]=page.url
    report["title"]=page.title()
    report["body_excerpt"]=page.locator("body").inner_text(timeout=12000)[:1500]
    links=page.locator('a[href*="/requisition/"]').evaluate_all("""(xs)=>xs.map(a=>{
      let parent=a;
      let evidence='', fallback='';
      const title=(a.innerText||a.textContent||'').trim();
      // A job title like "Mecánico - Nacimiento" is not a full posting
      // card. The former reader stopped there, losing the original date.
      for(let i=0;i<7 && parent;i++,parent=parent.parentElement){
        const t=(parent.innerText||'').trim();
        if(t.length<20 || t.length>1200 || !t.includes(title))continue;
        if(!fallback && /(?:Chile|Nacimiento|Collipulli|Santa Fe)/i.test(t))fallback=t;
        if(/(?:\\b20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\/20\\d{2}\\b)/.test(t)){
          evidence=t;break;
        }
      }
      return {url:a.href,title,card_text:evidence||fallback};
    })""")
    for row in links[:100]:
     u=row.get("url","")
     if urlparse(u).hostname=="cmpc.csod.com" and re.search(r"/requisition/[0-9]+",u):
      card=row.get("card_text","")[:750]
      # No inventar ubicación: se conserva la evidencia textual original del portal.
      report["individual_urls"].append({"url":u,"cargo":row.get("title","")[:160],"evidencia_tarjeta":card})
    # Consultar fichas individuales solo de enlaces visibles en el portal público.
    detailed=[]
    for item in report["individual_urls"][:45]:
     try:
      detail=browser.new_page()
      detail.goto(item["url"],wait_until="domcontentloaded",timeout=24000)
      # Cornerstone renders requisition content asynchronously after DOMContentLoaded.
      # Do not mistake a navigation-only shell for a job description.
      try:
       detail.wait_for_function("""() => {
         const body=(document.body?.innerText||'').trim();
         const meaningful=/(requisitos|funciones|responsabilidades|descripción del cargo|requerimientos|experiencia|postular|apply now)/i.test(body);
         return body.length>450 && meaningful;
       }""",timeout=10000)
      except BrowserTimeout:
       detail.wait_for_timeout(1800)
      body=detail.locator("body").inner_text(timeout=12000)
      parsed=dict(item)
      parsed["ficha_excerpt"]=body[:4200]
      meaningful=bool(re.search(r"requisitos|funciones|responsabilidades|descripci[oó]n del cargo|requerimientos|experiencia|postular|apply now",body,re.I))
      parsed["ficha_accessible"]=bool(len(body)>450 and meaningful)
      parsed["ficha_content_length"]=len(body)
      parsed["ficha_contenido_laboral"]=meaningful
      parsed["ficha_checked_at"]=datetime.now(timezone.utc).isoformat()
      detailed.append(parsed)
      detail.close()
     except Exception as exc:
      detailed.append({**item,"ficha_accessible":False,"detail_error":str(exc)[:140]})
    report["individual_details"]=detailed
    report["state"]="individual_links_found" if report["individual_urls"] else "no_public_individual_links"
    if any(x in report["body_excerpt"].lower() for x in ["access denied","unauthorized","iniciar sesión","sign in"]):
     report["state"]="access_restricted"
   finally:browser.close()
 except (Exception, BrowserTimeout) as exc:
  report["state"]="browser_error"
  report["errors"].append(str(exc)[:350])
 with open(os.path.join(OUT,"cmpc_discovery.json"),"w",encoding="utf-8") as f:
  json.dump(report,f,indent=2,ensure_ascii=False)
 print(json.dumps({"cmcp_status":report["state"],"individual_links":len(report["individual_urls"])}))
if __name__=="__main__":run()
