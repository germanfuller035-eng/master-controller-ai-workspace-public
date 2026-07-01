# Gate B Package — Telegram FINAL UX (next-action reason + lead card localization)

date: 2026-06-18 · branch feature/controlled-production-launch-v1 · GATE_B_REQUIRED=YES · GATE_B_APPROVED=YES · DEPLOYED=YES (2026-06-17T22:24Z)

> DEPLOYMENT EXECUTED under owner token APPROVE_GATE_B_EXACT_PRODUCTION_CHANGE.
> views.mjs 99071ffa → dd45b613 (verified), telegram service restarted once (PID 7080→7757),
> one poller, canonical/send unchanged, 33/33 server-side UX checks PASS. New soak T0
> 2026-06-17T22:24:14Z. Owner retest pending. See TELEGRAM_FINAL_UX_DEPLOYMENT.md.

This fix changes the production Telegram runtime → Gate B required. Owner approval token NOT present
in this pass. NO deployment, restart, or VPS change performed. NO message sent. NO canonical write.

## What changed and why
Two owner-facing UX defects remained after the deployed hotfix (PID 7080):

1. `/next` showed the generic fallback "Требуется проверить следующее действие." for DKBI_RU.
   ROOT CAUSE = FIELD_NAME_MISMATCH + ACTION_TYPE_NOT_MAPPED. The live next-action DTO is
   `{ kind, reason, lead }` (backend `getMiniAuditOperatorState().nextAction`). For DKBI_RU the
   backend emits `kind="followup"`, `reason="proven SMTP 250 and >48h since send"` (raw English).
   The old `renderNextActionReason()` read only `reasonCode/action/code/reason_key/reason` — it
   never read the stable `kind` field, and the raw English `reason` text was not in the allowlist,
   so DKBI fell through to the generic fallback. Now `kind` is a first-class structured lookup and
   the canonical reason_code allowlist is supported, so DKBI renders the specific Russian sentence.

2. Lead card exposed raw internal identifiers (`candidate_score_v2`, `canonical_score_v1`,
   `revision`, raw `waiting_reply`) and empty `—` placeholders. Now the card is fully localized,
   technical fields hide when empty, blockers show "отсутствуют", and no raw enum/placeholder leaks.

Business logic UNCHANGED: no change to next-action selection, lead status, canonical data, API,
worker, scheduler, or IMAP. Presentation-only.

## Exact changed runtime files (1)
| file | production sha256 (deployed, current) | target sha256 (this branch) |
|------|----------------------------------------|------------------------------|
| tools/telegram_gateway/api_only/views.mjs | 99071ffa0107f1aa6153f4d65d7dfb5876cfc81d656d03a9a2e17656d3248a86 | dd45b6138ce4e97367c74f47cee6606198f9ff97b7feac69d1304a5df3621dbc |

UNCHANGED (must NOT be touched — deployed hash == branch hash):
- tools/telegram_gateway/api_only/index.mjs  = b7b5eea04666dbcbdb38a2b10afbaa49b8412ae5d4f39c9ddf104b60a8822dec
- tools/telegram_gateway/api_only/api_client.mjs = 4904d7a51f99117c5255d74b1bf306d14280ed6218d6928fedcbf4b1ce37eb7e
- tools/telegram_gateway/api_only/mc_service.mjs = 5a09559c15ddeafebe32b2f3c99ee7754334094d3319edb436f3bd3295cb2523

index.mjs was reviewed and needs NO routing/data-shape change — the DTO shape `{ kind, reason, lead }`
is already passed straight to `renderNextAction`, which calls the corrected `renderNextActionReason`.
Only the presentation layer (views.mjs) changed.

SOURCE_COMMIT=f8cc379
SERVICE_AFFECTED=master-controller-telegram.service
DATA_MIGRATION_REQUIRED=NO · CANONICAL_IMPACT=NONE · REBOOT_REQUIRED=NO
EXPECTED_DOWNTIME=brief Telegram restart only (seconds; API/worker/canonical untouched)
AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF (unchanged by this fix)

