# Owner Visible Repair V1 — Android Source Map

## Routes And Anchors

Navigation root:

- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt`

Screen anchor registry:

- `apps/mater_controller_android/app/src/androidTest/assets/screen_anchors.json`

Relevant route mapping:

| owner area | route / screen id | anchor | source |
| --- | --- | --- | --- |
| Today / Home | `today` / `home` | `today_screen` | `feature/home/TodayScreen.kt`, `feature/home/TodayViewModel.kt` |
| Commercial summary | `commerce` / `commercial` | `commercial_summary` | `feature/commercial/CommercialSummaryScreen.kt`, `feature/commercial/CommercialViewModel.kt` |
| Pipeline hub | `leads` / `pipeline` | `leads_home` | `feature/pipeline/LeadsHomeScreen.kt` |
| Pipeline queue | `pipeline_queue/{queue}` | `pipeline_queue_*` | `feature/pipeline/PipelineQueueScreen.kt`, `feature/pipeline/PipelineQueueViewModel.kt` |
| Costs | `cost_center` / `cost` | `cost_center_screen` | `feature/cost/CostCenterScreen.kt` |
| Incidents | `owner_incidents` | `owner_list_incidents` | `feature/commandcenter/OwnerListScreen.kt` |
| System / STOP | `system` / `operations` | `operations_home` | `feature/operations/OperationsScreens.kt`, `feature/operations/OperationsViewModel.kt` |
| Approvals | `decisions`, `approval_list/{queue}`, `approval_detail/{queue}/{id}` | `approvals_home`, `approval_list_*`, `approval_detail_*` | `feature/approvals/*` |

Note: `feature/pipeline/PipelineHomeScreen.kt` exists but the current nav graph uses `LeadsHomeScreen` for the accepted `pipeline` screen anchor.

## Existing UI Components Used

- `OwnerActionCard`
- `OwnerStatusChip`
- `OwnerStopComponent`
- `EmptyState`
- `OfflineBanner`
- New shared presentation-only helpers:
  - `OwnerSafetyInvariant`
  - `SafetyInvariantPanel`
  - `ContractOnlyPanel`

## Data/API Sources

Today / Home:

- `MaterRepository.status()` -> `GET mini-audit/status`
- `MaterRepository.nextAction()` -> `GET mini-audit/next-action`
- `MaterRepository.automationStatus2()` -> `GET automation/status`
- `MaterRepository.replyCounts()` -> `GET replies/counts`
- `MaterRepository.costOverview()` -> `GET costs`
- `MaterRepository.ownerIncidentsSummary()` -> `GET incidents/summary`
- `MaterRepository.commandBrief()` -> `GET command-brief`

Commercial / Pipeline:

- `MaterRepository.commercialSummary()` -> `GET commercial/summary`
- `MaterRepository.financeSummary()` -> `GET finance/summary`
- `MaterRepository.commercialIntegrationStatus()` -> `GET commercial/integration-status`
- `MaterRepository.pipelineByStatus(status)` -> `GET pipeline/by-status/{status}`

Safety / Costs / Incidents / STOP:

- `MaterRepository.costOverview()` -> `GET costs`
- `MaterRepository.ownerIncidents()` -> `GET incidents`
- `MaterRepository.ownerIncidentsSummary()` -> `GET incidents/summary`
- `MaterRepository.automationStatus2()` -> `GET automation/status`
- `MaterRepository.jobs()` / `jobsCounts()` -> `GET jobs`, `GET jobs/counts`

All above are existing repository calls. The sprint does not add backend routes, production flags, payment calls, outbound sends, or production writes.

## Loading / Empty / Error States

- Loading remains `LoadingState`.
- Offline cached reads remain `OfflineBanner`.
- Empty pipeline queues now state that empty does not mean send success.
- Empty incidents now state that no rows does not hide production risk or contract-only areas.
- Cost no-data state now states that unavailable data is not zero spend.

## Contract-Only Labels Added

Minimum contract-only labels were added to Today, Commercial, Cost, and System for:

- real Qdrant;
- Docling;
- OPA;
- VoltAgent runtime;
- MCP production servers;
- browser automation;
- voice capture;
- CRM/payment/mail integrations;
- post-hardening contract layers.
