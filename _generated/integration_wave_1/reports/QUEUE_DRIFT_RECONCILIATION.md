# Queue Drift Reconciliation — Integration Wave 1

date: 2026-06-18 · read-only

## Metric definition reconciliation (the source of the apparent jump)
- "28 completed" in the OLD approved baseline was a documentation figure. The actual frozen rev66-era
  queue backup (release_20260617_*/job_queue.json) holds 27 COMPLETED jobs at queue_revision 104.
  → old approved "28" vs actual 27 = a 1-job rounding in the old package, NOT live drift.
- "41" = live job_queue.json jobs object count.
- "queue_revision=146" = a MONOTONIC write counter, NOT a job count. Must not be compared to job totals.
QUEUE_METRIC_DEFINITION_RECONCILED=YES

## Live queue (job_queue.json, updated_at 2026-06-18T10:15:50Z)
- total_jobs=41, queue_revision=146
- by_status: COMPLETED=41 (pending=0, running=0, failed=0, dead_letter=0, cancelled=0)
- by_type: LEAD_VERIFY=29, LEAD_DISCOVERY=9, HEALTH_CHECK=2, METRICS_REFRESH=1
- jobs_created_2026-06-18=13
- send-capable jobs=0

## Old vs new
| metric | rev66-era backup | live |
|---|---|---|
| total jobs | 27 | 41 |
| completed | 27 | 41 |
| failed | 0 | 0 |
| dead_letters | 0 | 0 |
| queue_revision | 104 | 146 |
NEW_JOBS_TOTAL=14 (27→41) · NEW_JOBS_EXPLAINED=14 (all COMPLETED discovery/verify/health/metrics)
UNKNOWN_JOB_TYPES=0 · UNEXPECTED_SEND_JOBS=0 · FAILED_JOBS=0 · DEAD_LETTERS=0

## Conclusion
The queue growth is the same authorized discovery+verify automation that produced the 12 leads.
No send-capable jobs, no failures, no dead letters, no unknown types. CLEAN.
