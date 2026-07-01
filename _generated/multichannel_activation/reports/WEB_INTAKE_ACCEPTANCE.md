# WEB INTAKE LIVE ACCEPTANCE

**Дата:** 2026-06-18
**Эндпоинт:** `POST /api/v1/public/intake` (без auth, валидируется, rate-limit на edge, НИКОГДА не отправляет).

## Owner-controlled self-tests (live, production)

| Тест | Результат | Статус |
|---|---|---|
| Валидная заявка (TEST_ONLY) | `{accepted:true, status:"STAGED", submission_id:"intake_…"}` | PASS |
| Honeypot (`hp` заполнен) | `INVALID_SUBMISSION` errors:`[honeypot, empty_submission]` | PASS |
| Без consent | `INVALID_SUBMISSION` errors:`[empty_submission, consent_required]` | PASS |

## Поведение TEST_ONLY

- Заявка принята со статусом **STAGED** — НЕ промоутится в canonical (промоушен owner/worker-gated).
- Сообщений не отправляется (`note: "Заявка принята на модерацию. Сообщений не отправляется."`).
- **Canonical integrity после теста:** `store_revision=106`, `leads=62`, `send_ledger=7` — без изменений.
- TEST_ONLY не создаёт send eligibility и не создаёт реальную opportunity.

## Webhook gates (закрыты)

| Канал | HTTP | Поведение |
|---|---|---|
| `/webhooks/vk` | 403 | FEATURE_DISABLED (VK_INBOUND=false) |
| `/webhooks/max` | 403 | FEATURE_DISABLED (MAX_INBOUND=false) |
| `/webhooks/telegram-client` | 403 | FEATURE_DISABLED (CLIENT_TELEGRAM_INBOUND=false) |

Webhook-обработчик: feature-gate → signature/replay verify (`verifyWebhook`) → quarantine unknown,
никогда не диспатчит. Replay-protection через `__webhookSeen` (event_id dedupe).

## Вывод

```
WEB_INTAKE=ACTIVE (на 195-96-132-82.sslip.io)
WEB_INTAKE_VALIDATION=PASS (honeypot + consent + idempotency staging)
NO_AUTOMATIC_OUTBOUND=confirmed
CANONICAL_CONTAMINATION=none
```
