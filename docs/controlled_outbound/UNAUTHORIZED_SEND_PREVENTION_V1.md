# Unauthorized Send Prevention V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Unauthorized sends, duplicate sends, and false success are blocked by the local no-send guard.

The guard rejects:

- any object claiming `sent=true`;
- any object with `outbound_count>0`;
- any object claiming `paid=true`;
- any object with `payment_count>0`;
- any object claiming CRM or production DB write;
- any STOP-active request;
- any future send/payment request without owner approval and payload hash.

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
