# Owner Visible Repair V1 - Known Limitations

## Remaining Product Gaps

P0_BLOCKERS_REMAINING=0

P1_OWNER_VALUE_GAPS_REMAINING=YES

This sprint intentionally repaired only the top 3 owner-visible areas. Other
screens from the review still need future owner-visible polish:

- approvals detail depth;
- offer review and replies clarity;
- agents and AI surfaces;
- multichannel owner copy;
- commandcenter_commercial deep flow if enabled as a separate command surface.

## Contract-Only Features

The following remain contract-only and are labeled in the Android UI where
relevant:

- real Qdrant;
- Docling;
- OPA;
- VoltAgent runtime;
- MCP production servers;
- browser automation;
- voice capture and voice placeholder status;
- CRM/payment/mail integrations;
- post-hardening contract layers.

CONTRACT_ONLY_LABELING_STATUS=PASS

## Web Scope

WEB_REPAIR_SCOPE=NOT_AVAILABLE

No ready owner-control Web UI app surface was found. This sprint did not create
one from scratch.

## Logcat Evidence

The device was reachable and the app was running, but logcat buffers reported
`0 B readable` during final evidence capture.

Impact:

- screenshots and UI hierarchy evidence are complete;
- logcat tail is empty;
- `logcat/logcat_buffer_state.txt` records the device buffer state.

## Production Safety

No production actions were enabled.

NO_SEND_STATUS=PASS
NO_PAYMENT_STATUS=PASS
NO_PRODUCTION_WRITE_STATUS=PASS
OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
PRODUCTION_CHANGES=NO
VPS_CHANGED=NO
DNS_CHANGED=NO
HAPP_PROXY_CHANGED=NO
