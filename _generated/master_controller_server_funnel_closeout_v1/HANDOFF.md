# Handoff

## Current State

The controlled server-connected funnel is working up to owner approval:

Yandex IMAP read-only headers snapshot -> Email Hub list/detail -> private/local CRM/audit -> reply draft -> quality checks -> Android approval screen -> owner Telegram approval card.

No client email has been sent.

## Next Safe Step

Run a separate SMTP canary gate only after the owner provides:

- exact self/test recipient
- exact subject
- exact body
- approval for one SMTP send

## Keep Off

- auto-reply
- mass send
- payments
- payment links
- production DB write
- VPS/DNS/HAPP/proxy changes
