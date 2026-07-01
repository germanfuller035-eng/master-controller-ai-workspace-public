# FINAL VERIFIED CLEAN PILOT PACKAGE

**Дата:** 2026-06-19 · production rev 125 · ветка `feature/production-activation-completion-v1`.
**Статус:** `STOP_NO_VERIFIED_CONTACT_AVAILABLE` — ни один лид не проходит hard gates на доступной публичной evidence. Отправка не выполнялась.

## Почему нет verified clean pilot
Hard gates требуют ОДНОВРЕМЕННО: identity VERIFIED_MATCH + verified/evidenced контакт + нулевая история отправок + audit + quality≥85 + compliance + deliverability. Из 7 eligible-кандидатов проходят **0**:
- **KZ-JBI_RU** — единственный без истории отправок, но identity **mismatch** (сайт по наблюдениям относится к СПб/ЛО, лид заявлен краснодарским) + контакт **scraped**; сайт kz-jbi.ru недоступен (ECONNREFUSED) → подтвердить VERIFIED_MATCH нечем. `BLOCKED_IDENTITY_MISMATCH`.
- **BETON-MASTERS_RU, GBIRESURS_RU, MEGALIT-KRD_RU** — identity match + evidenced контакт, но `uncertain_no_smtp_proof`. `BLOCKED_UNCERTAIN_PRIOR_SEND`.
- **DKBI_RU, STROYDVOR-UG_RU, ZAVODATOM_RU** — identity match + evidenced контакт, но `send_proof=proven` (уже контактированы) → не «первое касание». `BLOCKED_PRIOR_SEND`.

Путь «дозаполнить evidence» исчерпан честно: 33 zero-send-лида с сайтами все `not_verified`+guessed/no-email; реальная проверка выборки дала ECONNREFUSED / «домен продаётся» / пустую страницу. Synthetic lead создавать запрещено.

## Недостающая evidence (что нужно, чтобы разблокировать)
1. **KZ-JBI_RU:** доступ к kz-jbi.ru (сейчас недоступен) ИЛИ иной публичный источник, подтверждающий, что компания и контакт `info@kz-jbi.ru` относятся к Краснодару (а не СПб/ЛО). Тогда identity → VERIFIED_MATCH, контакт → EVIDENCED.
2. **BETON/GBIRESURS/MEGALIT:** техническое доказательство, что письмо 2026-06-12 фактически НЕ доставлено (SMTP-логи провайдера), чтобы снять uncertain_no_smtp_proof.
3. **Альтернатива:** новый лид с реально верифицируемым публичным сайтом+контактом+аудитом (через FREE_ONLY discovery + ручную верификацию).

## Approval phrases
```
OLD (KZ-JBI): APPROVE_ONE_FIRST_TOUCH_SEND:KZ-JBI_RU:cfd6a59cec98500a25197699d48d04b7  -> SUPERSEDED_NOT_VALID
NEW VALID PHRASE: НЕТ (нет verified clean pilot)
APPROVAL_TOKEN_ISSUED=NO
REAL_SEND_EXECUTED=NO
```

## BETON-MASTERS_RU
Остаётся `DELIVERY_STATUS_UNKNOWN` / `BLOCKED_UNCERTAIN_PRIOR_SEND` — не менялся на NOT_SENT без доказательства.
