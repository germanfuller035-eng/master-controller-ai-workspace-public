# SMTP Canary Preflight Gate V1

STATUS: PARTIAL_PASS_BLOCKED_BEFORE_LIVE_SEND

Scope:
- Fixed approved-send preflight so direct `EMAIL_*` config and `YANDEX_*` aliases both count as configured.
- Kept real send behind explicit one-send approval.
- No SMTP live connection was opened in this stage.

Preflight result:
- `EMAIL_PREFLIGHT_READY`: PASS
- Yandex alias detected: YES
- Required Yandex key presence: PASS
- Test recipient key presence: PASS
- Secret values printed: NO
- Email sent: NO

Live canary status:
- `SMTP_CANARY_STATUS=BLOCKED_PENDING_EXACT_ONE_SEND_APPROVAL`
- `OUTBOUND_COUNT=0`

Reason:
- A real SMTP canary requires exact `RECIPIENT`, `SUBJECT`, `BODY`, and `OWNER_APPROVAL=YES_FOR_THIS_ONE_SEND_ONLY`.
- The current gate did not include those exact fields.
