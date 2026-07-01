# DEPLOY ALLOWLIST MANIFEST — SAFE_TEST_ONLY_CONVERSATIONS (2026-06-23)

Класс изменения: ADDITIVE_NO_SEND_TEST_ONLY_SUPPORT. Owner-approved (восстановить SSH → я деплою).
Schema migration: НЕТ. Rollback: восстановить .bak_v3_conv + restart.

## Первопричина (подтверждена)
- listConversations({includeTest}) УЖЕ поддерживает includeTest (conversations.mjs:45);
- route /conversations вызывал listConversations() БЕЗ includeTest (index.mjs:624) → всегда owner-mode;
- Android debug-клиент не слал includeTest;
- prod owner-mode КОРРЕКТНО исключает test/internal диалоги (002/A/MA-1 имеют timeline, но скрыты);
- поэтому экран всегда получал пустой список.

## Файл к деплою (ровно один, allowlisted) — относительно /opt/master-controller/
1. tools/mater_controller_api/src/server/index.mjs
   sha256(local)=fafa5b19dc101bb21ac8a4ea70620b254ce0444e34f13282c0ac4783d8a80cf5
   изменение (1 строка route): /conversations пробрасывает includeTest=req.query?.includeTest==='true'
   в listConversations(), по точному образцу /first-touch/summary (index.mjs:674). Default false →
   REAL_COMMERCIAL_ONLY (owner production visibility НЕ меняется). Acceptance/debug токен или
   includeTest=true → scope ALL (test/internal диалоги видны только в acceptance-контуре).

## НЕ деплоить
- tools/tests/conversations_includetest_test.mjs — локальный тест, на VPS не нужен.
- Любые Android-файлы (MaterApi.kt, MaterRepository.kt, build.gradle.kts) — они в APK, не на бэкенде.
- tools/mater_controller_api/data/devices.json, pairing.json — runtime drift, НЕ трогать.

## Перезапуск
Только: sudo systemctl restart master-controller-api
НЕ трогать: Telegram, IMAP, Caddy, scheduler, discovery, outbound transport.

## Postflight проверки (через API-токен + node на VPS)
- prod sha256 index.mjs == local (fafa5b19...);
- health=ok;
- GET /conversations?includeTest=false → scope=REAL_COMMERCIAL_ONLY, TEST_ONLY visible=0 (KPI/brief leak=0);
- GET /conversations?includeTest=true → scope=ALL, минимум 1 TEST_ONLY диалог виден (002/A/MA-1);
- autosend blocked; send_allowed_live off; controlled_send_gate disabled; SEND_LEDGER_DELTA=0.

## Безопасность
Чистый read-only route. Без мутаций, без записи в canonical store, без ledger. Reply клиента НЕ
отправляется. CLIENT_MESSAGES_SENT=0, SMTP_CALLS=0, PAYMENT_OPERATIONS=0.
