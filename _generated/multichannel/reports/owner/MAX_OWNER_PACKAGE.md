# MAX — Owner Credential & Moderation Package
VERIFY FIRST against the live official MAX docs (could not be fetched from build env).
1. Register/confirm a MAX business account; create a Bot via the official MAX bot tooling.
2. Obtain the bot token. Store it ONLY in /etc/master-controller/master-controller.env on the VPS as
   MAX_BOT_TOKEN=... and MAX_WEBHOOK_SECRET=... (chmod 600). Do NOT paste tokens into chat.
3. Configure the webhook URL to https://<host>/api/v1/webhooks/max with the secret.
4. Submit the Mini App for moderation if publishing; keep MAX_MINI_APP unpublished until approved.
5. Activate: set MAX_INBOUND=true, restart only master-controller-api.
6. Verify without revealing the secret: curl the health endpoint and check /channels shows MAX inbound ON.
Outbound stays OFF (separate gate).
