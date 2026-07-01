# Master Controller v0.4.0-rc1 — FINAL RELEASE REPORT

Date: 2026-06-17 · Branch: feature/master-controller-lead-hunter-integration
Tag target: ef6eaf3 (verified) · Version: 0.4.0-rc1 / versionCode 4

## Gate results (all programmatically verifiable gates)

| Gate | Result | Evidence |
|------|--------|----------|
| Tag target verified | YES | ef6eaf3 = 73f17ae (full release source+artifacts) + checkpoint doc only |
| Legacy failures classified | 16/16, 0 unclassified, 0 regression | CLASSIFICATION report; 14/16 untracked scratch, 2 target undeployed legacy bot |
| SSH access | RESTORED | masterctl@195.96.132.82 via AI_SECRETS dedicated key (fp iO8wf6…) |
| Telegram UX deploy | PASS (already deployed) | deployed api_only files byte-identical to committed patch (cd63e17/55bf548) |
| Telegram service | active, enabled, 1 poller, 0 restarts, 0 conflicts, 0 secret logs | systemd + journal |
| api_only test gate | 25/25 + 18/18 | tg_api_only + handler_routing |
| Android required screens | PASS (22/22) | completeness matrix |
| Android compact nav | PASS (5 tabs) | MaterControllerRoot Tab sealed class |
| Android clean build | BUILD SUCCESSFUL | gradle clean test lint assemble* bundle* |
| Android tests | 66 passed / 0 failed (debug+release) | test-results XML |
| Android lint | 0 errors / 120 warnings (all non-blocking) | UnusedResources 94, GradleDependency 18, others |
| APK signature | VERIFIED rc=0 (key 11038fca…, unchanged) | apksigner |
| AAB signature | jar verified | jarsigner |
| SHA256 | regenerated from clean build | SHA256SUMS-v0.4.0-rc1.txt |
| Secrets in APK/AAB | NO (0 matches) | secret scan; HTTPS-only; R8 retained critical classes (mapping.txt) |
| Cross-client consistency | YES | identical queue keys + statuses across API/Android/Telegram |
| Revision conflict handling | PASS | E2E stale-revision + RepoLogic.reduceMutation |
| Full E2E (no-send) | PASS 21/21 + LH 17/17 | pipeline_e2e_nosend + lh_pipeline_e2e |
| API suite | 47/47 | run_all.mjs (store/ledgers unchanged) |
| Security regression | PASS | single api/worker/poller, 0 legacy, segregated users, canonical 0750 |
| Backup | PASS | release_20260617_prereboot + MANIFEST.sha256 |
| Restore drill | PASS | restored to valid JSON, checksum match, parity |
| VPS reboot recovery | PASS | all services active 0 restarts, 0 failed units, canonical retained (rev 66/50 leads), stable +25s |

## Safety (held throughout)

AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF · EMAILS_SENT=0 · CLIENT_MESSAGES_SENT=0 · SMTP_CALLS=0
Source-of-truth: /etc/master-controller/*.env → EMAIL_REAL_SEND_ENABLED=false, MATER_NO_SEND=true.
Canonical: revision 66, 50 leads, 0 sent=true, 0 SENT status (before and after reboot).

## Architecture invariants verified on VPS

VPS sole canonical writer (canonical/ dir 0750 masterctl-only; worker+telegram cannot read).
API sole mutation path. Worker unit: "no canonical file access". Android + Telegram API-only (HTTPS).
Single scheduler/worker/poller/Overpass runtime. No legacy bot deployed/imported/served. No 2nd ledger.

## Known limitations (post-release acceptance items, non-blocking)

1. OWNER_TELEGRAM_SMOKE: interactive owner taps not performed this session. Allowed as documented
   post-release item because server routing + deployed code + automated handler tests all pass
   (18/18 + 25/25). Checklist provided to owner.
2. 16 legacy offline tests remain RED by design (deprecated bot / no-send-blocks-send expectations);
   formally quarantined, 0 production relevance. Not deleted (left as-is, untracked scratch).

## Tag

Annotated tag v0.4.0-rc1 created on ef6eaf3 (unsigned annotated — tag signing not configured).
Not pushed (no push instruction / verify remote policy first).
