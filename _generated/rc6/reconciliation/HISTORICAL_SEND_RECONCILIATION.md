# HISTORICAL SEND RECONCILIATION (7 sends)

**Главный вывод:** 7 строк send-ledger — ВСЕ тестовые/внутренние лиды, НЕ коммерческие offers.
3 коммерческих offer (СтройДвор/ДКБИ/Завод Атом) — НЕ в send-ledger (никогда не отправлялись),
но имеют stale `lead.status=waiting_reply`.

## 7 ledger-записей
| lead_id | result | sent_at | lead.status | offer.status | вывод |
|---|---|---|---|---|---|
| 002 | SENT | 2026-06-08 | — | — | тест |
| A | SENT | 2026-06-13 | — | — | тест |
| MA-1 | SENT | 2026-06-11 | — | — | тест |
| INTERNAL_VALIDATION_ONLY_20260614 | SENT | 2026-06-14 | waiting_reply | — | внутр. валидация |
| selftest:<…@yandex.com> | SENT | 2026-06-14 | — | — | self-test |
| TEST_OWNER_EMAIL_CHANNEL | SENT | 2026-06-15 | waiting_reply | — | тест канала |
| TEST_KGBI23_E2E | SENT | 2026-06-16 | — | — | e2e тест |

## 3 коммерческих offer (конфликт)
| lead | lead.status | offer.status | в send-ledger | reconciled effective state |
|---|---|---|---|---|
| STROYDVOR-UG_RU | waiting_reply (stale) | READY_FOR_SEND_REVIEW | НЕТ | READY_FOR_SEND_REVIEW (не отправлен) |
| DKBI_RU | waiting_reply (stale) | READY_FOR_SEND_REVIEW | НЕТ | READY_FOR_SEND_REVIEW (не отправлен) |
| ZAVODATOM_RU | waiting_reply (stale) | READY_FOR_SEND_REVIEW | НЕТ | READY_FOR_SEND_REVIEW (не отправлен) |

## Reconciled результат
```
READY_FOR_SEND_REVIEW = 3 (СтройДвор, ДКБИ, Завод Атом)
AWAITING_REPLY (commercial) = 0  (нет подтверждённой отправки коммерческого offer)
SENT_LEADS_IN_SEND_REVIEW = 0
UNSENT_LEADS_IN_AWAITING_REPLY = 0
```
Authoritative правило: send-ledger SENT > stale lead.status. Коммерческий лид не в AWAITING_REPLY без записи в ledger.
Canonical-мутация stale lead.status НЕ требуется — исправляется reconciliation read model.
