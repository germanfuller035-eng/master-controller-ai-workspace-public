# VISUAL DASHBOARD COMMAND GUIDANCE REPORT
**Дата:** 2026-05-26  
**Время:** 17:39 (Europe/Moscow)  
**Статус:** ✅ ВЫПОЛНЕНО

---

## Status: COMPLETE

Все 9 шагов задачи выполнены. Dashboard стал понятным для Дмитрия: добавлены инструкции, команды для Cline и плейбуки по каждому лиду.

---

## Dashboard updated: ✅

**Файл:** `09_dashboards/visual_master_dashboard.html`  
**Резервная копия:** `09_dashboards/visual_master_dashboard.bak_2026-05-26.html`

Добавлено:
1. **Верхний блок «Как управлять системой сейчас»** — объясняет роли dashboard / Cline / ручная отправка / логирование
2. **Per-lead командные карточки** для каждого лида в блоке «Активные лиды»:
   - Что решить
   - Куда дать команду
   - Команда для Cline (copy-paste готова)
   - Что запрещено
   - Как залогировать после ручного действия

---

## Command guidance added: ✅

В `dashboard_state.json` добавлено поле `command_guidance`:

```json
{
  "dashboard_role": "смотреть — только отображение состояния",
  "cline_role": "выполнять задачи — подготовка черновиков, логирование, обновление данных",
  "manual_send_role": "ручная отправка клиенту через email / WhatsApp / MAX / Telegram",
  "log_after_manual": "после любого ручного касания логировать через Cline",
  "telegram_bot_status": "не подключён к этим командам — в разработке"
}
```

---

## Cline command templates: ✅

**Файл:** `02_templates/active_lead_cline_command_templates.md`

Шаблоны команд:
| Команда | Назначение |
|---|---|
| `prepare_draft` | Подготовить черновик сообщения |
| `verify_contact` | Проверить/подтвердить контакт |
| `verify_reply` | Проверить наличие ответа |
| `log_manual_touch` | Залогировать ручное касание |
| `put_on_hold` | Поставить лид на паузу |
| `approve_manual_send` | Запросить approval на ручную отправку |
| `update_lead_status` | Обновить статус лида |

---

## Active lead playbook: ✅

**Файл:** `13_sales/daily_lead_factory/active_lead_command_playbook_2026-05-26.md`

Таблица команд для всех 5 активных лидов:

| Лид | Ситуация | Команда для Cline | Результат | Requires approval |
|---|---|---|---|---|
| ZB23 | Ждём ответ до 2026-05-28 | `verify_reply ZB23` | Отчёт о наличии ответа | Нет |
| ZB23 | Нет ответа — нужен follow-up | `prepare_draft ZB23 whatsapp_followup` | WA Business черновик | Да |
| ZB23 | Ручная WA отправка выполнена | `log_manual_touch ZB23 whatsapp` | Запись в лог-файл | Нет |
| EDERA | Проверить закрытие проекта | `verify_contact EDERA project_status` | Статус лида | Да |
| EDERA | Готовить post-sale оффер | `prepare_draft EDERA post_sale_offer` | Черновик оффера | Да |
| EDERA | Ручное касание выполнено | `log_manual_touch EDERA telegram` | Запись в лог | Нет |
| КЖБИ | Подтвердить контакт/ЛПР | `verify_contact КЖБИ` | Подтверждение контакта | Да |
| КЖБИ | Подготовить черновик после confirm | `prepare_draft КЖБИ first_message` | Первое письмо | Да |
| КЖБИ | Ручное касание выполнено | `log_manual_touch КЖБИ` | Запись в лог | Нет |
| ATOM | Уточнить статус первого касания | `verify_contact ATOM first_touch` | Статус first touch | Да |
| ATOM | Если не было — первое письмо | `prepare_draft ATOM first_message` | Первое сообщение | Да |
| ATOM | Если было — follow-up | `prepare_draft ATOM followup` | Follow-up черновик | Да |
| ГСК | Подтвердить канал | `verify_contact ГСК channel` | Выбор канала | Да |
| ГСК | Подготовить первое сообщение | `prepare_draft ГСК first_message` | Черновик под канал | Да |
| ГСК | Ручное касание выполнено | `log_manual_touch ГСК` | Запись в лог | Нет |

---

## SOP updated: ✅

**Файл:** `03_sop/visual_dashboard_daily_use_sop.md`

Добавлен раздел:
```
## Куда давать команды

- Dashboard → смотреть (только отображение)
- Cline → выполнять задачи в AI_WORKSPACE
- Ручная почта/WA/MAX/TG → отправлять клиенту
- Cline (после отправки) → логировать
- Telegram-бот → позже (в разработке)
```

---

## dashboard_state rebuilt: ✅

```
[build_dashboard_state] ✅ dashboard_state.json обновлён
[build_dashboard_state] active_work_queue: 5 лидов
[build_dashboard_state] dmitry_decision_center: 5 решений
[build_dashboard_state] forbidden_now: 11 правил
[build_dashboard_state] risks: 5
[build_dashboard_state] legacy_leads (архив): 0
```

Новые поля в `dashboard_state.json`:
- `command_guidance` — роли каждого инструмента
- `cline_command_templates` — список из 7 шаблонов
- `manual_send_log_required: true`

Резервная копия: `tools/dashboard/build_dashboard_state.bak_2026-05-26.mjs`

---

## Auto-send: ❌ ОТКЛЮЧЁН

`auto_send_enabled: false` — не изменялся, не запускался.

---

## Secrets read: ❌ НЕТ

Никакие `.env`, пароли, токены не читались.

---

## VPS touched: ❌ НЕТ

VPS / SSH / deploy не затрагивались.

---

## Report path

`09_dashboards/visual_dashboard_command_guidance_report_2026-05-26.md`

---

## Созданные / обновлённые файлы

| Файл | Действие |
|---|---|
| `09_dashboards/visual_master_dashboard.html` | Обновлён: command guidance block + per-lead cards |
| `09_dashboards/visual_master_dashboard.bak_2026-05-26.html` | Создана резервная копия |
| `13_sales/daily_lead_factory/active_lead_command_playbook_2026-05-26.md` | Создан: playbook по 5 лидам |
| `02_templates/active_lead_cline_command_templates.md` | Создан: 7 шаблонов команд |
| `03_sop/visual_dashboard_daily_use_sop.md` | Обновлён: раздел «Куда давать команды» |
| `tools/dashboard/build_dashboard_state.mjs` | Обновлён: 3 новых поля |
| `tools/dashboard/build_dashboard_state.bak_2026-05-26.mjs` | Создана резервная копия |
| `09_dashboards/dashboard_state.json` | Пересобран: новые поля включены |
| `09_dashboards/visual_dashboard_command_guidance_report_2026-05-26.md` | Этот отчёт |

---

## Next action (безопасный следующий шаг)

**Дмитрий принимает решения по лидам в Центре решений dashboard:**

1. **ZB23** — ждать до 2026-05-28, потом дать команду: `prepare_draft ZB23 whatsapp_followup`
2. **EDERA** — подтвердить: проект закрыт? → дать команду: `verify_contact EDERA project_status`
3. **КЖБИ** — подтвердить ЛПР → дать команду: `verify_contact КЖБИ`
4. **ATOM** — подтвердить: первое сообщение было? → дать команду: `verify_contact ATOM first_touch`
5. **ГСК** — выбрать канал → дать команду: `prepare_draft ГСК first_message`

После каждой ручной отправки — логировать: `log_manual_touch [ЛИД] [КАНАЛ]`
