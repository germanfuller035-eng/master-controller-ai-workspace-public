# Telegram Sales System v1

Mode: ORDERED RELEASE. No client sends during implementation. No autosend.
No mass send. No new experiments. Restore block-by-block architecture.

## Block map

| Block | Name | Source files (primary) |
|-------|------|------------------------|
| A | Telegram Core Registry | `tools/telegram_gateway/telegram_command_registry.mjs`, `00_architecture/telegram_command_router_v1.md` |
| B | Lead Pipeline | `/lead_run_pipeline` (planned), `lead_import_readonly_live_control.mjs`, `lead_intake_router.mjs` |
| C | Contact Resolver | `telegram_contact_resolver.mjs`, `lead_contact_commands.mjs` |
| D | Audit Engine | `telegram_mini_audit_cockpit.mjs`, audit v1 logic (issues[3]/risk/offer) |
| E | Draft / Template | `audit_send_templates.mjs`, `telegram_outbound_draft_center.mjs` |
| F | Approval / SMTP Send | `telegram_approved_send_controller.mjs`, `telegram_approved_email_send_adapter.mjs` |
| G | Ledger / History / Contacted | `13_sales/outbound_send_ledger.jsonl`, `/sales_history` |
| H | Menu / Help / Status UI | `/sales_status`, `/help`, `/menu` in `telegram_master_bot.mjs` |
| I | Tests / Preflight / R4 | `tools/tests/*`, gateway preflight |

## Daily flow (the only primary path)

```
1. /sales_status        → state of the pipeline
2. /lead_run_pipeline   → ready/blocked counts (NO send, NO mark)
3. /sales_next          → next ready lead → preview
4. Dmitry presses ✅    → approval
5. send 1 email         → Yandex SMTP adapter
6. write ledger         → 13_sales/outbound_send_ledger.jsonl
7. mark contacted       → lead marked
8. /sales_next          → skips the sent lead
```

## Hard rules

- No client send during implementation.
- No autosend, no mass send.
- Send only after explicit ✅ approval.
- No duplicate send (duplicate_guard_id).
- fake / test / example / EMAIL_TEST_TO recipients are blocked.
- First-touch email must NOT contain "Ранее писал".
- Price is 10000 ₽.
- preview and live use ONE template (`audit_send_templates.mjs`).
- approve must go through the SMTP adapter (no bypass).
- SENT must write ledger AND mark contacted.

## Removed / deprecated (do not use as primary)

- P1 env flag / `P1_REQUIRED` / hidden env arming.
- Manual arming chains.
- Separate preview/selftest/live code paths (must converge).
- Hardcoded body templates outside `audit_send_templates.mjs`.
- T1/T2 placeholder UI.
- "client contact blocked" freeze wording (approved send works).
- Mini Audit Draft Cockpit as a "future step".

Old manual chains (`/contact_resolve` → `/audit_draft` → approve) may remain as
fallback, not as the daily path.

## Ledger record schema (`13_sales/outbound_send_ledger.jsonl`)

```
timestamp, lead_id, company, website, recipient, subject, draft_id,
result, smtp_message_id, approved_by, contacted_marked, duplicate_guard_id
```
