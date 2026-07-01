# Master Controller × Lead Hunter — Integration Contract (2026-06-16)

Integration branch: feature/master-controller-lead-hunter-integration (from MC v0.3.5-rc1 8445bf6;
lead-hunter 9d7c0fa already descends from the same base, so both contours share one tree — no
risky merge, only connecting code).

## Phase 1 — Duplication inventory + reuse decisions
| CAPABILITY | MASTER CONTROLLER | LEAD HUNTER | CANONICAL OWNER | REUSE | DEPRECATE |
|---|---|---|---|---|---|
| discovery sources | OSM-only handler in worker | 5 adapters (Overpass/2GIS/DFS/Yandex/CSV) | — | Lead Hunter adapters | MC inline OSM fetch → call LH |
| normalization | pipeline.normalize* | normalize.mjs (richer) | — | Lead Hunter | MC dup helpers stay for canonical |
| dedupe | stageCandidate dedupe_key (domain/phone/name) | weighted multi-key + reversible | MC for canonical verdict | LH for cross-source pre-merge; MC for canonical | none |
| candidate repo | canonical store | isolated LocalJsonRepo | MC canonical; LH intel only | both, separate roles | none |
| identity verify | LEAD_VERIFY handler | classifyIdentity (prelim) | MASTER CONTROLLER | MC verdict authoritative | none |
| website classify | pipeline.classifyWebsite | classify 6-tier (richer) | shared logic | LH richer tiers feed hint | reconcile to one lib (future) |
| contact evidence | email_status gate | classifyEmail | MASTER CONTROLLER | MC authoritative | none |
| scoring | score_v1 (canonical readiness) | score_v2 (candidate intel) | SEPARATE roles | both, contracted | neither |
| product routing | applyScore gate | leadRoute (prelim hint) | MASTER CONTROLLER | MC authoritative | none |
| promotion | /leads/stage | promote.mjs → API | MC via API | LH calls MC | none |
| scheduling | master-controller-discovery.timer | disabled | MASTER CONTROLLER | MC owns | LH timer stays OFF |
| retry/persistence | job queue | repo | MC queue authoritative | both | none |

## Phase 2 — Responsibility contract (FROZEN)
- Lead Hunter OWNS: source adapters, raw collection, normalization, source retries/health,
  provenance, cross-source merge, preliminary classification, candidate_intelligence_score_v2,
  candidate intelligence record (isolated repo).
- Master Controller OWNS: canonical lead creation + ID, production dedupe verdict, identity
  verdict, official-contact eligibility, VERIFIED_READY, canonical_readiness_score_v1, audit,
  draft, approval, replies, follow-ups, outbound, the ONE production scheduler, WIP/daily limits.
- Lead Hunter preliminary result CANNOT set VERIFIED_READY / AUDIT_READY / DRAFT_READY /
  APPROVED / SENT / WAITING_REPLY / DO_NOT_CONTACT. Those are MC-only.

## Phase 3 — Score contract (both retained, separate)
- candidate_intelligence_score_v2 (Lead Hunter): discovery ranking + source priority +
  enrichment priority + product-route HINT. NEVER authorizes verified/audit/draft/send.
- canonical_readiness_score_v1 (Master Controller): commercial readiness, verified identity,
  confirmed website, official contact, risk gates, VERIFIED_READY decision.
- Persist separately on the canonical lead: candidate_score / candidate_score_version /
  canonical_score / canonical_score_version. Never overwrite one with the other.

## Phase 6/10 — Scheduler + Overpass reconciliation
- ONE production scheduler: master-controller-discovery.timer. Lead Hunter timer stays disabled.
- Discovery job calls the Lead Hunter Overpass adapter (single runtime Overpass fetcher); the MC
  inline OSM fetch in the worker is superseded by the LH adapter call.

## INTEGRATION OUTCOME (live-proven 2026-06-16)
DONE + verified:
- Core architectural objective MET: Lead Hunter → canonical ONLY via POST
  /lead-intelligence/promote (single API path). Live: candidate CREATED, re-promote
  DUPLICATE_BLOCKED, auto-enqueued LEAD_VERIFY.
- Score contract enforced in production: candidate_score (score_v2=72) persisted SEPARATELY;
  canonical score unset until verify→score runs. Never overwritten.
- One canonical writer, one job queue, one scheduler (MC), Lead Hunter scheduler stays OFF.
- Tests: backend 47/47, Lead Hunter 115/115, promote 16/16. AUTOSEND=BLOCKED, 0 sends,
  canonical writes from Lead Hunter = 0 (API-only). 50 leads rev 56.

NOT done (honest — independent/blocked, not core to the unification):
- Scheduler invoking the LH adapter in-worker (currently MC discovery uses its own OSM call;
  reconciling to one Overpass runtime is a worker-handler swap — staged, low risk).
- Website-rich credentialed shadow (Track B): 2GIS/DataForSEO/Yandex adapters built +
  credential-gated; BLOCKED on keys in D:\AI_SECRETS (TWOGIS_API_KEY / DATAFORSEO_LOGIN+PASSWORD
  / YANDEX_API_KEY). Track A (Overpass product-routing) already proven.
- Telegram API-only (Phase 13), Android automation queues (Phase 14): large independent builds,
  not started.
- v0.4.0-rc1 release: deferred until Telegram/Android land (would be a false full-release now).

NEXT: provide a website-bearing source key to run Track B credentialed shadow → then the
audit/draft commercial track has real input; Telegram/Android are separate build sessions.

## UPDATE 2 — Overpass reconciled + Track B commercial route proven (live)
- DEFECT FIXED: OVERPASS_RUNTIME_IMPLEMENTATIONS=1. Worker LEAD_DISCOVERY now routes through the
  Lead Hunter OverpassAdapter (single runtime fetcher); MC inline OSM removed from runtime.
  LIVE: discovery COMPLETED runtime=lead_hunter_overpass_adapter. LH src deployed to VPS.
- Credentials: 2GIS/DataForSEO/Yandex all ABSENT → adapters stay gated (per spec, non-blocking).
- WEBSITE_RICH_MANUAL_SHADOW=PASS: Manual CSV Track B proven LIVE end-to-end —
  promote→CREATED→VERIFIED_READY(score 100)→AUDIT_READY(4 evidence findings)→draft+APPROVAL_PENDING.
  GUESSED_EMAILS_READY=0, 0 sends, TEST_ONLY cleaned (50 leads rev 66).
- Tests: lh_trackb_manual 10/10; backend 47/47; LH suites green.

### Still NOT done (large independent builds — honest)
- Telegram API-only (Phase 7): 5033-line bot conversion + VPS service — not started this session.
- Android automation queues (Phase 8): not built.
- Reboot proof (Phase 10) was passed in a prior session; not re-run after these changes.
- v0.4.0-rc1 release (Phase 11): deferred — would be a false full-release without Telegram/Android.
- WEBSITE_RICH_CREDENTIALED_SHADOW=BLOCKED_CREDENTIALS (no keys).
