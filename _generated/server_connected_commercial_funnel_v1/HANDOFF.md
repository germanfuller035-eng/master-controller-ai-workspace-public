# Handoff

Current safe state:

- Server funnel code is implemented and tested.
- Android shows server funnel readiness in System.
- Debug APK was built and installed on Honor.
- No live outbound, payment or production write occurred.

Next safe step:

1. Run read-only IMAP live check with headers-only contract.
2. Send one Telegram approval card to the owner.
3. Only after owner approval, run a single approved SMTP canary to a controlled recipient.

Do not enable mass send, auto-reply, payments or production DB writes in the same step.
