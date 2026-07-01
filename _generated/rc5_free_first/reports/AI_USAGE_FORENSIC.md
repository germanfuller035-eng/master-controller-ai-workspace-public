# AI USAGE FORENSIC

**Дата:** 2026-06-19

## Provenance трёх записей по 881 (всего 2643)
Все три записи в `ai_usage_ledger.jsonl`:
```
usage_source = estimated
result       = PROVIDER_UNAVAILABLE
raw_input_tokens = 0, raw_output_tokens = 0, request_id = null
lead_id: DKBI_RU / STROYDVOR-UG_RU / ZAVODATOM_RU
timestamp: 2026-06-19T00:10:44Z
```
**Вывод:** это 3 НЕУДАЧНЫХ провайдер-вызова во время внешнего сбоя Tokenator (503). Реальных токенов не было (0 — это факт, не fake). 881 — консервативная floor-оценка единиц за попытку.

## Историческая величина 196554
Подтверждена в rc3 live shadow-run (3 лида, provider_used=true) ДО появления persistent ledger.
Детализация по raw tokens на тот момент в журнал не писалась.

## Классификация для read model
```
POST_LEDGER (since persistent ledger):  2643  usage_source=ESTIMATED (failed calls, raw=0)
PRE_LEDGER  (confirmed evidence):       196554 usage_source=CONFIRMED_HISTORICAL_EVIDENCE; raw_tokens=UNKNOWN; provider_calls=UNKNOWN
TOTAL_KNOWN:                            199197
```
UNKNOWN ≠ 0. Test/synthetic usage не смешивается с production.
