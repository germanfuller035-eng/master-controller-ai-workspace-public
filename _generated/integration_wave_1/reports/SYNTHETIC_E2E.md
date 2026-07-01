# Integration Wave 1 — Synthetic E2E

date: 2026-06-18 · suite tools/commercial_core/tests/commercial.test.mjs · synthetic fixtures only

## Fixtures (no real data)
SYN_LEAD_001 «Синтетический Бетон», synthetic@example.invalid, product mini_audit @ 10000 RUB.
`example.invalid` is a reserved non-routable domain. ДКБИ / DKBI / real production IDs are NOT used
(enforced by security scan SEC10).

## Happy path (E2E1–E2E20) — PASS
synthetic verified lead → opportunity (10000 RUB ESTIMATE) → offer (price/scope snapshot, send
capability NONE) → owner APPROVE → deal WON (value FACT) → delivery handoff → project
(DELIVERY.PLANNED) → invoice schedule (TARGET, real_issuance DISABLED, bank NONE) → payment UNKNOWN
(confirmed_paid null) → profitability ESTIMATE, actual profit UNKNOWN.
Then: payment evidence (bank_statement ref) → payment FACT → invoice PAID/FACT → confirmed paid FACT 10000.

## Idempotency (IDEM1–IDEM5) — PASS
Repeat of each command (same idempotency key) yields exactly one entity / one transition:
opportunity, deal-won, handoff, project, invoice — no duplicates.

## Negative (NEG1–NEG10) — PASS
1 unverified lead blocked (LEAD_NOT_VERIFIED) · 2 missing product blocked · 3 deal without owner
approval blocked · 4 rejected offer cannot become deal · 5 handoff requires deal · 6 stale revision →
409 · 7 missing idempotency blocked · 8 payment without evidence blocked · 9 invoice stays TARGET
without payment (estimate never auto-promotes) · 10 invalid owner decision blocked.

## Read models (RM1–RM6) + single-writer (SW1–SW3) + events (EVT1–EVT3) — PASS
UNKNOWN money surfaces as null + UNKNOWN class (never 0); empty store confirmed-value UNKNOWN; exactly
7 sections; one commit() writer; monotonic single revision counter; fact vs recommendation events
distinct; unknown event type rejected.

## Result
commercial_core: 87 passed, 0 failed. security: 15 passed, 0 failed.
REAL_PRODUCTION_DATA_USED=NO · REAL_MESSAGES_SENT=0 · SMTP_CALLS=0.
