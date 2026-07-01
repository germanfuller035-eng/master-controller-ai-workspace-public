# Voice Approval Boundaries V1

Safe intents create local plans only. Risky intents require screen approval. Payment, irreversible action, browser production action, outbound send, and production write are denied.
STOP blocks all voice action plans.

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
