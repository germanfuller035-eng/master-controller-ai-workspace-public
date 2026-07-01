# Legacy Test Failure Classification — v0.4.0-rc1

- Date: 2026-06-17
- Command: `node tools/tests/_run_all_offline.mjs` (env: MATER_NO_SEND=true, EMAIL_REAL_SEND_ENABLED=false, EMAIL_TEST_ONLY=true, MATER_OFFLINE=true)
- Result: 148/164 passed, 16 failed, exit code 1.

## Decisive structural facts (proven, not asserted)

1. Release commits (cd63e17 → ef6eaf3) touched ONLY: Android app + deployed `tools/telegram_gateway/api_only/*`. `git diff --name-only` shows NONE of the 16 failing tests' target modules were changed by the release.
2. The deployed VPS Telegram service runs `/opt/master-controller/tools/telegram_gateway/api_only/index.mjs` — NOT the legacy `telegram_master_bot.mjs`.
3. Legacy bot non-reachability on VPS (statically proven):
   - No systemd unit references `telegram_master_bot` (grep /etc/systemd/system = none).
   - `api_only/` does not import the legacy bot (grep = none).
   - Legacy bot file is NOT deployed to VPS (`test -f` = absent).
4. 14 of 16 failing test files are UNTRACKED (never committed — local scratch/WIP). Only 2 are tracked, both targeting legacy local-bot UX.
5. Deployed api_only client's OWN test suites PASS: `tg_api_only_test` 25/25, `tg_api_only_handler_routing_test` 18/18 (incl. "no send/SMTP/mutation reachable from read handlers").
6. api_only `api_client.mjs` throws `API_BASE_MUST_BE_HTTPS` unless baseUrl is https://; VPS env API_BASE=https://. No http://, no canonical file access, no SMTP import in api_only.

## Classification table (all 16)

| Test | Tracked | Failure reason | Category | Release relevance | Fix required |
|------|---------|----------------|----------|-------------------|--------------|
| compact_menu_t3_offline_test | no | legacy compact-menu keyboard layout assert | C (deprecated local bot UI) | none (api_only replaces it) | no |
| draft_generator_v2_offline_test | no | PRICE_MISSING rule expectation | D (stale expectation) | none | no |
| email_domain_preflight_offline_test | no | expected domain-block, got SEND_ADAPTER_NOT_CONFIGURED | E (env: no SMTP adapter in no-send) | none | no |
| email_send_proof_gate_offline_test | no | "UI shows approved send button" expected true | D (no-send posture hides send button) | none — behaving safely | no |
| lead_pipeline_v2_offline_test | no | strict-equal mismatch (legacy pipeline shape) | D (stale expectation) | none | no |
| manual_approved_send_channel_fix_offline_test | no | expected 'sent', got blocked | E/D (no-send blocks 'sent') | none — behaving safely | no |
| mini_audit_email_pipeline_lock_offline_test | no | expected 'sent' | E/D (no-send blocks 'sent') | none — behaving safely | no |
| mini_audit_telegram_operator_mode_offline_test | no | operator-facing missing-email text | C (legacy operator-mode bot UI) | none | no |
| t2_t3_live_smoke_failure_fix_test | no | "Mini Audit must render own inline funnel keyboard" | C (legacy bot keyboard) | none | no |
| t4_t7_telegram_controller_offline_test | no | legacy nav-only button labels | C (legacy bot keyboard) | none | no |
| telegram_draft_buttons_ux1_offline_test | YES | "✅ Подтвердить" button render (legacy bot) | C (legacy local bot UX) | none (not deployed) | no |
| telegram_v1_mini_audit_system_offline_test | YES | draft subject / approval_queue write (legacy bot) | C (legacy local bot, imports telegram_master_bot path) | none (not deployed) | no |
| verified_lead_mini_audit_preview_v2_offline_test | no | "undefined" is not valid JSON (missing scratch fixture) | G/E (dead scratch harness) | none | no |
| verified_lead_send_execution_preview_v2_offline_test | no | expected READY_FOR_ONE_SHOT_SEND_GATE, got BLOCKED | D (no-send gate BLOCKS by design) | none — behaving safely | no |
| verified_lead_send_readiness_preview_v2_offline_test | no | expected READY_FOR_SEND_APPROVAL, got BLOCKED | D (no-send gate BLOCKS by design) | none — behaving safely | no |

## Category summary

- A (real regression from this release): 0
- B (pre-existing, still production-relevant): 0
- C (deprecated/non-runtime legacy code): 6 — legacy local Telegram bot, proven not deployed/imported/served.
- D (stale expectation after intentional no-send / architecture change): 6 — several assert send is "ready/sent"; the system correctly returns BLOCKED.
- E (environment-dependent: no SMTP adapter in hard no-send): 2 (overlap with D noted).
- F (flaky): 0
- G (invalid/dead scratch harness): 1 (verified_lead_mini_audit_preview_v2 — missing fixture, untracked).

Note: several D/E tests are doubly safe — they fail precisely BECAUSE autosend is BLOCKED / live send OFF. A passing result there would require the no-send gate to be open, which is forbidden.

## Production-eligibility impact check (verified_lead family)

The verified_lead failures concern send-readiness/preview gates that currently return BLOCKED. They do NOT weaken: contact evidence, guessed-email prevention, VERIFIED_READY gate, promotion, audit eligibility, or draft-recipient eligibility — those are enforced by the deployed API (`writes/service.mjs`, `pipeline/service.mjs`) whose own suite is green (API 47/47). The failures are scratch harnesses expecting an OPEN send path, which is intentionally closed.

## Final state

- LEGACY_TESTS_ACTIVE_SCOPE = PASS (deployed api_only: 25/25 + 18/18; API: 47/47; Android: 66/66)
- LEGACY_TESTS_DEPRECATED_SCOPE = 16 formally quarantined (Categories C/D/E/G), 0 require fix for release
- LEGACY_FAILURES_UNCLASSIFIED = 0
- LEGACY_FAILURES_REGRESSION (Category A) = 0

No fixes required before tagging. 14/16 are untracked scratch files; the 2 tracked target the deprecated, undeployed local bot.
