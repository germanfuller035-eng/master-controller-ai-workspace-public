# SYSTEM TEST MATRIX

**Дата:** 2026-06-18

## Android (app/src/test) — 117 tests, 0 failed
- CommercialMappingTest: snake_case маппинг, offers_ready_for_send_review=3, money UNKNOWN≠0.
- OfferReviewMappingTest: 3 реальных offer, TEST_ONLY исключён, статусы локализованы, действия text-only.
- OwnerUiRawCodeSafetyTest: новые экраны без утечки сырых кодов.
- DtoMapping/PipelineQueue/Multichannel/Ops/TransportReadiness/OfflineAndMetadata/GateC1a/AgentPipeline — без регрессий.
- `:app:lintRelease` — SUCCESSFUL. `:app:assembleRelease`+`bundleRelease` — SUCCESSFUL, подпись валидна.

## Backend (tools/commercial_core/tests) — 335 tests, 0 failed
| Suite | Tests |
|---|---|
| commercial | 91 (RM7-RM10 регрессия summary) |
| continuous_pipeline | 33 |
| gate_c1a | 63 |
| multichannel | 48 |
| reply_correlation | 9 |
| route_security | 20 (RS1/RS2/RS9 счётчики приведены к 17/8; gating сохранён) |
| runtime_bundle | 20 |
| security | 15 |
| transport_readiness | 36 |

## Security / no-send (live)
- web intake: honeypot + consent rejection, TEST_ONLY staging без promotion.
- webhooks VK/MAX/Telegram → 403 FEATURE_DISABLED.
- shadow-wave: send_attempts=0, guessed_emails=0, direct_writes=0.
- safety-флаги все OFF; canonical writer=1; ledger=7 неизменен.
