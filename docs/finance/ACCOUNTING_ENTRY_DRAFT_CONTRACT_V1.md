# Accounting Entry Draft Contract V1

SCOPE=LOCAL_SYNTHETIC_ONLY

Accounting entries are local synthetic drafts only. They do not export to accounting systems, ledgers, spreadsheets, bank tools, or production databases.

Required contract fields:

- `accounting_entry_draft_id`;
- `synthetic=true`;
- `draft_only=true`;
- `export_allowed=false`;
- balanced debit and credit synthetic units;
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
