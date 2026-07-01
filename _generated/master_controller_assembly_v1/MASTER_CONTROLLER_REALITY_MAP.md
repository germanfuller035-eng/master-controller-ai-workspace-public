# Master Controller Reality Map

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1

## Android Screens

| Component | Current location | Status | Owner visible | Import candidate available | Action |
| --- | --- | --- | --- | --- | --- |
| Today/Home sales snapshot | `feature/home/TodayScreen.kt` | WORKING | YES | YES | Added Working Sales MVP card and loading-state safety entry. |
| Pipeline/Leads | `feature/pipeline/LeadsHomeScreen.kt` | WORKING | YES | YES | Added Working Sales MVP entry beside existing lead queues. |
| Commercial summary | `feature/commercial/CommercialSummaryScreen.kt` | WORKING | YES | YES | Added Working Sales MVP card and loading-state entry. |
| Offer preview | `feature/sales/WorkingSalesMvpScreen.kt` | WORKING | YES | YES | Local offer preview is visible as `working_sales_offer_preview`. Existing backend offer review remains separate. |
| Approvals | `feature/approvals/*` and `feature/sales/WorkingSalesMvpScreen.kt` | PARTIAL | YES | YES | Existing approval screens remain; sales MVP adds manual approval packet but does not write approval to backend. |
| Safety/STOP | `feature/home/TodayScreen.kt`, `feature/commercial/CommercialSummaryScreen.kt`, `feature/sales/WorkingSalesMvpScreen.kt` | WORKING | YES | YES | No-send/no-payment/no-production-write visible. |
| Costs/Incidents | `feature/cost/CostCenterScreen.kt`, `feature/commandcenter/OwnerListScreen.kt` | WORKING | YES | YES | Existing read-only owner surfaces kept; no new writes. |

## Backend / API / Tools

| Component | Current location | Status | Owner visible | Import candidate available | Action |
| --- | --- | --- | --- | --- | --- |
| Lead intake | Local: `feature/sales/WorkingSalesMvpEngine.kt`; reference: `tools/mater_controller_api/src/leads/manual_intake.mjs` in import snapshot | WORKING locally / CONTRACT_ONLY for backend | YES | YES | Reimplemented local manual/demo lead input; did not connect POST `/leads/manual`. |
| Qualification | `feature/sales/WorkingSalesMvpEngine.kt` | WORKING | YES | YES | Local deterministic score/readiness/missing-data/reason. |
| Mini audit / digital presence draft | `feature/sales/WorkingSalesMvpEngine.kt` | WORKING | YES | YES | Manual/synthetic facts only; no scraping. |
| Product strategy | `feature/sales/WorkingSalesMvpEngine.kt` | WORKING | YES | YES | Deterministic product selection with reason; not always Mini Audit. |
| Offer draft | `feature/sales/WorkingSalesMvpEngine.kt` | WORKING | YES | YES | Local draft only, not sent. |
| ROI assumptions | `feature/sales/WorkingSalesMvpEngine.kt` | WORKING | YES | YES | Assumptions only, no fake revenue promises. |
| QA/red-team | `feature/sales/WorkingSalesMvpEngine.kt` | WORKING | YES | YES | Blocks unsupported claims, false success language, missing approval, payment request. |
| No-send gate | `feature/sales/WorkingSalesMvpScreen.kt` plus existing commercial/lead safety panels | WORKING | YES | YES | Explicit no-send/no-payment/no-production-write; no outbound code path added. |
| Pipeline summary | Existing repository-backed screens | PARTIAL | YES | YES | Existing read-only summary kept; local sales MVP is separate. |
| Owner approval packet | `feature/sales/WorkingSalesMvpEngine.kt`, `feature/sales/WorkingSalesMvpScreen.kt` | WORKING | YES | YES | Added manual send readiness / approval packet. |

## Import Candidate Search

| Component | Current location | Status | Owner visible | Import candidate available | Action |
| --- | --- | --- | --- | --- | --- |
| Manual lead entry | `production-activation-completion-v1` and `owner-command-autonomy-center-v1` snapshots contain `manual_intake.mjs` and `ManualLeadDtos.kt` | PARTIAL | NO from backend in this MVP | YES | Used as read-only reference for field shape and no-send wording. |
| Owner manual company entry | `ManualLeadDtos.kt` snapshot | CONTRACT_ONLY | NO | YES | Not imported; local screen uses editable company/domain fields. |
| Approval queue | Import snapshots contain Telegram/approval queue tooling | CONTRACT_ONLY | NO | YES | Not imported; local approval packet only. |
| First-touch packages | `FirstTouchScreen.kt`, first-touch reports in snapshots | PARTIAL | Existing separate screen | YES | Not imported; used conceptually as no-send owner package. |
| Commercial no-send E2E | candidate tracked/test lists and existing code | PARTIAL | YES | YES | Existing no-send UI preserved; local MVP adds explicit no-send path. |
| Product catalog / Mini Audit detail | `feature/catalog/*`, `feature/miniaudit/*` in current app and snapshots | WORKING/PARTIAL | YES | YES | Product-fit reason reimplemented locally; no bulk import. |
| Cost/radar owner UI | `feature/cost/*`, `feature/knowledge/*`, `knowledge_radar.mjs` snapshots | WORKING/PARTIAL | YES | YES | Existing read-only screens kept; options map records them. |
| Reliability/backup/owner controls | `feature/reliability/*`, `feature/backup/*`, command center screens | WORKING/PARTIAL | YES | YES | Existing surfaces kept; no production controls changed. |
