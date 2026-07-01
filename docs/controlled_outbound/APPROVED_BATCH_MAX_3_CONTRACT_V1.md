# Approved Batch Max 3 Contract V1

SCOPE=LOCAL_SYNTHETIC_ONLY

The approved batch contract allows at most three synthetic outbound drafts in a future owner-approved batch. A fourth draft is blocked by contract.

Rules:

- `max_batch_size=3`;
- all drafts require `synthetic=true`;
- every draft requires a payload hash;
- owner approval is required before any future send;
- approval must bind to the exact batch payload hash;
- this stage still sends zero messages.

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
