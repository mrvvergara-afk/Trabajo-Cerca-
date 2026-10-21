"""Verify deployed deny policy through the supported frontend SDK; never start collectors."""
import asyncio
import json
import os
import shutil
from pathlib import Path
from .common import write_json, utcnow

URL='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/'

async def observe():
    from playwright.async_api import async_playwright
    environment={k:v for k,v in os.environ.items() if k not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,env=environment)
        try:
            page=await browser.new_page()
            await page.goto(URL+'?security-proof=1#operacion',wait_until='domcontentloaded',timeout=30000)
            await page.wait_for_function("""() => {try {let v=JSON.parse(document.getElementById('security-live-check')?.textContent);return Boolean(v?.results || v?.error);}catch{return false;}}""",timeout=60000)
            proof=json.loads(await page.locator('#security-live-check').inner_text())
            assert not proof.get('error'),proof
            assert proof['policy']['revision']=='security-containment-v1'
            assert all(proof['policy'][key] is False for key in ('paidProviders','remoteAi','externalAnalytics','manualOperations'))
            assert len(proof['results'])==6
            for row in proof['results']:
                expected=503 if row['path'].endswith('/photo-tip') else 401
                assert row.get('status')==expected,row
            assert proof['analytics'].get('disabled') is True,proof
            await page.goto(URL,wait_until='domcontentloaded',timeout=30000)
            await page.wait_for_selector('article.neoJobCard',timeout=60000)
            await page.locator('.neoTileRadar').click()
            assert await page.locator('.photoTipBox input[type=file]').is_disabled()
            assert 'deshabilitada' in await page.locator('.photoTipBox').inner_text()
            await page.locator('.smartForm button.close').click()
            assert await page.locator('article.neoJobCard').count()>0
            return {'checked_at':utcnow().isoformat(),'sdk_security_proof':proof,
                'photo_upload_disabled_with_explanation':True,'existing_cards_remain_available':True,
                'collector_calls':0,'remote_ocr_calls':0,'new_offers_published':0}
        finally:await browser.close()

if __name__=='__main__':
    result=asyncio.run(observe())
    write_json(Path('output/site-inventory/security-containment.json'),result)
    print('SECURITY_CONTAINMENT_PROOF '+json.dumps(result,ensure_ascii=False),flush=True)
