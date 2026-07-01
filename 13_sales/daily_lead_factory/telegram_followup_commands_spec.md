# Telegram Follow-up Commands Spec

**Проект:** Mini Audit 10K  
**Создан:** 2026-05-26  
**Статус:** Build/Test  
**Слой:** Daily Command Layer → Telegram Master Controller

---

## Обзор

Спецификация команд Telegram Master Controller для ежедневного управления follow-up очередью.

**Принцип:** Все команды — READ-ONLY или LOG-ONLY. Ни одна команда не инициирует отправку клиенту.

---

## Команды

---

### `/followups`

**Назначение:** Показать все due и overdue follow-ups на сегодня

**Синтаксис:**
```
/followups
```

**Источник данных:** `13_sales/daily_lead_factory/output/followup_queue_2026-MM-DD.json`

**Фильтрация:**
- `next_contact_date <= today`
- `status` NOT IN `['closed', 'blacklisted', 'max_touches_reached']`

**Формат ответа:**
```
📋 FOLLOW-UPS DUE TODAY — 2026-05-26

⏰ OVERDUE (просрочено):
(список если есть)

📋 DUE TODAY:
🏢 ZB23 — Company Name
📅 Last touch: 2026-05-26 (email)
📅 Next touch: 2026-05-28
📲 Next channel: WhatsApp Business
📄 Draft: output/zb23_followup_plan_2026-05-26.md
🔢 Touch count: 1/5
⚠️ Approval required: YES
🚫 Auto-send: BLOCKED

Команды: /approve_followup ZB23 | /log_touch ZB23 whatsapp

---
Всего в очереди: 1
```

**Ограничения:**
- ❌ Не отправляет сообщения
- ❌ Не меняет статусы
- ✅ Только чтение и отображение

---

### `/sales_today`

**Назначение:** Сводка продаж и активных лидов на сегодня

**Синтаксис:**
```
/sales_today
```

**Источник данных:**
- `13_sales/daily_lead_factory/output/sales_today_YYYY-MM-DD.md`
- `13_sales/daily_lead_factory/output/followup_queue_YYYY-MM-DD.json`
- `data/deals.json`

**Формат ответа:**
```
📊 SALES TODAY — 2026-05-26

💰 Revenue:
• Закрыто сделок: 0
• В переговорах: 0
• Ожидают ответа: 1

📋 Активные лиды:
• ZB23 — waiting_reply (email sent 2026-05-26)
  Next touch: 2026-05-28 via WhatsApp Business

🎯 Действий сегодня: 0
📅 Следующее действие: 2026-05-28
```

**Ограничения:**
- ❌ Не запускает никаких действий
- ✅ Только информационный дэшборд

---

### `/replies`

**Назначение:** Показать найденные ответы от клиентов

**Синтаксис:**
```
/replies
```

**Источник данных:**
- `data/mail_reply_monitor.json`
- `data/inbox_messages.json`

**Фильтрация:**
- Новые входящие с момента последней проверки
- Только от доменов из followup_queue

**Формат ответа (есть ответы):**
```
📬 НОВЫЕ ОТВЕТЫ — 2026-05-26

✉️ От: [domain]
📅 Дата: 2026-05-26 10:30
📲 Канал: email
📝 Preview: "Добрый день, спасибо..."

Команда: /lead_status [domain]
```

**Формат ответа (нет ответов):**
```
📭 Новых ответов нет (2026-05-26 13:00)
Следующая проверка — ручная через /replies
```

**Ограничения:**
- ❌ Не отвечает клиентам автоматически
- ❌ Не читает .env / токены / пароли
- ✅ Только показ входящих

---

### `/lead_status <domain>`

**Назначение:** Показать статус конкретного лида по домену

**Синтаксис:**
```
/lead_status zb23.ru
/lead_status example.com
```

**Параметры:**
| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `domain` | string | ✅ | Домен компании из followup_queue |

**Источник данных:** `13_sales/daily_lead_factory/output/followup_queue_2026-MM-DD.json`

**Формат ответа:**
```
🏢 СТАТУС ЛИДА

Lead ID: ZB23
Компания: [Company Name]
Домен: zb23.ru
Статус: waiting_reply
Score: 85

📞 Касания:
• Touch 1: 2026-05-26 | Email | Отправлен первый аудит
Touch count: 1/5

📅 Next touch: 2026-05-28
📲 Next channel: WhatsApp Business
📄 Draft: output/zb23_followup_plan_2026-05-26.md

⚠️ Approval required: YES
🚫 Auto-send: BLOCKED
```

**Ограничения:**
- ❌ Не меняет статус
- ✅ Только чтение карточки

---

### `/approve_followup <lead_id>`

