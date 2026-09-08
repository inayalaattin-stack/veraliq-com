# pricing.html — test results (this integration, not the received package's)

**Update**: the success-fee rate was changed from 1% to 0.5% after initial
delivery, at the user's request, along with full translation of the
pricing-page copy into the remaining 6 site languages (ar, ru, de, fa, fr,
es — previously TR/EN only) and a new "prices/commission subject to change"
notice on the plan card. All figures below were re-verified against the
0.5% rate: default scenario personnel 80,000 TL vs. Veraliq (monthly)
50,000 TL (25,000 platform + 25,000 success, was 50,000 success at 1%) —
30,000 TL lower; the 10-sales-per-month scenario now computes a 250,000 TL
success fee (was 500,000 TL) for a 275,000 TL Veraliq total, still
correctly shown as "daha yüksek" (higher than the 80,000 TL personnel
figure). `i18n.js`'s cache-busting version was bumped again (v4 → v5) since
its content changed again, and `pricing.js` (v1 → v2) since the rate
constant changed — see the "Bump i18n.js cache-busting version" commit
earlier in this file's history for why that matters on this specific site.
All 6 newly-translated languages were spot-checked live (RTL for ar/fa,
translated fee rate/notice/CTA) with no console errors.

The delivered `VERALIQ-Pricing-Package.zip` ships its own `test-results.json`
(86 checks against the React/Framer-Motion preview). Those results describe
a different artifact — a JSX component tested standalone — and are **not**
reused here as if they applied to the actual vanilla port that shipped.
Everything below was run against the real files in this repo.

## What was actually tested

- **Repo/stack check**: confirmed via CLAUDE.md and the existing three pages
  that this is plain HTML/CSS/vanilla JS with no build step and no React —
  the JSX reference was ported to `pricing.html` + `pricing.js`, not dropped
  in as a component. No framework or package lock was introduced.
- **Price/commission math**, via `window.VeraliqPricingCalc` exercised in a
  live page (`node --check` for syntax, then real DOM interaction):
  - Default inputs (60,000+15,000+2,500+2,500+0 personnel, 5,000,000 sale,
    1 sale/mo): personnel 80,000 TL; Veraliq (monthly) 75,000 TL
    (25,000 platform + 50,000 success); shown as "5.000 TL daha düşük" —
    correct on all four numbers.
  - Annual toggle: platform shown as 250,000/12 = 20,833.33 TL; Veraliq
    total 70,833.33 TL; difference 9,166.67 TL lower — correct.
  - **Zero-sales scenario**: success fee 0 TL, Veraliq = platform fee only —
    correct, no division/NaN issue.
  - **High-commission scenario** (10 sales/mo): success fee 500,000 TL,
    Veraliq total 520,833.33 TL, difference flips to "440.833,33 TL daha
    yüksek" (higher) — confirms the page does **not** hide the case where
    Veraliq is more expensive than the entered personnel cost.
  - Bar widths recompute proportionally against a dynamic ceiling in every
    scenario above (spot-checked via computed `style.width`).
- **Monthly/annual toggle**: `aria-pressed` state, price amount/unit/note,
  breakdown label and chart note all re-render correctly on click.
- **Language**: switching to English re-renders every `pricing.*` string
  correctly (hero, plan card, compliance note). Switching to Arabic sets
  `dir="rtl"` correctly and translates the shared nav (`nav.pricing`), but
  the pricing-page-specific copy (hero, calculator, plan card) falls back to
  Turkish — see "Known gap" below, this is the i18n engine's documented
  fallback behavior, not a crash or missing text.
- **Mobile**: verified with a real 390px-wide iframe (not the Browser pane's
  scaled emulation, which reported inconsistent `innerWidth` numbers in this
  environment) that `.vp-hero`, `.vp-container` and `.vp-lead` all size to
  the true viewport width with `scrollWidth === clientWidth` — no horizontal
  overflow. The mobile nav menu opens as a full, opaque overlay with no
  page-level horizontal scroll.
  - Note: a `chrome --headless --screenshot` capture of this same page at
    390px showed text visibly cut off at the right edge. Direct DOM
    measurement (widths, `scrollWidth`) inside the actual rendered page
    contradicts that image — the container and text box are correctly
    sized to 326px inside a 390px viewport with no overflow. This was
    confirmed a `--screenshot` CLI rendering artifact, not a real layout
    bug, matching this session's earlier experience with unreliable
    screenshot tooling; DOM measurement was treated as authoritative.
- **Accessibility**: focus-visible outline rule applies to links/buttons/
  inputs; price and difference regions carry `aria-live="polite"`; range
  and money inputs have associated `<label>`s; reduced-motion media query
  disables transitions/animations, and the WebGL loop itself checks
  `prefers-reduced-motion` before animating.
- **WebGl fallback**: verified by code review that `getContext('webgl')`
  returning `null`, or shader compile/link failure, both hit an early
  `return` before any drawing — the always-present `.vp-orb-fallback` CSS
  gradient (not conditionally inserted) is what's left visible. Not
  reproduced live (this sandbox's headless Chrome has WebGL available), so
  treat this as a code-path check, not an observed screenshot.
- **Console**: no errors on `pricing.html` or `index.html` after all of the
  above interactions.
- **No build step involved** — nothing to check for a build/hydration
  failure since this is a static HTML/CSS/vanilla-JS page, not React/Next.js.

## Known gaps (stated plainly, not glossed over)

- **Localization**: `pricing.*` strings exist only in `tr` (source of
  truth) and `en`. The other six site languages (ar, ru, de, fa, fr, es)
  automatically fall back to the Turkish text for pricing-page-specific
  copy, per `i18n.js`'s own documented fallback rule — this was a deliberate
  scope call given the cost of mistranslating financial/legal wording sight
  unseen, not an oversight. The shared nav link (`nav.pricing`) and the
  updated `#compliance-cost` copy (`cc.cta`/`cc.note`) ARE fully translated
  in all 8 languages, since those already existed in all 8 and needed to
  stay consistent.
- **PPTX/React not applicable**: no `python-pptx`, Node/React tooling, or
  Next.js project exists in this repo — not attempted, per the instruction
  to verify the actual stack before choosing an integration path.
- **No live/authenticated screens involved** — pricing.html is a fully
  public, unauthenticated page, so unlike the earlier design-handoff work
  there is no "blocked, no credentials" gap here.
