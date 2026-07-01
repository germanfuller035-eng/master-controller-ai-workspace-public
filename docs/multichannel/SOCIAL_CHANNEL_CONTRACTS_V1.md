# Social Channel Contracts V1

Social channels are represented as draft-only contracts. No WhatsApp, VK, MAX, Avito, or social publishing adapter is enabled.
All social draft objects set publish_allowed=false and send_allowed=false.

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
