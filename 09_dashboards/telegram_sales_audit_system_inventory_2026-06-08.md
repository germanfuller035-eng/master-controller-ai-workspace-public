# Telegram Sales / Audit System — Inventory (Blocks A–I)

- Date: 2026-06-08
- Mode: ORDERED RELEASE — inventory only (read-only + this document). No code changes. No client sends.
- Author: Cline (Session 1 of 7)
- Goal: Restore block-by-block architecture. Map exactly what exists, what works,
  what is stale/duplicate, what is missing, and the exact blocker per block A–I.

---

## How this inventory was produced

- Read `tools/telegram_gateway/telegram_master_bot.mjs` (~3874 lines, monolithic router).
- `search_files` for `sales_status|sales_next|sales_history|sales_today|lead_run_pipeline`.
- Listed `tools/telegram_gateway/*.mjs` (96 files) and relevant `tools/tests/*`.
- Probed `13_sales/` contents and key data files.

### Key raw facts

- Gateway `.mjs` files: **96** (includes ~30 `_emergency_*`, `_getme_*`, `_route_probe_*`,
  `_d2*_once.mjs`, `_webhook_check_*` one-shot/diagnostic scripts = noise).
- `tools/telegram_gateway/telegram_command_registry.mjs` → **DOES NOT EXIST** (must be created in Block A).
- `13_sales/outbound_send_ledger.jsonl` → **MISSING** (Block G must create + backfill).
- `13_sales/lead_contacts.json` → EXISTS (+ `.bak`, `.backup_2026-06-05.json`).
- `13_sales/leads_master.json` → MISSING (leads live under `13_sales/leads/` and intake queue).
- `/sales_status` and `/sales_history` → **NOT FOUND in code** (only `/sales_today` from phase1 exists).
- `/sales_next` → exists in `telegram_outbound_draft_center.mjs` as a thin alias of `/audit_draft top1`.
- `/lead_run_pipeline` → exists in `telegram_master_bot.mjs`, routed through old A3 approval queue
  (does NOT emit ready/blocked counts as required by Block B).

---

## Command source-of-truth fragmentation (root cause of "lost order")

Commands are currently defined/handled across **7+ files** with no single registry:

| File | Role |
|---|---|
| `telegram_master_bot.mjs` | Monolith router: dozens of sequential `if` guards |
| `russian_command_router.mjs` | NL → canonical command mapping |
| `telegram_command_normalizer.mjs` | Alias normalization (e.g. `/leadrunpipeline` → `/lead_run_pipeline`) |
| `sales_commands_phase1.mjs` | `/sales_today /followups /replies /lead_status` (read-only) |
| `sales_commands_phase2.mjs` | Phase 2 sales ops |
| `telegram_text_voice_intent_router.mjs` | Text + voice intent routing |
| `telegram_outbound_draft_center.mjs` | `/sales_next`, `/audit_draft top1` |

This is the structural reason preview≠live and selftest≠approve paths diverged.

---

# Block-by-block status

## A — Telegram Core Registry
- **Existing files:** routing logic split across the 7 files above. `telegram_hotkey_menu.mjs` for menu.
- **Existing commands:** `/ping /health /today /start /status /newleads /intake_status /debug_last /keepalive`,
  vault commands, `/sales_today /followups /replies /lead_status`, `/lead_run_pipeline`, `/sales_next`.
- **Working:** PARTIAL — individual commands route, but there is **no unified registry**.
- **Stale/duplicate:** `telegram_master_bot_hardened.mjs`, `_emergency_live_fix_2026-05-27.mjs` (duplicate bot bodies).
- **Missing:** `telegram_command_registry.mjs`, `00_architecture/telegram_command_router_v1.md`.
- **EXACT BLOCKER:** No single registry. Slash/text/voice intents not consolidated.
- **STATUS: RED**

## B — Lead Pipeline
- **Existing files:** `lead_intake_pipeline.mjs`, `lead_intake_router.mjs`, `lead_intake_commands.mjs`, `lead_resolver.mjs`, `lead_dedupe_engine.mjs`.
- **Existing commands:** `/lead_run_pipeline` (A3 approval-gated), `/lead_add /leadadd /newleads /lead_list /lead_status`.
- **Working:** PARTIAL — pipeline runs via approval, but does NOT output `ready leads / blocked leads / next ready / blocked reasons`.
- **Stale/duplicate:** D1/D2E1/D3B/D3C lead-import guards (multiple frozen/disabled write paths in monolith).
- **Missing:** `ready/blocked` counts contract; `blocked reasons` (no_contact/fake_email/already_contacted/no_site).
- **EXACT BLOCKER:** `/lead_run_pipeline` is a "run via approval" command, not a "prepare leads + report ready/blocked" command.
- **STATUS: RED**

