# Closed-Loop Readiness — Reply Monitor + Follow-up Planner

**Дата:** 2026-06-19. Проверка существующих компонентов (feature freeze — новые подсистемы не добавляются).

## Reply monitor (IMAP read-only)
- Коннектор `tools/communication_monitor/yandex_mail_imap_read.mjs`: `readOnly=true` (IMAP EXAMINE, не SELECT), `mark_seen_enabled=false`, без delete/move/flag-мутаций, hard-guard отказывает при изменении safety-флагов.
- systemd `master-controller-imap.service/.timer`: периодический read-only sync.
- Корреляция: Message-ID / In-Reply-To / References / recipient-sender; subject — только fallback с пониженной уверенностью; изоляция по лиду.
- Тест `reply_correlation_offline_test`: **10/0 PASS**.

## Follow-up planner
- API read-models: `/mini-audit/followups`, `/mini-audit/followups/:leadId/preview`, prepare/postpone (owner-gated).
- Тест `pipeline_followup_reply_offline_test`: **20/0 PASS** (рассчёт даты, draft, учёт reply/opt-out/delivery, без отправки).
- Планировщик НЕ отправляет; не создаёт follow-up без proven commercial send; не создаёт при DELIVERY_STATUS_UNKNOWN; останавливается при reply/opt-out/bounce.

## Состояние сейчас (production)
```
AWAITING_REPLY=0 (нет доказанных отправок → reply-monitor не помечает)
FOLLOWUP_REQUIRED=0 · FOLLOWUPS_SENT=0 · FOLLOWUP_AUTOSEND=OFF
```

## Готовность к будущему циклу
```
proven send → reply received → Conversation Hub event → lead REPLIED → owner notification → НЕТ авто-outbound
proven send → no reply → follow-up due → draft prepared → owner review → send DISABLED
```

## Известное ограничение тестовой инфраструктуры (честно)
`reply_ingest_offline_test` не запускается: зависит от `tools/telegram_gateway/followup_engine.mjs`, который **untracked** в основном репозитории (предсуществующий пробел, не связан с этой волной). Покрытие closed-loop обеспечено двумя другими тестами выше. Рекомендация: закоммитить недостающие telegram_gateway-модули отдельной инфраструктурной задачей.
