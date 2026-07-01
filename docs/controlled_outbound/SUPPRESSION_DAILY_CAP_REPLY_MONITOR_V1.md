# Suppression Daily Cap Reply Monitor V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Controlled outbound requires three local gates before any future activation:

- suppression list check blocks suppressed contacts and unsubscribe/STOP signals;
- daily cap check blocks requests over the configured cap;
- reply monitor gate must be ready before activation, but this stage uses only synthetic reply state.

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
