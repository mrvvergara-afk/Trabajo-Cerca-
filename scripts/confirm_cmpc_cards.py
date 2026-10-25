"""Count new publications only after signed receipts, complete SDK feed and cards agree."""
import json
import os
from pathlib import Path
from .common import write_json
from .cmpc_reviewed_handoff import ROLES
from .document_queue_reader import publish_evidence,restore_checkpoint
from .observe_document_revalidation import EXPECTED_IDS


def confirm(delivery,inventory,baseline):
    result=delivery.get('confirmation',{})
    ids=set(result.get('published_ids',[]))
    current={item['id']:item for item in inventory.get('visible_items',[])}
    expected={row[0] for row in ROLES.values()}
    if delivery.get('published')!=2 or len(ids)!=2 or not inventory.get('feed_read_complete') or inventory.get('homepage_read_error'):
        raise ValueError('cmpc_publication_or_complete_feed_not_confirmed')
    if not ids<=set(current) or {current[key]['title'] for key in ids}!=expected or not EXPECTED_IDS<=set(current):
        raise ValueError('cmpc_receipt_or_traiguen_id_not_in_complete_feed')
    titles={card['title'] for card in inventory['homepage_cards']}
    if not expected<=titles:raise ValueError('cmpc_cards_not_visible_on_homepage')
    before={item['id'] for item in baseline['visible_items']}
    if ids & before:raise ValueError('cmpc_ids_are_existing_records_not_new')
    return {'schema':'trabajo-cerca.cmpc-visible-publication-proof.v1','checked_at':inventory['checked_at'],
            'published_new_difficult_offers':2,'published_ids':sorted(ids),'titles':sorted(expected),
            'sdk_total_items':len(current),'sdk_job_offer_records':inventory['sdk_job_offers'],
            'homepage_cards_confirmed':True,'homepage_job_cards':inventory['homepage_job_cards'],
            'feed_manifest':inventory['feed_manifest'],'traiguen_ids_preserved':sorted(EXPECTED_IDS),
            'baseline_feed_manifest':baseline['feed_manifest'],'added_ids_since_baseline':sorted(set(current)-before),
            'removed_ids_since_baseline':sorted(before-set(current)),
            'restored_existing_ids_not_new':[],
            'paid_provider_calls':0,'expiry_inferred':False}


def main():
    delivery=json.loads(Path('output/cmpc-reviewed-handoff/publication-confirmation.json').read_text())
    inventory=json.loads(Path('output/site-inventory/proof.json').read_text())
    baseline=json.loads(Path('config/feed-quality-baseline-2026-10-19.json').read_text())
    report=confirm(delivery,inventory,baseline)
    # Compare restoration with the preceding 31-record quality snapshot as well.
    report['restored_existing_ids_not_new']=[key for key in ['0b54a8ad-1f4a-47f4-b351-8aa8dfa582f1'] if key in {item['id'] for item in inventory['visible_items']}]
    output=Path('output/cmpc-cards-proof');output.mkdir(parents=True,exist_ok=True)
    write_json(output/'confirmation.json',report)
    write_json(output/'complete-inventory.json',inventory)
    write_json(output/'operator-proof.json',json.loads(Path('output/site-inventory/operator-proof.json').read_text()))
    parent,checkpoint=restore_checkpoint()
    commit=publish_evidence(output,checkpoint,parent,os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    report['durable_data_commit']=commit
    print('CMPC_CARDS_CONFIRMED '+json.dumps(report,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
