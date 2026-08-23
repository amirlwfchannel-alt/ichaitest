# -*- coding: utf-8 -*-
"""E2E: full developer-page test WITH login (credentials via env vars)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
URL = "https://amirlwfchannel-alt.github.io/ichaitest/admin.html"
EMAIL = os.environ.get("DEV_EMAIL", "")
PASS = os.environ.get("DEV_PASS", "")

async def main():
    if not EMAIL or not PASS:
        print("SKIP: set DEV_EMAIL / DEV_PASS env vars to run the logged-in test")
        return
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL)
        await page.wait_for_timeout(6000)

        # fill login form (Alpine x-model needs input events — page.fill does that)
        await page.fill('input[type="email"]', EMAIL)
        await page.fill('input[type="password"]', PASS)
        await page.evaluate("(() => { document.querySelector('.login-box button.btn, .login-box button')?.click(); })()")
        await page.wait_for_timeout(7000)

        # click developer nav item
        dev_btn = page.locator('button.nav-item', has_text="دولوپر")
        visible = await dev_btn.first.is_visible()
        print("developer nav visible:", visible)
        if visible:
            await dev_btn.first.click()
            await page.wait_for_timeout(5000)

            # KPI values
            kpis = await page.locator(".stat-number").all_inner_texts()
            print("KPI numbers:", kpis[:6])

            # chart rendered?
            chart = await page.evaluate("(() => { const c = document.getElementById('visitsChart'); return c ? c.width > 0 : false; })()")
            print("visits chart rendered:", chart)

            # DB usage table rows
            rows = await page.locator(".data-table tbody tr").count()
            print("db-usage table rows:", rows)

        print("\nconsole errors:", len(errors))
        for e in errors[:6]:
            print(" -", e[:200])
        await browser.close()

asyncio.run(main())
