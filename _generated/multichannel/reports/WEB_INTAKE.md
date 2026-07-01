# Web Intake
Public intake API: /public/intake, /public/mini-audit-request. Validation: honeypot, consent required,
email format, dedupe (idempotency token), evidence hash. Junk → 400. Accepted → STAGED (no auto-lead from
junk; canonical promotion owner/worker-gated). No send. WEB_INTAKE=ON in production.
