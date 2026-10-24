"""Read two existing pilot pages and compare literal source dates; no app writes or paid APIs."""
import json
from .common import Budget, write_json
from .local_source_audit import fetch_public, source_error
from .verify_candidates import Extract, job_postings, evaluate, evaluate_public

URLS = [
    'https://www.chiletrabajos.cl/trabajo/tens-enfermera-administrativa-angol-3911374',
    'https://www.chiletrabajos.cl/trabajo/psicologo-a-clinico-comuna-de-ercilla-3902679',
]


def main():
    from .common import utcnow
    now, budget, results = utcnow(), Budget(30), []
    for url in URLS:
        try:
            data, final, mime, status = fetch_public(url,budget,max_bytes=600000)
            raw = data.decode('utf-8','replace')
            parser = Extract();parser.feed(raw)
            dates = [{key:str(job.get(key,''))[:150] for key in ('datePosted','validThrough')} for job in job_postings(parser)][:3]
            external = evaluate({'url':url},raw,final,status=status,now=now)
            native = evaluate_public({'url':url},raw,final,status,now)
            results.append({'url':url,'http':status,'literal_dates':dates,
                            'external':{key:external.get(key) for key in ('status','reason','source_published_at','valid_through')},
                            'native':{key:native.get(key) for key in ('status','reason','source_published_at','valid_through')}})
        except Exception as exc:
            results.append({'url':url,'error':source_error(exc)})
    report={'checked_at':now.isoformat(),'read_only':True,'paid_provider_calls':0,'results':results}
    write_json('output/public-sources/source-date-comparison.json',report)
    print('PUBLIC_DATE_COMPARISON '+json.dumps(report,ensure_ascii=False))


if __name__=='__main__':main()
