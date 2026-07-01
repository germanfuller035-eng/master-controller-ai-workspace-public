# Master Controller Evidence Index

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1

## Source Evidence

| Evidence | Path |
| --- | --- |
| Local engine | `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpEngine.kt` |
| Android screen | `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt` |
| Navigation route | `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt` |
| Today entry | `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/home/TodayScreen.kt` |
| Commercial entry | `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/commercial/CommercialSummaryScreen.kt` |
| Leads entry | `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/pipeline/LeadsHomeScreen.kt` |
| Engine tests | `apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/WorkingSalesMvpEngineTest.kt` |
| Owner UI safety scan | `apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/OwnerUiRawCodeSafetyTest.kt` |

## Imported-Idea Evidence

| Evidence | Path |
| --- | --- |
| Manual lead DTO reference | `D:\AI_WORKSPACE\_IMPORT_CANDIDATES\final_20260627_160847\D_AI_WORKSPACE_WORKTREES_production-activation-completion-v1\source_snapshot\apps\mater_controller_android\app\src\main\java\ru\dmitry\matercontroller\core\model\ManualLeadDtos.kt` |
| Manual intake helper reference | `D:\AI_WORKSPACE\_IMPORT_CANDIDATES\final_20260627_160847\D_AI_WORKSPACE_WORKTREES_production-activation-completion-v1\source_snapshot\tools\mater_controller_api\src\leads\manual_intake.mjs` |
| Cost/reliability/backup references | `D:\AI_WORKSPACE\_IMPORT_CANDIDATES\final_20260627_160847\D_AI_WORKSPACE_WORKTREES_owner-command-autonomy-center-v1\source_snapshot\apps\mater_controller_android\app\src\main\java\ru\dmitry\matercontroller\feature\cost\CostCenterScreen.kt` |

## Command Evidence

| Check | Result |
| --- | --- |
| `git branch --show-current` | `feature/working-sales-mvp-launch-v1` |
| `git rev-parse HEAD` before commit | `9386d706af10c3067f24a4557c19067dc7b830c9` |
| `:app:compileDebugKotlin` | PASS |
| `:app:testDebugUnitTest --tests WorkingSalesMvpEngineTest --tests OwnerUiRawCodeSafetyTest` | PASS |
| `:app:assembleDebug` | PASS |
| `adb -s AMSKBB4914919475 install -r app-debug.apk` | PASS |
| `adb -s AMSKBB4914919475 get-state` | `device` |
| `adb -s AMSKBB4914919475 shell settings get global http_proxy` | `127.0.0.1:18089` |
| `adb -s AMSKBB4914919475 reverse --list` | Empty before and after install |
| Scoped security scan | `security_scan_report.txt`, PASS no matches |

## Device Evidence

| Screen | Screenshot | Hierarchy |
| --- | --- | --- |
| Today/Home | `device_smoke/01_launch.png` | `device_smoke/01_launch.xml` |
| Commercial top | `device_smoke/02_commerce.png` | `device_smoke/02_commerce.xml` |
| Commercial sales entry | `device_smoke/03_commerce_scrolled.png` | `device_smoke/03_commerce_scrolled.xml` |
| Sales manual lead top | `device_smoke/04_sales_top.png` | `device_smoke/04_sales_top.xml` |
| Sales qualification | `device_smoke/05_sales_mid.png` | `device_smoke/05_sales_mid.xml` |
| Sales offer preview | `device_smoke/06_sales_offer.png` | `device_smoke/06_sales_offer.xml` |
| Sales QA/packet before layout fix | `device_smoke/07_sales_packet.png` | `device_smoke/07_sales_packet.xml` |
| Sales QA/packet after layout fix | `device_smoke/08_sales_packet_fixed.png` | `device_smoke/08_sales_packet_fixed.xml` |
| Sales blocked actions / still manual | `device_smoke/09_sales_packet_tail.png` | `device_smoke/09_sales_packet_tail.xml` |
| Leads/Pipeline entry | `device_smoke/10_leads.png` | `device_smoke/10_leads.xml` |
| Logcat tail | `device_smoke/logcat_tail.txt` | N/A |
