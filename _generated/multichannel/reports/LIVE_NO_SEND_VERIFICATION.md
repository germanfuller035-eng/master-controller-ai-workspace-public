# Live No-Send Verification
- API health 200; one writer (3 node procs); revision 106; send ledger 7 (unchanged).
- /sources, /sources/health, /channels, /channels/health, /owner-queues/multichannel, /identities-conflicts → 200, HTTP_500=0.
- Web intake self-test: STAGED, no send. Junk submission (honeypot + no consent) → 400. 
- VK/MAX/Telegram webhooks → 403 FEATURE_DISABLED (inbound flags off, pending credential).
- outbound_channels_enabled=0. REAL_OUTBOUND_MESSAGES=0, VK/MAX/Telegram-client outbound calls=0, SMTP=0, PAYMENT_FACTS=0.
- Telegram poller untouched (PID 7757). No new service unit created (multichannel is in-process to API).
