# Candidate Funnel — Hard Gate Evaluation

**Дата:** 2026-06-19 · production rev 125 (69 лидов). Без hardcode победителя.

## Hard gates (все обязательны одновременно)
identity_match=VERIFIED_MATCH · contact in {VERIFIED_OFFICIAL, EVIDENCED_PUBLIC_BUSINESS} · real_audit · quality≥85 · prior_commercial_send=false · uncertain_send_history=false · opt_out=false · bounce=false · compliance PASS · deliverability READY_NO_SEND.

## Результат: HARD_GATE_PASS = 0 из 7 eligible
| lead_id | company | identity | contact | last_send | pass | reason |
|---|---|---|---|---|---|---|
| KZ-JBI_RU | Краснодарский Завод ЖБИ | mismatch | SCRAPED | none | ❌ | BLOCKED_IDENTITY_MISMATCH |
| BETON-MASTERS_RU | Бетон-Мастер | match | EVIDENCED | uncertain_no_smtp_proof | ❌ | BLOCKED_UNCERTAIN_PRIOR_SEND |
| GBIRESURS_RU | ГБИ Ресурс | match | EVIDENCED | uncertain_no_smtp_proof | ❌ | BLOCKED_UNCERTAIN_PRIOR_SEND |
| MEGALIT-KRD_RU | Мегалит Краснодар | match | EVIDENCED | uncertain_no_smtp_proof | ❌ | BLOCKED_UNCERTAIN_PRIOR_SEND |
| DKBI_RU | ДКБИ | match | EVIDENCED | success (proven) | ❌ | BLOCKED_PRIOR_SEND |
| STROYDVOR-UG_RU | СтройДвор-Юг | match | EVIDENCED | success (proven) | ❌ | BLOCKED_PRIOR_SEND |
| ZAVODATOM_RU | Завод Атом | match | EVIDENCED | success (proven) | ❌ | BLOCKED_PRIOR_SEND |

## Структурная причина
Множества не пересекаются: **0 лидов** одновременно имеют (identity match + verified contact + нулевую историю отправок). Все verified-контакты уже контактировались (proven или uncertain); единственный лид без истории (KZ-JBI) имеет mismatch и scraped-контакт.

## Попытка пути «дозаполнить evidence» (тоже исчерпана честно)
- 33 zero-send-history лида имеют website, но все `not_verified` + guessed/no email.
- Реальная read-only проверка выборки: kz-jbi.ru → ECONNREFUSED; jbi-armavir.ru → ECONNREFUSED; ugbeton.ru → «домен продаётся» (не компания); stroydvor-krd.ru → пустая страница. Данные неверифицируемы.
- Контроль: beton-masters.ru / dkbi.ru читаются (инструмент исправен) — но у них prior send.
- Synthetic lead создавать запрещено.

## Вывод
Ни один кандидат не может быть сделан истинно чистым на доступной публичной evidence без небезопасных допущений. Машинные данные: `CANDIDATE_HARD_GATES.json`.
