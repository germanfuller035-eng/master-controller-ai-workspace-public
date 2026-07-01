# Master Controller — Autonomous Pipeline (progress, 2026-06-16)

## UPDATE 6 — multi-candidate shadow PASSED on safety; scheduler blocked on data-source reality
- Ran 6-candidate shadow (OSM beauty, Krasnodar). Quality table: ALL 6 →
  MANUAL_REVIEW_PRODUCT_ROUTING (no website). Safety gate result:
  guessed_ready=0, fake_audits=0, dead_letters=0, false_promotions=0, sends=0. Gate correct.
- REAL DATA-SOURCE LIMITATION (owner decision needed): the only keyless source (OSM Overpass)
  returns businesses WITHOUT websites in this region. Since auto Mini-Audit requires a
  confirmed reachable website, ZERO OSM candidates can reach verified_ready→audit→draft. They
  correctly park in product-routing. So a "full quality pass" (3-5 candidates THROUGH audit+
  draft) is not achievable from OSM alone — it needs a website-bearing source (2GIS/DataForSEO,
  creds required) or accepting that OSM feeds only the future product-catalog (no-website) track.
- Scheduler (Phase 5) remains OFF: enabling 24/7 OSM discovery would only generate
  product-routing leads, not audit/draft pipeline leads. Not wrong, but not the stated goal.
- Shadow candidates cleaned; canonical baseline 50 leads restored (rev 38). autosend BLOCKED.

## UPDATE 5 — shadow run executed; 2 real bugs found+fixed; scheduler gate NOT passed
- Controlled shadow cycle ran live (OSM car_repair, Krasnodar bbox, limit 5).
- Bug 1 (fixed, commit 0a66a40): discovery did not auto-enqueue LEAD_VERIFY → staged
  candidates stalled. Discovery now chains verify. Re-run: the 1 OSM record ("СТО", no site)
  flowed discovery→verify→score→MANUAL_REVIEW_PRODUCT_ROUTING (correct — not promoted, no
  fake audit). Gate working as designed.
- Bug 2 (fixed, commit 79c1a75): worker token got 401 on /automation/status + /pipeline/counts
  (owner-only) → METRICS_REFRESH dead-lettered. Added requireAuthOrService; verified worker
  reads now 200, METRICS_REFRESH COMPLETED, DEAD_LETTER=0.
- Post-fix live state: jobs COMPLETED=8 DEAD_LETTER=0, autosend BLOCKED, sendLive=false,
  50 leads intact (rev 25), shadow artifacts cleaned.
- SHADOW_MODE_RESULT=NOT_PASSED: only 1 real candidate surfaced (OSM bbox sparse + flaky), not
  the ≥3-5 multi-candidate quality table the gate requires. Per rules, scheduler stays OFF.
- NEXT: obtain a denser candidate batch (wider OSM bbox / multiple niches, or 2GIS/DataForSEO
  if creds exist) for a real multi-candidate shadow quality pass, THEN enable scheduler.

Foundation of the autonomous pipeline built + deployed + verified live this pass: the
API-owned job queue and the VPS API-only worker. The business pipeline phases (discovery →
verify → score → audit → draft → follow-up) and Telegram conversion remain — they depend on
this foundation and are multi-session. No PASS is claimed without proof.

## DONE + verified live this pass
### Phase 1 — API-owned persistent job queue
- `jobs/queue_store.mjs` (atomic temp+rename + lock + revision; operational queue, API-process
  only — NOT a second business store/ledger) + `jobs/service.mjs` (full lifecycle).
- Lifecycle proven: idempotent enqueue, atomic claim w/ lease, heartbeat (leaseholder-only),
  complete, fail→retry+exponential backoff, dead-letter at max attempts, stale-lease recovery,
  cancel, restart persistence, no lost update. Tests: jobs_queue 16/16; backend 47/47.
- Routes: `/jobs/*` (worker service credential, scopes enforced, 401/403) + `/automation/status`
  (owner). LIVE on VPS: enqueue→claim→complete cycle; no-auth→401.

### Phase 2 — VPS API-only worker service
- `worker/index.mjs`: claims jobs over HTTPS, handler registry, reports via API. No canonical
  file access, no SMTP, no send. Pipeline handlers return BLOCKED_DEPENDENCY until wired (no
  fabricated success). Graceful SIGTERM, bounded polling, idle sleep.
- `master-controller-worker.service` under dedicated low-priv user `mcworker` (nologin),
  MemoryMax 192M, ProtectSystem=strict, enabled at boot.
- OS isolation PROVEN: canonical dir locked 0750 masterctl-only →
  WORKER_CAN_READ_CANONICAL=NO, WORKER_CAN_WRITE_CANONICAL=NO, WORKER_CAN_READ_QUEUE=NO;
  API user retains access; API healthy after lockdown.
- LIVE: single instance (verified), 2 HEALTH_CHECK jobs COMPLETED end-to-end by the deployed
  worker, restart recovery active, graceful shutdown ("worker stopped"). RAM 350/960MB.

## NOT done (honest — large build, multi-session)
- Phase 3 Lead discovery 24/7: handler is a BLOCKED_DEPENDENCY stub; real 2GIS/DataForSEO
  adapter wiring + staging + dedupe not built.
