# CRM Finance Accounting And Controlled Outbound V1 - Scope

This stage creates local, deterministic, synthetic-only CRM, finance, accounting, and controlled outbound V1 contracts and evidence.

In scope:

- CRM contact, opportunity, and deal contracts.
- Reply monitor contract without real inbox access.
- Invoice draft contract without sending.
- Accounting entry draft contract without export.
- Payment preparation contract without payment execution.
- Suppression list, daily cap, STOP, and reply-monitor gates.
- Approved batch max 3 contract.
- Owner approval requirement before any future send or payment.
- Payload hash binding for future approval.
- No-send, no-payment, and no-production-write evidence.

Out of scope and forbidden in this stage:

- Real outbound email, social, Telegram, WhatsApp, VK, MAX, Avito, website form, or batch send.
- Real CRM write.
- Invoice send.
- Accounting export.
- Payment execution or payment request.
- Real inbox or reply monitor integration.
- Production DB write.
- Production deploy, VPS, DNS, HAPP, VPN, proxy, adb reverse, or Android global proxy changes.
- Full Run 1, Full Run 2, broad Android acceptance, APK install, or instrumentation.
- Provider credentials, secrets, runtime data, real client data, real contact data, real domains, real bank/card data, or real invoices.

Required defaults:

OUTBOUND_EMAIL=OFF
OUTBOUND_SOCIAL=OFF
AUTO_SAFE=OFF
PAYMENTS=OFF
PRODUCTION_DB_WRITE=OFF

Data scope:

SYNTHETIC_FIXTURES_ONLY=YES
REAL_CLIENT_DATA=NO
REAL_PERSONAL_DATA=NO
REAL_CONTACT_DATA=NO
REAL_EXTERNAL_DOMAIN_DATA=NO
REAL_BANK_OR_CARD_DATA=NO
