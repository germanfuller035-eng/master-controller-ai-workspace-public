# Android RC9 — Autonomous Acceptance Lab

**Дата:** 2026-06-19 · ветка `feature/first-touch-strategist-controlled-pilot-v1`
**Сборка:** 0.6.0-rc9 (versionCode 21). Инфраструктура: реальный Android emulator (не физическое устройство).

## Инфраструктура (поднята автономно)
- Эмулятор `a56lab`, system-image android-34 (SDK 34), headless boot — PASS (`sys.boot_completed=1`).
- Sandbox backend: реальный `mater-controller-api` (тот же серверный код, что в проде) на `0.0.0.0:8799`, store — **изолированная копия** канонического снимка (`_generated/first_touch/sandbox/13_sales/`). Production не использовался.
- Зависимости API, отсутствующие в этой ветке (untracked в основном репо), скопированы во временные lab-fixtures worktree — не коммитятся. `node_modules` подключён junction'ом на основной репозиторий.
- Подключение приложения: реальный pairing-flow (`/auth/pairing/start` → `/complete`), получен bearer-токен.

## Реальные авторизованные HTTP-ответы (через настоящий API-стек)
Полный снимок: `_generated/first_touch/data/acceptance_lab_snapshot.json`.
- `GET /first-touch/summary` → `leads_scored=50, pilot_eligible=7, recommended_pilot=BETON-MASTERS_RU, controlled_send_gate=DISABLED, transport_enabled=false, no_send=true`.
- `GET /first-touch/candidates` → top-5 (BETON-MASTERS_RU, DKBI_RU, GBIRESURS_RU, KZ-JBI_RU, MEGALIT-KRD_RU), все quality=98/score=84, `excluded_reasons=[]` у eligible.
- `GET /first-touch/pilot-readiness` → `send_allowed_live=false, approval_token_issued=false, owner_text_approved=false, transport_disabled=true, no_send=true`.
- `GET /first-touch/candidates/BETON-MASTERS_RU` → `status=QA_PASSED, hook=CONTACT_DISCOVERY_FRICTION, quality=98/PASS, compliance=PASS, deliverability=READY_NO_SEND, smtp_probing=false, no_send=true`.

## Прогон на устройстве
```
Unit (JVM): 158 tests, 0 failures, 0 errors (incl. 3 FirstTouchDtoMappingTest)
Instrumented (connectedDebugAndroidTest, a56lab/AVD-14): 3/3 PASS, 0 skipped, 0 failed
App FATAL/ANR (matercontroller) за всю сессию: 0
```
Примечание: на этом эмуляторе с software-GPU периодически падает СИСТЕМНЫЙ UI (`System UI isn't responding`) — это инфраструктура эмулятора, не приложение; в logcat нет ни одного FATAL/ANR по `ru.dmitry.matercontroller`. Поэтому достоверность подтверждена инструментальным прогоном (не зависит от стабильности лаунчера), а не скриншот-обходом.

## Сборка и подпись (RC9)
```
assembleRelease + bundleRelease: BUILD SUCCESSFUL (R8 minify + resource shrink)
apk_sha256 = ba652780dfa01c6cefdb142dd3a27689e32e1e48efb43748e6c6edd66e05ebec
aab_sha256 = a8c858d41c3fa2a53860bec7ba69a1ee0a5014459bd750ab9b0bf90062a5c56f
signer SHA-256 = 11038fca...1023f7  (== RC1..RC8, signer_match=true)
apksigner verify = PASS · versionCode=21 · versionName=0.6.0-rc9
```

## Безопасность / no-send
```
PRODUCTION_MUTATING_REQUESTS=0  PRODUCTION_OUTBOUND_REQUESTS=0  PAYMENT=0
prod store unchanged: sha 01ba740f (lead store) / 81fe6b76 (send ledger) — идентичны до и после лаборатории
controlled_send_gate=DISABLED · transport_enabled=false · send_allowed_live=false · autosend blocked
no send button on the screen; нет write-эндпоинтов First Touch (offline-мутация невозможна — все вызовы GET)
MESSAGES_SENT=0  EMAILS_SENT=0  SMTP_CALLS=0
```

## Verdict
**PASS.** RC9 собран, подписан тем же ключом, 158+3 теста зелёные, реальные эндпоинты отвечают корректно, no-send и неизменность production доказаны.
