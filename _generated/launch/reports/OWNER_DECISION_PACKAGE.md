# Owner Decision Package — Controlled Production Launch (Phase 2)

date: 2026-06-17 · branch feature/controlled-production-launch-v1 · HEAD 7ea6993 · STOP POINT = GATE A

This package consolidates all 27 owner decisions for the final launch. **Recommended defaults are
shown but NOT silently approved.** Capacity numbers are NOT invented. After this package the run
**STOPS at GATE A** (no live access, no production change, no sends performed).

## Recommended minimal technical-launch defaults (owner confirms)
ALERT_CHANNEL=OWNER_TELEGRAM · AUTOSEND=BLOCKED · LIVE_SEND=PER_MESSAGE_OWNER_APPROVAL ·
PILOT_PRODUCT=MINI_AUDIT · MINI_AUDIT_PRICE=10000_RUB · LEAD_HUNTER_PAID_CREDENTIALS=DEFERRED ·
GIT_REMOTE=DEFERRED · LEGAL_REVIEW=REQUIRED_BEFORE_SCALE

## Decisions (id · question · recommended_default · blocks)
| id | question | recommended_default | blocks_live | blocks_tech | blocks_commercial | deferrable |
|----|----------|--------------------|----|----|----|----|
| od16 | Alert delivery channel | OWNER_TELEGRAM | YES | no | no | no |
| od17 | SLO targets | adopt INTERNAL_TARGET set; refine post-soak | YES | no | no | partial |
| od18 | RPO target | 24h (proposed) | YES | no | no | partial |
| od18b/od18 | RTO target | 4h (proposed) | YES | no | no | partial |
| od19 | Backup encryption | enable (owner) | YES | no | no | partial |
| od20 | Off-site backup | enable (owner) | YES | no | no | partial |
| od01 | Owner weekly capacity | OWNER MUST PROVIDE (not invented) | no | no | YES | no |
| od02 | Delivery capacity | OWNER MUST PROVIDE | no | no | YES | no |
| od03 | Support capacity | OWNER MUST PROVIDE | no | no | YES | no |
| od05 | Product statuses | keep 2 ACTIVE / 7 DRAFT / 9 PLANNED | no | no | YES | no |
| od06 | Product prices | Mini Audit 10000 RUB; others UNKNOWN | no | no | YES | no |
| od10 | Approved claims | evidence-backed only; no guarantees | no | no | YES | no |
| od13 | Tax regime/rate | LEGAL_REVIEW_REQUIRED | no | no | no | defer |
| od27 | Commercial cycle start authorization | TIER_0/1 first | no | no | YES | no |
| od22 | Legal/privacy/consent review | REQUIRED_BEFORE_SCALE | no | no | YES | defer-to-scale |
| od15 | Lead Hunter paid credentials | DEFERRED (use Overpass/manual CSV) | YES* | no | no | YES |
| od21 | Communication-monitor file disposition | per Security disposition | no | no | no | YES |
| od23 | Git remote policy | DEFERRED (no remote) | no | no | no | YES |
| od24 | Telegram owner acceptance smoke | owner performs (Phase 12) | YES | no | no | no |
| od25 | Android physical-device acceptance | owner performs (Phase 13) | YES | no | no | no |
| od26 | Authorize live verification (GATE A) | APPROVE_GATE_A_READ_ONLY_LIVE_VERIFICATION | YES | no | no | no |
| od07 | Start Pack price conflict | owner | no | no | no | YES |
| od08 | Pilot product | MINI_AUDIT | no | no | partial | no |
| od09 | Product pause/merge | owner | no | no | no | YES |
| od11 | Approved cases | owner | no | no | no | YES |
| od12 | Cash balances | owner | no | no | no | YES |
| od14 | Expense classification | owner | no | no | no | YES |
| od04 | Monthly revenue target | owner | no | no | no | YES |

Reconciled totals (authoritative, from flags): 27 total · 9 block live verification · 8 block
commercial launch · 0 block technical consolidation · 2 legal-review.

## What is needed to proceed past this point
1. **GATE A** (`APPROVE_GATE_A_READ_ONLY_LIVE_VERIFICATION`) + live SSH/API access → Phases 3-6
   (live baseline, source/version match, health, backup evidence).
2. **GATE B** (`APPROVE_GATE_B_EXACT_PRODUCTION_CHANGE`) — only if Phase 4 finds a runtime delta →
   Phases 8-11 (backup, deploy, post-deploy verify).
3. Owner-performed **Telegram smoke** (Phase 12) + **Android device smoke** (Phase 13).
4. **GATE C** per message (`exact lead/recipient/subject/body/channel`) → any commercial send.

Nothing past Gate A can be executed by me without owner approval tokens and live access.
