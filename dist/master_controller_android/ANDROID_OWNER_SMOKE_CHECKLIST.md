# Android Owner Smoke Checklist — v0.4.0-rc5 (OWNER PERFORMS; NOT_RUN_FOR_RC5)

Samsung A56 · build versionCode 8 / versionName 0.4.0-rc5 · install OVER rc4 (do NOT uninstall).
New signed APK:
`D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc5.apk`
SHA-256 844a6194161edd5685a31321c695438561fe93c9b435a425ce0273b600a35b42 · signer == rc1-rc4.

## Upgrade
1. Pairing preserved (no re-pair prompt).
2. Settings shows «Версия приложения: 0.4.0-rc5» / «Код сборки: 8».

## System online
3. Open «Система»: revision 66.
4. completed 28 («Выполнено: 28» / «Очередь задач: 28»).
5. dead letters 0 («Ошибки обработки: 0»).

## System offline (the defect)
6. Enable airplane mode.
7. Force-stop.
8. Reopen.
9. Open «Система».
10. revision 66 still shown.
11. completed 28 still shown (NOT 0, NOT «Нет данных»).
12. dead letters 0 still shown.
13. Offline banner + timestamp visible.
14. No false reset of completed to 0.
15. Today still shows cached data.

## Recovery
16. Disable airplane mode.
17. Tap «Обновить».
18. Offline banner disappears.
19. Values remain correct (66 / 28 / 0).
20. Pairing not lost.
21. No crash.
22. No message sent to any client.

## Terminology
23. «Система» shows «Каноническое хранилище: работает» (not «writer»).
24. No owner-facing «follow-up»/«writer» strings anywhere.

Record PASS/PARTIAL/FAIL with screenshots. Do NOT mark PASS without owner evidence.
