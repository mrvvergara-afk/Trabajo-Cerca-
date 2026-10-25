"""Capture a complete SDK baseline plus new bounded portal access evidence."""
import json
import os
import subprocess
from pathlib import Path
from . import observe_site_inventory
from .document_queue_reader import publish_evidence,restore_checkpoint


def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17':raise ValueError('repair_branch_required')
    output=Path('output/source-access-baseline');output.mkdir(parents=True,exist_ok=True)
    observe_site_inventory.main()
    (output/'sdk-before.json').write_bytes(Path('output/site-inventory/proof.json').read_bytes())
    (output/'sdk-operator-before.json').write_bytes(Path('output/site-inventory/operator-proof.json').read_bytes())
    subprocess.run(['node','scripts/source_access_audit.mjs'],check=True,timeout=240)
    parent,checkpoint=restore_checkpoint()
    commit=publish_evidence(output,checkpoint,parent,os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    proof=json.loads((output/'public-access.json').read_text())
    print('SOURCE_ACCESS_BASELINE '+json.dumps({'data_commit':commit,**proof},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
