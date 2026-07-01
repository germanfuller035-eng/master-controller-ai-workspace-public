# PRODUCTION DEPLOYMENT REPORT
Backup: /opt/master-controller/backups/ai_intelligence_20260619T000924Z (canonical+ledger+code, SHA256SUMS).
Deployed (atomic, node --check): config.mjs, ai_provider.mjs, ai_model_router.mjs, ai_usage_ledger.mjs,
offer_preview.mjs, knowledge_radar.mjs, deepseek_provider.mjs, provider_registry.mjs, agents.mjs,
pipeline_read.mjs, index.mjs. Restarted: api, worker (read EnvironmentFile). Telegram/Caddy не трогались.
Migrations: только additive (new JSONL ledger, knowledge store) — canonical schema не менялась.
API tests on VPS: 47 passed / 0 failed (lead store / send ledger unchanged).
