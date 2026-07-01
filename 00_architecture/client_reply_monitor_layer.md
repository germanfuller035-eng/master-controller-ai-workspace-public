# CLIENT REPLY MONITOR LAYER

**Создан:** 2026-05-26  
**Проект:** Mini Audit 10K  
**Статус:** Build/Test  
**Связан с:** `00_architecture/client_communication_cadence_layer.md`

---

## 1. Назначение слоя

Client Reply Monitor Layer — это уровень мониторинга входящих ответов клиентов в рамках B2B outreach кампании Mini Audit 10K.

**Задачи слоя:**
- Обнаруживать ответы клиентов на отправленные outreach-письма
- Классифицировать ответы (позитивный / негативный / молчание)
- Предотвращать дублированные касания
- Формировать очередь follow-up для одобрения Дмитрием
- Обновлять статус лидов в `leads_master.json`
- Поддерживать Approval Gate перед любым новым контактом

---

## 2. Как мониторить ответы

### 2.1 Ручная проверка (основной метод)

> **Auto-scan без Дмитрия — ЗАПРЕЩЁН.**  
> Все проверки — вручную или с явным разрешением.

**Шаги ежедневной проверки:**
1. Открыть Яндекс.Почту (yandex.ru / mail.yandex.ru)
2. Проверить папку **Входящие** — фильтр по домену клиента
3. Проверить папку **Спам** — ответы могут туда попасть
4. Проверить папку **Удалённые** — на случай автоудаления
5. Зафиксировать результат в `followup_queue_*.json`

### 2.2 Признаки ответа клиента

| Признак | Как проверить |
|---|---|
| From: содержит домен клиента | `from:zb23.ru` в поиске почты |
| Subject: содержит Re: + тему письма | Поиск по теме отправленного письма |
| Message-ID / In-Reply-To | Заголовки письма (показать источник) |
| Timestamp > дата отправки | Только письма после 2026-05-26 09:19 МСК |

---

## 3. Как отличать Reply от нового письма

| Признак | Reply | Новое письмо |
|---|---|---|
| Subject | Начинается с `Re:` | Без `Re:` |
| In-Reply-To header | Присутствует | Отсутствует |
| Thread ID | Тот же тред | Новый тред |
| From domain | Совпадает с доменом лида | Возможно новый домен |
| Контекст | Цитирует наш текст | Без цитирования |

**Правило:** Если сомнение — считать новым письмом и запросить решение у Дмитрия.

---

## 4. Как обновлять lead status

После обнаружения или отсутствия ответа — обновить статус лида в:
- `13_sales/daily_lead_factory/data/processed/leads_master.json`
- `13_sales/daily_lead_factory/output/followup_queue_*.json`

### Статусы и условия смены:

| Статус | Условие |
|---|---|
| `waiting_reply` | Письмо отправлено, ответа нет, дата follow-up ещё не наступила |
| `followup_due` | Дата следующего касания наступила, ответа нет |
| `reply_positive` | Клиент ответил с интересом ("пришлите", "расскажите", "сколько стоит") |
| `reply_negative` | Клиент ответил с отказом ("не интересно", "не нужно") |
| `hold_30d` | Клиент ответил "позже", "занят"; повторный контакт через 30 дней |

**Алгоритм обновления:**
1. Открыть `leads_master.json`
2. Найти запись по `lead_id`
3. Обновить поле `status`
4. Обновить `last_contact_date`, `last_reply_date` (если ответ)
5. Обновить `next_contact_date` (если требуется follow-up)
6. Сохранить файл
7. Обновить `followup_queue_*.json`

---

## 5. Как формировать follow-up queue

Follow-up queue формируется вручную или обновляется по результатам проверки:

**Файл:** `13_sales/daily_lead_factory/output/followup_queue_YYYY-MM-DD.json`  
**Схема:** `13_sales/daily_lead_factory/followup_queue_schema.md`

**Принципы формирования:**

1. **Один лид — одна запись в очереди** (нет дублей)
2. **next_contact_date** — не раньше чем через 48ч после последнего касания
3. **touch_count_total** — никогда не превышать 4–5 касаний за 14 дней
4. **priority** — расставлять по потенциалу (reply_positive → followup_due → waiting_reply)
5. **draft_path** — путь к заготовке сообщения (заполняется до approval)
6. **approval_required: true** — каждое касание требует одобрения Дмитрия

---

## 6. No Auto-Send Rule

> **⛔ АБСОЛЮТНЫЙ ЗАПРЕТ:**  
> Ни один инструмент, скрипт, агент или автоматизация **не имеет права**  
> отправлять сообщение клиенту без явного одобрения Дмитрия.

Это относится к:
- Email (Yandex SMTP)
- WhatsApp Business
- MAX
- Telegram
- Любым другим каналам

Нарушение — критическая ошибка системы.

---

## 7. Approval Gate

**Перед каждым новым касанием:**

1. AI формирует `draft_path` (заготовка сообщения)
2. Запись добавляется в `followup_queue_*.json` с `approval_required: true`
3. Дмитрий получает уведомление (через Telegram или просмотр файла)
4. Дмитрий одобряет или отклоняет
5. После одобрения — отправка вручную или с подтверждением
6. Лог касания фиксируется в `outreach_log_*.md`

**Никаких исключений из этого правила нет.**

---

## 8. Связь с leads_master.json

| Поле в leads_master.json | Источник обновления |
|---|---|
| `status` | Результат мониторинга ответа |
| `last_contact_date` | Дата последней отправки |
| `last_contact_channel` | Канал последнего касания |
| `next_contact_date` | Рассчитывается из cadence rules |
| `touch_count` | Инкрементируется при каждом касании |
| `reply_received` | true / false после проверки |
| `reply_type` | positive / negative / none |
| `notes` | Любые комментарии по клиенту |

**Путь к файлу:** `D:\AI_WORKSPACE\13_sales\daily_lead_factory\data\processed\leads_master.json`

---

## Ссылки

- `00_architecture/client_communication_cadence_layer.md` — слой cadence
- `03_sop/client_reply_monitor_sop.md` — операционные процедуры
- `13_sales/daily_lead_factory/followup_queue_schema.md` — схема очереди
- `13_sales/daily_lead_factory/anti_duplicate_contact_rules.md` — правила антидублей
- `03_sop/b2b_followup_cadence_sop.md` — SOP по cadence

---

*Создан: 2026-05-26 | Client Reply Monitor & Follow-up Queue Builder*
