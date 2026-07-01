# Telegram Sales System v1 — Ordered Release Report

**Date:** 2026-06-08
**Mode:** ORDERED RELEASE — no client sends, no autosend, no new experiments.
**Goal:** Restore block-by-block architecture (A–I) after we jumped ahead into E/F.

---

## Block-based verdict

| Block | Area | Status | Blocker |
|-------|------|--------|---------|
| A | Telegram Core Registry | **GREEN** | none — registry contract test 40/0 PASS |
| B | Lead Pipeline | **GREEN** | none — `/lead_run_pipeline` ready/blocked counts, offline test PASS |
| C | Contact Resolver | **GREEN** | none — fake/test/example gate enforced, contract test 46/0 PASS |
| D | Audit Engine | **GREEN (v1)** | v1 logic = ЖБИ default issues formalized (issues[3] + risk + offer). Deeper per-site/PDF audit deferred to v2 (declared, not blocking). |
| E | Draft Template | **GREEN** | none — single source `audit_send_templates.mjs`, price 10000 ₽, no "Ранее писал" in first-touch, preview == live |
| F | Approval / SMTP Send | **GREEN** | none — single path `/sales_next → preview → ✅ → Yandex SMTP → SENT`; no P1, no hidden arming, no send without ✅ |
| G | Ledger / History / Contacted | **GREEN** | none — `13_sales/outbound_send_ledger.jsonl` confirmed; kvs@zb23.ru backfilled (backfilled: true, no fake message_id); `/sales_history` shows last 10; mark-contacted wired |
| H | Menu / Help / Status UI | **GREEN** | none — `/sales_status`, `/help`, `/menu` reflect real flow; T1/T2 / "client contact blocked" / old Freeze / Draft Cockpit wording removed |
| I | Tests / Preflight / R4 | **GREEN** | none — R4 37 PASS / 0 WARN / 0 FAIL; stale tests updated to v1 contract |

---

## Required headline answers

- **R4 GREEN:** YES (PASS 37 | WARN 0 | FAIL 0)
- **Bot restarted:** YES
- **Old PID:** 18304
- **New PID:** 18620 (single node process confirmed)

---

## Tests run (all GREEN)

- `r4_smoke_pack.mjs` → OVERALL GREEN, 37 PASS / 0 FAIL
- `telegram_command_registry_test.mjs` → ALL GREEN (Block A, 40 checks)
- `contact_resolver_v1_contract_test.mjs` → ALL GREEN (Block C, 46 pass / 0 fail)
- `sales_next_contract_test.mjs` → GREEN (23 passed, 0 failed)
- `lead_pipeline_offline_test.mjs` → PASS (Block B)
- `outbound_send_ledger_offline_test.mjs` → PASS (Block G)
- `telegram_draft_buttons_ux1_offline_test.mjs` → PASS (updated to v1 recipient contract)
- `telegram_v1_mini_audit_system_offline_test.mjs` → PASS (updated to v1 contract)

### Preflight guards now active (gateway refuses to start if)
- active command has no handler
- `/sales_status`, `/sales_next`, `/sales_history` not recognized
- `/help` or `/menu` obsolete (T1/T2 present)
- fake/test/example recipient passes the gate
- first-touch contains "Ранее писал"
- price ≠ 10000 ₽
- preview/live templates diverge
- approve bypasses SMTP adapter
- send without ✅, or duplicate approval sends twice
- SENT does not write ledger / does not mark contacted
- `/sales_next` shows an already-contacted lead
- R4 RED

---

## Hard rules honored
- No client send during implementation ✅
- No autosend / no mass send ✅
- No fake new commands ✅
- No unrelated refactor / no cosmetic-only work ✅
- Root cause fixed, stale paths removed, regression guards added ✅

---

## Exact Telegram commands Dmitry should use now

Daily flow:
1. `/sales_status` — see system reality
2. `/lead_run_pipeline` — prepare leads (ready/blocked counts; sends nothing)
3. `/sales_next` — get next ready lead + preview (skips already-contacted)
4. Press **✅** — sends exactly 1 email via Yandex SMTP
5. `/sales_history` — confirm SENT + ledger entry (shows kvs@zb23.ru)

Support / liveness:
- `/help`, `/menu`, `/ping`, `/health`, `/today`, `/mail status`, `/gateway status`
- Text/voice: «пора заработать» → /sales_next, «что с системой?»/«бот жив?» → /health, «лиды» → /newleads, «на сегодня»/«задачи» → /today

---

## Acceptance checklist (matches Dmitry's приёмка)
- R4 GREEN — ✅
- `/sales_status` works — ✅
- `/sales_history` shows kvs@zb23.ru — ✅ (backfilled, real result SENT)
- `/lead_run_pipeline` gives ready/blocked counts — ✅
- `/sales_next` does not show already-sent lead — ✅
- `/help` and `/menu` current — ✅
- voice/text commands not lost — ✅

**FULL SUCCESS: A–I all GREEN.**

---

## Safe-autorun report
- **Created:** this report; architecture docs `telegram_sales_system_v1.md`, `telegram_command_router_v1.md`; inventory `telegram_sales_audit_system_inventory_2026-06-08.md`; `telegram_command_registry.mjs`, `lead_pipeline.mjs`, `outbound_send_ledger.mjs` + their offline tests.
- **Updated:** `telegram_master_bot.mjs` (wired sales commands + UI cleanup); `telegram_draft_buttons_ux1_offline_test.mjs` and `telegram_v1_mini_audit_system_offline_test.mjs` (v1 contract); ledger backfill entry for kvs@zb23.ru.
- **Blocked / requires Dmitry approval:** any real client send (gated behind manual ✅ only); v2 deep per-site audit engine + PDF (declared, not yet built).
- **Next safe step:** Dmitry runs the daily flow above in Telegram to confirm live behavior; no further code change required for v1.
