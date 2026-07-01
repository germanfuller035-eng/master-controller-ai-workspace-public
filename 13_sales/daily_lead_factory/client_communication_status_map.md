# CLIENT COMMUNICATION STATUS MAP

**Версия:** 1.2 (добавлены scored/approval/followup_N/converted статусы)  
**Дата:** 2026-05-26  
**Проект:** Mini Audit 10K / Daily Lead Factory

---

## Полный реестр статусов

| Статус | Описание |
|---|---|
| `new` | Лид найден, не контактировали |
| `scored` | Лид оценён по скорингу (score рассчитан), ещё не на approval |
| `waiting_approval` | Ожидает одобрения Дмитрия перед первым контактом |
| `approved_for_contact` | Approval получен — разрешён outreach по выбранному каналу |
| `contacted_email_manual` | Отправлено email вручную (с approval) |
| `contacted_whatsapp_manual` | Отправлено сообщение в WhatsApp вручную (с approval) |
| `contacted_max_manual` | Отправлено сообщение в MAX вручную (с approval, только по публичному контакту) |
| `contacted_telegram_manual` | Отправлено сообщение в Telegram вручную (с approval) |
| `contacted_phone_manual` | Звонок / обращение через форму сайта сделан вручную |
| `waiting_reply` | Ожидаем ответа (любой канал) |
| `reply_positive` | Ответ получен: заинтересован, просит подробности |
| `reply_negative` | Ответ получен: не заинтересован или явный отказ |
| `followup_due` | Пора следующего касания (дата next_contact_date наступила) |
| `followup_1_sent` | 1-й follow-up отправлен (обычно Day 2–3, WhatsApp или повтор email) |
| `followup_2_sent` | 2-й follow-up отправлен (Day 5–6, value-письмо с 1 находкой) |
| `final_followup_sent` | Финальный close-loop follow-up отправлен (Day 9–10) |
| `in_negotiation` | В переговорах (ответил, обсуждаем детали) |
| `hold_30d` | На паузе 30 дней (мягкий отказ или истекли касания без ответа) |
| `do_not_contact` | Запрет контакта — все каналы заблокированы навсегда |
| `converted_to_audit` | Конвертирован: запущен полный B2B-аудит (сделка закрыта) |
| `converted_to_start_pack` | Конвертирован: продан Start Pack (сделка закрыта) |

---

## Дополнительные MAX-статусы

| Статус | Описание |
|---|---|
| `max_followup_due` | Пора делать follow-up в MAX |
| `max_followup_sent` | MAX follow-up отправлен |
| `max_waiting_reply` | Ожидаем ответа в MAX |
| `max_reply_positive` | Ответ в MAX: заинтересован |
| `max_reply_negative` | Ответ в MAX: не заинтересован |

---

## Схема переходов статусов

### Стандартный путь (Email → WhatsApp → MAX/Telegram → Phone)

```
new
  → scored                        (скоринг выполнен автоматически)
  → waiting_approval              (лид передан Дмитрию на одобрение)
  → approved_for_contact          (Дмитрий одобрил outreach)

approved_for_contact
  → contacted_email_manual        (Day 0, email отправлен вручную)
  → waiting_reply

waiting_reply (2 дня без ответа)
  → followup_due
  → followup_1_sent               (Day 2–3, WhatsApp или повторный email)
  → waiting_reply

waiting_reply (ещё 2–3 дня без ответа)
  → followup_due
  → followup_2_sent               (Day 5–6, value follow-up с 1 находкой)
  → waiting_reply

waiting_reply (ещё 3–4 дня без ответа)
  → followup_due
  → final_followup_sent           (Day 9–10, close-loop)
  → hold_30d                      (нет ответа → пауза 30 дней)

При ответе:
  → reply_positive                (заинтересован)
  → in_negotiation
  → converted_to_audit            (закрыта сделка = аудит)
  → converted_to_start_pack       (закрыта сделка = StartPack)

  → reply_negative                (не заинтересован)
  → do_not_contact                (явный отказ: "больше не пишите")
  → hold_30d                      (мягкий: "сейчас не актуально")
```

### Email → MAX (опциональный путь)

```
contacted_email_manual
  → max_followup_due              (публичный MAX-контакт найден, нет ответа 48h+)

max_followup_due
  → contacted_max_manual          (approval получен, сообщение отправлено)
  → max_waiting_reply

max_waiting_reply
  → max_reply_positive  → reply_positive → in_negotiation
  → max_reply_negative  → reply_negative / do_not_contact / hold_30d
  → followup_due        (нет ответа 48h)
  → hold_30d            (нет ответа 7 дней)
```

---

## Ограничения по MAX

- MAX-касания: **не более 3** на один контакт
- Интервал: **минимум 48 часов** между касаниями
- Требуется публичное основание (MAX-ссылка/QR/канал на сайте)
- После `do_not_contact` — **стоп по всем каналам**
- `auto-send` через MAX — **ЗАПРЕЩЁН**

---

## Ограничения по общему количеству касаний

- Не более **4–5 касаний за 14 дней** на один контакт (все каналы суммарно)
- Не более **1 касания в день** (один канал в день)
- Все касания **только ручные, с approval Дмитрия**

---

## Логирование каждого касания

Каждое касание логируется в `data/communication_log.json`:

```json
{
  "lead_id": "...",
  "channel": "email | whatsapp | max | telegram | phone",
  "status": "contacted_email_manual | followup_1_sent | ...",
  "date": "2026-05-26T09:19:00+03:00",
  "template_used": "TEMPLATE_01_FIRST_EMAIL",
  "approval_id": "APQ-XXXX",
  "next_contact_date": "2026-05-28",
  "notes": "..."
}
```

---

*Обновлён: 2026-05-26 — добавлены статусы: scored, waiting_approval, approved_for_contact, followup_1_sent, followup_2_sent, final_followup_sent, converted_to_audit, converted_to_start_pack*
