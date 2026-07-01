@echo off
:: ============================================================
::  Visual Dashboard Launcher BAT — v4 (Node) 2026-05-26
::  Запускает PowerShell launcher (start_visual_dashboard.ps1)
::  Не закрывается при ошибке — показывает сообщение.
:: ============================================================
title Visual Dashboard Launcher

echo.
echo  =====================================================
echo   Visual Dashboard Launcher v4 — NODE STATIC SERVER
echo   2026-05-26 Emergency Fix
echo  =====================================================
echo.

:: Проверить наличие PowerShell
where powershell >nul 2>&1
if errorlevel 1 (
    echo  [ОШИБКА] PowerShell не найден!
    echo  Установите PowerShell: https://aka.ms/powershell
    pause
    exit /b 1
)

:: Запустить PowerShell launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\AI_WORKSPACE\tools\dashboard\start_visual_dashboard.ps1"

if errorlevel 1 (
    echo.
    echo  =====================================================
    echo   [ОШИБКА] Launcher завершился с ошибкой.
    echo   Возможные причины:
    echo     1. Node.js не установлен (https://nodejs.org)
    echo     2. Порт 8787 занят — см. инструкцию ниже
    echo     3. Файл start_visual_dashboard.ps1 не найден
    echo.
    echo   Диагностика порта:
    echo     netstat -ano ^| findstr :8787
    echo.
    echo   Убить зависший процесс:
    echo     taskkill /PID ^<PID^> /F
    echo  =====================================================
    echo.
    pause
    exit /b 1
)

exit /b 0
