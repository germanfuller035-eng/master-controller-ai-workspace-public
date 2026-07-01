# Controlled Outbound Architecture V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Controlled outbound V1 is a contract-only local shadow pipeline. It creates outbound drafts and approval payloads while enforcing no-send, suppression, daily cap, reply monitor, STOP, owner approval, and payload hash gates.

Activation gates before any future send:

- owner approval bound to exact payload hash;
- suppression check;
- daily cap check;
- reply monitor gate;
- STOP inactive check;
- no-send guard replaced by a separately approved production adapter in a future stage.

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
