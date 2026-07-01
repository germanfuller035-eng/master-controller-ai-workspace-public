# ANDROID ACCEPTANCE LAB — RC7 → RC8

**Дата:** 2026-06-19 (UTC). Тестовая инфраструктура: реальный Android emulator (не физическое устройство).

## Инфраструктура (создана автономно)
- Android SDK + emulator 36.6.11, WHPX-ускорение доступно.
- system-image android-34 google_apis x86_64 — догружен (4.2 ГБ).
- AVD `a56lab` (Samsung-A56-подобный): 1080x2340, 440 dpi, x86_64, headless boot — PASS.
- Sandbox backend: локальный Node API на 0.0.0.0:8799, засеян read-only снимком production (rev 106, 62 лида, 7 ledger). Эмулятор → host через 10.0.2.2 (debug cleartext overlay).
- Production: только чтение. 0 мутаций, 0 outbound, 0 payment.

## Дефекты, найденные и исправленные лабораторией (→ RC8)
1. **JBI-ARMAVIR contact contradiction** — email `sales@jbi-armavir.ru` + source `guessed_unverified` ошибочно показывался как «связан с доменом компании» (evidenced=true). Фикс: evidence-предикат исключает guessed/unverified/inferred. Теперь «источник требует подтверждения».
2. **False DKBI follow-up** — `/mini-audit/next-action` рекомендовал follow-up по ДКБИ из stale sendProof/SMTP, хотя коммерческой отправки не было. Фикс: follow-up/await next-action подавляется без COMMERCIAL send в ledger → `review_first_touch_draft` по СтройДвор-Юг.
3. **TEST_ONLY в Диалогах** — legacy `/conversations` включал все 7 тестовых ledger-лидов (002/A/MA-1/selftest/TEST_*/INTERNAL_VALIDATION). Фикс: owner-режим исключает test-сущности; на устройстве Диалоги показывают только СтройДвор-Юг/ДКБИ/Завод Атом.

## Cross-screen truth (на устройстве + API, оба прогона)
```
commercial_successful_sends=0  ready_for_send_review=3  awaiting_reply=0  followup_required=0
total_leads=62  primary_stage_sum=62  test_internal_ledger=7
legacy /mini-audit/metrics overlay == unified truth (readySend=3, waitingReply=0, followupDue=0)
dialogs owner-mode = [STROYDVOR-UG_RU, DKBI_RU, ZAVODATOM_RU] (0 test entities)
JBI-ARMAVIR: present=true, evidenced=false, no "not found" contradiction
no false DKBI follow-up on Today next-action
```

## Прогоны
```
FULL_RUN_1 = PASS (9/9 assertions, 0 crash/ANR)
FULL_RUN_2 = PASS (9/9 assertions after force-stop, 0 crash/ANR)
```

## Install-over-install + Room migration
```
RC7(versionCode 19) → RC8(versionCode 20) install-over (no uninstall): Success
App RUNNING after upgrade; 0 crash/migration errors (Room v4 retained)
signer == RC1..RC7 (11038fca)
```

## Безопасность
```
PRODUCTION_MUTATING_REQUESTS=0  PRODUCTION_OUTBOUND_REQUESTS=0  PAYMENT=0
prod integrity unchanged: rev 106, leads 62, sends 7 (sha 04fda652)
all flags OFF (COMMERCIAL_SEND/AUTOSEND/FOLLOWUP/PAYMENT)
```
