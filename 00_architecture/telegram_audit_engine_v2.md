# Telegram Audit Engine v2 — Architecture & Contract

Status: v2 (Block D-v2). Ordered release on top of GREEN v1.
Date: 2026-06-08

## Purpose

Block D in the ordered architecture (A–I) was a placeholder: outbound emails
used hardcoded `DEFAULT_ISSUES` for the ЖБИ niche. v2 replaces the hardcode
with a **real, deterministic, offline-testable audit engine** that inspects a
site's HTML and produces real `issues[3]`, a `risk` level, and a recommended
offer. It also produces a 1–2 page **PDF mini-audit** artifact.

The engine is a layer **before** the email template. It feeds the already-GREEN
`renderAuditEmail({ issues, site, niche, company })` contract. The email
template is NOT changed — we only stop passing nothing and start passing real
`issues`.

## Hard safety rules

- The core engine (`audit_engine_v2.mjs`) is **PURE**: no network, no SMTP, no
  Telegram, no `.env`, no token read. It takes HTML in, returns a report out.
- **All network access is isolated** in `audit_fetch_adapter.mjs` — the single
  place allowed to `fetch()` a site. Mirrors how SMTP is isolated in its adapter.
- The PDF builder creates a **local file only**. It NEVER sends. Sending a PDF
  to a client remains a separate, manual, approval-gated step.
- No client send, no autosend, no mass send during this block.
- Graceful degradation: if the site can't be fetched (timeout / 404 / empty),
  the engine returns `degraded: true` and falls back to `DEFAULT_ISSUES[niche]`.
  It never throws, never blocks the operator with a crash.

## File map

```
00_architecture/telegram_audit_engine_v2.md        ← this doc
tools/telegram_gateway/audit_engine_v2.mjs         ← PURE engine core
tools/telegram_gateway/audit_fetch_adapter.mjs     ← ONLY network point (fetch HTML)
tools/telegram_gateway/audit_pdf_builder.mjs       ← reportJSON → PDF (local file only)
tools/tests/audit_engine_v2_offline_test.mjs       ← offline test on HTML fixture
tools/tests/audit_pdf_builder_offline_test.mjs     ← offline PDF build test
tools/tests/fixtures/audit_sample_jbi.html         ← saved sample site (good)
tools/tests/fixtures/audit_sample_weak.html        ← saved sample site (weak)
13_sales/audit_reports/<lead_id>.json              ← report artifact
13_sales/audit_reports/<lead_id>.pdf               ← PDF artifact (NOT sent)
```

## Engine contract — `runSiteAudit({ html, site, niche })`

PURE. No network. Returns:

```js
{
  site: 'zb23.ru',
  niche: 'jbi',
  degraded: false,                 // true if html was empty/fallback
  checks: {
    first_screen: { ok: true,  note: '...' },  // понятный H1 / оффер на 1 экране
    path_to_lead: { ok: false, note: '...' },  // форма / телефон / CTA «оставить заявку»
    trust:        { ok: false, note: '...' },  // документы / примеры / отзывы / реквизиты
    cta:          { ok: true,  note: '...' },  // явный призыв к действию
    mobile_basic: { ok: true,  note: '...' },  // viewport meta / базовая адаптивность
  },
  issues: [ '...;', '...;', '...' ],           // exactly 3, template-ready
  risk: 'low' | 'medium' | 'high',
  recommended_offer: 10000,
}
```

### Check heuristics (deterministic, regex/DOM-lite over raw HTML)

| check         | OK when (signal present)                                                        |
|---------------|----------------------------------------------------------------------------------|
| first_screen  | has an `<h1>` with non-trivial text, or a clear offer phrase near top            |
| path_to_lead  | has a `<form>`, a `tel:` link, or a phrase like «оставить заявку / заказать»     |
| trust         | mentions документы / сертификат / отзывы / примеры / реквизиты / ИНН / производство |
| cta           | has a button/link with action verb (заказать, рассчитать, оставить заявку, связаться) |
| mobile_basic  | has `<meta name="viewport">`                                                     |

### issues[3] generation

For each FAILED check we add a niche-aware remediation line (template-ready,
ending with `;` for slots 1–2 and `.` for slot 3 to match existing copy style).
If fewer than 3 checks fail, we top up from `DEFAULT_ISSUES[niche]` so the email
always has 3 concrete lines. The 3 most impactful issues are chosen by a fixed
priority: first_screen > path_to_lead > trust > cta > mobile_basic.

### risk

```
failedCount >= 3  -> 'high'
failedCount == 2  -> 'medium'
failedCount <= 1  -> 'low'
```

`recommended_offer` is fixed at 10000 ₽ for v1 (matches GREEN price guard).

## Fetch adapter — `fetchSiteHtml(site, opts)`

Lives alone in `audit_fetch_adapter.mjs`. Uses global `fetch` with a timeout
(default 8s) and a desktop UA. Returns `{ ok, status, html, error }`. Never
throws to the caller — failures become `{ ok:false }` so the engine can degrade.

## PDF builder — `buildAuditPdf({ report, outPath })`

Uses `pdfkit` (pure Node, no Chromium). Renders a 1–2 page document:
header (site + date), the 5 checks with ✓/✗, the 3 issues, risk, recommended
offer, signature. Writes to `outPath`. Returns `{ ok, outPath, bytes }`.
NEVER sends. NEVER emails. Local artifact only.

## Pipeline wiring

New command `/audit_run top1` and an auto-step inside `/sales_next` before
preview:

```
1. nextReady lead from lead_pipeline
2. fetchSiteHtml(lead.website)            ← adapter (network)
3. runSiteAudit({ html, site, niche })    ← PURE engine
4. write 13_sales/audit_reports/<lead_id>.json
5. buildAuditPdf -> 13_sales/audit_reports/<lead_id>.pdf   (local only)
6. renderAuditEmail({ issues, site, niche, company })       ← GREEN template
7. preview shows real issues + risk + report path; ✅ sends as before
```

## Preflight additions (Block I)

Gateway preflight FAILS if:
- audit engine import fails
- `runSiteAudit` on the bundled fixture does not return exactly 3 issues
- a report with empty/missing `issues[3]` would reach the template
- price in recommended_offer != 10000

## Regression guards

- `audit_engine_v2_offline_test.mjs` runs the engine on saved fixtures (good +
  weak site) and asserts: 3 issues, correct risk, degraded path works, issues
  are template-ready (non-empty strings).
- `audit_pdf_builder_offline_test.mjs` builds a PDF from a synthetic report and
  asserts the file exists, is non-empty, and starts with the `%PDF` magic bytes.
