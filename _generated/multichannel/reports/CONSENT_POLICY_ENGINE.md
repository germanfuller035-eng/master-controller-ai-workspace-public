# Consent / Contact Policy Engine
Deterministic engine with reason codes. Statuses: PUBLIC_BUSINESS_CONTACT/INBOUND_INITIATED/EXPLICIT_OPT_IN/
EXISTING_RELATIONSHIP/OWNER_APPROVED_ONE_TIME/UNKNOWN/OPTED_OUT/PROHIBITED. Rules: public contact != consent;
UNKNOWN never allowed; opt-out blocks outbound; inbound reply may be drafted (send gated); new-channel
outbound always OFF; quiet hours respected. Decisions stored with reason codes.
