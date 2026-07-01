# FINAL CLEAN PILOT PACKAGE — First Touch

**Дата:** 2026-06-19 · production rev (на момент сборки пакета) 120-снимок · ветка `feature/production-activation-completion-v1`.
**Статус отправки:** НЕ выполнялась. controlled_send_gate=DISABLED, transport_enabled=false, approval_token_issued=NO, real_send_executed=NO.

## Чистый пилот
- **lead_id:** KZ-JBI_RU · **company:** Краснодарский Завод ЖБИ · **segment:** ЖБИ · **region:** Краснодар.
- **clean-history proof:** 0 записей в send ledger и email ledger; нет `last_send_status`, нет `uncertain_last_sent_at`, `external_contact_sent=false`. Единственный eligible-лид без истории отправок.
- **почему выбран:** детерминированный clean-pilot gate (нулевая история отправок) при q98; BETON-MASTERS_RU и др. исключены из-за prior/uncertain send.

## Контакт / аудит / крючок
- **email:** info@kz-jbi.ru · **источник:** `scraped_site_contact` (⚠️ не manual_verified).
- **audit:** 3 evidence-backed наблюдения · **hook:** WEAK_WEBSITE.
- artifact status QA_PASSED, quality 98/PASS, compliance PASS, deliverability READY_NO_SEND.

## Текст (no-send)
**Темы:** `Наблюдение по сайту` (рек.) · `Вопрос по сайту Краснодарский Завод ЖБИ` · `Короткий разбор сайта Краснодарский Завод ЖБИ`
**Тело (body_a, рекомендовано):**
> Здравствуйте.
>
> Посмотрел путь клиента до обращения на сайте Краснодарский Завод ЖБИ глазами нового посетителя. Новому посетителю может быть сложнее понять следующий шаг. Из-за этого часть людей, которые уже заинтересованы, может откладывать обращение или уходить к более понятному поставщику.
>
> Отметил ещё один момент … Могу прислать короткий разбор на одной странице — без созвона и обязательств.
>
> Прислать его ответным письмом?

- **artifact / content_hash:** `cfd6a59cec98500a25197699d48d04b7` · **source_revision:** 120.

## ⚠️ Блокеры перед реальной отправкой (решение владельца)
1. **Контакт `scraped_site_contact`** — рекомендуется подтвердить email как manual_verified.
2. **identity_match_status=mismatch**, статус лида `needs_identity_verification` — подтвердить идентичность компании.

Эти два пункта — реальные, не скрыты. Отправка не должна выполняться, пока владелец их не снимет.

## Будущая approval phrase (НЕ исполнять в этом prompt)
```
APPROVE_ONE_FIRST_TOUCH_SEND:KZ-JBI_RU:cfd6a59cec98500a25197699d48d04b7
```
```
APPROVAL_TOKEN_ISSUED=NO
REAL_SEND_EXECUTED=NO
```

## О BETON-MASTERS_RU
Классифицирован DELIVERY_STATUS_UNKNOWN (uncertain_no_smtp_proof, нет ledger-записи, нет Message-ID) → BLOCKED_UNCERTAIN_PRIOR_SEND, исключён из пилота. Запуск не заблокирован — выбран KZ-JBI_RU.
