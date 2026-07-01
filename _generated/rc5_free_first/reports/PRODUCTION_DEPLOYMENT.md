# PRODUCTION DEPLOYMENT
Backup: /opt/master-controller/backups/rc5_free_first_20260619T013500Z (canonical+usage ledger+send ledger+code, SHA256SUMS).
Deployed (atomic, node --check): config.mjs, ai_usage_ledger.mjs, offer_preview.mjs, product_presentation.mjs,
multichannel.mjs, knowledge_radar.mjs, owner_settings.mjs, domain_reservoir.mjs, index.mjs.
Restart: api only. Telegram/Caddy/worker не трогались без нужды. Migrations: только additive (new JSON stores).
API tests on VPS: 47/0 (lead store/send ledger unchanged). Reservoir test run: 0 canonical promotions, 0 AI calls.
