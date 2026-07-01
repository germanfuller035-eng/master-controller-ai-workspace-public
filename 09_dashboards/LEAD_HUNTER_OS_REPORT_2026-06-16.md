# Lead Hunter OS — Implementation Report & Operator Guide (2026-06-16)

Branch feature/lead-hunter-os. A deterministic, multi-source lead-intelligence subsystem under
tools/lead_hunter/. Isolated DB (never the canonical store). Promotion only via Master
Controller API. Autosend BLOCKED, scheduler disabled.

## Architecture
- src/state.mjs — 15-state machine (missing-website/email are own states, NOT rejection).
- src/repository.mjs — LocalJsonRepo (atomic, isolated lead-intel DB) + documented PostgresRepo
  interface. 18 collections per data model.
- src/campaign.mjs — campaign config, production-safe defaults (shadow, scheduler off,
  20 raw / 5 verified, clamped).
- src/normalize.mjs — deterministic name/domain/phone/email/address normalization, geoCell,
  Levenshtein similarity, evidence() with full provenance.
- src/dedupe.mjs — weighted dedupe; NEVER merges on name alone (strong key required); reversible.
- src/classify.mjs — 6-tier website, email confidence, identity (≥2 signals), lead routing.
- src/score.mjs — deterministic score_v2 (market 30 / digital-pain 30 / contactability 20 /
  identity 15 / freshness 5), versioned, explainable, null-safe.
- src/adapters/ — base (dry-run/live/budget/credential-gating) + Overpass (keyless),
  2GIS / DataForSEO v3 / Yandex (credential-gated), Manual CSV.
- src/pipeline.mjs — runDiscovery (source-failure isolation), runDedupe, verifyScoreClassify,
  campaignSummary (read-only dashboard).
- src/promote.mjs — API-ONLY promotion (idempotency, 409/503 handling, audit event, no fs writes).
- src/cli.mjs — campaign/discover/review/status/doctor/promote; live needs --live --confirm.

## Tests (offline, deterministic) — 115/115
- lh_foundation 19, lh_dedupe 19, lh_score_classify 29, lh_adapters 15, lh_promote 16,
  lh_pipeline_e2e 17. Covers normalization, fuzzy-name false-positive guard, restart
  persistence, source-failure isolation, idempotency, no-direct-canonical-write, promotion
  dry-run + mock-API live/duplicate/conflict/maintenance, no-send invariants.

## LIVE SHADOW CYCLE (Krasnodar, real OSM Overpass, no send)
- source_coverage: shop=hardware 5, shop=doityourself 0, craft=metal_construction 5.
- raw_candidates 10, unique 10, duplicate_groups 0.
- by_tier: NO_SITE 7, WEAK_SITE 3.  no_site_candidates 13(incl prior), email_ready 2.
- by_route: LOW_CONFIDENCE_RESEARCH, WEAK_SITE_MINI_AUDIT, NO_SITE_OFFER, NO_EMAIL_MANUAL_CONTACT.
- Top scored examples (with explanations): Югметаллпром 85 (WEAK_SITE→mini-audit),
  Металлтеплострой 85, Леруа Мерлен 71 (no-email→manual), Хозтовары 69 (no-site→offer).
- sends 0, emails 0, canonical_writes 0, errors 0, scheduler disabled.
- Validates: no-website businesses found+classified+kept; no-email kept valid; deterministic
  routing/scoring on real data.

## Operator quick reference
- DB location: `LEAD_HUNTER_DB=<path>` (default ./lead_hunter_db.json). Isolated from canonical.
- `node src/cli.mjs doctor` — show available sources + safety posture.
- `node src/cli.mjs campaign create --name X --region Y --niches a,b`
- `node src/cli.mjs discover --campaign <id>` (dry-run) | add `--live --confirm` for real OSM.
- `node src/cli.mjs review --campaign <id>` — dashboard summary + top-scored + why.
- Promotion: use src/promote.mjs with a Master Controller API client; dry-run by default;
  requires candidate.state=PROMOTION_APPROVED.

## Known limitation / next step
Only keyless sources (OSM Overpass, Manual CSV) are active → most candidates are no-website
(product-routing track). Website-bearing discovery (2GIS / DataForSEO v3 / Yandex) needs API
keys placed in protected config (TWOGIS_API_KEY / DATAFORSEO_LOGIN+PASSWORD / YANDEX_SEARCH_API_KEY);
adapters are built and credential-gated, will activate automatically when keys are present.
Production scheduler remains DISABLED pending owner go-ahead after a credentialed shadow pass.
