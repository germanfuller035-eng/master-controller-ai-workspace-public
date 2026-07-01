# Owner Refresh/Search Buttons Acceptance

Date: 2026-07-01

Scope:
- Android owner app buttons `Обновить`, `Запустить поиск`, and `Найти`.
- Screens: `Сегодня`, `Лиды`.
- Device smoke: Honor via controlled backend channel.

Result:
- `Сегодня -> Обновить`: PASS. Summary refresh completes and shows owner-visible update time.
- `Сегодня -> Запустить поиск`: PASS. Lead discovery job is requested, queue is rechecked, and owner sees a clear result.
- `Лиды -> Обновить`: PASS. Outreach queue refresh completes and shows ready/total count.
- `Лиды -> Найти`: PASS. Lead discovery is requested without starting outbound actions.
- Old stale `43` lead count: NOT OBSERVED in the verified path.
- False `+24` search result: FIXED by comparing against the full displayed queue snapshot.

Safety:
- Live send: OFF.
- Mass send: OFF.
- Payments: OFF.
- Production write: OFF.
- Client outbound actions during this check: 0.
- Payment actions during this check: 0.
- Production DB writes during this check: 0.

Known limitation:
- Direct Honor-to-VPS HTTPS remained blocked by device/network route during this pass.
- VPS health is reachable from the laptop; phone direct remote mode still needs the separate network/auth gate.
