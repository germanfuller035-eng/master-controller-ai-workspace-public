# Unified Channel Router
Channel-neutral message contract across EMAIL/VK/MAX/TELEGRAM/WEB_FORM/WHATSAPP/SMS/PHONE/AVITO.
ingestInbound (raw secrets never stored), prepareOutbound (DRAFT, not dispatchable), dispatch refused for
all new channels, webhook verify (HMAC/timestamp/replay/quarantine). INGEST_INBOUND=ON, PREPARE_OUTBOUND=ON,
DISPATCH_NEW_CHANNELS=OFF. Email seam unchanged.
