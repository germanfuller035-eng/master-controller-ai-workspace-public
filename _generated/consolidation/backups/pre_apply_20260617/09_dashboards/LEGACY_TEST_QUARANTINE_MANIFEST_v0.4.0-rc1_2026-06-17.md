# Legacy Test Quarantine Manifest — v0.4.0-rc1

Date: 2026-06-17 · Owner: release maintainer · Review date: next minor release (v0.4.x)
Runner: `node tools/tests/_run_all_offline.mjs` (164 total, 148 pass, 16 quarantined).
CI behavior: NO CI executes this runner (no .github workflows, no git hooks). It is a local-only
developer aggregate. Quarantined failures therefore CANNOT surface as release-gating CI failures.

Active release suites (all green, gate the actual runtime):
- API: `tools/mater_controller_api/tests/run_all.mjs` = 47/47
- Telegram api_only (deployed): `tg_api_only_test` 25/25, `tg_api_only_handler_routing_test` 18/18
- Android: 66/66 (clean build, debug+release variants)
- E2E no-send: `pipeline_e2e_nosend_test` 21/21, `lh_pipeline_e2e_test` 17/17

## Quarantine table (16)

| Test | Tracked | Category | Production reachable | Reason | Removal/fix criteria |
|------|---------|----------|----------------------|--------|----------------------|
| compact_menu_t3_offline_test | untracked | C | NO | legacy local-bot keyboard layout; api_only replaces it | delete when legacy bot source retired |
| draft_generator_v2_offline_test | untracked | D | NO | stale PRICE_MISSING expectation | update to current draft rules if revived |
| email_domain_preflight_offline_test | untracked | E | NO | expects domain-block, gets SEND_ADAPTER_NOT_CONFIGURED (no SMTP in no-send) | provide SMTP fixture or document waiver |
| email_send_proof_gate_offline_test | untracked | D | NO | expects send button visible; no-send hides it | update expectation to no-send posture |
| lead_pipeline_v2_offline_test | untracked | D | NO | legacy pipeline shape strict-equal mismatch | realign to canonical pipeline shape |
| manual_approved_send_channel_fix_offline_test | untracked | D/E | NO | expects 'sent'; no-send blocks transition | requires send-enabled fixture (forbidden in no-send) |
| mini_audit_email_pipeline_lock_offline_test | untracked | D/E | NO | expects 'sent'; no-send blocks | as above |
| mini_audit_telegram_operator_mode_offline_test | untracked | C | NO | legacy operator-mode bot UI text | delete when legacy bot retired |
| t2_t3_live_smoke_failure_fix_test | untracked | C | NO | legacy bot inline funnel keyboard | delete when legacy bot retired |
| t4_t7_telegram_controller_offline_test | untracked | C | NO | legacy bot nav-only button labels | delete when legacy bot retired |
| telegram_draft_buttons_ux1_offline_test | TRACKED | C | NO | legacy local-bot draft buttons UX | update or remove with legacy bot retirement (tracked → needs commit to remove) |
| telegram_v1_mini_audit_system_offline_test | TRACKED | C | NO | imports legacy telegram_master_bot path | update or remove with legacy bot retirement |
| verified_lead_mini_audit_preview_v2_offline_test | untracked | G | NO | dead scratch harness; missing fixture ("undefined" JSON) | delete (invalid harness) |
| verified_lead_send_execution_preview_v2_offline_test | untracked | D | NO | expects READY_FOR_ONE_SHOT_SEND_GATE; no-send returns BLOCKED | behaving safely; revive only with send-enabled fixture |
| verified_lead_send_readiness_preview_v2_offline_test | untracked | D | NO | expects READY_FOR_SEND_APPROVAL; no-send returns BLOCKED | behaving safely; as above |
| r4_smoke_pack (aggregate) | TRACKED | C/D | NO | aggregates several legacy-bot checks above | green once underlying legacy-bot tests retired/updated |

Categories: C=deprecated/non-runtime legacy code; D=stale expectation after intentional no-send/arch change; E=environment-dependent (no SMTP in hard no-send); G=invalid/dead scratch harness.

## Status

- LEGACY_TESTS_TOTAL=164 · ACTIVE=148 (PASS) · QUARANTINED=16
- LEGACY_FAILURES_UNCLASSIFIED=0 · LEGACY_REGRESSIONS=0
- Tracked quarantined: 3 (telegram_draft_buttons_ux1, telegram_v1_mini_audit_system, r4_smoke_pack) — all target the deprecated, undeployed local bot. Removal requires a tracked commit and is deferred to legacy-bot retirement; left in place per "do not delete historical tests merely to produce green totals."
- 13 untracked are local scratch/WIP, never committed.
- Production reachability of legacy bot: NO systemd unit references it, api_only does not import it, file not deployed to VPS (proven 2026-06-17).
