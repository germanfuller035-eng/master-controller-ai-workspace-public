# CRM Not Implemented Yet

The following remain explicitly not implemented:

- real CRM integration;
- real CRM production write;
- real contact enrichment;
- real inbox or reply monitor connection;
- real pipeline sync;
- real owner-approved CRM mutation execution.

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
