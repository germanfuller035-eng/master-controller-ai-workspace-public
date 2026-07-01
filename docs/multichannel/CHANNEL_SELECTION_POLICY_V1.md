# Channel Selection Policy V1

Selection order is explicit fixture context first, then allowed synthetic channels in policy order: mail draft, form draft preview, Telegram reserve notice, social draft contract.
Suppression and daily cap checks run before a draft is created. STOP returns BLOCKED_BY_STOP.

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
