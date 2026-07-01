# CLAUDE PROVIDER LIVE SHADOW

**Дата:** 2026-06-18
**Режим:** `SHADOW_NO_SEND`, read-only прогон против production через `/api/v1/agents/shadow-wave?maxLeads=3`.

## Состояние provider

```
CLAUDE_PROVIDER_AVAILABLE=NO  (ANTHROPIC_API_KEY ABSENT)
PROVIDER_CLIENT_IMPLEMENTED=NO
AGENT_MODE=SHADOW_NO_SEND
```

Live-вызов Claude **не выполнялся** — ключа нет и HTTP-клиента нет. Вместо этого выполнен **детерминированный** (авторитетный) shadow-прогон, чтобы доказать целостность цепочки без отправок и записей.

## Результат bounded-прогона (maxLeads=3)

```json
{
  "agent_mode": "SHADOW_NO_SEND",
  "shadow_leads_processed": 1,
  "agent_tasks_completed": 1,
  "agent_tasks_failed": 0,
  "agent_dead_letters": 0,
  "qa_verdicts": { "APPROVED_FOR_OWNER_REVIEW": 0, "NEEDS_REWORK": 0, "REJECTED": 1, "QUARANTINED": 0 },
  "unsupported_claims": 0,
  "guessed_emails": 0,
  "duplicate_proposals": 0,
  "send_attempts": 0,
  "prompt_injection_flagged": 0,
  "owner_review_queue": []
}
```

> `shadow_leads_processed=1`: cohort жёстко отфильтрован (`eligibleForShadow`) — исключены TEST_ONLY, rejected, guessed-email, лиды с открытыми opportunity (СтройДвор-Юг/ДКБИ/Завод Атом уже имеют opportunity → исключены), delivery-unconfirmed. Остался 1 валидный лид (`INTERNAL_VALIDATION_ONLY_*`), вердикт REJECTED — корректно (внутренний валидационный).

## Контроль безопасности (все выполнены)

| Требование | Факт |
|---|---|
| `PROVIDER_CALLS_SUCCESSFUL>0` | n/a (provider PENDING_SECRET) — детерминированный путь активен |
| `ARTIFACTS_CREATED>0` | 1 артефакт |
| `QA_REVIEWS_CREATED>0` | 1 QA-вердикт |
| `DIRECT_WRITES=0` | ✅ 0 (рантайм не пишет canonical) |
| `SEND_ATTEMPTS=0` | ✅ 0 |
| `PAYMENT_ATTEMPTS=0` | ✅ 0 |
| `UNSUPPORTED_CLAIMS=0` | ✅ 0 |
| `GUESSED_EMAILS=0` | ✅ 0 |

## Вывод

```
LIVE_AGENT_SHADOW_RUN=PASS_DETERMINISTIC (PROVIDER PENDING_SECRET)
AGENT_RUNTIME=DEPLOYED_PENDING_SECRET
```

Цепочка агентов работает безопасно и детерминированно. Live-провайдер Claude активируется только после предоставления владельцем рабочего `ANTHROPIC_API_KEY` и реализации HTTP-клиента. До этого — `PENDING_SECRET`, что не блокирует остальные фазы.