- Phase 4 Verification, Phase 5 scoring, Phase 6 auto-audit, Phase 7 auto-draft,
  Phase 8 follow-up/reply planning: not built this pass (worker registry has the slots).
- Phase 9 observability: /automation/status live (basic); full metrics/alerts not built.
- Phase 10 full no-send E2E: not run this pass.
- Phase 11 Telegram API-only: NOT started (5033-line bot; stopped + guarded).
- Phase 12 Android: unchanged (rc1). Phase 13 reboot/release: not run.

## Safe state
VPS sole canonical writer (rev 7, 50 leads); worker is API-only with zero canonical FS access;
AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, 0 emails, 0 SMTP. IMAP read-only timer + daily backup
+ fail2ban all active. RAM 350/960MB, disk 33%.

## UPDATE 2 — Phase 1+3 real discovery + pipeline core DONE (commit 1883935)
- LEAD_DISCOVERY stub REPLACED with a real handler: keyless OSM Overpass fetch → normalize →
  stage via API. Daily limit + STAGING backpressure (BLOCKED_CAPACITY). Worker stays API-only
  (no canonical FS). Live OSM fetch verified on VPS (returned a real Krasnodar СТО record).
- pipeline/service.mjs: stageCandidate (dedupe-idempotent), deterministic computeScore
  (score_v1, versioned, null-safe), verifiedReadyDecision gate. Maps/marketplace/messenger →
  MANUAL_REVIEW_PRODUCT_ROUTING (no fake mini-audit); guessed email never VERIFIED_READY.
- API: POST /leads/stage, GET /pipeline/by-status/:s, /pipeline/counts; automation status +pipeline.
- Tests: pipeline 17/17, queue 16/16, writes 14/14, replies 23/23, backend 47/47. Live: stage +
  domain-dedupe proven (synthetic TEST_ONLY, removed; 50 real leads, rev 9).
- STILL stubbed/not-built (honest): LEAD_VERIFY, LEAD_SCORE wiring into worker, AUDIT_GENERATE,
  DRAFT_GENERATE, FOLLOWUP_PLAN, REPLY_DRAFT_GENERATE handlers (service fns for score/gate exist
  + tested, but verify/audit/draft worker handlers + engines not yet wired). Telegram API-only
  (Phase 10), Android queues (Phase 11), full E2E (Phase 9), reboot (Phase 12) not done.
- NOTE: Overpass is a flaky public API (intermittent empty responses); discovery handler treats
  empty as clean COMPLETED (discovered=0), not failure.

## UPDATE 4 — all 7 handlers real + E2E harness + chain fix (commits 5f80dce, c00d6ee, 0a66a40)
- FOLLOWUP_PLAN + REPLY_DRAFT_GENERATE: REAL (stubs removed). Canonical D2/D5/D10 eligibility;
  reply drafts only for interested/asks_details/asks_price/wants_call/not_now; both
  approval-pending, never send. Tests: followup_reply 20/20.
- Full failure-oriented no-send E2E harness: 21/21 (happy path + duplicate/NXDOMAIN/timeout/
  guessed-email/maps-routing/identity-conflict/opt-out/recipient-invalidation/reply-block/
  unmatched/not-found + no-send invariants). Emits E2E_REPORT.
- Discovery now auto-enqueues LEAD_VERIFY (shadow run found staged candidates weren't chaining).
- LIVE on VPS: followup DRAFT_READY, reply-draft asks_price ok, spam→422; all deployed.
- Offline suites: pipeline 17, verify 19, audit/draft 16, followup_reply 20, e2e 21, queue 16,
  writes 14, replies 23 + backend 47 — all green.

### Honest remaining (NOT done — stopping checkpoint)

## UPDATE 3 — Phases 1-4 commercial pipeline core DONE + live-proven (commit 6da41d1)
- LEAD_VERIFY, LEAD_SCORE, AUDIT_GENERATE, DRAFT_GENERATE: all REAL handlers (stubs removed),
  transactional + idempotent. Worker does bounded HTTP probes (no browser), submits via API.
- Safety-correct classifiers: timeout≠NOT_FOUND, 403≠no-site, parked→BROKEN; identity needs
  >1 signal incl name-on-site (OSM-only never VERIFIED); guessed/OSM email never official;
  audit findings all evidence-backed, cautious wording, no fabricated traffic/revenue claims;
  draft official-recipient-only + approval-gated; edit/recipient change invalidates approval.
- Tests: pipeline 17, verify 19, audit/draft 16, queue 16, writes 14, backend 47 — green.
- LIVE E2E on VPS (synthetic TEST_ONLY, cleaned): stage→verify→VERIFIED_READY(92.5)→
  AUDIT_READY(4 findings)→draft+approval PENDING. AUTOSEND=BLOCKED, SMTP_CALLS=0, 50 leads rev 15.
- STILL NOT DONE (honest): FOLLOWUP_PLAN + REPLY_DRAFT_GENERATE handlers (BLOCKED_DEPENDENCY);
  full multi-failure E2E harness (Phase 7); shadow quality run (8) + daily scheduler (9);
  Telegram/Android. Production scheduler remains OFF (correct).

## NEXT_ACTION
