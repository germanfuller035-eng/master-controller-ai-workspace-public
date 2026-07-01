# Handoff

Current state:
- Final APK was built and installed on Honor ALT-LX1.
- Owner app opens in local mode.
- Main bottom navigation is: Today, Leads, Replies, Deals, More.
- Commercial workflow is available as one owner action per screen.
- Manual send packet is prepared locally and is explicitly not sent by the system.
- Reply monitor is read-only.
- Deal, product, document, invoice, payment gate, history and safety routes are reachable.

Safety state:
- AUTO_SEND_STATUS=OFF
- PAYMENT_LIVE_STATUS=OFF
- PRODUCTION_WRITE_STATUS=OFF
- OUTBOUND_COUNT=0
- PAYMENT_COUNT=0
- PRODUCTION_DB_WRITES=0

Next safe step:
- OWNER_HAND_TEST_ON_PHONE

Owner test focus:
- Open local mode.
- Check Today, Leads, Replies, Deals and More.
- Walk through one synthetic/manual lead to send packet.
- Confirm the packet text, channel, hashes and not-sent state.
- Do not use live send or payment without a separate approval gate.
