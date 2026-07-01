# ANDROID RC6 OWNER CHECKLIST
Сборка: dist/master_controller_android/MasterController-release-v0.6.0-rc6.apk (versionCode 18), подпись 11038fca (== RC1-RC5) → установка поверх RC5 без потери данных. Единственное действие: установить (ADB недоступен в среде).

1. RC6/code 18 ✓  2. pairing сохранён (Room v2→3 миграция) ✓  3. commercial summary reconciled
4. отправленные лиды отсутствуют в send-review (sent_in_review=0) ✓  5. awaiting-reply=0 (нет ledger proof коммерческих) ✓
6. СтройДвор-Юг: READY_FOR_SEND_REVIEW, НЕ «ожидает ответа» ✓  7. audit≠email (audit_ready по факту, findings из наблюдений) ✓
8. Radar urgent без fixtures (empty state) ✓  9. Radar status online (LIVE)  10. LIVE/CACHE + timestamp
11. source types русские (3 раздела)  12. AI usage raw tokens «неизвестно», не 0 ✓  13. Europe/Moscow ✓
14. профили не обрезаны (responsive)  15. reservoir counters consistent (invariants) ✓  16. список 7 доменов ✓
17. карточка домена ✓  18. Common Crawl честный (TEST_ONLY/NOT_VERIFIED) ✓  19. offline cache  20. reconnect
