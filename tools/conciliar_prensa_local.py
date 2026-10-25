#!/usr/bin/env python3
"""Join public-source evidence without writing or publishing any job."""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl, urlencode

def normal_url(raw: str) -> str:
    p=urlsplit(raw)
    host=(p.hostname or '').lower().removeprefix('www.')
    if p.scheme!='https' or not host or p.username or p.password or p.port is not None:
        return ''
    identity = [(k,v) for k,v in parse_qsl(p.query,keep_blank_values=False)
                if k.lower() in ('p','id','job_id','vacancy_id') and len(v) <= 50]
    suffix = '?' + urlencode(sorted(identity)) if identity else ''
    return 'https://' + host + p.path.rstrip('/').lower() + '/' + suffix

def merge_reports(*reports: dict) -> dict:
    combined=[]
    for report in reports:
        combined.extend(report.get('results', []))
        for item in report.get('results', []):
            combined.extend(item.get('checked', []))
    unique={}
    for row in combined:
        url=normal_url(str(row.get('url') or ''))
        if not url or 'decision' not in row:
            continue
        earlier=unique.get(url)
        priority=lambda x: (
            x.get('decision')=='candidato_para_revision',
            bool(x.get('publication_date_evidence')),
            bool(x.get('deadline'))
        )
        if earlier is None or priority(row)>priority(earlier):
            unique[url]=row
    items=[]
    for url,row in sorted(unique.items()):
        items.append({'source_url':url,'status':row.get('decision'),
            'article_date_evidence':row.get('publication_date_evidence'),
            'deadline_evidence':row.get('deadline'),
            'original_employer_post_date':None,
            'review_required':True,'published':False})
    return {'schema':'trabajo-cerca.local-source-reconciliation.v1',
        'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),
        'read_only':True,'paid_provider_calls':0,'app_writes':0,
        'source_rows_seen':len([x for x in combined if x.get('url') and 'decision' in x]),
        'unique_source_documents':len(items),
        'unique_candidates_for_review':sum(x['status']=='candidato_para_revision' for x in items),
        'old_or_expired':sum(x['status'] in ('documento_antiguo_no_publicar','plazo_vencido_no_publicar') for x in items),
        'items':items}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',nargs='+',required=True)
    parser.add_argument('--output',default='reporte_candidatos_unicos.json')
    args=parser.parse_args()
    report=merge_reports(*(json.loads(Path(p).read_text()) for p in args.input))
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='items'},ensure_ascii=False))