## C — Contact Resolver
- **Existing files:** `telegram_contact_resolver.mjs`, `lead_contact_registry.mjs`, `lead_resolver.mjs`, `contact_channel_extractor.mjs`.
- **Existing commands:** `/contact_resolve top1` (regression test `telegram_contact_resolve_top1_regression_test.mjs` exists).
- **Working:** YES (partial) — resolver found kvs@zb23.ru; fake/example/test recipient gate exists.
- **Stale/duplicate:** legacy `/contact_show /contact_add_email /contact_enrich_*` chains in monolith.
- **Missing:** unified `sendable YES/NO` output with company/website/email/source/confidence in one card.
- **EXACT BLOCKER:** Output shape not standardized to the Block C contract; gates not centralized.
- **STATUS: AMBER (works but not contract-shaped)**

## D — Audit Engine
- **Existing files:** `telegram_mini_audit_cockpit.mjs`, `audit_send_templates.mjs` (templates only).
- **Existing commands:** `/audit_draft top1`, `/audit_send_preview_to_me top1`, `/audit_send_selftest`.
- **Working:** PARTIAL — produces an email OFFER with default ЖБИ issues (effectively hardcoded), not a real audit.
- **Stale/duplicate:** "Mini Audit Draft Cockpit" UI shown as a future step.
- **Missing:** `audit_engine_v1` (site → quick audit → 3 issues → offer): first screen / path to request / trust / CTA / mobile → issues[3], risk, recommended_offer.
- **EXACT BLOCKER:** No real audit logic module; issues are hardcoded defaults not formalized as v1 logic.
- **STATUS: RED (functionally an email offer, not an audit)**

## E — Draft / Template
- **Existing files:** `audit_send_templates.mjs` (canonical), `telegram_outbound_draft_center.mjs`.
- **Working:** MOSTLY — template normal, price 10000 ₽, subject present.
- **Stale/duplicate:** older hardcoded body templates; risk of preview≠live divergence (regression test `audit_send_canonical_path_regression_test.mjs` exists to guard this).
- **Missing:** confirmed single-source guarantee that preview and live use the exact same template; explicit "no 'Ранее писал' in first-touch" guard.
- **EXACT BLOCKER:** Need preflight assertion that preview/live templates do not diverge + first-touch wording guard.
- **STATUS: AMBER**

## F — Approval / Send
- **Existing files:** `telegram_approved_send_controller.mjs`, `telegram_approved_email_send_adapter.mjs`, `approved_email_send_commands.mjs`, `approval_commands.mjs`, `approval_queue.mjs`.
- **Existing commands:** `✅` inline approval → Yandex SMTP send. Recipient gate + autosend block present.
- **Working:** YES — email to kvs@zb23.ru sent; approval required; autosend blocked; fake recipient gate works.
- **Stale/duplicate:** `P1_REQUIRED` env flag, manual arming, separate preview/selftest/live paths.
- **Missing:** single canonical path `/sales_next → preview → ✅ → SMTP → SENT`; duplicate-approval guard.
- **EXACT BLOCKER:** P1 arming + multiple paths remain; duplicate approval could send twice; SENT does not yet write ledger / mark contacted.
- **STATUS: AMBER (sends, but path not unified + no ledger/contacted write)**

## G — Accounting / Ledger
- **Existing files:** NONE for a unified ledger. `lead_intake_events.jsonl` exists (different purpose).
- **Existing commands:** NONE (`/sales_history` not implemented).
- **Working:** NO.
- **Missing:** `13_sales/outbound_send_ledger.jsonl` (timestamp, lead_id, company, website, recipient, subject, draft_id, result, smtp_message_id, approved_by, contacted_marked, duplicate_guard_id); `/sales_history` (last 10); backfill of kvs@zb23.ru send (`backfilled: true`, no fake smtp_message_id).
- **EXACT BLOCKER:** No ledger file, no `/sales_history`, first real send not recorded.
- **STATUS: RED**

