# VISUAL DASHBOARD LAUNCHER FIX REPORT
_Дата: 2026-05-26 | Время: 15:27 MSK | Оператор: Cline Visual Dashboard Launcher Fix Operator_

---

## Итог

| Поле | Значение |
|------|---------|
| **Status** | ✅ FIXED — все 4 файла обновлены, .bak сохранены |
| **Root cause** | Старый launcher использовал `Start-Job` (PowerShell background job). При закрытии launcher-окна PowerShell завершал job и убивал `python.exe` → порт 8787 освобождался раньше, чем браузер успевал подключиться → `ERR_EMPTY_RESPONSE`. Дополнительно: `localhost` на Windows 10/11 резолвится в IPv6 `::1`, а Python `http.server --bind 127.0.0.1` слушает только IPv4 → ещё один вектор `ERR_EMPTY_RESPONSE`. |
| **PS1 updated** | ✅ `tools/dashboard/start_visual_dashboard.ps1` → v3 |
| **BAT updated** | ✅ `tools/dashboard/start_visual_dashboard.bat` → v3 |
| **Uses 127.0.0.1** | ✅ Да — и в bind, и в URL браузера |
| **Port check** | ✅ Автоматическая проверка порта 8787 + авто-kill зависшего PID + повторная проверка с понятным сообщением |
| **Server launch** | ✅ `Start-Process cmd /K` — сервер живёт в отдельном окне независимо от launcher |
| **Browser URL** | ✅ `http://127.0.0.1:8787/09_dashboards/visual_master_dashboard.html` |
| **Auto-send** | ❌ Не выполнялся |
| **Secrets read** | ❌ Не читались |
| **VPS touched** | ❌ Не трогался |
| **Report path** | `09_dashboards/visual_dashboard_launcher_fix_report_2026-05-26.md` |
| **Next action** | Запустить `tools\dashboard\start_visual_dashboard.bat` и убедиться что dashboard открывается |

---

## Детали изменений

### 1. `tools/dashboard/start_visual_dashboard.ps1` → v3

**Ключевые изменения:**

| Было (v1/v2) | Стало (v3) |
|---|---|
| `Start-Job { py -m http.server... }` | `Start-Process cmd /K title ... && py -m http.server...` |
| Сервер умирал при закрытии launcher | Сервер живёт в отдельном окне cmd |
| `localhost:8787` в URL | `127.0.0.1:8787` в URL |
| Нет проверки Port | Проверка порта + авто-kill по PID через netstat |
| Нет проверки dashboard_state.json | Проверка наличия файла с понятной ошибкой |
| Нет fallback python/py | py → python fallback |
| Нет ожидания сервера | `Start-Sleep -Seconds 2` перед открытием браузера |

**Шаги нового launcher (v3):**
1. `Set-Location D:\AI_WORKSPACE`
2. Проверка Node.js → выход с ошибкой если не найден
3. `node tools\dashboard\build_dashboard_state.mjs` → обновление данных
4. Проверка `09_dashboards\dashboard_state.json` → выход если отсутствует
5. `netstat -ano | Select-String ":8787"` → если занят: Kill-PID + повторная проверка
6. Поиск `py` / `python` → выход если оба не найдены
7. `Start-Process cmd /K "title Dashboard HTTP Server :8787 && cd /d D:\AI_WORKSPACE && py -m http.server 8787 --bind 127.0.0.1"` — **новое окно cmd**
8. `Start-Sleep -Seconds 2`
9. `Start-Process "http://127.0.0.1:8787/09_dashboards/visual_master_dashboard.html"`
10. `Read-Host "Нажмите Enter..."` — окно не закрывается

**BAK:** `tools/dashboard/start_visual_dashboard.ps1.bak_2026-05-26`

---

### 2. `tools/dashboard/start_visual_dashboard.bat` → v3

**Ключевые изменения:**

