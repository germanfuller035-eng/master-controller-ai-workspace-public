# Telegram Client Inbound
SEPARATE client bot boundary from the owner Master Controller bot. Inbound-only: start payload, product
selection, Mini Audit request, website submission, file intake → Conversation Hub + reply drafts. Token
separation REQUIRED (CLIENT_TELEGRAM_SECRET). Owner bot stays API-only. DEPLOYED_DISABLED_PENDING_TOKEN.
