# Communication Monitor — Reproducibility Note (Agent Orchestration MP2)

date: 2026-06-17
status: REPRODUCIBILITY_RESTORED (minimal safe source tracked)

## Problem
`tools/communication_monitor/yandex_mail_imap_read.mjs` existed on the main workspace disk but
was UNTRACKED in git (not committed, not ignored). Clean clones/worktrees lacked it, while it is
referenced (in comments) by `reply_correlation.mjs` and `reply_inbox_sync_cli.mjs`, and by the
production IMAP deploy path. This is a reproducibility defect, not a runtime bug.

## Classification of the 25 on-disk files
Tracked into this branch (clean, read-only, no secrets, no real contacts):
- `yandex_mail_imap_read.mjs` — read-only IMAP connector (EXAMINE/BODY.PEEK; mark_seen disabled;
  hard SAFETY guard refusing connect if any send/delete/flag flag is enabled). Credentials come
  only from `process.env` (no literal secrets). Lazy `imapflow` import (dry-run is dependency-free).
- `yandex_mail_readonly_healthcheck.mjs`, `yandex_mail_safety_check.mjs` — read-only checks, no send.
- `package.json` — single dep `imapflow`.

NOT tracked (excluded, kept on main disk only — owner decides):
- `yandex_mail_send_once_zb23.mjs` (+ `.bak`) — SEND capability -> excluded.
- `yandex_imap_zb23_search_result.json`, `yandex_send_zb23_result.json` — contain REAL email
  addresses (a client address + an owner address) -> excluded as production data.
- `yandex_mail_credential_preflight*.{mjs,md}`, `_check_env_presence.mjs` — credential handling.
- `yandex_mail_dry_run_import.mjs`, `yandex_mail_imap_append_dryrun.mjs`, `intake_message.mjs`,
  `mail_reply_monitor.mjs`, `prepare_reply_draft.mjs`, `_stage2b_preflight.mjs`, stage report `.md`,
  `README.md`, `yandex_mail_connector_plan.md` — reference the real client "zb23" / not needed for
  the read-only source -> excluded.

## Read-only proof (static, no IMAP executed)
- SAFETY object: send_enabled/delete_enabled/archive_enabled/attachments_enabled/body_download_enabled/
  mark_seen_enabled = false; readonly_mailbox = true; allowlist_only = true.
- Hard guard throws "SAFETY contract violation" if any forbidden flag is enabled before connecting.
- No `addFlags`/`setFlags`/`STORE`/`APPEND`/`expunge`/`deleteMessage`/`sendMail` in the source.
- Live read only when `YANDEX_MAIL_STAGE1_LIVE_READ=true` is explicitly set; default path is dry-run.

## Dangling import
The references in `reply_correlation.mjs` / `reply_inbox_sync_cli.mjs` are COMMENTS, not hard
`import`/`require` statements — so there is no runtime dangling import to break. Resolution: the
correct stable source is now tracked at the same path in this branch. No production runtime changed;
IMAP timer/service untouched; no deploy.

## Result
COMMUNICATION_MONITOR_REPRODUCIBILITY=PASS · YANDEX_IMAP_SOURCE_TRACKED=YES
SECRETS_COMMITTED=NO · LIVE_IMAP_EXECUTED=NO · PRODUCTION_RUNTIME_CHANGED=NO
