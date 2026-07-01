# Telegram Reserve Channel V1

Telegram is a reserve channel contract only. Notices use reserved synthetic refs and never contain bot tokens, chat ids, or send permissions.
telegram_sent=false is mandatory.

## Safety Boundary

- no send in this session;
- all outgoing messages are draft-only;
- forms are preview-only, no submit;
- Telegram is reserve channel only;
- social channels are contract-only;
- browser actions are contract-only;
- no Playwright runtime installed;
- no real voice capture;
- no STT/TTS provider;
- risky actions require screen approval;
- STOP blocks outbound/browser/voice/payment/production writes;
- future send requires owner approval with payload hash.
