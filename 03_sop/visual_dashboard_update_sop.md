# VISUAL_DASHBOARD_UPDATE_SOP

## 1. Назначение

SOP описывает обновление визуального дашборда.

## 2. Источник данных

Основной источник:
09_dashboards/dashboard_state.json

Вспомогательные источники:
- master_control_dashboard.md
- approval_center.md
- revenue_pipeline_dashboard.md
- followup_calendar.md
- lead_pipeline_dashboard.md
- project status files

## 3. Процесс обновления

1. Обновить dashboard_state.json.
2. Запустить update_visual_dashboard.mjs.
3. Открыть visual_master_dashboard.html.
4. Проверить глазами.
5. Если статусы неверные — исправить JSON и повторить.

## 4. Когда обновлять

- утром;
- после отправки сообщения;
- после ответа клиента;
- после изменения статуса;
- после approval/reject;
- после оплаты;
- после завершения pipeline stage.

## 5. Запреты

- не ставить Paid без оплаты;
- не ставить Contacted без отправки;
- не ставить Sent без отправки;
- не менять цену без approval;
- не удалять blockers без основания;
- не запускать outreach из dashboard.

## 6. Daily command

"Обнови dashboard_state.json и пересобери visual_master_dashboard.html на сегодня. Ничего не отправляй."