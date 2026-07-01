# Mater Controller API

Owner-only HTTP gateway over the existing AI_WORKSPACE **Mini Audit** services.
The API is a thin, secure seam — it reuses the canonical business logic and never
creates a second store, a second ledger, or a second send path. **Autosend is always BLOCKED.**

## Architecture

```
Mater Controller Android
        │  HTTPS / LAN, Bearer device token
        ▼
Mater Controller API  (this service, Node ESM + Express)
        │  in-process import, no duplication
        ▼
tools/telegram_gateway/  shared Mini Audit core
   ├── mini_audit_operator_mode.mjs   getMiniAuditOperatorState, buildFollowupDraft
   ├── queue_navigation.mjs           computeLeadEligibility, resolvePreviewSource
   └── outbound_channel_router.mjs    sendApprovedMessage  (the ONLY send seam)
        ▼
13_sales/lead_pipeline_store.json   (canonical store — atomic, lock-guarded)
13_sales/outbound_send_ledger.jsonl (canonical ledger)
```

The same shared modules are used by the Telegram Master Controller, so both
interfaces share one source of truth and one eligibility gate.

## Requirements

- Node.js (ESM). `express` resolves from the workspace `node_modules`.
- The API secret is generated on first run into `D:\AI_SECRETS\01_env\mater_controller_api.env`
  and is **never** printed or copied into the workspace.

## Start / stop / check

```powershell
# loopback only (default, safest)
.\start_mater_controller_api.ps1

# private LAN (binds 0.0.0.0; pair a phone over Wi-Fi) — needs the firewall rule below
.\start_mater_controller_api.ps1 -Lan -Port 8787

# no-send test mode (no real SMTP even on approve)
.\start_mater_controller_api.ps1 -NoSend

.\check_mater_controller_api.ps1
.\stop_mater_controller_api.ps1
```

Single instance is enforced via PID + lock file with stale-pid recovery. Logs go to
`logs/` with size-based rotation. Heartbeat is written to `data/api_heartbeat.json`.

## Pairing (owner authentication)

1. On the PC: `POST /api/v1/auth/pairing/start` → returns a 6-digit code (valid 10 min, single-use).
2. In the app: enter API base URL + the code + a device name.
3. `POST /api/v1/auth/pairing/complete` → returns an access token (24h) + refresh token (30d).
4. Only salted HMAC **hashes** of tokens are stored server-side (`data/devices.json`).
5. `GET /api/v1/auth/devices` lists devices; `DELETE /api/v1/auth/devices/:id` revokes one.

## Endpoints

Base path: `/api/v1`. Full schema: [`openapi/mater-controller-api-v1.json`](openapi/mater-controller-api-v1.json).

Every response uses the envelope `{ ok, data, error, requestId }`. Errors never leak
secrets or stack traces. `/health` is public; everything else requires a Bearer device token.

Key routes: system status/events/refresh; auth pairing/refresh/devices; projects;
mini-audit status/next-action/metrics; leads (+ buckets, search, pagination); audit &
email previews; send/prepare → approvals approve/reject/postpone; follow-ups;
send-uncertain check-proof.

## Local mode

- Default bind `127.0.0.1:8787` (loopback).
- LAN mode binds `0.0.0.0`; create a **Private-profile, LocalSubnet** firewall rule:

```powershell
New-NetFirewallRule -DisplayName "MaterControllerAPI-LAN" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 8787 -Profile Private -RemoteAddress LocalSubnet
# rollback:
Remove-NetFirewallRule -DisplayName "MaterControllerAPI-LAN"
```

## Remote HTTPS mode

The app supports a Remote HTTPS profile, but this build ships **Local mode as the working
MVP**. Exposing a public endpoint requires HTTPS + auth and is an external deployment step
(reverse proxy / tunnel). Do not expose plain HTTP.

## Tests

```powershell
node tests/run_all.mjs   # 47 checks, no-send, asserts canonical files are not mutated
```

## Rollback

- Stop: `.\stop_mater_controller_api.ps1`
- The API is additive: removing `tools/mater_controller_api/` and the firewall rule fully
  reverts it. It never edits the canonical store outside the owner-confirmed send path,
  which itself is gated and blocked during tests.
