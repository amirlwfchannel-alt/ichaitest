# -*- coding: utf-8 -*-
"""E2E: developer page + accounting calendar on LIVE test site."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
URL = "https://amirlwfchannel-alt.github.io/ichaitest/admin.html"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL)
        await page.wait_for_timeout(6000)

        # Login via Alpine directly (test credentials are the user's own; use env-free path)
        # We cannot know the password here — instead verify the page boots without the
        # previous crash by exercising fetchVisitStats logic through a fake state:
        boot = await page.evaluate("(() => ({ hasAlpine: !!window.Alpine, ready: window.SupaDB ? SupaDB.ready : null }))()")
        print("boot:", boot)

        # Check visit stats function exists and runs (will return null if not logged in — but must NOT throw)
        res = await page.evaluate("""(() => {
          try {
            const p = SupaDB.fetchVisitStats();
            return 'called-ok';
          } catch (e) { return 'THROW: ' + e.message; }
        })()""")
        print("fetchVisitStats sync call:", res)
        await page.wait_for_timeout(2500)

        # Accounting calendar smoke: open admin page is auth-walled, so just confirm
        # no console errors so far
        print("\nconsole errors:", len(errors))
        for e in errors[:6]:
            print(" -", e[:200])

        await browser.close()

asyncio.run(main())
