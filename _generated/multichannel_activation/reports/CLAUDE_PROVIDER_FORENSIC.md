# CLAUDE PROVIDER FORENSIC

**Дата:** 2026-06-18
**Цель:** доказать или опровергнуть, что AI-провайдер (Claude) реально работает. `AGENT_RUNTIME=ON` НЕ считается доказательством.

## Полный путь, как он реализован

```
agent task  (/agents/shadow-wave)
 → commercial/agents.mjs :: runShadowWave({maxLeads})
   → readStore (canonical, read-only)
   → eligibleForShadow() — отсекает TEST_ONLY/rejected/guessed/open-opp/delivery-unconfirmed
   → orchestrateLead(lead, snapshot, ctx)   ← commercial_core/lib/agent_shadow.mjs
       → leadIntelligence() / miniAudit() / offer() / qaSafety()  — ДЕТЕРМИНИРОВАННЫЕ анализаторы
   → artifacts + QA verdicts + owner_review_queue
```

## Ключевые факты

| Параметр | Значение |
|---|---|
| `PROVIDER_CONFIG_PATH` | резолв через `process.env.ANTHROPIC_API_KEY` (presence-only), `agents.mjs:18` |
| `PROVIDER_SECRET_SOURCE` | env агентского рантайма (`/etc/master-controller/master-controller.env`) |
| `PROVIDER_MODEL` | не задан (клиент не реализован) |
| `PROVIDER_HEALTH_CHECK` | отсутствует (нет клиента) |
| `LAST_SUCCESSFUL_PROVIDER_CALL` | НИКОГДА |
| `LAST_ERROR_CODE` | n/a |

## Главная находка

1. **`ANTHROPIC_API_KEY` = ABSENT** (см. CREDENTIAL_INVENTORY.md) → `provider_available=false`.
2. **HTTP-клиента к Claude в кодовой базе НЕТ.** Поиск по `tools/` и `commercial_core/` не нашёл ни одного из:
   `api.anthropic.com`, `@anthropic-ai`, `messages.create`, `x-api-key`, `fetch(` к provider.
3. Документация модуля `agent_shadow.mjs` прямо описывает дизайн:
   > "A deterministic analyzer underlies each agent (...never burns API calls...). An optional Claude provider can be injected by the caller for richer analysis; when absent the deterministic path is authoritative."

То есть текущий shadow-рантайм **намеренно** работает без provider — это безопасный детерминированный путь. `provider_available` — это индикатор будущей возможности, а не работающего вызова.

## Безопасность

- `agent_secret_exposure=0`, `direct_agent_writers=0`, `direct_smtp_paths=0` (из `/agents/status`).
- Секрет нигде не выводится (только `Boolean(...)`).
- Prompt-injection containment присутствует (`sanitizeUntrusted`).

## Вывод

```
AGENT_RUNTIME=ON
CLAUDE_PROVIDER_AVAILABLE=NO
CLAUDE_PROVIDER_SECRET_STATE=ABSENT
AGENT_RUNTIME_RESULT=DEPLOYED_PENDING_SECRET
PROVIDER_CLIENT_IMPLEMENTED=NO  (только точка инъекции, без HTTP-клиента)
```

Live-активация provider требует двух owner-действий:
1. предоставить рабочий `ANTHROPIC_API_KEY` в защищённый env-контур;
2. реализацию/инъекцию HTTP-клиента Claude в точку `orchestrateLead` (опциональный provider).

Без рабочего ключа health-call невозможен и не выполняется (нельзя проверить — нельзя активировать). Это соответствует hard-stop правилу «при невозможности проверить официальный API перед live-активацией». Все остальные фазы выполняются независимо.
