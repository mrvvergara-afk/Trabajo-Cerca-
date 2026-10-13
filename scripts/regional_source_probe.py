"""Inspect public regional source formats. No publishing, credentials or paid provider calls."""
import json
import re
from pathlib import Path
from .common import Budget, utcnow, write_json
from .local_source_audit import fetch_public, source_error, Document

URLS = ["https://www.bne.gob.cl/oferta/2026-109726","https://www.munimulchen.cl/?feed=rss2&s=oferta+laboral","https://www.munimulchen.cl/wp-json/wp/v2/posts?search=oferta%20laboral&per_page=10","https://www.muninegrete.cl/feed/","https://www.cmpc.com/trabaja-con-nosotros/","https://cmpc.trabajando.cl/","https://jobs.arauco.com/","https://radioviaducto.cl/","https://lasnoticiasdemalleco.cl/","https://www.djkamikaze.cl/"]

def main():
    output=Path('output/public-sources');output.mkdir(parents=True,exist_ok=True)
    rows=[];budget=Budget(100)
    for index,url in enumerate(URLS):
        row={'url':url,'paid_provider_calls':0}
        try:
            data,final,mime,status=fetch_public(url,budget,max_bytes=900000)
            raw=data.decode('utf-8','replace')
            parsed=Document();parsed.feed(raw)
            row.update(final_url=final,status=status,mime=mime,bytes=len(data),title=parsed.title[:180])
            # Retain a bounded structural fixture, not scripts, cookies, hidden tokens or contact details in logs.
            sanitized=re.sub(r'<script\b[^>]*>[\s\S]*?</script>|<input\b[^>]*>|<style\b[^>]*>[\s\S]*?</style>','',raw,flags=re.I)
            (output/('regional-source-'+str(index)+'.html')).write_text(sanitized)
            relevant=[(href,label[:120]) for href,label in parsed.links if re.search(r'oferta|empleo|job|trabaj|facebook|instagram|feed|omil',href+' '+label,re.I)]
            row.update(links=relevant[:25])
            if 'bne.gob.cl/oferta/' in final:
                markers=['DATOS DE CONTACTO','DESCRIPCI','15/09/2026','Origen de la Oferta','Postular','Negrete']
                row['structure']=[sanitized[max(0,match.start()-120):match.start()+650] for marker in markers for match in list(re.finditer(re.escape(marker),sanitized,re.I))[:1]]
            if mime=='application/json':
                values=json.loads(raw)
                row['entries']=[{'date':entry.get('date'),'date_gmt':entry.get('date_gmt'),'link':entry.get('link'),'title':entry.get('title')} for entry in values[:10]] if isinstance(values,list) else {'type':type(values).__name__}
        except Exception as exc:
            row['error']=source_error(exc)
        rows.append(row)
    report={'checked_at':utcnow().isoformat(),'read_only':True,'paid_provider_calls':0,'results':rows}
    write_json(output/'regional-source-probe.json',report)
    print('REGIONAL_SOURCE_PROBE '+json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
