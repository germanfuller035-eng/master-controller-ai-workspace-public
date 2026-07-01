# Owner Command & Autonomy Center 0.8.0-rc2 — Deploy Evidence (no-send)

Сессия: завершение оставшихся 6 подсистем (Reliability / Cost / Backup / Knowledge Radar /
FCM push / Android-экраны). Все изменения АДДИТИВНЫЕ и read-only/no-send.

## Подсистемы

| # | Подсистема | Статус | Backend | Тест | Android |
|---|-----------|--------|---------|------|---------|
| A | Reliability Center | DONE | owner_center/reliability.mjs + GET /reliability | reliability_v1 29/0 | ReliabilityScreen |
| B | Cost & Capacity Center | DONE | owner_center/cost_center.mjs + GET /costs | costs_v1 30/0 | CostCenterScreen |
| C | Backup & Recovery Center | DONE | owner_center/backup_center.mjs + /backups/* + worker drill | backup_v1 35/0 | BackupCenterScreen |
| D | Knowledge Radar | DONE (live OFF) | commercial/knowledge_radar.mjs (был готов) | knowledge_radar_v1 31/0 | KnowledgeScreens (был готов) |
| E | FCM Push | DONE (live OFF) | owner_center/fcm_push.mjs + /push/* | fcm_push_v1 29/0 | PushSettingsScreen |
| F | Android-экраны + навигация | DONE | — | unit/lint/build PASS | 4 новых раздела в Система-хабе |

## Тесты (все exit 0)

- reliability_v1: 29/0 · costs_v1: 30/0 · backup_v1: 35/0 · knowledge_radar_v1: 31/0 ·
  fcm_push_v1: 29/0 · owner_center_v1: 38/0 (без регресса)
- API suite (tests/run_all.mjs): 47/0 — canonical store / send ledger / email ledger без изменений
- Итого новых backend-ассертов: 154; всего с owner_center: 192

## Android-сборка 0.8.0-rc2 (versionCode 26)

- `:app:testReleaseUnitTest` — BUILD SUCCESSFUL (включая версионную проверку 0.8.0-rc2 / 26)
- `:app:lintRelease` — BUILD SUCCESSFUL
- `:app:assembleRelease` + `:app:bundleRelease` — BUILD SUCCESSFUL
- Подпись: SHA-256 `11038fca7db3fab1b0206971a93678b9dd28363ddf61241e162568019a1023f7`
  (совпадает с RC11 / 0.8.0-rc1 — ключ не менялся)
- Артефакты:
  - APK `dist/master_controller_android/MasterController-release-v0.8.0-rc2.apk`
    SHA256 `c5478e8b0d4f3b78971c347f1acda1554cbb5b76f2d363132e0d3496b9f3ce29`
  - AAB `dist/master_controller_android/MasterController-release-v0.8.0-rc2.aab`
    SHA256 `a5ded21f4721dcc4b4b1afb09ab76729975050d68437029ae987bd4e8643087b`
- Эмулятор (emulator-5554): install-over vc25(0.8.0-rc1)→vc26(0.8.0-rc2), данные сохранены;
  запуск + 60-событийная monkey-навигация; процесс жив (pid 22264); **0 crash / 0 ANR**;
  Firebase-классы в dex отсутствуют (шаблон не компилируется).

## No-send / no-spend инварианты (подтверждены тестами и кодом)

- Reliability: `performs_remediation=false`, `sends=false` — только репорт.
- Cost: `performs_payment=false`, `sends=false`; деньги — честный UNKNOWN, не coerce в 0.
- Backup: restore drill НЕРАЗРУШАЮЩИЙ — живой файл байт-идентичен и mtime не меняется (тест);
  rollback — только инструкции, выполняет владелец вручную.
- Radar: `auto_production_changes=0`, `auto_client_messages=0`, `auto_financial_decisions=0`;
  live fetch OFF, LLM `DISABLED_NO_BUDGET_APPROVAL`.
- FCM: `sends_client_messages=false`; доставка `CREDENTIAL_REQUIRED` (выключена), fail-closed,
  без выдуманных credentials, secret не в Git.
- AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF — без изменений.

## Credential-gated (live OFF, готовы к активации)

- Knowledge Radar: `_generated/release/KNOWLEDGE_RADAR_ACTIVATION_PACKAGE.md`
- FCM Push: `_generated/release/FCM_PUSH_ACTIVATION_PACKAGE.md` +
  `apps/.../push/FcmService.kt.template` (не компилируется до активации)

## Деплой backend

Аддитивный (новые owner_center-модули + маршруты; canonical writer не затронут). На момент
написания PROD-деплой этой сессии НЕ выполнялся — изменения в ветке
`feature/owner-command-autonomy-center-v1`, готовы к no-send деплою по утверждённой процедуре
(manifest + backup + rollback + post-check).
