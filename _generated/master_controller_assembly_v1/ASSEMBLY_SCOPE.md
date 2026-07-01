# Assembly Scope

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1

## Goal

Build a working owner-visible Master Controller sales MVP path:

manual/demo lead -> qualification -> mini-audit/digital presence assessment -> product strategy reason -> offer draft -> ROI assumptions -> QA/red-team check -> Android owner-visible result -> manual send readiness / approval packet -> no automatic outbound.

## Allowed Work Performed

- Continue current dirty Android MVP files.
- Add a local deterministic sales engine and owner-visible Compose screen.
- Wire the sales MVP from Today/Home, Commercial Summary and Leads/Pipeline.
- Add focused JVM tests for the local sales engine and include the new screen in owner UI raw-code safety scan.
- Use compacted import candidates only as read-only references for small ideas and labels.
- Create `_generated/master_controller_assembly_v1/**` evidence files.

## Forbidden Work Not Performed

- No bulk import, merge, tag or deploy.
- No production DB write.
- No outbound email, Telegram, social, browser automation or auto-send.
- No payment action.
- No VPS, DNS, Caddy, firewall or backend production changes.
- No reads from or writes to `D:\AI_SECRETS` values.
- No writes to quarantine, backups or file vault.
- No Full Run 1/2.
- No app data clear.

## Source Files In Scope

| File | Reason |
| --- | --- |
| `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpEngine.kt` | Local deterministic sales MVP facade. |
| `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt` | Owner-visible Android flow and approval packet. |
| `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt` | Route wiring for `working_sales_mvp`. |
| `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/home/TodayScreen.kt` | Today/Home entry and safety snapshot. |
| `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/commercial/CommercialSummaryScreen.kt` | Commercial entry, including loading state safety entry. |
| `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/pipeline/LeadsHomeScreen.kt` | Leads/Pipeline entry. |
| `apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/WorkingSalesMvpEngineTest.kt` | Focused no-send sales MVP tests. |
| `apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/OwnerUiRawCodeSafetyTest.kt` | Adds the new screen to owner-visible literal scan. |

## Out Of Scope

- Backend endpoint activation.
- Real lead scraping or contact discovery.
- Controlled send.
- Production launch.
- Payment, CRM, mail, Telegram or browser automation integration.
- Old worktree cleanup.
