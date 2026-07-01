# FOLLOW-UP QUEUE SCHEMA

**Создан:** 2026-05-26  
**Проект:** Mini Audit 10K  
**Файл очереди:** `output/followup_queue_YYYY-MM-DD.json`

---

## Описание полей

### `queue_id`
- **Тип:** string
- **Формат:** `FQ-YYYYMMDD-NNN` (например `FQ-20260526-001`)
- **Назначение:** Уникальный идентификатор записи в очереди follow-up
- **Пример:** `"FQ-20260526-001"`

---

### `lead_id`
- **Тип:** string
- **Формат:** Совпадает с `lead_id` в `leads_master.json`
- **Назначение:** Ссылка на лид в основной базе
- **Пример:** `"ZB23"`

---

### `domain`
- **Тип:** string
- **Назначение:** Домен компании клиента
- **Пример:** `"zb23.ru"`

---

### `company_name`
- **Тип:** string
- **Назначение:** Название компании (для удобства чтения)
- **Пример:** `"ЗБ23 / zb23.ru"`

---

### `current_status`
- **Тип:** enum string
- **Допустимые значения:**
  - `waiting_reply` — письмо отправлено, ответа нет, срок ещё не истёк
  - `followup_due` — дата следующего касания наступила, ответа нет
  - `reply_positive` — клиент ответил с интересом
  - `reply_negative` — клиент отказал
  - `hold_30d` — клиент попросил написать позже (30 дней)
- **Пример:** `"waiting_reply"`

---

### `last_contact_channel`
- **Тип:** string
- **Допустимые значения:** `Yandex Email`, `WhatsApp Business`, `MAX`, `Telegram`, `Phone`, `Form`
- **Назначение:** Канал последнего состоявшегося контакта
- **Пример:** `"Yandex Email"`

---

### `last_contact_date`
- **Тип:** string (ISO date `YYYY-MM-DD`)
- **Назначение:** Дата последнего отправленного сообщения
- **Пример:** `"2026-05-26"`

---

### `next_contact_date`
- **Тип:** string (ISO date `YYYY-MM-DD`)
- **Назначение:** Дата, не ранее которой разрешено следующее касание
- **Правило:** Минимум +48ч после `last_contact_date`
- **Пример:** `"2026-05-28"`

---

### `next_channel`
- **Тип:** string
- **Допустимые значения:** `Yandex Email`, `WhatsApp Business`, `MAX`, `Telegram`, `Phone`, `Form`
- **Назначение:** Следующий канал по cadence (если нет ответа)
- **Пример:** `"WhatsApp Business"`

---

### `next_action`
- **Тип:** string
- **Назначение:** Конкретное действие для следующего касания
- **Примеры:**
  - `"prepare_wa_followup_draft_if_no_reply"`
  - `"send_email_reply_with_details"`
  - `"prepare_commercial_offer"`
  - `"check_inbox_for_reply"`
- **Пример:** `"prepare_wa_followup_draft_if_no_reply"`

---

### `draft_path`
- **Тип:** string | null
- **Назначение:** Относительный путь к файлу с черновиком сообщения
- **Пример:** `"13_sales/daily_lead_factory/output/zb23_wa_followup_draft_2026-05-28.md"`
- **Если черновика нет:** `null`

---

### `approval_required`
- **Тип:** boolean
- **Назначение:** Требует ли следующее действие одобрения Дмитрия
- **Правило:** Всегда `true` для любого нового касания с клиентом
- **Пример:** `true`

---

### `do_not_contact`
- **Тип:** boolean
- **Назначение:** Флаг запрета на контакт (клиент отказался / блэклист)
- **Правило:** Если `true` — никаких касаний, не добавлять в follow-up
- **Пример:** `false`

---

### `touch_count_total`
- **Тип:** integer
- **Назначение:** Общее количество состоявшихся касаний с клиентом
- **Правило:** Максимум 4–5 за 14 дней
- **Инкремент:** +1 после каждой успешной отправки
- **Пример:** `1`

---

### `priority`
- **Тип:** enum string
- **Допустимые значения:**
  - `high` — горячий лид, reply_positive или срочное действие
  - `medium` — стандартный follow-up, followup_due
  - `low` — waiting_reply, ещё есть время
  - `hold` — hold_30d, нет активных действий
- **Пример:** `"low"`

---

### `notes`
- **Тип:** string
- **Назначение:** Любые заметки оператора: контекст, особенности, причины статуса
- **Пример:** `"Email отправлен 2026-05-26 09:19 МСК. Ждём ответа до 2026-05-28."`

---

## Пример полной записи

```json
{
  "queue_id": "FQ-20260526-001",
  "lead_id": "ZB23",
  "domain": "zb23.ru",
  "company_name": "ЗБ23 / zb23.ru",
  "current_status": "waiting_reply",
  "last_contact_channel": "Yandex Email",
  "last_contact_date": "2026-05-26",
  "next_contact_date": "2026-05-28",
  "next_channel": "WhatsApp Business",
  "next_action": "prepare_wa_followup_draft_if_no_reply",
  "draft_path": null,
  "approval_required": true,
  "do_not_contact": false,
  "touch_count_total": 1,
  "priority": "low",
  "notes": "Email отправлен 2026-05-26 09:19 МСК. Ждём ответа до 2026-05-28."
}
```

---

## Файловая структура очереди

```
13_sales/daily_lead_factory/output/
  followup_queue_2026-05-26.json   ← текущая очередь
  followup_queue_2026-05-28.json   ← создаётся при наступлении followup_due
```

---

## Ссылки

- `00_architecture/client_reply_monitor_layer.md`
- `03_sop/client_reply_monitor_sop.md`
- `13_sales/daily_lead_factory/data/processed/leads_master.json`

---

*Создан: 2026-05-26 | Client Reply Monitor & Follow-up Queue Builder*
