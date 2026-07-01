# Source Registry
14 sources with status + capabilities. ACTIVE: OSM, web_intake, referral, csv_manual. PENDING_CREDENTIAL:
VK communities/lead-forms/inbound, 2GIS, DataForSEO, MAX, Telegram-client. DISABLED: Yandex, Avito, WhatsApp.
Common adapter contract (10 methods): buildQuery/validateConfig/dryRun/discoverCandidates/normalizeCandidate/
extractEvidence/reportHealth/respectBudget/respectRateLimit/redactSecrets. Adapters never write canonical,
never guess email/website, never send. Source health separate from channel health; no-data shown as null.
