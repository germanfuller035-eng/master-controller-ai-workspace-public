# Production Drift Timeline — Integration Wave 1

date: 2026-06-18 · all timestamps UTC · server TZ US/Eastern (EDT, UTC−4) · read-only

| timestamp (UTC) | event_type | entity | revision | writer | source_service | classification | evidence_source |
|---|---|---|---|---|---|---|---|
| 2026-06-16T18:51:54Z | freeze | store rev66/50 leads | 66 | verify | api | EXPECTED_AUTOMATION | backup 20260618_072634.json |
| 2026-06-18T10:15:34Z | scheduled run start | discovery cycle | — | mcworker | master-controller-discovery.service | EXPECTED_AUTOMATION | systemctl ExecMainStartTimestamp (06:15:34 EDT), Result=success, status=0 |
| 2026-06-18T10:15:43Z | lead create ×12 | 12 osm_overpass leads | 67..90 | verify (via API) | discovery→API | EXPECTED_AUTOMATION | live store created_at, all 12 == 10:15:43Z |
| 2026-06-18T10:15:50Z | store persist | rev90/62 leads | 90 | verify | api | EXPECTED_AUTOMATION | live store updated_at |
| 2026-06-18T10:15:50Z | queue persist | 41 jobs (13 new today) | queue_rev 146 | mcworker→API | worker | EXPECTED_AUTOMATION | job_queue.json updated_at |
| (no event) | send | — | — | — | — | N/A | send ledger frozen mtime 2026-06-16 07:10; 0 sends in window |

Key facts:
- DRIFT_WINDOW_START=2026-06-16T18:51:54Z · DRIFT_WINDOW_END=2026-06-18T10:15:50Z
- All mutating activity is a single authorized discovery cycle at 2026-06-18T10:15Z.
- No UNKNOWN / ANOMALOUS events. No send, no flag change, no second writer.
- _operation_log holds only 5 TEST_ONLY cutover ops (op-T1..op-C2, 2026-06-16) — not a per-revision
  journal; revision rows reconstructed from snapshot deltas + discovery correlation (inference noted).
