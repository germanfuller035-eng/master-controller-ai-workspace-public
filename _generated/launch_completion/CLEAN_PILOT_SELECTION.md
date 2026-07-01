# Clean Pilot Selection (post-discovery, post-forensic)

**Дата:** 2026-06-19 · production snapshot 69 лидов (rev 120). Без hardcode.

## Селектор + clean-pilot gate
Базовый селектор: 7 eligible (q98). Дополнительный clean-pilot gate отбрасывает любой лид с историей отправки или uncertain-маркером.

| lead_id | clean? | send history | uncertain | email source | q |
|---|---|---|---|---|---|
| KZ-JBI_RU | ✅ ДА | нет | нет | scraped_site_contact | 98 |
| BETON-MASTERS_RU | ❌ | да | да (uncertain_no_smtp_proof) | manual_verified | 98 |
| GBIRESURS_RU | ❌ | да | да | manual_verified | 98 |
| MEGALIT-KRD_RU | ❌ | да | да | manual_verified | 98 |
| DKBI_RU | ❌ | да (proven sent, waiting_reply) | нет | manual_verified | 98 |
| STROYDVOR-UG_RU | ❌ | да (proven sent) | нет | manual_verified | 98 |
| ZAVODATOM_RU | ❌ | да (proven sent) | нет | manual_verified | 98 |

## Результат
```
RECOMMENDED_CLEAN_PILOT=KZ-JBI_RU
CLEAN_PILOT_SCORE=84 (quality 98)
BETON_MASTERS=BLOCKED_UNCERTAIN_PRIOR_SEND
```

## ⚠️ Честные оговорки по KZ-JBI_RU (требуют внимания владельца)
KZ-JBI_RU — **единственный** лид без истории отправки, но:
- контакт `info@kz-jbi.ru` имеет источник `scraped_site_contact` (не manual_verified);
- `identity_match_status=mismatch`, статус лида `needs_identity_verification`.

Это означает: формально он «чистый первый контакт» и проходит QA/compliance/deliverability гейты (q98/PASS, READY_NO_SEND), но перед реальной отправкой владельцу следует подтвердить личность компании и контакт (identity verification). Это вынесено явным блокером в финальный пакет. Я не подменяю это автоматическим «всё хорошо».

Альтернатива: лиды с proven-sent (DKBI/STROYDVOR/ZAVODATOM) — это не «первое касание», а уже контактированные (waiting_reply); для first-touch пилота не подходят.
