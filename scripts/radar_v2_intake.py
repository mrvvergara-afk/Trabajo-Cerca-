"""Import contributed posters/PDF locally. Declared dates never become source proof."""
import argparse
import json
import mimetypes
from pathlib import Path

from .common import canonical_url, parse_date, utcnow
from .radar_v2_store import PilotStore, MAX_OBJECT_BYTES


def import_manifest(store,path,now=None):
    now=now or utcnow();path=Path(path).resolve();items=json.loads(path.read_text())
    if not isinstance(items,list) or len(items)>20:raise ValueError('Provide a list of up to 20 contributions')
    imported=[]
    for row in items:
        source_url=canonical_url(row['source_url'])
        original=(path.parent/row['file']).resolve()
        if not original.is_relative_to(path.parent):raise ValueError('Contributed file must remain beside its manifest')
        mime=mimetypes.guess_type(original.name)[0]
        if mime not in ('application/pdf','image/png','image/jpeg','image/webp'):raise ValueError('Unsupported contributed file type')
        if original.stat().st_size>MAX_OBJECT_BYTES:raise ValueError('Contribution exceeds byte budget')
        declared=row.get('declared_publication_date')
        if declared and not parse_date(declared):raise ValueError('Invalid declared date')
        digest=store.put(original.read_bytes(),mime)
        identity=store.seed('media',source_url+':contribution:'+digest,{'source_url':source_url,
          'source_family':'contribution','source':'contributed_notice','local_object_sha256':digest,'mime':mime,
          'source_published_at':None,'declared_publication_date':declared,
          'contribution_requires_review':True},now)
        imported.append({'job_id':identity,'source_url':source_url,'object_sha256':digest,'status':'awaiting_origin_confirmation'})
    return {'imported':len(imported),'items':imported,'paid_provider_calls':0,'published':0}


def main():
    parser=argparse.ArgumentParser(description='Archive contributed notices without publishing or network requests')
    parser.add_argument('manifest');parser.add_argument('--state',default='state/radar-v2')
    args=parser.parse_args();store=PilotStore(args.state)
    try:print(json.dumps(import_manifest(store,args.manifest),ensure_ascii=False))
    finally:store.close()


if __name__=='__main__':main()
