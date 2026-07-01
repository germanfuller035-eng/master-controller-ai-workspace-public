# Suppression List V1

Suppression entries are local synthetic contract rows keyed by reserved contact refs. A match blocks draft creation and records BLOCKED_SUPPRESSION.
No real email, phone, Telegram id, social handle, or real client data is stored.

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
