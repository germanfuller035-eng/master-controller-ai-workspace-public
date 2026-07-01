# OWNER AUTOMATION CONTROLS
Профили: Экономный/Сбалансированный(default)/Активный/Пользовательский. Server hard limits enforced.
Discovery/AI/budget настройки. source_strategy FREE_ONLY(default, активна), paid требует confirm+creds(absent).
Command: expectedRevision+idempotencyKey+changedFields. 409 conflict, 422 hard-limit/paid, idempotent replay, audit history.
Live tested: профиль применяется, hard-limit reject, paid gate, 409, idempotency, audit. paid_sources_enabled=false.
