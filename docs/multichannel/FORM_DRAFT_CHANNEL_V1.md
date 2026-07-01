# Form Draft Channel V1

Website forms are represented as preview-only form drafts. The contract stores target_form_ref and field previews, but submit_allowed=false and browser_used=false.
A future submit requires a dedicated browser/send approval with the exact payload hash.

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
