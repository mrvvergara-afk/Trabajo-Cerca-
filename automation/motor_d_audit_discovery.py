"""Motor D: seguimiento reproducible de fuentes públicas derivadas de la auditoría.
No realiza scraping de portales restringidos ni autoriza publicaciones.
"""
import json, os, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup

ROOT=Path("automation/motor_d_discovery")
SOURCE=Path("automation/motor_d_audit_sources.json")
HEADERS={"User-Agent":"TrabajoCerca/1.0 (auditoria de vacantes publicas; contacto desde sitio oficial)"}
RESTRICTED={"cl.computrabajo.com","cl.indeed.com","linkedin.com","www.linkedin.com","www.laborum.cl"}

def inspect(page):
    url=page["url"]
    host=urlsplit(url).hostname or ""
    result={"fuente":page["name"],"url":url,"categoria":page["category"],
            "consulta":datetime.now(timezone.utc).isoformat(),"estado":"pendiente","evidencia":{},
            "publicable":False,"duplicado_conocido":bool(page.get("known_duplicate",False))}
    if host in RESTRICTED or page["category"]=="agregador":
        result["estado"]="solo_indicio_buscar_origen"
        return result
    if page["category"]=="ats":
        result["estado"]="usar_extractor_playwright"
        return result
    try:
        rsp=requests.get(url,headers=HEADERS,timeout=14,allow_redirects=True)
        result["http_status"]=rsp.status_code
        result["url_final"]=rsp.url
        if rsp.status_code!=200:
            result["estado"]="error_http"
            return result
        ctype=rsp.headers.get("Content-Type","").lower()
        if "html" not in ctype:
            result["estado"]="documento_no_html"
            result["evidencia"]["tipo_contenido"]=ctype[:100]
            return result
        soup=BeautifulSoup(rsp.text[:600000],"html.parser")
        heading=soup.select_one("article h1,main h1,h1")
        title=heading.get_text(" ",strip=True) if heading else (soup.title.get_text(" ",strip=True) if soup.title else "")
        area=soup.select_one("article .entry-content, article, main, body")
        body=area.get_text(" ",strip=True) if area else ""
        dates=[]
        for tag in soup.select('time[datetime],meta[property="article:published_time"],meta[name="date"]'):
            d=tag.get("datetime") or tag.get("content")
            if d:dates.append(d[:40])
        # Conservar enlaces individuales localizados en concursos/bolsas oficiales,
        # sin confundir etiquetas de navegación con ofertas comprobadas.
        anchors=[]
        for a in soup.select('article a[href], main a[href], .entry-content a[href]')[:160]:
            label=a.get_text(" ",strip=True)
            href=a.get("href","")
            if href and label and re.search(r"concurso|postul|enfermer|reemplazo|trabajador|profesional|administrativ|compra",label,re.I):
                from urllib.parse import urljoin
                anchors.append({"titulo":label[:160],"url":urljoin(rsp.url,href)})
        text=body.lower()
        closed=bool(re.search(r"postulaci[oó]n cerrada|convocatoria cerrada|plazo vencido",text))
        open_label=bool(re.search(r"postulaci[oó]n abierta|convocatoria abierta",text))
        result["evidencia"]={"titulo":title[:200],"extracto":body[:750],
                           "fechas_documentales":dates[:5],"enlaces_individuales":anchors[:50],
                           "etiqueta_cierre":closed,"etiqueta_apertura":open_label}
        result["estado"]="cerrada_documental" if closed else "evidencia_html_pendiente_validacion"
    except requests.RequestException as ex:
        result["estado"]="error_conexion"
        result["error"]=str(ex)[:190]
    return result

def main():
    config=json.loads(SOURCE.read_text(encoding="utf-8"))
    ROOT.mkdir(parents=True,exist_ok=True)
    results=[inspect(p) for p in config["seed_pages"]]
    report={"fecha":datetime.now(timezone.utc).isoformat(),
            "advertencia":"Inventario de evidencia, NO aprobación ni publicación; revisar fuente original",
            "territorio":config["communes"],"alias_localidades":config["aliases"],
            "fuentes":results,"empleadores_a_investigar":config["employer_leads"]}
    outfile=ROOT/"auditoria_fuentes.json"
    outfile.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"sources":len(results),"html_with_evidence":sum(x["estado"].startswith("evidencia_html") for x in results),
                      "closed":sum(x["estado"]=="cerrada_documental" for x in results),
                      "restricted_discovery_only":sum(x["estado"]=="solo_indicio_buscar_origen" for x in results),
                      "ready_for_publication":0}))

if __name__=="__main__":
    main()
