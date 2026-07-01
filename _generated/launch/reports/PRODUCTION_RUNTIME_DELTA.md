# Production Runtime Delta (Phase 8)

date: 2026-06-17 · basis: OFFLINE git analysis (live source hashing requires SSH, currently DENIED)

## Comparison
- v0.4.0-rc1 == commit 9d346f3 (production release; ancestor of the chain).
- consolidation candidate == 7ea6993; controlled-launch HEAD == 48c8260 (adds only `_generated/launch/` reports).

## Method + limitation
Live production file hashing (`sha256sum` over runtime paths) requires read-only SSH, which is DENIED
(no authorized key). Therefore this delta is derived from git history of what the OS-building chain
changed AFTER the release commit 9d346f3, classified by path. It is NOT yet live-confirmed.

## Delta classification (post-9d346f3 chain content)
| Area | Class | Runtime-required | Deployment-required |
|------|-------|------------------|---------------------|
| docs_canonical_proposed/** + applied canonical docs (261) | DOCUMENTATION_ONLY | no | no |
| tools/{revenue,delivery,finance,executive,product,customer_success,analytics,growth,conversation_hub,integration,orchestrator,security,reliability,consolidation}_os | OFFLINE_OS_ONLY | no | no |
| tools/*/tests/**, fixtures | TEST_ONLY | no | no |
| _generated/** (reports, manifests, bundles) | OFFLINE_TOOLING_ONLY | no | no |
| tools/mater_controller_api/src (backend) | NO_DIFFERENCE expected (no post-release backend change authored) | yes | LIVE-CONFIRM |
| tools/telegram_gateway (runtime) | NO_DIFFERENCE expected | yes | LIVE-CONFIRM |
| tools/communication_monitor (read-only IMAP) | OFFLINE tracked subset; runtime unchanged | yes | LIVE-CONFIRM |
| canonical data / schema | NO_DIFFERENCE (never touched offline) | yes | no |

## Required output
WHOLE_REPO_DEPLOYMENT_REQUIRED=NO
MINIMAL_RUNTIME_DEPLOYMENT_SCOPE=NONE_EXPECTED (pending live source-hash confirmation under SSH)
DATA_MIGRATION_REQUIRED=NO
SERVICE_RESTART_REQUIRED=NO_EXPECTED

The 261 canonical documentation files and all offline OS modules are NOT VPS runtime files and must
NOT be deployed. The consolidation chain added documentation + offline tooling on top of the existing
production release; no production backend/Telegram/IMAP runtime change was authored after 9d346f3.
Final confirmation that production source == 9d346f3 still requires the Gate-A SSH hash pass.
