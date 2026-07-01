# Android Acceptance Lab — Environment Baseline

Снято: 2026-06-20. Хост — ноутбук владельца (Windows). Ничего не переустанавливалось:
все требуемые компоненты уже присутствуют и исправны.

## Хост

| Параметр | Значение |
|----------|----------|
| OS | Windows 11, build 26200 |
| CPU | Intel Core i3-10110U @ 2.10GHz (2 ядра / 4 потока) |
| RAM | 7.8 GB |
| Диск C свободно | 20.9 GB |
| Диск D свободно | 85.4 GB |
| HypervisorPresent | True (Windows Hypervisor Platform) |

Замечание: CPU слабый (2 ядра), RAM 7.8 GB — эмулятор работоспособен, но тяжёлые
параллельные сборки следует избегать. Один видимый AVD + connectedAndroidTest — приемлемо.

## Android toolchain (всё présent, установка не требуется)

| Компонент | Версия |
|-----------|--------|
| JDK | OpenJDK 17.0.19 LTS (Microsoft) |
| adb | 1.0.41 |
| Android Emulator | 36.6.11.0 |
| Build Tools | 34.0.0 |
| Platform | android-34 |
| System image | android-34 / google_apis / x86_64 |
| cmdline-tools | latest |
| Gradle (wrapper) | 8.7 |
| AVD существующий | a56lab |

## Решение

- НИЧЕГО не устанавливаем (все компоненты исправны и достаточны для targetSdk=34/minSdk=26).
- Hyper-V/WSL не трогаем.
- Используем штатный AndroidX Test / Compose UI Test / Espresso / UIAutomator стек проекта.
- Эмулятор запускаем в ВИДИМОМ окне (без -no-window/-headless).

## Честное ограничение наблюдаемости

Я могу запустить эмулятор с видимым окном и записать видео обхода (adb screenrecord),
но НЕ могу подтвердить, что человек смотрел на экран в реальном времени. Поэтому
"OWNER_CAN_WATCH" означает: окно видимое + воспроизводимый скрипт демонстрации + видео-артефакт,
а не утверждение о факте живого наблюдения.
