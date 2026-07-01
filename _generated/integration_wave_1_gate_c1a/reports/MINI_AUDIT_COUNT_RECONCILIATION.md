# Mini Audit Lead Count Reconciliation (52 ↔ 62)

date: 2026-06-18 · verified on production.

## Root cause: NOT A BUG
`52` is the **operational subset** of leads in the active Mini Audit contour; `62` is the **full
canonical base**. The Android app showed the bare operational `total` (52) with an ambiguous label
"Всего лидов", which read as if the whole base were 52.

## The numbers
```
canonical_total_leads        = 62
mini_audit_operational_leads = 52
excluded_from_mini_audit     = 10   (rejected: 9, waiting_reply: 1)
unknown_exclusions           = 0
```

## Where 52 comes from (production-only module)
`tools/telegram_gateway/mini_audit_operator_mode.mjs` → `getMiniAuditOperatorState()`:
`allLeads.filter(!isHidden)` then `leads = allLeads.filter(!isArchived)` where
`ARCHIVED_STATUSES = {rejected}`. The API's `mini-audit/status.total` = `s.leads.length` = 52.

## Fix
- Backend (additive): `GET /api/v1/mini-audit/lead-count-definitions` returns canonical/operational/
  excluded counts + a per-count Russian definition + the excluded breakdown. Pure set-difference in
  `commercial_core/lib/reconciliation.mjs` (no reimplementation of the operator filter).
- Android: MiniAuditHome now shows **"Всего в системе: 62 · В контуре Mini Audit: 52 · Не включены: 10"**
  with a "Почему отличаются показатели?" expandable explanation and the excluded-by-status breakdown.
  The discrepancy is explained, not hidden behind a single number.

```
LEAD_COUNT_52_ROOT_CAUSE = operational subset (active leads), 10 excluded (9 rejected + 1 waiting_reply edge)
EXCLUDED_LEADS_EXPLAINED = 10/10
ANDROID_LABEL_FIXED = YES
```
