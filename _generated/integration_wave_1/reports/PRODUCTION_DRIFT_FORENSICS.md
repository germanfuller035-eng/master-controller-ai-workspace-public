# Production Drift Forensics — Integration Wave 1 (read-only)

date: 2026-06-18 · branch feature/integration-wave-1-commercial-core-v1 · HEAD 1286c1c
DRIFT_VERDICT=EXPECTED_ORGANIC_ACTIVITY · PRODUCTION_CHANGES=0 · SSH=read-only (masterctl key fp iO8wf6…)

## Headline
The 66→90 drift is one Lead Hunter discovery run. There was NO 8th send — the prior "8" was a
metric-definition error. Single writer intact. Canonical integrity PASS. Rebaseline to v2 is safe;
deployment still requires fresh owner reapproval against baseline v2.

## Corrected send count (the critical safety finding)
- Authoritative ledger /opt/master-controller/13_sales/outbound_send_ledger.jsonl = 7 SENT entries,
  file frozen read-only (mtime 2026-06-16 07:10), last entry 2026-06-16T08:09:11Z. = approved 7.
- My prior pass reported "8" from a DIFFERENT metric: a substring scan of lead objects for a "sent"
  marker. That scan returns 8 in BOTH the rev66 backup AND the live store — identical sets
  (TEST_OWNER, GBIRESURS, DKBI_RU, BETON-MAST, STROYDVOR, MEGALIT-KR, ZAVODATOM, INTERNAL_V).
  NEW_sent_markers_in_window = []. So historical successful sends = 7 (unchanged), not 8.
- SMTP calls in window = 0. Autosend enable events = 0. SEND_ALLOWED_LIVE enable events = 0.

## Timeline (UTC; server TZ is US/Eastern EDT = UTC−4)
- 2026-06-16T18:51:54Z — rev66 / 50 leads frozen (op verify-lh_TEST_ONLY_TRACKB).
- 2026-06-18 ~07:26 EDT — daily canonical backup still rev66 / 50 leads (20260618_072634.json).
- 2026-06-18 06:15:34 EDT (10:15:34Z) — master-controller-discovery.service ran (Result=success,
  ExecMainStatus=0, User=mcworker, ExecStart node src/scheduler/daily_discovery.mjs, MATER_API_BASE
  http://127.0.0.1:8787/api/v1, region Krasnodar, niches beauty/car_repair/dentist, limit 20).
- 2026-06-18 10:15:43Z — 12 new leads created (one batch).
- 2026-06-18 10:15:50Z — canonical store written: rev90 / 62 leads (updated_by=verify).
=> The whole 66→90 jump is concentrated in one discovery cycle on 2026-06-18 morning, not spread
   organically across two days — but it is a single authorized scheduled run.

## Revisions 66→90 (24 increments)
24 increments ≈ 12 new leads × 2 canonical ops each (create candidate + route to
manual_review_product_routing). No revision gaps observed across snapshots (7→9→15→53→66→90 captured
in backups; intermediate numbers are the per-op bumps of the single API writer). No multi-writer
revision, no revision rollback, no direct file write (discovery promotes via the API, not the file).
Evidence basis: store snapshots in /opt/master-controller/backups + live; discovery unit Result;
store mtime == discovery run time. Inference (not a per-revision journal): the API keeps only a
5-entry _operation_log of TEST_ONLY cutover ops, so individual revision rows are reconstructed from
snapshot deltas + the single discovery correlation, not a full per-revision ledger. Stated as such.

## Single writer & integrity
- Processes: api PID615 (User=masterctl), worker PID620 (User=mcworker, API-only), telegram PID7757
  (User=mctelegram, API-only). Telegram/worker units have empty ReadWritePaths and the canonical dir
  is 0750 masterctl → they cannot write the store directly. No cron writer. No second send ledger
  writing (email ledger also frozen mtime Jun 16). CANONICAL_WRITER_COUNT=1.
- Integrity at rev90: leads=62, duplicate_ids=0, id_mismatch=0, missing_status=0, JSON parse OK,
  commercial sections=0.

## Queue 27→41 (queue_revision 146)
- queue_revision is a monotonic counter, NOT a job count. Old rev66-era queue backup = 27 jobs
  (queue_revision 104), all COMPLETED. Live = 41 jobs, all COMPLETED; 13 created 2026-06-18.
  Types: LEAD_VERIFY 29, LEAD_DISCOVERY 9, HEALTH_CHECK 2, METRICS_REFRESH 1. Send-capable jobs=0,
  failed=0, dead_letters=0. (NB: the OLD approved baseline said "28 completed"; the actual frozen
  rev66 queue backup holds 27 — a 1-job documentation rounding in the old package, not live drift.)

## Verdict
All 24 revisions, all 12 leads, all new queue jobs, and the send count are explained by authorized
automation under a single writer. DRIFT_VERDICT=EXPECTED_ORGANIC_ACTIVITY. GATE_B_REBASELINE_ALLOWED=YES.
No production change made. Deployment NOT executed — awaits owner reapproval bound to baseline v2.
