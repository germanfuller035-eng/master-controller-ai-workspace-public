# CLIENT_REPLY_MONITORING_SOP

**Version:** 1.0  
**Created:** 2026-05-22  
**Owner:** Dmitry / System  

---

## 1. Назначение

Следить за ответами клиентов после отправленных сообщений.  
Не допустить потери входящего ответа и не отправить лишнее сообщение.

---

## 2. Главный принцип

Если клиент ответил:
- записать входящее сообщение в `data/inbox_messages.json`;
- классифицировать intent;
- создать черновик ответа в `data/reply_drafts.json`;
- создать approval запись в `data/approvals.json`;
- **не отправлять автоматически**.

---

## 3. Текущие проекты в ожидании ответа

| Проект | Канал | Контакт | Последнее касание |
|---|---|---|---|
| EDERA | Telegram | missing | 2026-05-20 (receipt sent) |
| КЖБИ | Manual/Email | missing | 2026-05-21 (follow-up) |
| ГСК | Email | 2@900-800.ru | 2026-05-21 (first email) |
| Завод АТОМ | Email | missing | 2026-05-22 (follow-up) |

---

## 4. Каналы приёма

- **Yandex Mail** — manual intake only (Stage 0). НЕ подключена автоматически.
- **Telegram** — forwarded messages от Дмитрия.
- **Manual copy/paste** — Дмитрий копирует текст вручную.

---

## 5. Что запрещено

- ❌ авто-ответ без approval;
- ❌ повторное касание без approval Дмитрия;
- ❌ изменение цены;
- ❌ отправка PDF;
- ❌ обещания результата;
- ❌ юридические/финансовые/медицинские утверждения;
- ❌ использование реальной Яндекс.Почты без Stage 1 approval.

---

## 6. Процесс обработки входящего ответа

1. **Ответ клиента попадает в inbox** (вручную или через forward).
2. **Системный оператор / Дмитрий** определяет проект — сверяет с `data/reply_monitoring.json`.
3. **Классифицировать intent:**
   - `interested` — клиент заинтересован
   - `price_question` — спрашивает о цене
   - `payment_question` — вопрос по оплате
   - `objection` — возражение
   - `not_interested` — отказ
   - `ask_details` — запрашивает подробности
   - `unclear` — неясно
4. **Создать запись** в `data/inbox_messages.json`.
5. **Создать reply draft** в `data/reply_drafts.json` с использованием шаблона `02_templates/client_reply_triage_template.md`.
6. **Создать approval** в `data/approvals.json` с статусом `Pending`.
7. **Уведомить Дмитрия** (через /inbox или Telegram).
8. **Дмитрий** утверждает / правит / ставит Hold.
9. После approval — отправить вручную.

---

## 7. Связанные файлы

- `data/reply_monitoring.json` — статус ожидания ответов
- `data/inbox_messages.json` — входящие сообщения
- `data/reply_drafts.json` — черновики ответов
- `data/approvals.json` — approval queue
- `data/yandex_mail_allowlist.json` — разрешённые контакты
- `02_templates/client_reply_triage_template.md` — шаблон триажа
- `04_agents/client_reply_monitor_agent.md` — агент мониторинга

---

## 8. Эскалация

Если ответ клиента содержит:
- запрос возврата денег — **немедленно уведомить Дмитрия, не отвечать**;
- юридические претензии — **остановить всё, только Дмитрий принимает решение**;
- угрозы или агрессию — **зафиксировать, не отвечать**.
