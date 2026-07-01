# 2GIS / DataForSEO — Credential Installation
1. Obtain official API keys from the provider dashboards.
2. Store on VPS env: TWO_GIS_API_KEY=... / DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... (chmod 600).
3. The source registry flips the source to ACTIVE once its credential_state=PRESENT.
4. Verify via GET /sources — status should move from PENDING_CREDENTIAL to ACTIVE.
Respect each provider's rate limits and request budget (configured per source).
