# Production Drift Forensic — DRIFT MATRIX

Captured: 2026-06-20 (UTC) · Production: 195.96.132.82 · Canonical rev **221**, **13** leads
Release branch: `feature/contact-enrichment-campaign-hub-release-v1` @ 8e98fec
Source baseline: `c5be621` (historical, NOT data truth)

## Acceptance gates
```
UNCLASSIFIED_DRIFT=0
UNKNOWN_DATA_MUTATIONS=0
UNKNOWN_SEND_EVENTS=0
UNKNOWN_RUNTIME_WRITERS=0
C_UNKNOWN_OR_UNSAFE_DRIFT=0
```

## Class A — EXPECTED_DATA_DRIFT (never revert, never copy back)

| entity | production | release/baseline | origin | evidence |
|---|---|---|---|---|
| canonical_revision | 221 | 1 (baseline) | active discovery + verify/score/audit jobs | monotonic; 141 COMPLETED jobs |
| canonical_leads | 13 | n/a | discovery scheduler (1 timer) | lead_ids captured in PRODUCTION_BASELINE_CURRENT.json |
| queue | 141 COMPLETED, 0 failed, 0 dead | n/a | worker pipeline | job_queue.json |
| enriched leads | 9 verify_v2_enrich, 4 official emails | 0 | prod enrichEmailFromSite | emails are real domains (bk.ru, artstroy-kuban.ru, elikacheli.ru, gbi2.ru) — not placeholders |

Resolution: **preserve as-is**. Deployment must not touch canonical/queue data.

## Class B — AUTHORIZED_RUNTIME_DRIFT (prod ahead of git; reconcile)

| path | prod vs baseline | origin | resolution | deployment_action |
|---|---|---|---|---|
| `src/worker/index.mjs` | +87 lines: `FIRST_TOUCH_DRAFT_GENERATE` handler, `enrichEmailFromSite`, `findContactPageUrl`, `verify_v2_enrich` | prod first-touch + enrichment work (uncommitted) | **prod is newer & correct** → capture into release; my separate `LEAD_ENRICH_CRAWL` is SUPERSEDED, drop it | capture-to-git; do NOT overwrite prod |
| `src/pipeline/service.mjs` | +40 lines: enrichment params on `applyVerification` (email/emailSource/emailSourceUrl/emailVerified), `identity_match_status` | prod | **prod newer** → capture; my `applyEnrichment`/`classifyEnrichedEmailStatus` SUPERSEDED, drop | capture-to-git |
| `src/server/index.mjs` | +42 lines: full `/first-touch/*` routes | prod | **prod newer** → capture; add my `/campaigns/*` additively | capture-to-git + add campaigns |
| `tools/telegram_gateway/contact_channel_extractor.mjs` | prod == baseline (no drift) | mine | **release newer (placeholder filter + same-domain)** — upgrades prod's live enrichment safety | DEPLOY (clean apply) |
| `osm_overpass_connector.mjs` + 6 others | untracked, prod==local sha | prior authorized | recover into git (done, commit e12fe16) | already in manifest |

## Class C — UNKNOWN_OR_UNSAFE_DRIFT

**NONE.** No unknown runtime writer, no unexplained data mutation, no send-ledger event,
no SMTP/network send, no unknown systemd service. `FIRST_TOUCH_DRAFT_GENERATE` drop-in
(`10-ft-draft-type.conf`) is the documented owner of the first-touch handler.

## Reconciliation decision

1. **Adopt production as the live baseline** for `worker/pipeline/server` (it is newer).
2. **Drop my superseded orchestration**: `LEAD_ENRICH_CRAWL`, `applyEnrichment`,
   `classifyEnrichedEmailStatus`, `/enrich` route, `contact_site_crawler` stage —
   production already enriches inside `LEAD_VERIFY` (no second writer).
3. **Deploy only the additive, non-conflicting wins**:
   - hardened `contact_channel_extractor.mjs` (placeholder filter + same-domain) →
     upgrades prod's existing `enrichEmailFromSite` safety;
   - Campaign Governor (`campaigns/service.mjs` + `/campaigns/*` routes + config) →
     net-new, no collision.
4. Campaign store is empty-by-default, additive, rollback-safe.
