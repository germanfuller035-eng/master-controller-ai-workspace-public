# Android Physical Smoke Checklist (OWNER + DEVICE — NOT_RUN)

date: 2026-06-17 · ANDROID_BUILD_STATUS=PASS (offline) · ANDROID_PHYSICAL_SMOKE=NOT_RUN

## Build verified offline
Signed artifacts present in dist/master_controller_android/: MasterController-release-v0.4.0-rc1.apk
(2.2MB), MasterController-release-v0.4.0-rc1.aab (4.9MB), versionName 0.4.0-rc1, SHA256SUMS-v0.4.0-rc1.txt
present. No rebuild needed.

## Physical smoke (requires owner + connected device — Claude must NOT fake)
1. Install signed APK `MasterController-release-v0.4.0-rc1.apk`.
2. Cold start.
3. HTTPS API connection to https://195-96-132-82.sslip.io.
4. Verify version display = 0.4.0-rc1.
5. Today.  6. Product Routing.  7. STAGING.  8. VERIFIED_READY.  9. Audit Queue.
10. Draft Queue.  11. Reply Drafts.  12. Follow-ups.  13. Source Health.  14. Scheduler.  15. Dead Letters.
16. Revision-conflict display behaves correctly.
17. Room/offline cache loads.
18. Offline read works; NO offline canonical mutation.
19. No secrets visible.

If no device connected: ANDROID_PHYSICAL_SMOKE=NOT_RUN and FINAL_STATUS cannot be COMPLETE unless the
owner explicitly defers Android and accepts technical launch classified separately.

---
## v0.4.0-rc2 OWNER UX RETEST (OWNER PERFORMS; NOT_RUN_FOR_NEW_BUILD — 2026-06-18)
rc1 paired + basic nav already PASS. rc2 fixes the raw owner-facing values seen on the physical
Samsung A56. New signed APK (install OVER the current app — do NOT uninstall):
`D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc2.apk`
SHA-256 01defb7a78e97312387697c9200a668755ebeb3e2ebca85a48de577d1aa53d03 · versionCode 5 · signer matches rc1.

Upgrade: 1) transfer APK; 2) install over existing app (in-place, same signer/applicationId);
3) do NOT delete old app; 4) confirm pairing preserved (no re-pair prompt); 5) About shows 0.4.0-rc2 (code 5).
Cold start: 6) force-close; 7) reopen; 8) no re-pair; 9) API data loads (rev 66, queue 28).
Root nav: 10) Сегодня 11) Лиды 12) Решения 13) Ответы 14) Система — open, no crash.
Raw values ABSENT: 15) no `proven SMTP 250 …`; 16) no `Product Routing`; 17) no `STAGING`;
18) no `VERIFIED_READY`; 19) no `approval pending`; 20) no `writer:да`; 21) no `autosend:BLOCKED`;
22) no `rev:66`; 23) no `Dead Letters`; 24) no truncated `Bounce...` (→ `Недоставка`).
Data: 25) «Ревизия хранилища: 66»; 26) «Выполнено: 28»; 27) «Ошибок обработки: 0»;
28) автоотправка «заблокирована»; 29) ДКБИ reason = доставка+48ч.
Offline: 30) open online; 31) airplane mode; 32) restart; 33) offline/cached banner; 34) mutations disabled;
35) airplane off; 36) refresh; 37) recovers.
Stability/security: 38) no crash; 39) no forced logout; 40) pairing preserved; 41) no token/secret on screen;
42) no message sent to any client.
Record PASS/PARTIAL/FAIL per item with screenshots. Do NOT mark PASS without owner evidence.

