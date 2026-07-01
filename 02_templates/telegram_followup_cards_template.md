# Telegram Follow-up Card Template

**Проект:** Mini Audit 10K  
**Создан:** 2026-05-26  
**Слой:** Daily Command Layer

---

## Шаблон карточки follow-up (Telegram)

```
━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FOLLOW-UP CARD — {lead_id}
━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 Company:       {company}
🌐 Domain:        {domain}
🔖 Status:        {status}

📅 Last touch:    {last_touch_date} ({last_touch_channel})
📅 Next touch:    {next_contact_date}
📲 Next channel:  {next_channel}
🔢 Touch count:   {touch_count}/5

📄 Draft path:    {draft_path}

⚠️  Approval req: {approval_required}
🚫 Auto-send:     BLOCKED

⚡ Risks:
{risks}

✅ Allowed actions:
{allowed_actions}

━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Поля карточки

| Поле | Тип | Описание | Пример |
|---|---|---|---|
| `lead_id` | string | Уникальный ID лида | ZB23 |
| `company` | string | Название компании | ООО Ромашка |
| `domain` | string | Домен сайта | romashka.ru |
| `status` | enum | Текущий статус | waiting_reply |
| `last_touch_date` | date | Дата последнего касания | 2026-05-26 |
| `last_touch_channel` | enum | Канал последнего касания | email |
| `next_contact_date` | date | Плановая дата следующего касания | 2026-05-28 |
| `next_channel` | enum | Следующий канал | WhatsApp Business |
| `touch_count` | int | Счётчик касаний | 1 |
| `draft_path` | path | Путь к черновику сообщения | output/zb23_followup_plan.md |
| `approval_required` | bool | Требуется ли approval | YES |
| `risks` | text | Риски по данному лиду | Дублирование email / слишком рано |
| `allowed_actions` | list | Что разрешено делать сегодня | /approve_followup ZB23 |

---

## Допустимые значения статусов

| Статус | Описание |
|---|---|
| `new` | Новый лид, не контактировали |
| `waiting_reply` | Отправлено касание, ждём ответа |
| `overdue` | next_contact_date прошёл, касание не сделано |
| `due_today` | Сегодня дата следующего касания |
| `approved_pending_send` | Approval выдан, ожидает ручной отправки |
| `replied` | Клиент ответил |
| `in_negotiation` | В переговорах |
| `closed_won` | Сделка закрыта |
| `closed_lost` | Отказ |
| `blacklisted` | Не контактировать |
| `max_touches_reached` | Достигнут лимит касаний |

---

## Допустимые каналы (next_channel)

| Канал | Значение |
|---|---|
| Email (Yandex) | `email` |
| WhatsApp Business | `whatsapp` |
| MAX | `max` |
| Telegram | `telegram` |
| Телефон | `phone` |

---

## Пример заполненной карточки

```
━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FOLLOW-UP CARD — ZB23
━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 Company:       [Company Name]
🌐 Domain:        zb23.ru
🔖 Status:        waiting_reply

📅 Last touch:    2026-05-26 (email)
📅 Next touch:    2026-05-28
📲 Next channel:  WhatsApp Business
🔢 Touch count:   1/5

📄 Draft path:    output/zb23_followup_plan_2026-05-26.md

⚠️  Approval req: YES
🚫 Auto-send:     BLOCKED

⚡ Risks:
• Не resend email — только WhatsApp Business
• Минимум 48h между касаниями
• Не использовать личный WhatsApp

✅ Allowed actions:
• /approve_followup ZB23
• /log_touch ZB23 whatsapp (после ручной отправки)
• /lead_status zb23.ru

━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*Создан: 2026-05-26 | Telegram Follow-up Card Template*
