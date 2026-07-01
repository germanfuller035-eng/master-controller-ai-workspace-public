# RC6 PHYSICAL DEFECT BASELINE

**Дата:** 2026-06-19 (UTC) • read-only forensic VPS. Production не менялся.
- branch `feature/rc6-unified-truth-owner-ui-rc7-v1`, base `5cf4f26`
- integrity: rev=106, leads=62, sends=7 (sha 04fda652)

## Подтверждённый корень дефекта: разные truth-проекции
| Экран | Endpoint | Значения (RC6) | Проблема |
|---|---|---|---|
| Commercial Summary (RC6) | /commercial/reconciliation | READY=3, AWAITING=0, commercial=0 | КОРРЕКТНО |
| Mini Audit dashboard | /mini-audit/metrics | waitingReply=3, followupDue=3, sendUncertain=3, preparing=32, needsCheck=49, total=52 | ЛОЖНО (stale lead.status) |
| Send reconciliation | /mini-audit/send-reconciliation | authoritative_successful_sends=7, 3 offers PROVEN_NO_LEDGER_MATCH | ЛОЖНО смешивает test+commercial |

## Root cause
`mini_audit/service.mjs getStatus()` → `loadState()` использует lead.status/last_sent_at/send_proof_status
(stale), НЕ reconciled commercial truth. → 3 коммерческих offer показываются как «ожидают ответа» +
рекомендуется ложный follow-up по ДКБИ. 7 тестовых отправок смешаны в commercial KPI.

## Цель RC7
Один OwnerCommercialTruthService; mini-audit/summary/today/awaiting/followup/dialogs/decisions берут
COMMERCIAL_REAL_ONLY scope. Test/internal только в diagnostics.
