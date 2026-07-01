# CLEANUP PROOF — FIRSTTOUCH (2026-06-22)

## Cleanup команда (на VPS, env loaded)
node seed_firsttouch_candidate.mjs cleanup-firsttouch

CLEANUP_FT_BEFORE: lead_present=true, ft_drafts_linked=9, ft_decisions_linked=18, ft_idem_linked=9,
  pilot_is_test=true, real_leads=40, store_revision=300
CLEANUP_FT_AFTER:  lead_present=false, ft_drafts_linked=0, ft_decisions_linked=0, ft_idem_linked=0,
  pilot_is_test=false, real_leads=40, store_revision=301

## Reread-доказательство (независимый повторный verify)
VERIFY_FT: lead_present=false, ft_drafts_linked=0, ft_decisions_linked=0, ft_idem_linked=0,
  pilot_is_test=false, real_leads=40

## Финальные инварианты (после cleanup)
- pilotCandidates(false): leads_scored=40, testInAll=false
- pilotCandidates(true):  leads_scored=40, testInAll=false  (синтетик удалён, виден 0 даже в acceptance)
- truth().total_leads=40
- send_ledger lines=7 (== baseline)

## Итог
FIRSTTOUCH_FIXTURE_CLEANED=YES
FIRSTTOUCH_LINKED_ARTIFACTS=0
REAL_LEADS_CHANGED_BY_TESTS=0  (40 → 40)
REAL_LEADS_LOST=0
TEST_ONLY_KPI_LEAKS=0
OWNER_BRIEF_TEST_ONLY_LEAKS=0
SEND_LEDGER_DELTA=0  (7 → 7)

Canonical revision вырос (281 baseline → 301) через sole writer (seed + post-draft команды 2 прогонов
+ cleanup). Это технический рост ревизии; реальные сущности (40 лидов) и показатели НЕ изменились.
НЕ заявляется, что revision вернулся назад.

Прочие acceptance_v3 owner-center fixtures (events/notifications/decisions/incidents/campaign) НЕ
трогались — они нужны следующим экранам. Cleanup затронул ТОЛЬКО firsttouch-synthetic лид и его
linked артефакты.
