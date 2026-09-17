# Local performance port (not deployed)

Only this repository was changed. No commit, push, or deployment was performed.
The live `ichaicafe/menu` repository was used as a read-only source for images/font subsets and performance techniques.

## Build

Install dev dependencies with `npm ci --include=dev`, then run `npm run build`.
Edit non-minified JS/CSS, not generated `.min` files. Build preserves global names
used by Alpine, hashes local asset references, and rejects missing/duplicate Alpine
or parser-blocking script regressions. `npm test` runs 10 offline checks.
`python tests/browser_smoke.py` uses a local HTTP server on 8125 and Chrome CDP on
9334 (requires websocket-client). It checks menu/cart, login visibility and mobile
width without logging in or submitting orders.

## Ported

- Runtime Tailwind replaced with compiled CSS scanned from BOTH new pages and JS.
- New JS and CSS minified from current source; original business logic preserved.
- Ordered deferred scripts; Alpine runs once, after all component registrations.
- 42 optimized product images, local hero background/logos, six subset font weights.
- Display-only URL mapping preserves database/order image URLs; unknown images
  continue using their original URLs, failed local images retry the original.
- Cache-first menu, three parallel refresh requests, removed 600ms artificial delay.
- Passive/rAF scrolling, observed card entrances, offscreen rendering skip,
  reduced sticky-navbar blur, reduced-motion support.

## Deliberate differences from live

- Supabase is deferred, not lazily initialized after interactions become possible:
  new ordering code treats `ready=false` as offline and could falsely report an
  order saved locally. Preserve synchronous initialization before interactions.
- CSS remains external/minified/cacheable rather than copying old inline CSS.
  This preserves new accounting/order/modal styles and avoids stale inline builds.
- Old minified business JS was NOT copied. Orders, accounting, realtime, developer
  tools, Persian search and report exports remain in the new sources.

## Verified / limits

10 offline tests passed; build completed; local desktop/mobile browser smoke had
zero JS errors, a functional cart and visible login with dashboard hidden.
Authenticated live CRUD, actual order submission and report downloads were not
exercised; no credentials or remote writes were used. No Lighthouse/FPS score is
claimed. Build emits an outdated Browserslist-data advisory, not a build failure.
