# Contact Opportunity Deal Contract V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Contact, opportunity, and deal records are represented as local JSON-compatible draft objects with explicit `synthetic=true` markers.

Required contract fields:

- contact: `contact_id`, `display_name`, `organization_name`, `contact_reference`, `consent_basis`, `suppression_status`, `crm_write_allowed=false`;
- opportunity: `opportunity_id`, `contact_id`, `stage`, `estimated_value_units`, `draft_only=true`, `crm_write_allowed=false`;
- deal: `deal_id`, `opportunity_id`, `stage`, `close_probability_percent`, `draft_only=true`, `crm_write_allowed=false`.

Mandatory stage constraints:

- synthetic/local only;
- no real send;
- no real CRM write;
- no invoice send;
- no accounting export;
- no payment execution;
- no real reply monitor;
- no production DB write;
- owner approval required for future send/payment;
- payload hash required;
- suppression list required;
- daily cap required;
- reply monitor required before future activation;
- STOP blocks outbound/payment/production write.
