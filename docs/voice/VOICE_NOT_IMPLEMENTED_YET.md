# Voice Not Implemented Yet

Not implemented: real voice capture, always-on listening, STT provider, TTS provider, voice push notification, phone call, voice payment, or irreversible voice command.

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
