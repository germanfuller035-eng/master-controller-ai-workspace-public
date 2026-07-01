# UI Localization Audit

SESSION_NAME=PRE_PILOT_RUSSIAN_LOCALIZATION_AND_AGENT_SKILL_GATE_V1
STATUS=PASS

Scope: owner-visible Android UI strings in the pilot cockpit, sales MVP, commercial, decisions, system/STOP, agents, sources, knowledge, costs, replies, reliability, settings, and first-touch surfaces.

| FILE | SCREEN | CURRENT_TEXT | REPLACEMENT_TEXT | ACTION |
|---|---|---|---|---|
| feature/home/TodayScreen.kt | Today | Manual Sales Pilot | Ручной пилот продаж | replaced |
| feature/home/TodayScreen.kt | Today | start here | начать здесь | replaced |
| feature/home/TodayScreen.kt | Today | Lead / Qualify / Draft / QA / Send | Лид / Проверка / Черновик / Контроль / Ручная отправка | replaced |
| feature/pilot/PilotCockpitScreens.kt | Pilot cockpit | QA | Контроль | replaced |
| feature/pilot/PilotCockpitScreens.kt | Pilot cockpit | manual gate ON | ручной контроль включен | replaced |
| feature/pilot/PilotCockpitScreens.kt | Pilot cockpit | fake green | ложный зеленый статус | replaced |
| feature/commercial/OfferReviewScreens.kt | Offer review | Offer Detail | Детали оффера | replaced |
| feature/commercial/OfferReviewScreens.kt | Offer review | Approve / Reject / Delay | Одобрить / Отклонить / Отложить | replaced |
| feature/commercial/OfferReviewScreens.kt | Offer review | all / drafts / synthetic | все / черновики / демо | replaced |
| feature/commercial/CommercialSummaryScreen.kt | Commercial | draft-only / manual | только черновик / вручную | replaced |
| feature/approvals/ApprovalsHomeScreen.kt | Owner decisions | warnings / needs decision | предупреждения / нужно решение | replaced |
| feature/sales/WorkingSalesMvpScreen.kt | Working Sales MVP | company / status / deadline / blocked / ready | компания / статус / срок / заблокировано / готово | replaced |
| feature/sales/WorkingSalesMvpEngine.kt | Local sales flow | Lead / Qualify / Draft / QA / Send statuses | Russian lead, scoring, draft, safety, send-control wording | replaced |
| feature/automation/AutomationScreen.kt | Automation status | Canonical writer / Autosend / Live send / Queued jobs | Каноническая запись / Автоотправка / Живая отправка / Заданий в очереди | replaced |
| feature/reliability/ReliabilityScreen.kt | Reliability | Reliability | Надежность | replaced |
| shared safety chips | Pilot safety | no-send / no-payment / no-prod-write | без отправки / без платежей / без записи в production | replaced |

Allowed intentional tokens left visible:
- STOP
- ROI
- API
- AI
- R1/R3/R4/R5/R6 style risk labels
- production in safety-chip context
- Master Controller as product/brand name

Validation:
- OwnerUiRawCodeSafetyTest expanded to scan displayed string literals and catch owner-visible English residue.
- Device UI XML check found all required Russian phrases and no forbidden visible English phrases in final smoke captures.
