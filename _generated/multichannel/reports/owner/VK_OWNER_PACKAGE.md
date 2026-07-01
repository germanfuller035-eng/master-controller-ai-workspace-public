# VK — Owner Credential & Moderation Package
VERIFY FIRST against the live official dev.vk.com docs (could not be fetched from build env).
1. Create/confirm a VK community (business) and a VK app with the required scopes.
2. Generate a community access token. Store on VPS env as VK_COMMUNITY_TOKEN=... and VK_WEBHOOK_SECRET=...
   (chmod 600). Never paste into chat.
3. Configure Callback API confirmation + secret; point it at https://<host>/api/v1/webhooks/vk.
4. For Lead Forms: enable in the community and authorize the app.
5. Activate: VK_DISCOVERY=true and/or VK_INBOUND=true; restart only API.
6. Verify via /sources and /channels (no secret revealed).
Outbound stays OFF.
