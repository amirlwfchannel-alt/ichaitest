# Audit and verification

## Verified locally

- 42 Node tests passed: accounting numeric coercion/Tehran calendar ranges, consistent snapshots, stale request suppression (including a late rejection of a superseded accounting request), real SupaDB transport-failure propagation for admin orders, logout cleanup, exports, storage validation, cart locking, acknowledgement handling, feedback failure propagation, Persian search, assets and templates. The two races the independent pre-commit review flagged were re-tested and fixed.
- Core Chrome smoke passed for index/admin with external requests blocked and default data injected. Offline admin shows login and hides dashboard. No JavaScript errors or horizontal overflow at 390px. Cart focus, Escape and focus restoration passed.
- Template Chrome suite passed 122 checks over classic/garden/midnight, widths 320/390/768/1024/1440, no-JS content, cart/search/filter, persistence, keyboard focus, reduced motion and local resources. Zero HTTP failures.
- npm audit: zero reported package vulnerabilities. This does not audit vendored libraries or prove application security.
- Build regenerates minified files and validates deferred Alpine ordering. Existing performance edits were preserved.

## Important limits

1. Live backend was not written to, migrations were not applied, and real authenticated administration/checkout was not exercised. Offline/mock tests are not backend security verification.
2. Existing orders SQL permits broad anonymous SELECT and all authenticated accounts have administrative access. Before production, restrict administrators through server-managed roles; scope customer tracking using an unguessable per-order token; do not expose private order fields in public reads.
3. Existing checkout writes order and items separately and trusts client-supplied price snapshots. Move checkout into one server-side transaction with product lookup, stock/price validation, idempotency and rate limiting. A failed second write can leave an incomplete order. Frontend validation added here is not a security boundary.
4. Publishing URL remains unconfirmed; canonical/sitemap/absolute sharing image are pending. Do not assume this repo is the deployed ichaicafe/menu lineage. No live SEO ranking claim is made.
5. Static public shell is readable without JavaScript; the complete current-price menu is still client-rendered. Contact defaults need owner verification. No unverified address/review/rating schema was added.
6. Screenshots were generated but the available vision backend could not inspect pixels. Layout checks are DOM/browser assertions, not a completed visual aesthetic review. Lighthouse scores were not measured.

## Files and backup

Pre-audit non-git/non-node_modules backup: `C:/Users/Woof/Desktop/ichaicafe/ichaitest-before-audit.zip`.
Template gallery: `templates/index.html`. Screenshots and browser evidence are local in `templates/qa/` and are not needed for deployment.
