# First Touch — Pilot Selector Rerank (full 62-lead reconciled set)

**Дата:** 2026-06-19 · источник: production canonical store rev 106 (sha 04c0160d), read-only.

## Детерминированность (не hardcode)
Selector оценивает все 62 лида, отбирает eligible по гейтам (контакт+evidence, реальный аудит, не rejected, не test, quality/compliance PASS). Из 7 eligible все имеют score=84; порядок задан стабильным tie-break по `lead_id` (алфавит). Поэтому `recommended_pilot` детерминирован и воспроизводим, а не зашит. Машинные данные: `PILOT_RERANK.json`.

## TOP-5 кандидатов
| lead_id | Компания | hook | quality | score |
|---|---|---|---|---|
| BETON-MASTERS_RU | Бетон-Мастер | CONTACT_DISCOVERY_FRICTION | 98 | 84 |
| DKBI_RU | ДКБИ | WEAK_WEBSITE | 98 | 84 |
| GBIRESURS_RU | ГБИ Ресурс | REQUEST_PATH_FRICTION | 98 | 84 |
| KZ-JBI_RU | Краснодарский Завод ЖБИ | WEAK_WEBSITE | 98 | 84 |
| MEGALIT-KRD_RU | Мегалит Краснодар | WEAK_WEBSITE | 98 | 84 |

(TOP-3 = первые три; recommended = BETON-MASTERS_RU.)

## ⚠️ Реальная находка безопасности (duplicate-contact risk)
Compliance-гейт selector'а проверяет только **commercial send ledger** (там 0 коммерческих отправок — это верно). Но в самом store у 6 из 7 eligible-лидов есть **per-lead маркеры прошлых отправок**, которые гейт не видит:

| lead_id | raw status | last_send_status | send_proof | true first-touch? |
|---|---|---|---|---|
| KZ-JBI_RU | needs_identity_verification | — | — | **ДА** (нет истории), но контакт `scraped_site_contact` |
| BETON-MASTERS_RU | send_uncertain | uncertain_no_smtp_proof | missing | НЕТ (uncertain 2026-06-12) |
| GBIRESURS_RU | send_uncertain | uncertain_no_smtp_proof | missing | НЕТ (uncertain) |
| MEGALIT-KRD_RU | send_uncertain | uncertain_no_smtp_proof | missing | НЕТ (uncertain) |
| DKBI_RU | waiting_reply | success | proven | НЕТ (доставлено) |
| STROYDVOR-UG_RU | waiting_reply | success | proven | НЕТ (доставлено) |
| ZAVODATOM_RU | waiting_reply | success | proven | НЕТ (доставлено) |

**Вывод:** рекомендованный BETON-MASTERS_RU не является «чистым первым касанием» — у него есть неподтверждённая попытка отправки (`uncertain_no_smtp_proof`) от 2026-06-12 без SMTP-доказательства. Это **не** коммерческая отправка в ledger (поэтому baseline `commercial_sends=0` сохраняется), но это реальный риск дубля при реальной отправке.

## Рекомендация (требует решения владельца, не меняю автоматически)
Перед реальной отправкой по BETON-MASTERS_RU нужно разрешить статус `send_uncertain`: подтвердить, была ли фактическая доставка 2026-06-12. Это вынесено явным блокером в approval package и в `send_uncertain` гейт. Менять recommended pilot автоматически я не стал: критерии score одинаковы, а единственный «чистый» first-touch (KZ-JBI_RU) имеет более слабый контакт (scraped, не manual_verified) — это компромисс, который должен выбрать владелец.

Это не дефект scorer'а (scorer работает по ledger-контракту), а пробел контракта compliance-гейта: он не учитывает per-lead uncertain-send маркеры. Зафиксировано как рекомендация к будущему ужесточению гейта (отдельная задача, не deployment).