**Назначение:** Одобрить конкретное касание (только approval, БЕЗ авто-отправки)

**Синтаксис:**
```
/approve_followup ZB23
```

**Параметры:**
| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `lead_id` | string | ✅ | ID лида из followup_queue |

**Что происходит при выполнении:**
1. Статус касания → `approved_pending_send`
2. Запись в лог: `{date, lead_id, approved_by: "Dmitry", channel: <next_channel>}`
3. Telegram подтверждение выведено

**Защиты:**
- Если `touch_count >= 5` → команда блокируется, выводит предупреждение
- Если `today - last_touch_date < 48h` → блокируется с предупреждением "Too soon"
- Повторный вызов в тот же день → предупреждение "Already approved today"

**Формат ответа (успех):**
```
✅ APPROVAL ЗАФИКСИРОВАН

Lead ID: ZB23
Канал: WhatsApp Business
Дата approval: 2026-05-26 13:05
Статус: approved_pending_send

⚠️ ВАЖНО: Отправьте вручную!
После отправки: /log_touch ZB23 whatsapp
```

**Формат ответа (блокировка):**
```
🚫 APPROVAL ЗАБЛОКИРОВАН

Причина: Too soon (last touch 2026-05-26, min 48h)
Next allowed: 2026-05-28

Если нужно отменить правило → требуется отдельное решение Дмитрия
```

**Ограничения:**
- ❌ НЕ отправляет сообщение клиенту
- ❌ НЕ является командой на отправку
- ✅ Только метка одобрения для аудит-трейла

---

### `/log_touch <lead_id> <channel>`

**Назначение:** Залогировать ручное касание после отправки

**Синтаксис:**
```
/log_touch ZB23 whatsapp
/log_touch ZB23 email
/log_touch ZB23 max
/log_touch ZB23 telegram
/log_touch ZB23 phone
```

**Параметры:**
| Параметр | Тип | Обязательный | Допустимые значения |
|---|---|---|---|
| `lead_id` | string | ✅ | ID лида из followup_queue |
| `channel` | string | ✅ | `email`, `whatsapp`, `max`, `telegram`, `phone` |

**Что происходит при выполнении:**
1. `last_touch_date` → today
2. `last_touch_channel` → channel
3. `touch_count` → touch_count + 1
4. `status` → `waiting_reply`
5. `next_contact_date` → today + 48h (или по каденции)
6. Запись в касания: `{date, channel, logged_by: "Dmitry"}`
7. Если `touch_count >= 5` → статус `max_touches_reached`, из очереди убирается

**Защиты:**
- Без предварительного `/approve_followup` → предупреждение "Approval not found"
- Дублирование `/log_touch` в один день → предупреждение "Already logged today"

**Формат ответа (успех):**
```
✅ КАСАНИЕ ЗАЛОГИРОВАНО

Lead ID: ZB23
Канал: WhatsApp Business
Дата: 2026-05-26 13:10
Touch count: 2/5
Статус: waiting_reply
Next touch: 2026-05-28

Очередь обновлена. ✓
```

**Формат ответа (max touches):**
```
⚠️ ЛИМИТ КАСАНИЙ ДОСТИГНУТ

Lead ID: ZB23
Touch count: 5/5
Статус: max_touches_reached

Лид убран из активной очереди.
Решение о продолжении — только Дмитрий.
```

**Ограничения:**
- ✅ Только логирование
- ❌ Не отправляет ничего клиенту

---

## Сводная таблица команд

| Команда | Действие | Auto-send | Approval required | Меняет данные |
|---|---|---|---|---|
| `/followups` | Показ очереди | ❌ | ❌ | ❌ |
| `/sales_today` | Сводка продаж | ❌ | ❌ | ❌ |
| `/replies` | Показ ответов | ❌ | ❌ | ❌ |
| `/lead_status <domain>` | Статус лида | ❌ | ❌ | ❌ |
| `/approve_followup <lead_id>` | Approval касания | ❌ | ✅ ДА — сам является | ✅ статус |
| `/log_touch <lead_id> <channel>` | Лог касания | ❌ | ❌ | ✅ touch log |

---

## Связанные файлы

| Файл | Роль |
|---|---|
| `00_architecture/sales_followup_daily_command_layer.md` | Архитектура слоя |
| `03_sop/sales_followup_daily_review_sop.md` | Ежедневный SOP |
| `02_templates/telegram_followup_cards_template.md` | Шаблон карточек |
| `13_sales/daily_lead_factory/followup_queue_schema.md` | Схема очереди |
| `13_sales/daily_lead_factory/anti_duplicate_contact_rules.md` | Правила антидублей |

---

*Создан: 2026-05-26 | Telegram Follow-up Commands Spec*
