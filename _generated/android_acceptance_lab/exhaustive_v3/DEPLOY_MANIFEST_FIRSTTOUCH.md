# DEPLOY ALLOWLIST MANIFEST — SAFE_TEST_ONLY_FIRSTTOUCH

Класс изменения: ADDITIVE_NO_SEND_TEST_ONLY_SUPPORT. Owner-approved.
Schema migration: НЕТ. Rollback: восстановить .bak_v3_ft каждого файла + restart.

## Файлы к деплою (ровно эти, allowlisted) — относительно /opt/master-controller/
1. tools/mater_controller_api/src/commercial/first_touch_service.mjs
   sha256(local)=eded501095be93fd4f5b3b28a667f731f64d3fc911835f39eeb672c5afc1ad54
   изменение: pilotCandidates(includeTest)/summary(includeTest); test_only skip при false;
   в acceptance-режиме (includeTest=true) test-лиды сортируются первыми → синтетик = top_5[0].
2. tools/mater_controller_api/src/server/index.mjs
   sha256(local)=c855f7d8e437e2a722d6c125f3fc7403d889c32fc2f437af6b10af640842f228
   изменение: проброс includeTest в /first-touch/summary и /first-touch/candidates.
3. tools/mater_controller_api/src/mini_audit/service.mjs
   sha256(local)=ad6e48c75a0d4c4b4a58096f2154c38149806d2e5df0f39bc1a8e78b75af4645
   изменение: stripTestLeads в loadState (test_only никогда не виден на реальном mini-audit).
4. tools/mater_controller_api/src/commercial/owner_commercial_truth.mjs
   sha256(local)=1166a14c7b2bae426b7e707f671b374590e1fbbaea0a4be4e3e99b5d390557f6
   изменение: truth() исключает test_only из leads-агрегатов (total_leads/stage counts).
5. tools/mater_controller_api/seed_firsttouch_candidate.mjs  (НОВЫЙ)
   sha256(local)=67bc39deeae8a2d63e6b573112b0d37d4927669442b3ee52c23bcfea028118fa
   назначение: seed/verify/cleanup синтетического TEST_ONLY firsttouch кандидата.

## НЕ деплоить
- tools/tests/first_touch_includetest_test.mjs — локальный тест, на VPS не нужен.
- Любые Android-файлы — они в APK, не на бэкенде.
- tools/mater_controller_api/data/devices.json, pairing.json — runtime drift, НЕ трогать.

## Перезапуск
Только: sudo systemctl restart master-controller-api
НЕ трогать: Telegram, IMAP, Caddy, scheduler, discovery, outbound transport.

## Postflight проверки
- prod sha256 каждого из 5 файлов == local;
- health=ok; canonical writer count=1; scheduler owners=1;
- autosend blocked; send_allowed_live off; controlled_send_gate disabled.
