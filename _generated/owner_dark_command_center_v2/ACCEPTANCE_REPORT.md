# Owner Dark Command Center V2 Acceptance Report

STATUS: PASS_PENDING_OWNER_HAND_TEST

Scope:
- Android owner app converted to dark command center default.
- Drawer navigation replaces bottom navigation for owner workflow.
- Command bar is local-only and supports Done/Enter execution.
- Manual commercial workflow remains no-live: no auto send, no live email send, no social send, no payment, no working DB write.

Honor device smoke:
- Device: Honor ALT-LX1, adb id AMSKBB4914919475.
- Installed debug APK after focused tests and assemble.
- Screenshots were saved only in private evidence.
- Synthetic lead data only was used during smoke.

Key checks:
- Today focus shows stale/offline reason and next action.
- Lead review does not invent product facts when only a site is provided.
- Draft is explicitly shown as draft and not sent.
- Quality check blocks missing contact channel until owner action.
- Channel screen now uses compact channel status lines.
- Send packet drawer shortcut opens the packet route.
- Send packet clearly says "PAKET NE OTPRAVLEN" in UI as "ПАКЕТ НЕ ОТПРАВЛЕН".
- Final text, package marker, text marker, channel, risk and audit preview are visible.
- Reply monitor is only for viewing and does not trigger auto-reply.
- Deal screen leads toward product, document, invoice and payment gate.
- Payment and working DB write stay separate permissions.

No-live counters:
- OUTBOUND_COUNT=0
- PAYMENT_COUNT=0
- PRODUCTION_DB_WRITES=0
