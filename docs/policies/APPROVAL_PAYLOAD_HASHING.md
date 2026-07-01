# Approval Payload Hashing

Status: foundation v1 contract.

## Purpose

Owner approval must bind to the exact action and payload that will be executed. The owner should not approve a vague class of action when the target or payload can change.

## Canonical Payload Fields

- action;
- actor;
- exact target;
- data class;
- risk level;
- payload body or redacted body reference;
- expiry;
- allowed retries;
- rollback or cancel option where possible.

## Hash Rule

The approval hash is computed from a canonical serialized payload after redaction rules are applied. The hash must change if action, target, body, expiry, retry count, or risk explanation changes.

## Revocation

STOP and explicit owner revocation invalidate active approvals. Expired approvals cannot be retried.

## Not Implemented

No production hash service or approval execution runtime is implemented in foundation v1.
