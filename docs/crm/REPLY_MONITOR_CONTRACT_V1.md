# Reply Monitor Contract V1

SCOPE=LOCAL_SYNTHETIC_ONLY

The reply monitor contract classifies local synthetic reply fixtures only. It never opens a real inbox, mailbox API, browser session, CRM inbox, Telegram chat, social inbox, or production queue.

Reply classes:

- `POSITIVE`: synthetic interest or next-step signal;
- `OBJECTION`: synthetic concern, timing, budget, or hesitation signal;
- `UNSUBSCRIBE`: synthetic STOP or unsubscribe signal that requires suppression.

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
