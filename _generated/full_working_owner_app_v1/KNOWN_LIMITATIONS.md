# Full Working Owner App V1 — Known Limitations

- Live email/social/Telegram/SMS/form sending remains disabled until a separate live-send gate.
- Payments remain disabled until a separate payment gate.
- Production DB writes remain disabled until a separate production-write gate.
- Post-send result marking is local owner workflow evidence in this stage; durable backend persistence requires an approved write gate.
- Screenshots were not committed because real-lead screens can contain private data.
