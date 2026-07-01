# Invoice Draft Contract V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Invoice drafts are local synthetic objects. They can describe draft line items, synthetic units, and approval metadata, but they cannot be sent or converted into a real invoice in this stage.

Required contract fields:

- `invoice_draft_id`;
- `synthetic=true`;
- `draft_only=true`;
- `send_allowed=false`;
- `owner_approval_required_for_future_send=true`;
- `payload_hash`.

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
