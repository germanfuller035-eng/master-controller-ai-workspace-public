# System Regression Test Suite v0.1

## Команда запуска

```
node "D:\AI_WORKSPACE\tools\tests\run_all_checks.mjs"
```

## Что проверяет

| # | Проверка | Описание |
|---|---|---|
| 1 | Syntax check | `node --check` для всех ключевых скриптов |
| 2 | Telegram self-test | `telegram_master_bot.mjs --self-test` |
| 3 | Data validation | `validate_data_layer.mjs` — структура JSON |
| 4 | Data sync | `sync_dashboard_state.mjs` — обновление состояния |
| 5 | Dashboard rebuild | `update_visual_dashboard.mjs` — HTML обновлён |
| 6 | Action executor dry-run | Risk gate: Green/Yellow/Orange/Red/Black |
| 7 | Master Controller commands | /health /next /report /payment /receipt /inbox /reply |
| 8 | Security scan | Нет токенов/паролей в логах/данных |
| 9 | Dashboard content check | Правильные блоки, нет кривых терминов |

## Что НЕ делает

- ❌ Не отправляет клиентам
- ❌ Не создаёт PDF
- ❌ Не меняет цены
- ❌ Не подключает почту
- ❌ Не читает секреты и токены
- ❌ Не делает массовую рассылку
- ❌ Не трогает банки, крипту, Госуслуги

## Результат

Отчёт сохраняется в:
```
tools/tests/latest_test_report.md
```

Статусы:
- **PASS** — всё OK
- **PARTIAL** — есть предупреждения, критических нет
- **FAIL** — есть критические ошибки

## Exit codes

- `0` — нет критических проблем (PASS или PARTIAL)
- `1` — есть критические проблемы (FAIL)

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `run_all_checks.mjs` | Главный скрипт проверок |
| `latest_test_report.md` | Последний отчёт |
| `03_sop/system_regression_test_sop.md` | SOP по тестированию |

## Когда запускать

- Перед подключением новых компонентов
- После крупных изменений
- Еженедельно для baseline
- Перед подключением Яндекс.Почты (Stage 1)
- После обновления executor/dashboard/data layer