---
## v0.4.0-rc3 OWNER UX RETEST (OWNER PERFORMS; NOT_RUN_FOR_RC3 — 2026-06-18)
rc3 fixes the nested-screen internal codes seen on rc2 (lead source, blockers, audit-missing,
follow-up term). Install OVER rc2 (do NOT uninstall):
`D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc3.apk`
SHA-256 0b1c26f4e2ba9422d5f2fa1459a4de3eb186dfe957083ec53be112e0b34be126 · versionCode 6 · signer == rc1/rc2.
Upgrade: 1) pairing preserved; 2) About 0.4.0-rc3 (code 6); 3) API reachable; 4) no new pairing code.
Defects GONE: 5) no `manual_verified_csv` (→ «Ручная проверка из CSV»); 6) no `ALREADY_WAITING_REPLY`
(hidden/«Уже ожидает ответа»; ДКБИ «Блокеры: отсутствуют»); 7) no `SEND_UNCERTAIN`; 8) no
`MISSING_PREVIEW` (→ «Предпросмотр аудита ещё не сформирован»); 9) `Follow-up` → «Повторный контакт»;
10) no other SCREAMING_SNAKE/snake_case.
Nav: 11-21 Сегодня/Лиды/Решения/Ответы/Система/Mini Audit/ДКБИ card/Готовят аудит/Ожидают ответа/
Повторный контакт/Неопределённые отправки.
Offline: 22-30 open online → airplane → force-stop → reopen → cached marker → mutations disabled →
airplane off → refresh → restored.
Safety: 31-35 pairing kept, no crash, no forced logout, no secrets, no client message.
Full per-item list: dist/master_controller_android/ANDROID_OWNER_SMOKE_CHECKLIST.md. Do NOT mark PASS without owner evidence.

---
## v0.4.0-rc4 OFFLINE RETEST (OWNER PERFORMS; NOT_RUN_FOR_RC4 — 2026-06-18)
rc4 fixes the rc3 offline defect (raw `connection closed`) + wrong version (1.0.0) + technical device
id. Install OVER rc3 (do NOT uninstall):
`D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc4.apk`
SHA-256 e3c9487b842c8658bd484ceef27aefc13da5cd4a9a315fbb46e6646d4895e597 · versionCode 7 · signer == rc1-rc3.
Upgrade: 1) pairing preserved; 2) API reachable; 3) «Версия приложения: 0.4.0-rc4»; 4) «Код сборки: 7»;
5) «Устройство: Samsung A56» (not dev_…).
Offline (the defect): 10) open Сегодня/Лиды/Система online; 11) airplane mode; 12) force-stop; 13) reopen;
14) main UI opens (no pairing screen); 15) saved data shown; 16) banner «Офлайн-режим: показаны
сохранённые данные»; 17) no `connection closed`; 18) no raw exception; 19) mutation controls
unavailable; 20) pairing not lost.
Recovery: 21) airplane off; 22) «Обновить»; 23) live refresh; 24) banner gone; 25) pairing kept;
26) no crash; 27) no client message.
Full per-item list: dist/master_controller_android/ANDROID_OWNER_SMOKE_CHECKLIST.md (rc4). Do NOT mark PASS without owner evidence.

---
## v0.4.0-rc5 SYSTEM-CACHE RETEST (OWNER PERFORMS; NOT_RUN_FOR_RC5 — 2026-06-18)
rc4 physical smoke was PARTIAL_PASS; the one blocker was «Система» showing false zeros offline. rc5
read-through-caches jobsCounts so queue completed survives offline, and shows «—» (not 0) when truly
unknown. Install OVER rc4 (do NOT uninstall):
`D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc5.apk`
SHA-256 844a6194161edd5685a31321c695438561fe93c9b435a425ce0273b600a35b42 · versionCode 8 · signer == rc1-rc4.
Upgrade: 1) pairing preserved; 2) «Версия приложения: 0.4.0-rc5» / «Код сборки: 8».
System online: 3) revision 66; 4) completed 28; 5) dead letters 0.
System offline (the defect): 6) airplane mode; 7) force-stop; 8) reopen; 9) open «Система»;
10) revision 66 still shown; 11) completed 28 still shown (NOT 0, NOT «Нет данных»); 12) dead letters 0;
13) offline banner + timestamp; 14) no false reset to 0; 15) Today still cached.
Recovery: 16) airplane off; 17) «Обновить»; 18) banner gone; 19) values still 66/28/0; 20) pairing kept;
21) no crash; 22) no client message.
Terminology: 23) «Каноническое хранилище: работает» (not «writer»); 24) no owner-facing «follow-up»/«writer».
Full per-item list: dist/master_controller_android/ANDROID_OWNER_SMOKE_CHECKLIST.md (rc5). Do NOT mark PASS without owner evidence.
