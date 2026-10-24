"""Bounded confirmation of the existing cron's quality projection; no source reading or publication."""
import json
import subprocess
import time
from pathlib import Path

from .common import write_json
from .observe_site_inventory import main as observe_inventory
from .observe_document_revalidation import EXPECTED_IDS


def quality(path):
    return json.loads(subprocess.check_output(['node','scripts/check_feed_quality.mjs',str(path)],text=True))


def main():
    output=Path('output/feed-quality');output.mkdir(parents=True,exist_ok=True)
    baseline=Path('config/feed-quality-baseline-2026-10-19.json')
    before=json.loads(baseline.read_text());before_quality=quality(baseline)
    end=time.monotonic()+1800
    while True:
        observe_inventory()
        path=Path('output/site-inventory/proof.json');current=json.loads(path.read_text())
        after_quality=quality(path)
        present={x['id'] for x in current['visible_items']};past={x['id'] for x in before['visible_items']}
        complete=not after_quality['excluded'] and not after_quality['duplicates'] and EXPECTED_IDS<=present
        report={'schema':'trabajo-cerca.feed-quality-comparison.v1','baseline':before['checked_at'],
          'checked_at':current['checked_at'],'before_manifest':before['feed_manifest'],'after_manifest':current['feed_manifest'],
          'before_total':before['sdk_total_items'],'after_total':current['sdk_total_items'],
          'before_quality':before_quality,'remaining_quality':after_quality,'removed_ids':sorted(past-present),
          'added_ids':sorted(present-past),'traiguen_ids_preserved':sorted(EXPECTED_IDS & present),
          'quality_migration_confirmed':complete,'new_difficult_offers_confirmed':0,'published':0,'paid_provider_calls':0,
          'current_inventory':current}
        write_json(output/'comparison.json',report)
        print('FEED_QUALITY_STATE '+json.dumps({k:v for k,v in report.items() if k!='current_inventory'},ensure_ascii=False),flush=True)
        if complete:return
        if time.monotonic()>=end:raise RuntimeError('quality_projection_not_completed_in_bounded_window')
        time.sleep(55)


if __name__=='__main__':main()
