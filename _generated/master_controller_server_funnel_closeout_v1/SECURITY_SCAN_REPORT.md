# Security Scan Report

Status before final staging:

- SECRETS_IN_GIT=NO
- REAL_CONTACT_DATA_IN_GIT=NO
- PRIVATE_SCREENSHOTS_IN_GIT=NO
- RAW_EMAILS_IN_GIT=NO
- PAYMENT_CALL_TRACES=NO
- PRODUCTION_DB_WRITE_TRACES=NO

Files intentionally excluded from Git:

- live Yandex headers snapshot
- Yandex allowlist
- IMAP runtime state
- API heartbeat
- pairing runtime data
- local API lock/pid
- private screenshots
- raw email/contact evidence
- Telegram tokens and owner chat ids
- SMTP credentials

Final scan commands and results are recorded in `TEST_RESULTS.md` and the final report.

Final refined scan result:

- SECRET_VALUE_HITS=0
- NON_RESERVED_EMAIL_HITS=0
- PHONE_HITS=0
- PRIVATE_IMAGE_FILES_IN_GENERATED=0

Notes:

- Test fixtures use reserved `example.test` addresses only.
- Private screenshot filenames are listed for owner traceability, but screenshot files are not committed.
