# Payment Preparation Contract V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Payment preparation is a local synthetic readiness object. It may prepare a future approval payload, but it cannot execute payment, request money, create payment links, call a bank API, or call a payment provider.

Required contract fields:

- `payment_preparation_id`;
- `synthetic=true`;
- `preparation_only=true`;
- `execution_allowed=false`;
- `payment_provider_enabled=false`;
- `owner_approval_required_for_future_payment=true`;
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
