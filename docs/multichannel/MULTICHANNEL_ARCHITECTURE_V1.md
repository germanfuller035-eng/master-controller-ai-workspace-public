# Multichannel Architecture V1

Multichannel V1 represents mail, website form, Telegram reserve, and social channels as local deterministic contracts.
The runtime output is a draft payload plus SHA-256 payload hash. No adapter can send, publish, submit, browse, call, capture audio, write production data, or process payments.
Channel selection evaluates synthetic context, suppression list, daily cap state, STOP state, and owner approval requirements.

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
