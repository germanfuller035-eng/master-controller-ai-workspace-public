# API Command Gap Matrix — First Touch

**Дата:** 2026-06-19. Развёрнутый First Touch API = read-only (4 GET). Нужно добавить no-send command-слой.

| Команда (план) | Метод/маршрут | Есть на prod? | Действие |
|---|---|---|---|
| summary | GET /first-touch/summary | ✅ | — |
| candidates | GET /first-touch/candidates | ✅ | — |
| candidate detail | GET /first-touch/candidates/:leadId | ✅ | — |
| pilot-readiness | GET /first-touch/pilot-readiness | ✅ | — |
| generate draft | POST /first-touch/generate-draft | ❌ | ДОБАВИТЬ (no-send) |
| select subject | POST /first-touch/select-subject | ❌ | ДОБАВИТЬ |
| select body | POST /first-touch/select-body | ❌ | ДОБАВИТЬ |
| request changes | POST /first-touch/request-changes | ❌ | ДОБАВИТЬ |
| approve text only | POST /first-touch/approve-text-only | ❌ | ДОБАВИТЬ |
| reject | POST /first-touch/reject | ❌ | ДОБАВИТЬ |
| select pilot | POST /first-touch/select-pilot | ❌ | ДОБАВИТЬ |
| return to audit | POST /first-touch/return-to-audit | ❌ | ДОБАВИТЬ |

Каждая команда: owner auth + expectedRevision + idempotency + artifact/lead ID + audit event + server-side validation + no_send=true + reread confirmation. Send endpoint НЕ добавляется. Decisions хранятся в отдельном first-touch decision store (через sole writer / API), не трогают send ledger/awaiting_reply/follow-up/transport.
