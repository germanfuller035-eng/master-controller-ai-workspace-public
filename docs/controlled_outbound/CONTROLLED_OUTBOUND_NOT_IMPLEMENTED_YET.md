# Controlled Outbound Not Implemented Yet

The following remain explicitly not implemented:

- real outbound;
- batch send;
- controlled auto-send;
- real email, Telegram, social, website form, or CRM channel adapter;
- real reply monitor;
- real production send ledger write;
- production DB write;
- payment execution.

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
