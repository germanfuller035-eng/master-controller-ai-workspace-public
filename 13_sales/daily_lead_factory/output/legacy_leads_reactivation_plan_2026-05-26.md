# Legacy Leads Reactivation Plan — 2026-05-26

**Создан:** 2026-05-26 14:48 МСК  
**Кампания:** Mini Audit 10K / B2B Sales  
**Решение:** По решению Дмитрия старые лиды переводятся из HOLD / Needs Verification в новый активный reactivation pipeline.  
**Правило:** Старые касания сохраняются как история. Новые действия требуют отдельного approval. Отправка — ЗАПРЕЩЕНА до получения approval.

---

## Активный Reactivation Pipeline

| Новый lead_id | Лид | Старый статус | Последнее известное действие | Новый статус | Следующий шаг | Канал | Требует approval | Риск |
|---|---|---|---|---|---|---|---|---|
| REACT-2026-EDERA-001 | EDERA / Эдера | closed_paid | Mini audit доставлен, оплата подтверждена (чек 2026-05-25) | active_post_sale_followup | Проверить, что проект закрыт корректно, затем предложить следующий шаг только после отдельного approval | Telegram / manual (рабочий канал) | ✅ ДА — approval перед любым касанием | ⚠️ Нельзя писать повторно без понимания статуса оплаты/оказания услуги |
| REACT-2026-KZHBI-001 | КЖБИ (ООО «КЖБИ») | hold_no_contact | Никогда не писали. Контакт недостоверен (contact_available: false) | active_needs_channel_confirmation | Дмитрий подтверждает правильный контакт или вручную указывает канал | pending (неизвестен) | ✅ ДА — approval + подтверждение контакта | ⚠️ Нельзя писать на неподтверждённый контакт |
| REACT-2026-ATOM-001 | Завод АТОМ | hold_needs_verification | Approval pack подготовлен (ATOM_FOLLOWUP_APPROVAL_PACK.md). Факт реальной отправки не подтверждён | active_followup_decision_required | Дмитрий подтверждает: было отправлено или нет | email / manual (только после approval) | ✅ ДА — нельзя делать follow-up без подтверждения первого касания | ⚠️ Нельзя делать follow-up, если первое касание не подтверждено |
| REACT-2026-GSK-001 | ГСК (ООО «ГСК» завод ЖБИ) | hold_pending_approval | Лид в базе (waiting_approval). Нет email. Только телефон. Approval не получен | active_waiting_approval | Дмитрий подтверждает канал, затем подготовить черновик | phone / WhatsApp Business (pending) | ✅ ДА — approval + выбор канала перед любым действием | ⚠️ Нельзя писать без approval и без подтверждённого канала |

---

## Правила реактивация (Anti-Duplicate Protection)

1. **Старый лид при реактивации получает новый lead_id** (формат `REACT-2026-XXX-001`) — дубли исключены.
2. **Старые касания не считаются разрешением на новые отправки.** Каждое новое касание требует отдельного approval.
3. **do_not_contact = false** (нет подтверждённого отказа), но это НЕ означает разрешение — approval обязателен.
4. **Если выяснится, что клиент уже получил сообщение недавно** — next_contact_date пересчитать с учётом cadence (минимум 48ч–7 дней зависимо от канала).
5. **Никакого auto-send.** Все касания — только через approval Дмитрия.

---

## История (сохраняется без изменений)

| Лид | Где хранится история |
|---|---|
| EDERA / Эдера | `17_client_projects/edera_rest_mini_audit/report/09_RECEIPT_CONFIRMATION.md` |
| КЖБИ | `leads_master.json` / DLF-20260525-0007, `19_kgbi/`, `17_client_projects/kgbi_b2b_audit/` |
| Завод АТОМ | `17_client_projects/lead_generation_test_jbi_krasnodar/followup/ATOM_FOLLOWUP_APPROVAL_PACK.md` |
| ГСК | `leads_master.json` / DLF-20260525-0008 |

---

## Центр одобрений (Approval Center)

| Лид | Что требует approval |
|---|---|
| ZB23 | 0 действий до 2026-05-28. После — WhatsApp Business follow-up (если нет ответа) |
| EDERA | Approval required for next offer (проверить статус проекта → подготовить оффер → approval) |
| КЖБИ | Approval required after contact confirmation (сначала Дмитрий подтверждает контакт) |
| Завод АТОМ | Approval required after send-status confirmation (сначала подтвердить — было ли первое касание) |
| ГСК | Approval required for first channel/message (сначала выбрать канал + подготовить черновик) |

---

**Источник:** Решение Дмитрия 2026-05-26 | pipeline_source: Mini Audit 10K / B2B sales campaign  
**Следующий шаг:** Дмитрий проверяет этот файл и даёт approval по каждому лиду отдельно.
