# OWNER PHYSICAL ACCEPTANCE PACKAGE

**Дата:** 2026-06-18
**Сборка:** `dist/multichannel_activation_android/MasterController-release-v0.6.0-rc2.apk` (versionCode 14)
**Подпись:** `11038fca…` — идентична RC1..RC5 → установка поверх RC4 без потери pairing/данных.

## Чек-лист физической приёмки

| # | Пункт | Ожидание | Готовность к проверке |
|---|---|---|---|
| 1 | Установить RC2 поверх RC4 | upgrade-install | APK готов; подпись совпадает |
| 2 | Pairing сохранён | без re-pair | гарантировано совпадением подписи |
| 3 | API подключён | health ok | API live на sslip.io |
| 4 | Каталог 18 | список продуктов | экран каталога без изменений |
| 5 | Mini Audit 10 000 ₽ | цена корректна | product_catalog/offer price_snapshot=10000 |
| 6 | Коммерческая сводка 3/3 | open=3, ready=3 | **исправлено и развёрнуто** (live 3/3) |
| 7 | «Ожидают отправки» открывается | список предложений | route queue/send-review + OfferReviewListScreen |
| 8 | Видны СтройДвор-Юг, ДКБИ, Завод Атом | 3 карточки | /offers возвращает 3 (live), локализация компаний |
| 9 | Все очереди открываются | 7 экранов | routes + onClick + экраны добавлены |
| 10 | Описания продуктов на русском | RU | presentation-локализация |
| 11 | Агенты — реальный provider state | «недоступен» | честное отображение (provider PENDING_SECRET) |
| 12 | Shadow-кнопка enabled/disabled | по provider | кнопка присутствует; runtime ON |
| 13 | Источники — раздельные статусы | discovery/inbound/outbound | экран источников + /sources/health |
| 14 | Входящие каналы — credentials/moderation | PENDING | channels/health: VK/MAX/TG PENDING_CREDENTIAL |
| 15 | Offline cache | работает | Room KV readCached |
| 16 | Reconnect | работает | offline-баннер + refresh |
| 17 | Ни одной активной outbound-кнопки | нет outbound | проверено: нет send-действий |
| 18 | Нет crash/re-pair | стабильно | unit+lint pass; подпись совпадает |

## Что требует владельца (физически / вне среды)

- Установить APK на устройство (ADB в среде сборки недоступен) и пройти пункты 1-18.
- Для активации внешних каналов — предоставить credentials (VK/MAX/Telegram/2GIS/DataForSEO),
  Claude `ANTHROPIC_API_KEY`, утверждённый домен landing. См. CREDENTIAL_INVENTORY.md.

## Что уже подтверждено программно
- Коммерческая сводка 3/3 — **в production** (live verify).
- Web intake (honeypot/consent/staging) — PASS.
- Inbound webhooks закрыты (403) до предоставления credentials.
- Все safety-флаги OFF; canonical integrity (rev 106, sends 7, dead 0) сохранена.
- Android: 117 unit-тестов, lint, signed RC2 — PASS.
