# Next Channel Activation Gates
Each external channel is DEPLOYED_DISABLED pending owner action (official docs could not be fetched here):
- VK_DISCOVERY / VK_INBOUND / VK_LEAD_FORMS: owner creates VK app + community token, sets VK_WEBHOOK_SECRET, verifies scopes against live dev.vk.com, flips VK_DISCOVERY/VK_INBOUND=true.
- MAX_INBOUND / MINI_APP: owner creates MAX bot, installs token + MAX_WEBHOOK_SECRET, passes moderation, flips MAX_INBOUND=true.
- CLIENT_TELEGRAM_INBOUND: owner creates a SEPARATE client bot token (not the owner bot), sets CLIENT_TELEGRAM_SECRET.
- 2GIS / DataForSEO: owner installs API credentials; source flips ACTIVE.
- Outbound on ALL new channels stays OFF (separate future gate). No autosend, no payment.
