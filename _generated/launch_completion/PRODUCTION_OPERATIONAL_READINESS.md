# Production Operational Readiness

**Дата:** 2026-06-19 · ветка `feature/production-activation-completion-v1`.

## Режим работы (достигнут)
```
Discovery and verification = automatic (FREE_ONLY, OSM Overpass, единственный owner, API-only promotion)
Audit and first-touch preparation = automatic
Owner decisions = Android commands (no-send: 8 команд через Idempotency-Key + expectedRevision)
Client sends = одно явное разрешение владельца (controlled_send_gate DISABLED сейчас)
Reply monitoring = automatic read-only (IMAP EXAMINE, без мутаций)
Follow-up drafts = automatic (планировщик, без отправки)
Follow-up sending = только разрешение владельца
Autosend = disabled
```

## Подтверждённые компоненты
| Область | Состояние |
|---|---|
| Discovery scheduler owner | 1 (failed-юнит исправлен: stale-lock + acquireLock recovery) |
| FREE_ONLY discovery | работает (validation run: +7 лидов, 0 платных вызовов) |
| First Touch command API | 8 no-send роутов live на production |
| Materialization | 2 пакета (≤3) через sole writer |
| Uncertain-send | BETON-MASTERS_RU = DELIVERY_STATUS_UNKNOWN, исключён |
| Clean pilot | KZ-JBI_RU (с блокерами identity/contact) |
| Reply monitor | read-only, тест 10/0 |
| Follow-up planner | готов, тест 20/0 |
| Android RC10 | 158 unit + 3×2 instrumented, signer match, install-over OK |
| Production integrity | store 62→69 (discovery), ledger 7 unchanged, commercial sends 0 |

## Гейты (на момент отчёта)
```
autosend BLOCKED · sendAllowedLive OFF · controlled_send_gate DISABLED · transport false
payment facts 0 · commercial sends 0 · SMTP 0 · client messages 0
canonical writer count 1 · queue failed 0 · dead letters 0
```

## Что требует владельца перед первой отправкой
1. Снять блокеры KZ-JBI_RU (identity mismatch, scraped contact) ИЛИ выбрать другой чистый пилот.
2. Дать явное одобрение фразой `APPROVE_ONE_FIRST_TOUCH_SEND:<LEAD_ID>:<ARTIFACT_HASH>`.

GATE_C1C=NOT_ACTIVATED · APPROVAL_TOKEN_ISSUED=NO · REAL_SEND_EXECUTED=NO.
