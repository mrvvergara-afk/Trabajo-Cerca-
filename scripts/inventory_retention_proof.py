"""Prove total vs loaded cards, unchanged IDs, reload and bounded new source access."""
import asyncio
import datetime as dt
import json
import os
import shutil
from pathlib import Path
from . import observe_site_inventory
from .common import Budget, write_json
from .document_queue_reader import publish_evidence, restore_checkpoint
from .public_document_http import PublicCapture, public_error
from .render_public_documents import main as render_public

APP='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/'

async def cards(expected):
    from playwright.async_api import async_playwright
    environment={key:value for key,value in os.environ.items() if key not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    async with async_playwright() as playwright:
        browser=await playwright.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,env=environment)
        try:
            page=await browser.new_page()
            await page.goto(APP,wait_until='domcontentloaded',timeout=30000)
            await page.wait_for_selector('article.neoKind-job_offer[data-offer-id]',timeout=60000)
            await page.wait_for_selector('.neoRecentArrivals',timeout=30000)
            async def state():
                return {'total':int(await page.locator('.neoHeroMeta > span').first.locator('b').inner_text()),
                        'ids':await page.locator('article.neoKind-job_offer[data-offer-id]').evaluate_all('(cards) => cards.map(card=>card.dataset.offerId)'),
                        'banner':await page.locator('.neoRecentArrivals').inner_text()}
            initial=await state()
            for _ in range(100):
                button=page.locator('.neoLoadMore button')
                if not await button.count():break
                old=len((await state())['ids']);await button.click()
                await page.wait_for_function('(old) => document.querySelectorAll("article.neoKind-job_offer[data-offer-id]").length>old || !document.querySelector(".neoLoadMore button")',arg=old,timeout=30000)
            loaded=await state()
            if set(loaded['ids'])!=set(expected) or len(loaded['ids'])!=len(expected):raise ValueError('cards_do_not_match_complete_sdk')
            if initial['total']!=len(expected) or loaded['total']!=len(expected):raise ValueError('homepage_total_is_not_full_sdk_count')
            await page.locator('.neoRecentArrivals button').click()
            await page.wait_for_function('() => document.querySelector(".neoRecentArrivals button")?.textContent.includes("Ver todas")')
            await page.locator('.neoRecentArrivals button').click()
            restored=await state()
            if set(restored['ids'])!=set(expected):raise ValueError('novelty_filter_loses_existing_cards')
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_selector('.neoRecentArrivals',timeout=60000)
            reload=await state()
            if reload['total']!=initial['total']:raise ValueError('total_changes_after_reload')
            return {'initial':initial,'all_cards':loaded,'reload':reload,'new_filter_roundtrip_preserved':True,'readonly':True}
        finally:await browser.close()


def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17':raise ValueError('repair_branch_required')
    output=Path('output/inventory-retention-proof');output.mkdir(parents=True,exist_ok=True)
    observe_site_inventory.main()
    inventory=json.loads(Path('output/site-inventory/proof.json').read_text())
    baseline=json.loads(Path('docs/evidence/inventario-antes-2026-10-20.json').read_text())
    expected={row['id'] for row in inventory['visible_items'] if row.get('kind')=='job_offer'}
    browser=asyncio.run(cards(expected));write_json(output/'cards.json',browser)
    write_json(output/'complete-inventory.json',inventory)
    before={row['id'] for row in baseline['visible_items']};after={row['id'] for row in inventory['visible_items']}
    # Exact unslashed reference from user poster; then the company root, never login.
    capture=PublicCapture(output);sources=[]
    for url in ['https://wof-chile.com/postular','https://wof-chile.com/']:
        try:
            raw,final,mime,http=capture(url,Budget(30));digest=capture.put(raw)
            sources.append({'url':url,'final_url':final,'http':http,'sha256':digest,'mime':mime})
            if mime=='text/html':(output/('wof-root.html' if url.endswith('.com/') else 'wof-postular.html')).write_bytes(raw)
        except Exception as exc:sources.append({'url':url,'error':public_error(exc)})
    write_json(output/'primary-followup.json',{'sources':sources,'requests':capture.requests})
    # New public JavaScript source; do not re-render exhausted restricted municipalities.
    asyncio.run(render_public(roots=[('laborum','https://www.laborum.cl/empleos-busqueda-angol.html')],destination=output/'laborum-render'))
    report={'schema':'trabajo-cerca.inventory-retention-proof.v1','checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),
        'sdk_total_items':inventory['sdk_total_items'],'sdk_job_offers':len(expected),'initial_cards':len(browser['initial']['ids']),
        'all_job_cards':len(browser['all_cards']['ids']),'total_stable_after_pagination_and_reload':True,
        'novelty_banner':browser['all_cards']['banner'],'traiguen_ids':inventory['traiguen_ids_in_feed'],
        'document_revalidation':inventory.get('document_revalidation'),'added_ids':sorted(after-before),'removed_ids':sorted(before-after),
        'removal_reasons_confirmed':False,'new_publications_confirmed':0,'paid_provider_calls':0,'sources':sources}
    write_json(output/'confirmation.json',report)
    parent,checkpoint=restore_checkpoint();commit=publish_evidence(output,checkpoint,parent,os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    print('INVENTORY_RETENTION_PROOF '+json.dumps({**report,'data_commit':commit},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
