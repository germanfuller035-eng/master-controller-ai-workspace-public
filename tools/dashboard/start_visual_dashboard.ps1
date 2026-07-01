# ============================================================
#  Visual Dashboard Launcher v4 — NODE STATIC SERVER
#  Emergency fix 2026-05-26: Python http.server заменён на
#  Node.js static server (dashboard_static_server.mjs)
#  Root cause: python.exe зависал на порту 8787 → ERR_EMPTY_RESPONSE
#
#  ИЗМЕНЕНИЯ v4:
#  - Запускает Node.js static server (не Python!)
#  - Авто-убивает зависший процесс на порту 8787
#  - Ждёт реального старта сервера (loop 10x0.5s)
#  - Использует 127.0.0.1 (не localhost!)
#  - Резервный BAK файл: start_visual_dashboard.ps1.bak_2026-05-26
# ============================================================

$ErrorActionPreference = "Continue"
$WorkDir        = "D:\AI_WORKSPACE"
$BuildScript    = "tools\dashboard\build_dashboard_state.mjs"
$ServerScript   = "tools\dashboard\dashboard_static_server.mjs"
$StateFile      = "09_dashboards\dashboard_state.json"
$Port           = 8787
$BindAddr       = "127.0.0.1"
$BrowserUrl     = "http://127.0.0.1:$Port/09_dashboards/visual_master_dashboard.html"

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host "   Visual Dashboard Launcher v4 (Node) 2026-05-26 " -ForegroundColor Cyan
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host ""

# ── Шаг 0: Перейти в рабочую папку ──────────────────────────
Set-Location $WorkDir
Write-Host "  [OK] Рабочая папка: $WorkDir" -ForegroundColor Green

# ── Шаг 1: Проверить Node.js ─────────────────────────────────
Write-Host ""
Write-Host "  [1/5] Проверка Node.js..." -ForegroundColor Yellow
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "  [ОШИБКА] Node.js не найден!" -ForegroundColor Red
    Write-Host "  Установите Node.js с https://nodejs.org (LTS)" -ForegroundColor Red
    Read-Host "`n  Нажмите Enter для выхода"
    exit 1
}
$nodeVersion = & node --version 2>&1
Write-Host "  [OK] Node.js найден: $nodeVersion" -ForegroundColor Green

# ── Шаг 2: Запустить build_dashboard_state.mjs ──────────────
Write-Host ""
Write-Host "  [2/5] Обновление dashboard_state.json..." -ForegroundColor Yellow
try {
    & node $BuildScript 2>&1 | Out-Null
    Write-Host "  [OK] build_dashboard_state.mjs выполнен." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] build_dashboard_state.mjs: $_" -ForegroundColor DarkYellow
}

# ── Шаг 3: Проверить наличие dashboard_state.json ───────────
Write-Host ""
Write-Host "  [3/5] Проверка dashboard_state.json..." -ForegroundColor Yellow
if (-not (Test-Path $StateFile)) {
    Write-Host "  [ОШИБКА] Файл $StateFile не найден!" -ForegroundColor Red
    Write-Host "  Запустите вручную: node $BuildScript" -ForegroundColor Red
    Read-Host "`n  Нажмите Enter для выхода"
    exit 1
}
Write-Host "  [OK] dashboard_state.json существует." -ForegroundColor Green

# ── Шаг 4: Проверить порт 8787 — авто-убить зависший процесс ─
Write-Host ""
Write-Host "  [4/5] Проверка порта $Port..." -ForegroundColor Yellow
$portLines = netstat -ano 2>&1 | Select-String ":$Port\s"
if ($portLines) {
    Write-Host "  [WARN] Порт $Port занят. Освобождаем..." -ForegroundColor DarkYellow
    foreach ($line in $portLines) {
        $parts = ($line.Line.Trim() -split '\s+')
        $pid_ = $parts[-1]
        if ($pid_ -match '^\d+$' -and $pid_ -ne '0') {
            Write-Host "  -> Завершаем PID $pid_..." -ForegroundColor DarkYellow
            try { Stop-Process -Id ([int]$pid_) -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    Start-Sleep -Seconds 1
    $portLines2 = netstat -ano 2>&1 | Select-String ":$Port\s"
    if ($portLines2) {
        Write-Host "  [ОШИБКА] Порт $Port всё ещё занят!" -ForegroundColor Red
        Write-Host "  Найдите PID: netstat -ano | findstr :$Port" -ForegroundColor Yellow
        Write-Host "  Убейте:      taskkill /PID <PID> /F" -ForegroundColor Yellow
        Write-Host "  Перезапустите launcher." -ForegroundColor Yellow
        Read-Host "`n  Нажмите Enter для выхода"
        exit 1
    }
    Write-Host "  [OK] Порт $Port освобождён." -ForegroundColor Green
} else {
    Write-Host "  [OK] Порт $Port свободен." -ForegroundColor Green
}

# ── Шаг 5: Запустить Node.js static server ───────────────────
Write-Host ""
Write-Host "  [5/5] Запуск Node.js dashboard server на $BindAddr`:$Port..." -ForegroundColor Yellow

$serverTitle = "Dashboard Node Server :$Port"
Start-Process "cmd.exe" -ArgumentList "/K title $serverTitle && cd /d `"$WorkDir`" && node $ServerScript" -WindowStyle Normal

# ── Ждём реального старта (проверяем порт 10 раз по 0.5s) ───
Write-Host "  Ожидание запуска сервера..." -ForegroundColor DarkGray
$started = $false
for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Milliseconds 500
    $check = netstat -ano 2>&1 | Select-String ":$Port\s"
    if ($check) {
        $started = $true
        break
    }
    Write-Host "  ... попытка $i/10" -ForegroundColor DarkGray
}

if (-not $started) {
    Write-Host ""
    Write-Host "  [WARN] Сервер не обнаружен на порту $Port за 5 секунд." -ForegroundColor DarkYellow
    Write-Host "  Проверьте окно '$serverTitle' на наличие ошибок." -ForegroundColor DarkYellow
    Write-Host "  Попробуйте открыть URL вручную: $BrowserUrl" -ForegroundColor DarkYellow
} else {
    Write-Host "  [OK] Сервер запущен! Порт $Port активен." -ForegroundColor Green
}

# ── Открыть браузер ─────────────────────────────────────────
Write-Host ""
Write-Host "  Открываю браузер: $BrowserUrl" -ForegroundColor Cyan
Start-Process $BrowserUrl

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host "   Dashboard запущен!" -ForegroundColor Green
Write-Host "   URL: $BrowserUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Сервер работает в окне '$serverTitle'." -ForegroundColor DarkGray
Write-Host "   Закройте это окно, когда закончите работу." -ForegroundColor DarkGray
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Нажмите Enter для закрытия этого окна"
