# /sales_next Production Flow — Finalized & Live

Date: 2026-06-08T18:14 (Europe/Moscow)
Decision: APPROVAL GRANTED — remove P1 env gate; Telegram inline ✅ is the only authorization gate.

## Final status

- **/sales_next ready:** YES
- **P1 removed from normal approved send:** YES (no P1_REQUIRED / no P1 env flag in the normal approved client-send path; Telegram ✅ is the gate)
- **Current top1 recipient:** kvs@zb23.ru (real client email; passes recipient gate)
- **SMTP ready:** YES (SMTP_USER / SMTP_PASS / SMTP_FROM all present; values never logged)
- **Tests / preflight GREEN:** YES
- **Old PID:** none (no bot process was running)
- **New PID:** 18304

## Exact command Dmitry should type

```
/sales_next
```

Then review the Telegram preview and press ✅ to authorize the single send.

## Canonical flow (one path, no parallel path)

lead/top1 → resolve real email → block fake/test/example/EMAIL_TEST_TO →
build canonical audit email → Telegram preview → Дмитрий presses ✅ →
send via Yandex SMTP → log SENT → mark lead contacted → block duplicate click.

## Invariants enforced (verified by contract tests, all GREEN)

- No autosend, no mass send, no send without Telegram ✅ approval.
- No P1 env flag, no hidden arming.
- Recipient gate: no example.com, no test*, no EMAIL_TEST_TO, no empty recipient.
- Approval button sends only the exact previewed draft, once.
- Duplicate click does NOT resend.
- First-touch copy has NO "Ранее писал".
- Price is 10000 ₽.
- Approve path uses the SMTP adapter (same seam as self-test).
- `SEND_ADAPTER_NOT_CONFIGURED` only when SMTP config is actually missing.
- Email copy unchanged.

## Preflight gate (start_telegram_gateway.ps1)

The canonical start script refuses to launch the gateway if any of these are RED:
- entrypoint syntax (`node --check`) + stray-leading-bytes guard
- sales_next_contract_test.mjs — 23 passed
- audit_send_canonical_path_regression_test.mjs — 8 passed
- audit_send_approve_recipient_gate_test.mjs — 10 passed
- telegram_p1_top1_client_send_test.mjs — 30 passed

This run: ALL GREEN → gateway started.

## Governance report

- **Created:** this dashboard; `_smtp_presence_probe.mjs` (boolean-only, no values).
- **Updated:** gateway restarted via canonical start script (preflight-gated).
- **Blocked / not done (by design):** no client email was sent during implementation.
- **Requires Dmitry approval:** the actual client send — type `/sales_next`, review preview, press ✅.
- **Next safe step:** Dmitry runs `/sales_next` in Telegram and approves the single send to kvs@zb23.ru when ready.
