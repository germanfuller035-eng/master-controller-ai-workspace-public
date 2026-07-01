# Android Smoke Result

Device:
- Samsung, `SM_A566E`

Installed build:
- Package: `ru.dmitry.matercontroller.debug`
- Version code: 31
- Version name: `0.8.0-rc7`
- Foreground launch after install: PASS

Smoke path:
- `Сегодня`: PASS
- `Обновить`: PASS
- `Запустить поиск`: PASS
- `Открыть письмо`: PASS
- `Сохранить черновик`: PASS
- `Подготовить пакет`: PASS, send remains approval-gated
- `История`: PASS
- `Настройки`: PASS

Observed owner-facing behavior:
- No stale fallback after draft save.
- Search action reports queued server work.
- Draft save explicitly reports that nothing was sent.
- Send button requires separate approval.
- Settings show `Рабочий сервер`, connection status, and a recovery action.
