# Data Classification

Status: foundation v1 contract.

## Classes

| Class | Meaning | External AI rule | Git/log rule |
| --- | --- | --- | --- |
| PUBLIC | Publicly shareable data. | Allowed if task scope permits. | Allowed. |
| BUSINESS_INTERNAL | Internal operating, architecture, and planning data. | Allowed only when useful and scoped. | Allowed when not sensitive. |
| CLIENT_CONFIDENTIAL | Client, lead, deal, reply, offer, or delivery data. | Requires data minimization and policy gate. | Do not include raw sensitive payloads unless explicitly approved and redacted. |
| PERSONAL_CONFIDENTIAL | Personal identity, calendar, finance, property, travel, or private documents. | Requires owner approval and minimization. | Do not commit raw private payloads. |
| MILITARY_MEDICAL | Military, medical, or similarly sensitive special-category data. | Requires explicit owner approval before external AI processing. | Do not commit raw content. |
| SECRETS | Credentials, private keys, tokens, pairing material, passwords, and connection secrets. | Never send to prompts or external AI. | Never store in Git, reports, or logs. |

## Rules

- Secrets never go in prompts, logs, reports, or Git.
- Sensitive medical or military data requires explicit owner approval before external AI processing.
- High-risk audit logs store hashes and references, not full secret or sensitive content.
- Data class must be known before tool access, model routing, memory proposal, or owner approval.

## Not Implemented

No classifier runtime, no secret manager integration, and no production policy service are implemented in foundation v1.
