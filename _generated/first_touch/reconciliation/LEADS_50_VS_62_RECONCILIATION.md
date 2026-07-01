# Сверка 50 против 62 — все лиды учтены

**Дата:** 2026-06-19 · источник: production canonical store (revision 106, sha 04c0160d) · read-only.

## Корневая причина расхождения 50/62
Дефекта в scorer НЕТ. Scorer обрабатывает **каждый** лид store (`leads_scored === rows.length`). Число «50» возникло потому, что локальная копия store в worktree — устаревший снимок (revision 1, 50 лидов). Против production-store (revision 106, 62 лида) scorer даёт `leads_scored=62`. Это доказано прогоном того же кода против обоих store.

## Итог (production 62)
- LEADS_CONSIDERED=62
- SCORED (pilot_eligible)=7
- NOT_SCORED_EXPECTED=55
- NOT_SCORED_DEFECT=0
- UNEXPLAINED_EXCLUSIONS=0
- UNIQUE_IDS=62 · PRIMARY_STAGE_SUM=62 · LOST=0 · DELETED=0 · ARCHIVED=0
- Инвариант: 7+55+0=62=62 ✅

## Объяснение 12 "недостающих" (50→62)
Все 12 — это лиды `cand_*` со статусом `manual_review_product_routing`: свежеобнаруженные кандидаты на этапе product routing, без подтверждённого контакта и без реального аудита. Корректное исключение: MISSING_CONTACT + MISSING_AUDIT. Не TEST_ONLY, не удалены, не скрыты.

## Полная таблица 62 лидов