## H — Status / UI
- **Existing files:** `telegram_master_bot.mjs` (`/start /status /help-like text`), `telegram_hotkey_menu.mjs`, `telegram_mini_audit_cockpit.mjs`.
- **Existing commands:** `/help` and `/menu` show old T1/T2 placeholder; Freeze shows "client contact blocked"; Mini Audit shows old Draft Cockpit.
- **Working:** PARTIAL but STALE — wording contradicts reality (approved send already works).
- **Stale/duplicate:** T1/T2 placeholders, "client contact blocked" wording, old Freeze wording, Draft Cockpit "future step".
- **Missing:** `/sales_status`; updated `/help` `/menu` reflecting `/sales_status /lead_run_pipeline /sales_next ✅ /sales_history`.
- **EXACT BLOCKER:** `/sales_status` not recognized; `/help` `/menu` obsolete.
- **STATUS: RED**

## I — Tests / Preflight
- **Existing files (relevant tests):** `sales_next_contract_test.mjs`, `audit_send_canonical_path_regression_test.mjs`, `audit_send_approve_recipient_gate_test.mjs`, `audit_send_inline_buttons_test.mjs`, `telegram_draft_buttons_ux1_offline_test.mjs`, `telegram_sales_commands_phase1_smoke_test.mjs`, various smoke tests in gateway dir.
- **Existing commands:** test runner / R4 smoke (currently RED per task).
- **Working:** NO — R4 RED; two named tests expect obsolete behavior:
  - `telegram_draft_buttons_ux1_offline_test.mjs` (present)
  - `telegramv1miniauditsystemofflinetest.mjs` (referenced; name to be confirmed/normalized)
- **Missing:** gateway preflight that fails on the full condition list (no handler / sales cmds unrecognized / obsolete help-menu / fake recipient passes / first-touch "Ранее писал" / price≠10000 / preview≠live / approve bypasses SMTP adapter / send without ✅ / duplicate approval double-send / SENT no ledger / SENT no contacted / sales_next shows contacted lead / R4 RED).
- **EXACT BLOCKER:** No enforcing preflight; R4 RED; stale tests block GREEN.
- **STATUS: RED**

---

## Summary table

| Block | Area | Status | Exact blocker |
|---|---|---|---|
| A | Core Registry | RED | No unified registry; slash/text/voice split across 7 files |
| B | Lead Pipeline | RED | `/lead_run_pipeline` lacks ready/blocked counts contract |
| C | Contact Resolver | AMBER | Output not contract-shaped; gates not centralized |
| D | Audit Engine | RED | No real audit logic; issues hardcoded, not v1 module |
| E | Draft Template | AMBER | No preflight that preview/live cannot diverge; first-touch guard |
| F | Approval Send | AMBER | P1 arming + multi-path; no dup guard; SENT≠ledger/contacted |
| G | Ledger/History | RED | No ledger file; no `/sales_history`; first send unrecorded |
| H | UI | RED | `/sales_status` missing; `/help` `/menu` obsolete (T1/T2) |
| I | Tests/Preflight | RED | No enforcing preflight; R4 RED; stale tests |

**R4 GREEN:** NO (current state).
**Bot restarted:** NO (inventory session — no restart performed).

---

## Cleanup candidates (noise to quarantine, NOT delete without approval)

~30 one-shot/diagnostic scripts in `tools/telegram_gateway/`:
`_emergency_*` (12), `_getme_*` (6), `_route_probe_*` / `_route_live_restore_*` (2),
`_d2*_once.mjs` (5), `_webhook_check_*` (2), `_diag_env.mjs`, `_audit_send_preview_to_me_once.mjs`.
Plus duplicate bot bodies: `telegram_master_bot_hardened.mjs`.
> Per safe_autorun_rules: deletion requires Dmitry approval. Recommend a `99_ARCHIVE/`
> quarantine move in a later session, not in the release path.

---

## Recommended next session (Block A)

1. `00_architecture/telegram_sales_system_v1.md` — system contract A–I.
2. `00_architecture/telegram_command_router_v1.md` — routing order + ownership.
3. `tools/telegram_gateway/telegram_command_registry.mjs` — single registry of ALL
   slash + text + voice intents (old commands preserved, not lost).
4. Offline registry test.

---

## Report (per safe_autorun output rule)

- **Created:** this inventory document.
- **Updated:** nothing (read-only session).
- **Blocked:** all code changes deferred to ordered Sessions 2–7 (by design).
- **Requires Dmitry approval:** deletion/quarantine of ~30 noise scripts; any client send (none performed).
- **Next safe step:** Block A — create registry + architecture docs (Session 2), no live send.