## Backup plan (owner runs at Gate B)
```
ts=$(date -u +%Y%m%d_%H%M%S)
mkdir -p /opt/master-controller/backups/telegram_finalux_$ts
cp /opt/master-controller/tools/telegram_gateway/api_only/views.mjs /opt/master-controller/backups/telegram_finalux_$ts/
sha256sum /opt/master-controller/backups/telegram_finalux_$ts/*.mjs > /opt/master-controller/backups/telegram_finalux_$ts/SHA256SUMS.txt
# expect current: views 99071ffa…
```

## Deployment commands (owner runs at Gate B — single-file copy, no rsync)
```
# from a trusted host that has the reviewed branch file:
scp -i <AI_SECRETS key> views.mjs masterctl@195.96.132.82:/opt/master-controller/tools/telegram_gateway/api_only/views.mjs
# verify hash matches target BEFORE restart:
ssh ... 'cd /opt/master-controller/tools/telegram_gateway/api_only && sha256sum views.mjs'
# expect: views dd45b613…
```

## Restart command (single service)
```
sudo systemctl restart master-controller-telegram.service
```

## Post-restart checks (read-only)
1. `systemctl show master-controller-telegram.service -p ActiveState -p SubState -p MainPID -p NRestarts` → active/running, NRestarts +1 only.
2. One poller: `pgrep -u mctelegram -c` → 1 (no getUpdates conflict in journal).
3. API-only: no new fs/SMTP access; service user still mctelegram.
4. No-send: autosend=false unchanged; outbound_send_ledger still 7 lines (no new send).
5. Owner re-runs Telegram smoke:
   - /next (or 🎯 Следующее действие) for DKBI → reason reads
     "Доставка письма подтверждена. Прошло более 48 часов — пора проверить ответ и подготовить follow-up."
     (NOT the generic "Требуется проверить следующее действие.").
   - Tap 📂 Открыть лид → lead card reads:
       🏢 ДКБИ / ID: DKBI_RU / Статус: ожидает ответа / Маршрут: ожидание ответа /
       Сайт: dkbi.ru / Email: info@dkbi.ru / Блокеры: отсутствуют
     and shows NO candidate_score_v2 / canonical_score_v1 / revision / waiting_reply / "—".

## Rollback
TRIGGER: any post-restart check fails, poller>1, service crash-loop, reason still generic for DKBI,
or card still shows raw keys/placeholders.
```
cp /opt/master-controller/backups/telegram_finalux_$ts/views.mjs /opt/master-controller/tools/telegram_gateway/api_only/views.mjs
sudo systemctl restart master-controller-telegram.service
```
Rollback restores prod hash views 99071ffa…. Canonical store untouched throughout — no canonical
rollback needed, no newer-data overwrite risk.

## Scope guarantees
Only 1 Telegram view/presentation file. No backend/worker/scheduler/IMAP/canonical/schema change.
No second writer, no autosend, no live send, no reboot, no migration, no next-action selection change,
no lead status change.

## Soak rule
CURRENT_SOAK_T0=2026-06-17T20:57:18Z
CURRENT_SOAK_INVALIDATED_BY_FUTURE_DEPLOYMENT=YES
NEW_SOAK_T0_REQUIRED_AFTER_DEPLOYMENT=YES
Because deploying this fix requires a Telegram service restart, the current soak cannot be counted as
final. A new soak T0 must be started at the moment of the Gate B restart. The soak timer was NOT
changed in this local pass.

## Tests (all green, no-send, offline)
- tg_api_client: 18 passed, 0 failed
- tg_api_only (incl FINAL UX proofs): 74 passed, 0 failed
- tg_api_only_handler_routing: 18 passed, 0 failed
- telegram_command_routing_smoke: 20 passed, 0 failed
- static safety invariants (in tg_api_only / tg_api_client): no fs/SMTP/localhost/ledger; single poller; API-only
TOTAL=130 · TESTS_FAILED=0 · RAW_INTERNAL_KEYS_IN_OWNER_UX=0 (em-dash inside the Russian reason
sentence is punctuation, not a technical empty-field placeholder; the lead card has zero "—").
