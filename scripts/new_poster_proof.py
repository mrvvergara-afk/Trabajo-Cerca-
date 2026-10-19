"""Read two newly identified municipal images with local free OCR; never publish a candidate."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

from .common import Budget,decode_public_html,write_json
from .document_queue_reader import git,publish_evidence,restore_checkpoint
from .local_source_audit import discover
from .public_document_http import PublicCapture,public_error

TARGETS=[
    {'publisher':'https://www.munimulchen.cl/oferta-laboral-profesional-area-construccion-oficina-tecnica-mulchen/',
     'html_sha256':'057b22fb6615a59f9bb582137080a4deaeaf10e9e6f9c21d2cd0f01f5316ab2c',
     'image':'https://www.munimulchen.cl/wp-content/uploads/2025/01/OFERTA-Y-CAPACITACION-1.jpg'},
    {'publisher':'https://www.munimulchen.cl/oferta-laboral-labores-de-campo-y-cuidado-de-parcela/',
     'html_sha256':'94bf5801711a6fa5c4d439cfa55cfbcc7cf8e8c3f5ed8e71abca4be93839cfb3',
     'image':'https://www.munimulchen.cl/wp-content/uploads/2024/06/oferta-campo.jpg'},
]


def main():
    from PIL import Image
    if os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17':raise ValueError('repair_branch_required')
    parent,checkpoint=restore_checkpoint()
    output=Path('output/new-poster-proof');output.mkdir(parents=True,exist_ok=True)
    capture=PublicCapture(output);rows=[];budget=Budget(170)
    Image.MAX_IMAGE_PIXELS=12000000
    for item in TARGETS:
        row={**item,'source_published_at':None,'verified':False,'published':0}
        try:
            raw=git('show',parent+':objects/'+item['html_sha256'])
            if hashlib.sha256(raw).hexdigest()!=item['html_sha256']:raise ValueError('primary_hash_mismatch')
            if item['image'] not in discover(decode_public_html(raw),item['publisher'])['images']:raise ValueError('image_not_linked')
            data,final,mime,status=capture(item['image'],budget,max_bytes=3000000)
            if mime not in ('image/jpeg','image/png'):raise ValueError('image_type_unconfirmed')
            digest=capture.put(data);path=output/'objects'/digest
            with Image.open(path) as image:
                if image.width*image.height>12000000:raise ValueError('image_pixel_budget_exceeded')
                image.verify()
            result=subprocess.run(['tesseract',str(path),'stdout','-l','spa+eng','--psm','6'],capture_output=True,text=True,timeout=40,check=True)
            row.update(http=status,image_sha256=digest,bytes=len(data),engine='tesseract-local',
                text=result.stdout,text_sha256=capture.put(result.stdout.encode()),reason='requires_original_date_and_employer_review')
        except Exception as exc:row['error']=public_error(exc)
        rows.append(row)
    report={'schema':'trabajo-cerca.new-poster-proof.v1','sources':rows,'requests':capture.requests,
            'new_offers_confirmed':0,'published':0,'paid_provider_calls':0}
    write_json(output/'proof.json',report)
    commit=publish_evidence(output,checkpoint,parent,os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    print('NEW_POSTER_PROOF '+json.dumps({**report,'data_commit':commit},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
