# CRM Architecture V1

SCOPE=LOCAL_SYNTHETIC_ONLY

This CRM layer defines deterministic shadow CRM contracts for contacts, opportunities, deals, and reply monitor events.

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

The architecture produces draft and shadow objects only. It does not connect to CRM APIs, inboxes, mail providers, payment providers, accounting exports, or production databases.
