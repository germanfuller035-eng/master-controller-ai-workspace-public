# Owner Controlled Manual Send V1 — Known Limitations

- Post-send result marking is local UI state in this stage. Production persistence remains OFF until a separate production-write gate.
- Manual send packet creation does not send email, Telegram, social messages, forms, or browser actions.
- Owner override records are previewed in Android; immutable backend audit persistence requires a separate approved write gate.
- Screenshots were not committed because real-lead screens can contain private company/contact data.
- Live email/social integrations remain out of scope and feature-flagged OFF by default.
