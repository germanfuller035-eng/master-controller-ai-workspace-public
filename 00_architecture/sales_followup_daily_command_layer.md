# Sales Follow-up Daily Command Layer

**Проект:** Mini Audit 10K  
**Создан:** 2026-05-26  
**Статус:** Build/Test  
**Источник:** Telegram Master Controller

---

## 1. Цель слоя

Daily Command Layer — ежедневный управляющий слой для follow-up очереди Mini Audit 10K.

**Задача:** Дать Дмитрию единую точку контроля через Telegram-бот каждое утро:
- видеть, кому нужно написать сегодня;
- видеть, кто ответил;
- одобрять конкретное касание;
- логировать ручную отправку;
- не допустить дублей и несанкционированных отправок.

**Не является:** автоматической рассылкой, CRM-системой, заменой ручного решения.

---

## 2. Как Master Controller показывает ежедневные follow-up задачи

### Триггер
Каждый день утром (или по запросу `/followups`) Master Controller:
1. Читает `followup_queue_2026-MM-DD.json`
2. Фильтрует записи, где `next_contact_date <= today` и `status` не `closed` / `blacklisted`
3. Показывает карточки в Telegram через шаблон `telegram_followup_cards_template.md`

### Отображение в Telegram
```
📋 FOLLOW-UP DUE TODAY (2026-05-28)

🏢 ZB23 — [company name]
📅 Last touch: 2026-05-26 (Email)
📅 Next touch: 2026-05-28
📲 Next channel: WhatsApp Business
📄 Draft: output/zb23_followup_plan_2026-05-26.md
⚠️ Approval required: YES
🚫 Auto-send: BLOCKED

[/approve_followup ZB23] [/log_touch ZB23]
```

### Overdue
Если `next_contact_date < today` — статус `overdue`, карточка выводится с пометкой ⏰ OVERDUE.

---

## 3. Команды слоя

| Команда | Описание | Auto-send |
|---|---|---|
| `/followups` | Все due/overdue записи из followup_queue | ❌ нет |
| `/sales_today` | Сводка продаж и активных лидов на сегодня | ❌ нет |
| `/replies` | Найденные ответы от клиентов (из mail_reply_monitor) | ❌ нет |
| `/lead_status <domain>` | Статус конкретного лида по домену | ❌ нет |
| `/approve_followup <lead_id>` | Одобрение конкретного касания (без отправки) | ❌ нет |
| `/log_touch <lead_id> <channel>` | Лог ручного касания после отправки | ❌ нет |

Полная спецификация команд: `13_sales/daily_lead_factory/telegram_followup_commands_spec.md`

---

## 4. Данные из followup_queue

### Источник данных
- **Файл:** `13_sales/daily_lead_factory/output/followup_queue_2026-MM-DD.json`
- **Схема:** `13_sales/daily_lead_factory/followup_queue_schema.md`

### Поля, используемые слоем

| Поле | Назначение |
|---|---|
| `lead_id` | Идентификатор для команд `/approve_followup`, `/log_touch` |
| `company` | Отображение в карточке |
| `domain` | Для `/lead_status <domain>` |
| `status` | Фильтрация: `waiting_reply`, `overdue`, `due_today` |
| `last_touch_date` | Показ в карточке |
| `last_touch_channel` | История касаний |
| `next_contact_date` | Фильтр today/overdue |
| `next_channel` | Следующий канал (Email/WhatsApp/MAX/Telegram) |
| `draft_path` | Ссылка на черновик сообщения |
| `approval_required` | Флаг для блокировки auto-send |
| `touch_count` | Счётчик касаний (не более 4–5 за 14 дней) |

---

## 5. Как не допустить дублей

### Правила дедупликации

1. **Один lead_id — одно касание в день.** Если `/approve_followup ZB23` вызван дважды — второй вызов игнорируется с предупреждением.

2. **Лог касания обязателен перед следующим follow-up.** Без `/log_touch <lead_id> <channel>` статус остаётся `approved_pending_send`, следующий follow-up не показывается.

3. **next_contact_date обновляется только после логирования.** Касание без лога не сдвигает дату.

4. **touch_count ≥ 5 → автоматический hold.** Лид переходит в статус `max_touches_reached`, из очереди убирается.

5. **Проверка last_touch_date.** Если `today - last_touch_date < 48h` — касание блокируется с предупреждением «слишком рано».

### Файл антидублей
→ `13_sales/daily_lead_factory/anti_duplicate_contact_rules.md`

---

## 6. Что требует approval Дмитрия

| Действие | Требует approval |
|---|---|
| Отправить follow-up email | ✅ ДА |
| Отправить WhatsApp Business | ✅ ДА |
| Написать в MAX | ✅ ДА |
| Написать в Telegram клиенту | ✅ ДА |
| Позвонить / оставить заявку | ✅ ДА |
| Обновить статус лида | ❌ нет (ручное) |
| Залогировать касание `/log_touch` | ❌ нет (само является логом) |
| Просмотреть карточку `/lead_status` | ❌ нет |

**Принцип:** Master Controller только показывает и логирует. Отправляет всегда Дмитрий вручную.

---

## 7. Что запрещено auto-send

```
❌ ЗАПРЕЩЕНО БЕЗ APPROVAL:
- auto-send email
- auto-send WhatsApp / WhatsApp Business
- auto-post в MAX
- auto-message в Telegram клиентам
- массовая рассылка
- повторная отправка без нового approval
- отправка по истечении 24ч без переподтверждения

✅ РАЗРЕШЕНО БЕЗ APPROVAL:
- показ followup_queue
- показ статусов
- просмотр drafts
- логирование ручных касаний
- отображение ответов клиентов (только чтение)
```

---

## Связанные файлы

| Файл | Роль |
|---|---|
| `00_architecture/client_communication_cadence_layer.md` | Слой коммуникации |
| `00_architecture/client_reply_monitor_layer.md` | Мониторинг ответов |
| `03_sop/b2b_followup_cadence_sop.md` | SOP по каденции |
| `03_sop/client_reply_monitor_sop.md` | SOP мониторинга |
| `03_sop/sales_followup_daily_review_sop.md` | Ежедневный SOP |
| `13_sales/daily_lead_factory/followup_queue_schema.md` | Схема очереди |
| `13_sales/daily_lead_factory/output/followup_queue_2026-05-26.json` | Текущая очередь |
| `13_sales/daily_lead_factory/telegram_followup_commands_spec.md` | Спецификация команд |
| `02_templates/telegram_followup_cards_template.md` | Шаблон карточек |

---

*Создан: 2026-05-26 | Sales Follow-up Daily Command Layer Builder*