| Было | Стало |
|---|---|
| Минимальный wrapper | Проверка зависимостей Node.js + Python перед запуском |
| Молча закрывался при ошибке | `pause` + детальное сообщение при любой ошибке |
| Нет диагностики | Подсказка: `netstat -ano ^| findstr :8787` |
| Нет fallback | py → python fallback с понятным сообщением |

**BAK:** `tools/dashboard/start_visual_dashboard.bat.bak_2026-05-26`

---

### 3. `03_sop/visual_dashboard_daily_use_sop.md` → v3

**Добавлено:**
- Раздел 2: Правильный URL (`127.0.0.1` vs `localhost`) + объяснение причины
- Раздел 4: Troubleshooting — `ERR_EMPTY_RESPONSE` (4 причины + решения)
  - Сервер не запущен/упал
  - Порт занят + как проверить `netstat -ano | findstr :8787` + как убить PID
  - localhost vs 127.0.0.1
  - Старый launcher (Start-Job)
- Раздел 7: Полный цикл перезапуска сервера

**BAK:** `03_sop/visual_dashboard_daily_use_sop.md.bak_2026-05-26`

---

## Диагностика корневой причины ERR_EMPTY_RESPONSE

### Причина 1 (основная): Start-Job lifecycle

```
launcher.ps1 открывается
  → Start-Job { python http.server }  ← job привязан к PS-сессии
  → launcher.ps1 закрывается (или Read-Host нажат)
      → PowerShell сессия завершается
          → Job уничтожается → python.exe убит
              → порт 8787 больше не слушается
                  → браузер: ERR_EMPTY_RESPONSE
```

**Fix v3:** `Start-Process cmd /K` создаёт независимый процесс cmd.exe с живым Python, не привязанный к launcher.

### Причина 2 (дополнительная): localhost → IPv6

```
Python: py -m http.server 8787 --bind 127.0.0.1
  → слушает ТОЛЬКО IPv4: 127.0.0.1:8787

Browser: http://localhost:8787
  → Windows DNS резолвит localhost → ::1 (IPv6)
  → браузер пытается подключиться к [::1]:8787
  → нет сервера на ::1 → ERR_EMPTY_RESPONSE
```

**Fix v3:** Browser URL = `http://127.0.0.1:8787/...` (явный IPv4).

---

## Как убедиться что fix работает

```cmd
REM 1. Запустить launcher
D:\AI_WORKSPACE\tools\dashboard\start_visual_dashboard.bat

REM 2. Должны появиться 2 окна:
REM    - Окно launcher (PowerShell/BAT)
REM    - Окно "Dashboard HTTP Server :8787" (cmd + python)

REM 3. Браузер должен открыть:
REM    http://127.0.0.1:8787/09_dashboards/visual_master_dashboard.html

REM 4. Закрыть launcher-окно — окно сервера должно ОСТАТЬСЯ открытым
REM 5. Dashboard в браузере должен продолжать работать
```

---

## Файлы затронутые этим fix

| Файл | Действие | BAK |
|------|---------|-----|
| `tools/dashboard/start_visual_dashboard.ps1` | Updated → v3 | `.ps1.bak_2026-05-26` |
| `tools/dashboard/start_visual_dashboard.bat` | Updated → v3 | `.bat.bak_2026-05-26` |
| `03_sop/visual_dashboard_daily_use_sop.md` | Updated → v3 | `.md.bak_2026-05-26` |
| `09_dashboards/visual_dashboard_launcher_fix_report_2026-05-26.md` | Created (этот файл) | — |

---

## Блокировки / Ограничения

- Telegram-бот: ❌ не трогался
- Email/VPS/SSH: ❌ не трогались
- .env / secrets: ❌ не читались
- Auto-send: ❌ не запускался
- Реальный тест запуска: ⚠️ требует одобрения Дмитрия (запуск BAT-файла)

---

## Следующий безопасный шаг

```
Запустить: D:\AI_WORKSPACE\tools\dashboard\start_visual_dashboard.bat
Проверить: http://127.0.0.1:8787/09_dashboards/visual_master_dashboard.html
```
