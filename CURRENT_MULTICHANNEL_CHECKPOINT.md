# CURRENT MULTICHANNEL / FIRST-TOUCH ACTIVATION CHECKPOINT

**Обновлён:** 2026-06-19 · ветка `feature/first-touch-strategist-controlled-pilot-v1`
**Задача:** Multichannel/First-Touch activation — восстановление прерванной сессии.

## Статус задач
| # | Задача | Статус |
|---|---|---|
| 1 | Baseline + forensic preflight | ✅ закоммичено (baseline-доки) |
| 2 | First Touch Strategist + Hook Engine + composer | ✅ закоммичено `0a5a670` |
| 3 | Screen + Compliance + Deliverability + Pilot | ✅ закоммичено (часть `5266609`) |
| 4 | API + deploy(manifest) + verify + pilot package | ✅ завершено |
| 5 | Android RC9 + autonomous acceptance lab | ✅ завершено |
| 6 | 50/62 reconciliation + production deploy + RC9 live acceptance + approval package | ✅ **завершено в этой сессии** |

## Фаза 6 — итоги (production)
- Расхождение 50/62 объяснено: локальный store=50 (rev1), production=62 (rev106). Scorer не дефектный — `leads_scored=62` против prod. Honest-метрики добавлены (leads_considered/exclusion_breakdown). Reconciliation test 12/0.
- SSH восстановлен по известному ключу (fingerprint совпал). Backup сделан. Deploy 2 файлов (engine+service) с рестартом только API. Live: 4 эндпоинта ok:true, store/ledger неизменны (04c0160d/04fda652).
- Pilot rerank без hardcode: recommended BETON-MASTERS_RU (детерминированный tie-break). **Находка:** у 6/7 eligible есть per-lead маркеры прошлых отправок (BETON — uncertain_no_smtp_proof) — риск дубля, вынесен блокером.
- RC9 live acceptance: 2 зелёных прогона (3/3 каждый), 0 crash. Production не изменён. RC9 в dist.
- Approval package + next-send plan готовы. APPROVAL_TOKEN_ISSUED=NO, REAL_SEND_EXECUTED=NO.

## Фаза 4 — итоги (этой сессии)
- Frozen deployment manifest: `_generated/first_touch/data/deployment_manifest.json` (3 backend-файла, sha256, rollback).
- Live no-send verify: **PASS** — store + send_ledger + email_ledger без изменений (хэши до/после идентичны). `_generated/first_touch/data/live_no_send_verify.json`.
- Исправлены 2 реальных текстовых дефекта композера («по сайта»→«по сайту»; «на сайте на сайте»). Тесты 25/0.
- Pilot package: `_generated/first_touch/reports/CONTROLLED_PILOT_PACKAGE.md` (рекомендован BETON-MASTERS_RU).
- Production-деплой на VPS: **PENDING_OWNER** (нужны учётные данные владельца; не выполнялся, не фабриковался).

## Инварианты безопасности (подтверждены)
controlled_send_gate=DISABLED · transport_enabled=false · autosend=BLOCKED · new store/writer/ledger/sendpath=0.
**MESSAGES_SENT=0 · EMAILS_SENT=0 · SMTP_CALLS=0 · PAYMENT_FACTS=0 · PRODUCTION_CHANGES=0.**

## Следующий шаг (фаза 5)
Android RC9 (versionCode 21 / 0.6.0-rc9): экран First Touch + DTO + ViewModel + навигация уже в рабочем дереве (незакоммичено). Нужно: unit-тесты (включая FirstTouchDtoMappingTest), сборка signed APK/AAB с проверкой signer-match, autonomous acceptance lab прогон, доказательства offline-mutation-blocked и no-send.

## Фаза 5 — итоги (этой сессии)
- Исправлена компиляция: `OperationsHomeScreen` получил параметр `onOpenFirstTouch` + карточка «Первое касание».
- Unit-тесты: **158 passed / 0 failed** (включая 3 `FirstTouchDtoMappingTest`).
- Release-сборка: `assembleRelease` + `bundleRelease` BUILD SUCCESSFUL. APK/AAB подписаны (signer `11038fca…1023f7` == RC1..RC8, `signer_match=true`, `apksigner verify` PASS), versionCode=21 / 0.6.0-rc9. Данные: `_generated/first_touch/data/android_rc9.json`.
- Autonomous acceptance lab: реальный эмулятор `a56lab` (android-34) + sandbox API на изолированной копии store. Инструментальный прогон **3/3 PASS**, 0 FATAL/ANR приложения. Реальные authed HTTP-ответы `/first-touch/*` сняты. Отчёт: `_generated/first_touch/reports/ANDROID_RC9_ACCEPTANCE_LAB.md`.
- Production store неизменен (sha `01ba740f` / `81fe6b76` — до и после). Временные lab-fixtures и junction node_modules удалены.
