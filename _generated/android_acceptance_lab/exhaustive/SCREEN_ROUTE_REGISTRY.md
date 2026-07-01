# Screen Route Registry (v1)

Навигационные пути от reset-состояния (force-stop → Today, paired) до каждого экрana.
`navigation_path` — упорядоченные selectors (By.res testTag или text) для тапов.

## Достижимые экраны (paired session)

| screen_id | route | путь (тапы) | scroll container |
|-----------|-------|-------------|------------------|
| home | today | tab_today | today_screen |
| commandcenter | command_center | tab_today → card_command_center | command_center_screen |
| campaigns | campaigns | tab_today → card_campaigns | campaigns_screen |
| commercial | commercial_summary | tab_today → card_commercial | commercial_summary |
| pipeline | leads | tab_leads | — |
| approvals | decisions | tab_decisions | — |
| replies | replies | tab_replies | replies_screen |
| operations | system | tab_system | operations_home |
| reliability | reliability | tab_system → ops_card_reliability | reliability_screen |
| cost | cost_center | tab_system → ops_card_cost | cost_center_screen |
| backup | backup_center | tab_system → ops_card_backup | backup_center_screen |
| push | push_settings | tab_system → ops_card_push | push_settings_screen |
| knowledge | knowledge | tab_system → ops_card_knowledge | — |
| sources | source_registry | tab_system → ops_card_source_registry | — |
| reservoir | reservoir | tab_system → ops_card_reservoir | — |
| ai | ai_usage | tab_system → ops_card_ai_usage | ai_usage |
| ownersettings | owner_settings | tab_system → ops_card_owner_settings | — |
| settings | connection_settings | tab_system → ops_card_connection | settings_screen |
| firsttouch | first_touch | tab_system → Первое касание | — |
| automation | ops/automation | tab_system → ops_card_automation | — |
| agents | agents | commercial → Агенты | — |
| catalog | product_catalog | commercial → Каталог | — |
| multichannel | multichannel | commercial → Мультиканал | — |
| transport | delivery_review | commercial → Доставка | — |
| miniaudit | mini_audit | tab_today → card_next_action | — |

## Недостижимые в paired-сессии (честно исключены)

| screen_id | контролов | причина |
|-----------|-----------|---------|
| auth | 12 | экран Connection показывается только в un-paired состоянии; отвязка деструктивна |
| feature | 2 | сам tab-scaffold MaterControllerRoot — покрыт через tab_* контролы |
| ui | 1 | определение SectionCard (shared helper, не экран) |
| projects | 2 | ProjectsScreen не подключён к навигации (dead route); контролы — disabled-заглушки |
| system | 1 | дубль SystemScreen (вкладка system ведёт на OperationsHomeScreen) |

## Покрытие

- Selectable controls: 301
- На достижимых экранах (исполняемая цель): **283**
- На недостижимых экранах: 18 (классифицированы выше)
- CONTROLS_WITHOUT_SCREEN_ROUTE: 0 (каждый привязан к screen_id)
