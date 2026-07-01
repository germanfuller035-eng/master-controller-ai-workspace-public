# Mail Draft Channel V1

Mail is represented only as a local draft object. The draft includes recipient_ref, subject, body, payload_hash, draft_only=true, send_allowed=false, and owner_approval_required_for_future_send=true.
No Gmail, Yandex, SMTP, IMAP write, or provider credential is configured.

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
