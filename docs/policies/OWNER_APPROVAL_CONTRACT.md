# Owner Approval Contract

Status: foundation v1 contract.

## Required Approval Fields

- action;
- actor;
- exact target;
- payload hash;
- expiry;
- allowed retries;
- revocation method;
- owner identity;
- risk explanation;
- rollback or cancel option where possible;
- evidence reference.

## Approval Levels

- R0-R1: automatic after scope and data checks.
- R2: automatic with journal.
- R3: policy gate.
- R4: owner approval.
- R5: strong owner approval.

## Owner UX Requirements

Approval screens must show what will happen, why it is risky, what data class is involved, what can be undone, when approval expires, and how STOP affects it.

## Not Implemented

No production approval runtime, identity provider integration, or credential signing is implemented in foundation v1.
