# Telegram Gateway Smoke Test Report

- Generated: 2026-05-25T04:23:46.661Z
- Bot file:  `d:\AI_WORKSPACE\tools\telegram_gateway\telegram_master_bot.mjs`
- Test file: `d:\AI_WORKSPACE\tools\telegram_gateway\telegram_gateway_smoke_test.mjs`

## Result: 34 passed / 0 failed / 34 total

Status: **ALL OK**

## Checks

| Status | Check | Detail |
|--------|-------|--------|
| PASS | env_file_exists | gateway .env |
| PASS | telegram_bot_token_present | length=46 |
| PASS | no_hardcoded_token | token read from .env only |
| PASS | bot_file_exists | d:\AI_WORKSPACE\tools\telegram_gateway\telegram_master_bot.mjs |
| PASS | reliability_module_exists | d:\AI_WORKSPACE\tools\telegram_gateway\reliability.mjs |
| PASS | reliability_imported |  |
| PASS | heartbeat_wired |  |
| PASS | cmd_registered:/ping |  |
| PASS | cmd_registered:/start |  |
| PASS | cmd_registered:/status |  |
| PASS | cmd_registered:/today |  |
| PASS | cmd_registered:/newleads |  |
| PASS | cmd_registered:/emergency_stop |  |
| PASS | cmd_registered:/health |  |
| PASS | cmd_registered:/debug_last |  |
| PASS | cmd_registered:/keepalive |  |
| PASS | cmd_registered:/contact | NL intent (parseContactIntent) |
| PASS | contact_nl_supported | parseContactIntent / NL phrase present |
| PASS | unknown_command_fallback |  |
| PASS | error_handlers_present |  |
| PASS | auto_send_blocked |  |
| PASS | approve_send_no_client_send | no real outbound transport invoked |
| PASS | contact_confirm_no_email_send | no mail transport in bot |
| PASS | single_polling_loop | 0 setInterval call(s) |
| PASS | no_second_bot_library | native HTTPS getUpdates only |
| PASS | lock_file_referenced |  |
| PASS | no_real_parsers_or_senders | no live mail/imap transport |
| PASS | find_telegram_pollers_exists | d:\AI_WORKSPACE\tools\telegram_gateway\find_telegram_pollers.ps1 |
| PASS | telegram_api_diagnostics_exists | d:\AI_WORKSPACE\tools\telegram_gateway\telegram_api_diagnostics.mjs |
| PASS | stop_script_supports_deep | -Deep mode present |
| PASS | handler_409_exists | 409 Conflict handler found |
| PASS | start_checks_webhook | start preflight checks webhook state |
| PASS | start_checks_duplicate_pollers | start preflight checks duplicate pollers |
| PASS | no_token_logging | token not logged to console |

## Safety invariants verified

- Token is read from `.env`, never hard-coded.
- `auto_send_to_clients = BLOCKED`.
- `approve_send` does **not** invoke real outbound transport.
- Contact confirmation does **not** send email.
- No second bot library, no second polling loop.
- Single-instance enforced via lock file.
- No live IMAP/SMTP transport in bot.
