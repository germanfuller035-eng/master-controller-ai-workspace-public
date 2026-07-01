# RC5 PHYSICAL DEFECT FORENSIC
| # | Дефект | Root cause | Fix |
|---|---|---|---|
| A | STROYDVOR «ожидает ответа» но READY_FOR_SEND_REVIEW | reconciliation использует stale lead.status; offer не в send-ledger | delivery reconciliation engine (ledger > status) |
| B | вкладка Аудит = письмо | audit_preview = email draft (masked_recipient/subject/body/template_id); реальных MINI_AUDIT artifact нет | строгие типы artifact; AUDIT_READY=false когда нет настоящего; настоящий audit из audit_observations (evidence-grounded, без AI) |
| C | radar fixtures как urgent | DEFAULT_FIXTURES (TEST_ONLY) показываются; Android cache/seed | fixtures исключены из production presentation; grounding gate; status endpoint; cache migration |
| D | 3 неразличимых раздела источников | нет локализации/разделения | Источники лидов / Каналы связи / Источники знаний + локализация типов |
| E | AI usage ложные нули | summary показывает raw=0 при UNKNOWN | UNKNOWN≠0, периоды явные |
| F | timezone/layout | нет IANA tz; 4-й профиль обрезан | Europe/Moscow; responsive профили |
| G | reservoir 7 застряли DOMAIN_RESERVOIR | нет prefilter pipeline; counter ambiguity | free deterministic prefilter + exclusive counters + list/detail |
