# B2B FOLLOW-UP CADENCE SOP

**Версия:** 1.0  
**Дата:** 2026-05-26  
**Владелец:** Дмитрий Смагин  
**Применение:** Mini Audit 10K, все B2B outreach  
**Связанный документ:** `00_architecture/client_communication_cadence_layer.md`

---

## Цель

Пошаговый процесс для каждого цикла общения с B2B-клиентом: от первого касания до закрытия (сделка или do_not_contact).

---

## Шаг 1 — Подготовка лида (pre-contact)

1. Проверить статус лида в `data/leads.json`:
   - Если `do_not_contact: true` → **СТОП, не контактировать**
   - Если `next_contact_date` в будущем → **СТОП, ждать**
   - Если `touch_count >= 5` → перевести в `hold_long_term`
2. Убедиться, что email/домен уникальны (нет дублей в базе)
3. Проверить `data/yandex_mail_blacklist.json` — если домен есть → **СТОП**
4. Подготовить карточку лида с кратким обоснованием: почему этот лид сейчас

---

## Шаг 2 — Выбор канала первого касания

| Ситуация | Канал |
|---|---|
| Есть рабочий email | Email (Яндекс Почта) |
| Только телефон | Звонок → попросить email |
| Только соцсети | Telegram (если паблик) |
| Нет контактов | Пропустить, найти email через сайт |

**Правило:** Первый контакт всегда через Email, если он известен.

---

## Шаг 3 — Подготовка черновика (Day 0)

1. Открыть `02_templates/b2b_followup_message_templates.md`
2. Выбрать шаблон `TEMPLATE_01_FIRST_EMAIL`
3. Персонализировать:
   - Имя/компания клиента
   - 1–2 конкретных наблюдения с сайта/из аудита
   - Конкретная польза, не общие фразы
4. Сохранить черновик в `data/outbound_drafts.json`
5. **Не отправлять без approval**

---

## Шаг 4 — Approval Gate (перед каждой отправкой)

1. Подготовить Approval Card (см. `02_templates/email_reply_approval_card_template.md`)
2. Отправить Дмитрию через Telegram
3. Ждать: APPROVED / REJECTED / EDIT
4. Если REJECTED — пересмотреть текст, повторить
5. Если APPROVED — отправить вручную через Яндекс Почту
6. Зафиксировать факт отправки

---

## Шаг 5 — Логирование после отправки

После каждого касания обязательно записать:
- `date`: дата и время
- `channel`: email / whatsapp / telegram / phone
- `status`: sent / no_reply / replied / bounced
- `message_preview`: первые 50 символов (без секретов)
- `touch_count`: обновить счётчик +1
- `next_contact_date`: установить минимум +2 рабочих дня

---

## Шаг 6 — Ожидание ответа (Day 1–2)

- Ничего не делать
- Мониторить входящие через `tools/communication_monitor/mail_reply_monitor.mjs`
- Если пришёл ответ → перейти к шагу 10

---

## Шаг 7 — Follow-up 1 (Day 2–3, если нет ответа)

1. Проверить `next_contact_date` — не раньше
2. Выбрать канал для follow-up:
   - Если WhatsApp Business доступен → WhatsApp (шаблон `TEMPLATE_02_WHATSAPP`)
   - Иначе → короткое повторное письмо
3. Подготовить черновик → Approval → Отправить
4. Обновить `touch_count` и `next_contact_date`

---

## Шаг 8 — Follow-up 2 / Ценностное (Day 5–6)

1. Подготовить ценностное сообщение с **1 конкретной проблемой** из аудита
2. Шаблон: `TEMPLATE_05_VALUE_FOLLOWUP_WITH_FINDING`
3. Выбрать канал: Email или телефон
4. Если телефон: см. скрипт `TEMPLATE_04_PHONE_SECRETARY_SCRIPT`
5. Approval → Отправить/Позвонить → Залогировать

---

## Шаг 9 — Финальное закрытие цепочки (Day 9–10)

1. Шаблон: `TEMPLATE_06_FINAL_CLOSE_LOOP`
2. Тон: уважительный, без давления
3. Approval → Отправить → Залогировать
4. После отправки: установить статус `hold_long_term`
5. `next_contact_date = today + 30 days`

---

## Шаг 10 — Обработка ответа клиента

| Ответ | Действие |
|---|---|
| "Пришлите подробнее / КП" | Шаблон `TEMPLATE_07_REPLY_SEND_DETAILS` → подготовить, представить для approval |
| "Сколько стоит?" | Шаблон `TEMPLATE_08_REPLY_PRICING` → рассказать про Mini Audit 10K, цену |
| "Не интересно" | Шаблон `TEMPLATE_09_REPLY_NOT_INTERESTED` → вежливо закрыть, поставить `do_not_contact` или `hold_long_term` |
| Позитивный ответ | Перевести в `reply_received` → `deal_in_progress` → обсудить с Дмитрием |
| Нет ответа 14+ дней | Перевести в `hold_long_term` |

---

## Когда ставить HOLD

| Ситуация | Тип HOLD | Длительность |
|---|---|---|
| "Напишите через месяц" | `hold_short_term` | 14–30 дней |
| "Сейчас не актуально" | `hold_long_term` | 30–60 дней |
| Нет ответа 14+ дней | `hold_long_term` | 30 дней |
| Компания закрывается / переходный период | `hold_long_term` | 60+ дней |

---

## Когда ставить do_not_contact

| Ситуация |
|---|
| Явное "не пишите" / "не звоните" |
| Агрессивный ответ |
| Юридическая угроза |
| Клиент уже работает с конкурентом и доволен |
| Домен/email в `yandex_mail_blacklist.json` |

**После установки `do_not_contact`:**
- Поле `do_not_contact: true` в `data/leads.json`
- Запись в `data/yandex_mail_blacklist.json`
- Никаких касаний по любому каналу

---

## Что логировать после каждого касания

```
touch_log запись:
{
  "date": "2026-05-26T10:00:00+03:00",
  "channel": "email",
  "direction": "outbound",
  "status": "sent",
  "subject": "...",
  "message_preview": "Первые 50 символов...",
  "approved_by": "dmitry",
  "touch_count_after": 1,
  "next_contact_date": "2026-05-28"
}
```

---

## Ссылки

- `00_architecture/client_communication_cadence_layer.md`
- `02_templates/b2b_followup_message_templates.md`
- `13_sales/daily_lead_factory/client_communication_status_map.md`
- `13_sales/daily_lead_factory/anti_duplicate_contact_rules.md`