| # | lead_id | Компания | status | Категория | Причины | Q | hook | score |
|--|--|--|--|--|--|--|--|--|
| 1 | JBI-KUBAN_RU | ЖБИ Кубань | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 2 | KZ-JBI_RU | Краснодарский Завод ЖБИ | needs_identity_verification | SCORED | — | 98 | WEAK_WEBSITE | 84 |
| 3 | JBK-NVRSK_RU | ЖБК Новороссийск | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 4 | JBI-ARMAVIR_RU | ЖБИ Армавир | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 5 | JBI-KUBAN-YUG_RU | ЖБИ Кубань-Юг | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 6 | JBI-DINSKAYA_RU | ЖБИ Динская | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 7 | JBI-KROPOTKIN_RU | СтройЖБИ Кропоткин | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 8 | JBI-USTLABINSK_RU | ЖБИ Усть-Лабинск | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 9 | BETONSTROY-YUG_RU | БетонСтрой Юг | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 10 | KUBAN-BETON_RU | Кубань Бетон | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 11 | BETON-ADLER_RU | Бетонный Завод Адлер | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 12 | BETONMIX-KUBAN_RU | БетонМикс Кубань | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 13 | BETON-KUBANI_RU | Бетон Кубани | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 14 | UGBETON_RU | ЮгБетон | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 15 | BETONTRADE-SOCHI_RU | БетонТрейд Сочи | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 16 | BETON-ANAPA_RU | Бетон Анапа | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 17 | TBETON-KRD_RU | ТоварныйБетон Краснодар | rejected | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT, REJECTED | — | — | 0 |
| 18 | METALLK-YUG_RU | МеталлКонструкция ЮГ | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 19 | UGMETALLMONTAZH_RU | ЮгМеталлМонтаж | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 20 | METALLKARKAS23_RU | МеталлоКаркас 23 | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 21 | UGMETALLSERVICE_RU | ЮгМеталлСервис | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 22 | METALLPROKAT-UFO_RU | МеталлПрокат ЮФО | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 23 | STALK-KUBAN_RU | СтальКонструкция Кубань | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 24 | METALLSTROY-SOCHI_RU | МеталлСтрой Сочи | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 25 | KRASNODARMETALL_RU | КраснодарМеталл | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 26 | STRMAT-KUBAN_RU | СтройМатериалы Кубани | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 27 | SK-STROYRESURS_RU | ТД Стройресурс | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 28 | STROYDVOR-KRD_RU | СтройДвор Краснодар | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 29 | STROYOPTTORG-KRD_RU | СтройОптТорг | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 30 | STROYBAZA-SOCHI_RU | СтройБаза Сочи | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 31 | STROYTORG-UFO_RU | СтройТорг ЮФО | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 32 | STROYGOROD-KRD_RU | СтройГород Краснодар | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 33 | STROYSNAB-KUBAN_RU | СтройСнаб Кубань | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 34 | STROYLIDER-NVRSK_RU | СтройЛидер Новороссийск | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 35 | KZMI-KRD_RU | Кубанский Завод Металлоизделий | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 36 | PZBI-YUG_RU | Производство ЖБ Изделий Юг | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 37 | ZAVODSTROYDETAL_RU | ЗаводСтройДеталь | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 38 | PROMZAVOD-KUBAN_RU | ПромЗавод Кубань | hold_later | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 39 | ZAVODMP_RU | ЗаводМеталлоПрофиль | hold_no_public_email | NOT_SCORED_EXPECTED | CONTACT_NOT_EVIDENCED, MISSING_REAL_AUDIT | — | — | 0 |
| 40 | PROMSTROYKOMPLEKT_RU | ПромСтройКомплект | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 41 | KUBAN-PROFIL_RU | Кубань-Профиль Производство | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 42 | ZSM-ADYGEA_RU | Завод Стройматериалов Адыгея | written_channel_search_queue | NOT_SCORED_EXPECTED | MISSING_REAL_AUDIT | — | — | 0 |
| 43 | TEST_OWNER_EMAIL_CHANNEL | TEST_OWNER_EMAIL_CHANNEL | waiting_reply | NOT_SCORED_EXPECTED | TEST_ONLY, MISSING_REAL_AUDIT | — | — | 0 |
| 44 | GBIRESURS_RU | ГБИ Ресурс | send_uncertain | SCORED | — | 98 | REQUEST_PATH_FRICTION | 84 |
| 45 | DKBI_RU | ДКБИ | waiting_reply | SCORED | — | 98 | WEAK_WEBSITE | 84 |
| 46 | BETON-MASTERS_RU | Бетон-Мастер | send_uncertain | SCORED | — | 98 | CONTACT_DISCOVERY_FRICTION | 84 |
| 47 | STROYDVOR-UG_RU | СтройДвор-Юг | waiting_reply | SCORED | — | 98 | CONTACT_DISCOVERY_FRICTION | 84 |
| 48 | MEGALIT-KRD_RU | Мегалит Краснодар | send_uncertain | SCORED | — | 98 | WEAK_WEBSITE | 84 |
| 49 | ZAVODATOM_RU | Завод Атом | waiting_reply | SCORED | — | 98 | CONTACT_DISCOVERY_FRICTION | 84 |
| 50 | INTERNAL_VALIDATION_ONLY_20260614 | INTERNAL VALIDATION ONLY - Dmitry test mailbox | waiting_reply | NOT_SCORED_EXPECTED | TEST_ONLY | — | — | 0 |
| 51 | cand_5d7f29d6abe8 | Парикмахерская | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 52 | cand_4edcba517d8e | Тамара | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 53 | cand_af37d93740f5 | Маркиза | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 54 | cand_3a9d1ea548d0 | Глория | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 55 | cand_4f502f12ddb4 | Barbie | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 56 | cand_c090713edbf8 | Янина | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 57 | cand_5f6439c7d501 | Виктория | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 58 | cand_1e381e2a8371 | Paris | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 59 | cand_8bc8c56551b3 | Салон "Афродита" | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 60 | cand_02aa59b21abf | Салон Glamour | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 61 | cand_dba0d1e4bb13 | Салон Рождественский | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
| 62 | cand_7166204fc180 | Специализированный салон-парикмахерская | manual_review_product_routing | NOT_SCORED_EXPECTED | MISSING_CONTACT, MISSING_REAL_AUDIT | — | — | 0 |
