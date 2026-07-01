# Knowledge Radar — пакет активации live-сбора (LIVE FETCH = OFF)

Статус на момент написания: **офлайн-реализация и тесты завершены. Live-сбор ВЫКЛЮЧЕН.**
Радар работает в детерминированном режиме `live=false`: без сети, без LLM, без исходящих.
Все находки из фикстур помечены `TEST_ONLY` и не могут стать production-URGENT.

Активация live-сбора — отдельное owner-решение. Ниже точные шаги; код их не выполняет автоматически.

## Что уже работает без credentials

- Детерминированный конвейер: fetch(fixtures) → ETag/hash → нормализация → dedup → change-detect
  → trust-score → relevance → impact → routing. LLM-суммаризация отключена.
- Гейты заземления (grounded evidence): security-URGENT требует `cve_id + source_url +
  affected_versions + installed_version + stack_match + severity + recommended_action`;
  legal-URGENT требует `document_id + source_url + published_at + effective_at + exact_change +
  applicability`. Tier-4 источник в одиночку не может вызвать security/legal-решение.
- Prompt-injection карантин для всего внешнего текста.
- Эндпоинты (read-only): `GET /knowledge/status`, `/knowledge/radar-status`, `/knowledge/sources`,
  `/knowledge/digest?window=urgent|weekly|monthly`, `POST /knowledge/collect` (всегда `live:false`).
- Android: экраны Радара (loading/error/offline/empty, RU).
- Тест: `tools/tests/knowledge_radar_v1_test.mjs` — 31/0 PASS.

## Чего НЕ хватает для live-сбора (credential-gated)

Радар сейчас читает из встроенных фикстур. Для реального сбора нужны:

1. **Доступ к источникам (в основном бесплатные, ключи не нужны)** — большинство источников из
   реестра `SOURCES` публичные (NVD CVE feed, Android Security Bulletins, npm advisories,
   Node.js releases, ФНС, Роскомнадзор). Для них нужен только исходящий HTTPS с VPS.
2. **LLM-суммаризация (опционально, по умолчанию OFF)** — требует owner-approval на платный
   расход. Управляется бюджетом `KNOWLEDGE_RADAR_WEEKLY_BUDGET_UNITS` /
   `KNOWLEDGE_RADAR_MONTHLY_BUDGET_UNITS`. Без одобрения остаётся `DISABLED_NO_BUDGET_APPROVAL`.
3. **Закрытые каналы (Telegram discovery, VK)** — при необходимости отдельные токены; сейчас
   tier-4, только для обнаружения, не для решений.

## Шаги активации (выполняет владелец)

1. Подтвердить исходящий HTTPS с VPS к доменам источников (firewall/allowlist).
2. Реализовать реальные fetch-адаптеры на месте `DEFAULT_FIXTURES` (по одному на `source_id`),
   сохранив контракт нормализованного материала и пометку `verification` (`VERIFIED` только при
   полном наборе доказательств).
3. Запускать `runCollection({ live: true })` ТОЛЬКО после owner-решения о бюджете, если включается
   LLM-суммаризация. Без LLM `live:true` допустим для бесплатных источников.
4. Проверить, что production-digest показывает только `VERIFIED` + grounded URGENT.

## Жёсткие инварианты (не ослаблять)

- Радар НИКОГДА не меняет production, НИКОГДА не шлёт сообщения, НИКОГДА не принимает финансовых
  решений. Только находки и ПРЕДЛОЖЕНИЯ; одобрение владельца превращает предложение в отдельную
  инженерную задачу.
- `auto_production_changes = 0`, `auto_client_messages = 0`, `auto_financial_decisions = 0` —
  всегда.
- Весь внешний контент — недоверенные данные (prompt-injection guard обязателен).
