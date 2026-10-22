"""Read-only integration check of the deployed territorial UI; never submits forms."""
import asyncio
import json
import os
import shutil
from pathlib import Path

from .common import utcnow, write_json

URL = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/'
CITIES = ('Los Ángeles', 'Victoria', 'Temuco')


async def observe():
    from playwright.async_api import async_playwright
    browser = shutil.which('google-chrome') or shutil.which('chromium')
    if not browser:
        raise RuntimeError('public_browser_unavailable')
    environment = {k:v for k,v in os.environ.items() if k not in (
        'GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL')}
    results = []
    async with async_playwright() as playwright:
        instance = await playwright.chromium.launch(executable_path=browser, headless=True, env=environment)
        try:
            for width, height in ((390,844), (1440,1000)):
                page = await instance.new_page(viewport={'width':width,'height':height})
                errors = []
                page.on('pageerror', lambda err: errors.append(str(err)))
                await page.goto(URL, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_selector('article.neoJobCard', timeout=60000)
                await page.wait_for_function("""() => [...document.querySelectorAll('.tcExploreCities small')].length===3 && [...document.querySelectorAll('.tcExploreCities small')].every(n=>/^\\d+ ofertas? publicadas?$/.test(n.textContent))""", timeout=60000)
                legal_checks = []
                for trigger_name, dialog_name in (('Privacidad', 'Privacidad y tus datos'), ('Términos', 'Términos de uso')):
                    trigger = page.get_by_role('button', name=trigger_name, exact=True).first
                    await trigger.focus()
                    await page.keyboard.press('Enter')
                    dialog = page.get_by_role('dialog', name=dialog_name)
                    await dialog.wait_for()
                    assert await dialog.evaluate('(d) => d.contains(document.activeElement)'), 'legal_initial_focus'
                    for key in ('Tab', 'Shift+Tab', 'Tab'):
                        await page.keyboard.press(key)
                        assert await dialog.evaluate('(d) => d.contains(document.activeElement)'), 'legal_focus_escape'
                    await page.keyboard.press('Escape')
                    await dialog.wait_for(state='hidden')
                    assert await trigger.evaluate('(e) => e === document.activeElement'), 'legal_focus_not_restored'
                    legal_checks.append({'dialog':dialog_name, 'initial_focus':True, 'tab_contained':True, 'escape_closes':True, 'focus_restored':True})
                description = await page.locator('meta[name=description]').get_attribute('content')
                canonical = await page.locator('link[rel=canonical]').get_attribute('href')
                assert description and description.startswith('Encuentra oportunidades laborales'), 'public_description_missing'
                assert canonical == URL, 'canonical_mismatch'
                assert await page.get_by_role('button', name='Administración', exact=True).count() == 0, 'anonymous_admin_shortcut_visible'
                compact = await page.locator('.tcSiteMenu').count() > 0
                if compact:
                    await page.locator('.tcSiteMenu summary').click()
                else:
                    await page.get_by_role('button', name='Mi cuenta', exact=True).click()
                account_menu = page.get_by_role('region', name='Mi cuenta')
                assert await account_menu.get_by_role('button', name='Iniciar sesión', exact=True).is_visible()
                assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), 'account_menu_overflow'
                if compact:
                    await page.get_by_role('button', name='Cerrar menú principal', exact=True).click()
                    assert not await account_menu.is_visible()
                else:
                    await account_menu.get_by_role('button', name='Cerrar menú', exact=True).click()
                    assert not await account_menu.count()

                counts = await page.locator('.tcExploreCities button').all_text_contents()
                total = await page.locator('.neoHeroMeta span').first.inner_text()
                assert 'total del radar' in total, total
                for city in CITIES:
                    button = page.locator('.tcExploreCities button').filter(has_text=city)
                    await button.click()
                    await page.wait_for_function("""city => document.querySelector('.tcExploreCities button[aria-pressed=true] strong')?.textContent === city""", arg=city)
                    if not compact:
                        assert city in await page.locator('.tcLocalAdvertising[data-placement=search]').inner_text()
                    else:
                        for banner in await page.locator('.tcHouseAd').all():
                            assert city in await banner.inner_text(), 'house_ad_territory_mismatch'
                    await page.locator('.tcReturn').click()
                    assert await page.locator('.tcExploreCities button[aria-pressed=true]').count() == 0
                assert await page.locator('.neoHeroMeta span').first.inner_text() == total
                advertiser_opened = False
                for label in ('Anunciar aquí', 'Publicitar mi negocio'):
                    cta = page.get_by_role('button', name=label, exact=True)
                    if await cta.count() and await cta.first.is_visible():
                        await cta.first.click()
                        assert await page.locator('.advertiserPanel').is_visible()
                        await page.locator('.advertiserPanel button.close').click()
                        advertiser_opened = True
                        break
                news = page.locator('#actualidad-laboral')
                assert await news.locator('article time[datetime="2026-09-30"]').count() == 1
                assert await news.locator('article a[href^="https://www.tiempo21.cl/"]').count() == 1
                assert await news.locator('aside a').count() == 7
                await news.scroll_into_view_if_needed()
                overflow = await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
                assert not overflow, 'horizontal_overflow'
                assert not errors, errors
                results.append({'viewport':{'width':width,'height':height}, 'city_counts':counts,
                    'global_header':total, 'city_selection_and_return':True, 'advertiser_form_opened_only':advertiser_opened, 'compact_menu':compact,
                    'dated_news_and_official_resources':True, 'legal_keyboard_checks':legal_checks,
                    'description':description, 'canonical':canonical, 'horizontal_overflow':overflow,'page_errors':errors})
                await page.goto(URL+'?admin-proof=1#operacion', wait_until='domcontentloaded', timeout=30000)
                panel = page.get_by_role('region', name='Acceso administrativo')
                await panel.get_by_role('button', name='Verificar acceso', exact=True).click()
                await panel.get_by_text('Inicia sesión con la cuenta administradora autorizada.', exact=True).wait_for(timeout=30000)
                assert not await panel.get_by_text('Acceso administrativo confirmado.', exact=False).count()
                results[-1]['anonymous_admin_denied'] = True
                buttons = panel.locator('.tcAdminActions button')
                boxes = [await buttons.nth(i).bounding_box() for i in range(await buttons.count())]
                assert len(boxes) == 3 and all(box and box['height'] >= 44 for box in boxes), 'admin_touch_target'
                for i, a in enumerate(boxes):
                    for b in boxes[i+1:]:
                        overlap = a['x'] < b['x']+b['width'] and b['x'] < a['x']+a['width'] and a['y'] < b['y']+b['height'] and b['y'] < a['y']+a['height']
                        assert not overlap, 'admin_buttons_overlap'
                results[-1]['anonymous_admin_shortcut_hidden'] = True
                results[-1]['admin_buttons_separated'] = True
                await page.get_by_role('heading', name='Panel de administración', exact=True).wait_for()
                assert await page.get_by_role('region', name='Preparación para producción').is_visible()
                title_box = await page.get_by_role('heading', name='Panel de administración', exact=True).bounding_box()
                session_box = await panel.bounding_box()
                assert title_box['y'] < session_box['y'], 'admin_heading_order'
                assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), 'admin_horizontal_overflow'
                title_size = await page.get_by_role('heading', name='Panel de administración', exact=True).evaluate('(e) => parseFloat(getComputedStyle(e).fontSize)')
                status_size = await panel.locator('[role=status]').evaluate('(e) => parseFloat(getComputedStyle(e).fontSize)')
                assert title_size >= 28 and status_size >= 14, 'admin_readability'
                results[-1]['admin_panel_readable'] = True
                results[-1]['admin_heading_precedes_session'] = True
                results[-1]['admin_horizontal_overflow'] = False
                await page.goto(URL+'?restore-proof=1#operacion', wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_function("""() => {try {const r=JSON.parse(document.getElementById('restore-local-proof')?.textContent);return Boolean(r?.schema || r?.error);}catch{return false;}}""", timeout=60000)
                local_restore = json.loads(await page.locator('#restore-local-proof').inner_text())
                assert not local_restore.get('error'), local_restore
                assert local_restore['tables'] == 2 and local_restore['records'] == 2 and local_restore['files'] == 1
                assert local_restore['comparedElements'] == 3 and local_restore['mismatches'] == 0
                assert local_restore['temporaryStoreDeleted'] is True
                assert local_restore['privateValuesStoredEncrypted'] is True
                assert local_restore['productionWrites'] == 0 and local_restore['platformRestoreTested'] is False
                storage_audit = local_restore['storageAuditFixture']
                assert storage_audit['missingReferencedObjects']['closed'] == 1
                assert storage_audit['externalMediaReferences'] == 1
                assert storage_audit['currentSdkStorageObjects'] == 0
                assert storage_audit['productionWrites'] == 0 and storage_audit['fullPlatformStorageCertified'] is False
                results[-1]['synthetic_local_restore'] = local_restore


                await page.close()
        finally:
            await instance.close()
    return {'checked_at':utcnow().isoformat(),'read_only':True,'forms_submitted':0,
        'provider_calls':0,'new_offers_published':0,'views':results}


if __name__ == '__main__':
    report = asyncio.run(observe())
    write_json(Path('output/site-inventory/territorial-design.json'),report)
    print('TERRITORIAL_DESIGN_PROOF '+json.dumps(report,ensure_ascii=False),flush=True)

