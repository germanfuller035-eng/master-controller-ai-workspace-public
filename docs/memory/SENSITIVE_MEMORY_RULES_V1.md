# Sensitive Memory Rules V1

Sensitive memory cannot be auto-written.

Rules:

- secret-looking values are denied and redacted
- personal confidential data requires owner approval
- client confidential data requires owner approval
- military and medical data requires owner approval
- external AI use before owner approval is denied
- raw real sensitive documents are out of scope
- synthetic sensitive fixtures must be clearly marked

Negative tests may use fake synthetic sensitive fixtures only. They must not
contain real personal, client, military, medical, or financial data.
