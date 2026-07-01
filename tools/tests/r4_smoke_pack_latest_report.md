# R4_SMOKE_PACK_REPORT

## Overall

**GREEN**

Mode: full safe smoke

Generated: 2026-06-08T16:21:49.222Z

## Counts

- PASS: 37
- WARN: 0
- FAIL: 0

## Results

| Area | Status | Details |
|---|---|---|
| Syntax: tools/telegram_gateway/telegram_master_bot.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_live_control_d3.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_readonly_live_control.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_readonly_live_bot_glue.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_approval_decision_live_control.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_approval_decision_live_bot_glue.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_commit_live_control.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_commit_live_bot_glue.mjs | ok PASS | Syntax OK |
| Syntax: tools/telegram_gateway/lead_import_prepare_adapter.mjs | ok PASS | Syntax OK |
| Syntax: ALL CHAIN | ok PASS | 9 chain scripts compile |
| Test: approved_email_send_commands_c21_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_contact_commands_c26a_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_contact_enrichment_commands_c27c_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_import_approval_d2e1_bot_patch_offline_test.mjs | ok PASS | exit 0 |
| Test: lead_import_approval_queue_write_d2f_sandbox_test.mjs | ok PASS | exit 0 |
| Test: lead_import_approval_review_bot_glue_d2d_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_import_approval_review_d2d_sandbox_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_approval_queue_d2b_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_bot_adapter_d1e0_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_commands_d1b_sandbox_micro_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_commands_d1b_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_d1e2_bot_patch_offline_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_d1f_offline_bot_integration_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_pipeline_d1a_sandbox_test.mjs | ok PASS | exit 0 |
| Test: lead_intake_router_d1c_standalone_test.mjs | ok PASS | exit 0 |
| Test: lead_pipeline_offline_test.mjs | ok PASS | exit 0 |
| Test: outbound_send_ledger_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_approval_queue_standalone_b13_test.mjs | ok PASS | exit 0 |
| Test: telegram_approved_email_send_adapter_e1_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_draft_buttons_ux1_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_hotkey_menu_t1_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_lead_import_d3b_approve_reject_bot_patch_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_lead_import_d3c_prepare_bot_patch_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_ops_executor_t2_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_text_voice_intent_router_t1b_offline_test.mjs | ok PASS | exit 0 |
| Test: telegram_v1_mini_audit_system_offline_test.mjs | ok PASS | exit 0 |
| Watchdog verdict | ok PASS | GREEN |

## Quarantined (known-stale, excluded from verdict)

- `lead_import_prepare_adapter_d2c_sandbox_test.mjs` — Imports buildLeadImportPrepareId (removed); superseded by lead_import_prepare_adapter_d3c_test.mjs (passes).
- `lead_intake_pipeline_controlled_100_sandbox_test.mjs` — Imports runLeadIntakePipeline (not exported by current lead_intake_pipeline.mjs); legacy harness.
- `lead_import_approval_dispatcher_d2e0_offline_sim.mjs` — Section 10 asserts "live bot NOT patched with import-approval glue" — a point-in-time check that is now outdated. The glue was intentionally wired into telegram_master_bot.mjs in approved steps d2e1+ (confirmed: bot imports lead_import_approval_review_bot_glue.mjs). 85/88 assertions pass; the 3 failures are evolution-stale, not a regression.

## Safety attestation

- Telegram API: NOT CALLED
- Tokens: NOT READ
- Approval queue write: NO
- Real import / client contact / autosend: BLOCKED
- File deletion / scheduler: NO
- Executed: `node --check` + offline/standalone/sandbox tests + watchdog read-only check

## Next safe action

GREEN: lead-import chain healthy. Safe to proceed.
