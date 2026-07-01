# Handoff

Current state:
- Approved-send preflight is fixed.
- Offline guard suite passes.
- Runtime preflight sees the Yandex mail configuration safely.
- No email was sent.

To run the next live canary gate, provide:

```text
RECIPIENT=
SUBJECT=
BODY=
OWNER_APPROVAL=YES_FOR_THIS_ONE_SEND_ONLY
```

Keep disabled unless separately approved:
- Mass-send.
- Auto-reply.
- Payments.
- Production database writes.
