# No Send Policy V1

No-send guard denies send, publish, form_submit, social_send, Telegram send, browser production action, voice capture, payment, and production write attempts.
The only allowed output is local draft or evidence metadata.

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
