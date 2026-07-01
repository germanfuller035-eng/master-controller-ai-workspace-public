# CURRENT RELEASE CHECKPOINT — Master Controller v0.4.0-rc1

Status: RELEASE CLOSED (tagged). Recovery + full closure pass complete.

## FINAL STATE

- VERSION = 0.4.0-rc1 / versionCode 4
- BRANCH = feature/master-controller-lead-hunter-integration
- HEAD = a7c20ac (bundle docs) ; release closure = 9d346f3
- TAG = v0.4.0-rc1 -> 9d346f3 (annotated, unsigned; NOT pushed)
- TAG_TARGET rationale: 9d346f3 contains complete release source (identical to ef6eaf3/73f17ae)
  + mandated final report + rollback runbook + corrected artifacts/BUILD_INFO.

## GATES (all PASS)

- Git reconciled; no uncommitted release code; artifact source = tag target; BUILD_INFO commit corrected (ef6eaf3 build).
- Legacy: 16/16 classified, 0 unclassified, 0 regression (14 untracked scratch, 2 undeployed legacy bot). Active scope PASS.
- SSH RESTORED: masterctl@195.96.132.82 via /d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519 (fp iO8wf6…). Old key was for retired IP 185.214.108.101.
- Telegram UX patch already deployed (byte-identical to cd63e17/55bf548). Service active, 1 poller, 0 restarts/conflicts, no secret logs.
- api_only tests 25/25 + 18/18. API 47/47. Android 66/66, lint 0 errors.
- Android: 22/22 required screens, compact 5-tab nav. Clean build SUCCESSFUL.
- APK/AAB signed+verified (key 11038fca…). SHA256 refreshed. No secrets. HTTPS-only. R8 retained critical classes.
- Cross-client consistency PASS. Revision conflict PASS. E2E 21/21 + LH 17/17.
- Security regression PASS: single api/worker/poller, segregated users, canonical 0750 (worker+telegram blocked), no legacy bot, 0 SMTP listeners.
- Backup + restore drill PASS. Controlled reboot recovery PASS (0 failed units, canonical rev 66/50 leads retained, stable +25s).

## SAFETY (held throughout)

AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF · EMAILS_SENT=0 · CLIENT_MESSAGES_SENT=0 · SMTP_CALLS=0
VPS env source: EMAIL_REAL_SEND_ENABLED=false, MATER_NO_SEND=true.

## KNOWN LIMITATIONS (non-blocking, post-release acceptance)

1. OWNER_TELEGRAM_SMOKE = pending owner interactive taps. Allowed as post-release item (server
   routing + deployed code + automated handler tests all pass). Checklist provided.
2. 16 legacy offline tests RED by design (deprecated/no-send-blocks-send). Quarantined, 0 prod relevance.

## ARTIFACTS

dist/master_controller_android/MasterController-v0.4.0-rc1-release-bundle/ (apk, apk, aab, SHA256SUMS, BUILD_INFO, RELEASE_NOTES, ROLLBACK_GUIDE)

## NEXT ACTION (owner, optional)

- Perform Telegram smoke checklist (9 taps) for full owner acceptance.
- If desired, push branch + tag after confirming remote policy: `git push origin feature/... && git push origin v0.4.0-rc1`.
