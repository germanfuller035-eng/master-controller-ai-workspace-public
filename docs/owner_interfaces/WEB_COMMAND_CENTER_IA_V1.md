# Web Command Center IA V1

Status: foundation v1 architecture.

## Purpose

Web is the full owner command surface for planning, comparison, evidence review, approvals, and system health.

## Zones

| Zone | Purpose | Allowed actions | Denied actions |
| --- | --- | --- | --- |
| Today & Decisions | Current situation, approvals, incidents, owner next actions. | Review, approve R4/R5 only with exact payload, revoke approvals, STOP. | Hidden execution, broad approvals. |
| Commerce | Leads, offers, replies, deals, campaign and delivery context. | Draft, inspect, compare, approve explicit sends later. | Autonomous sends or payments. |
| AI Circuit | Agents, model routing, costs, memory proposals, tool access. | Inspect status, review proposals, run local synthetic checks later. | Runtime activation without flag and approval. |
| Knowledge | Read-only knowledge, source health, classified summaries. | Read, search, validate, request draft ingest. | Secret ingestion or unapproved sensitive processing. |
| System Health / STOP | Health, incidents, feature flags, emergency controls. | STOP, revoke approvals, review checkpoints. | Production changes without owner-approved release stage. |

## Risk Boundaries

Web may display R0-R5 tasks but cannot bypass policy. R4/R5 actions require owner approval payloads with hashes and expiry.

## Evidence Shown

Each risky item must show source, data class, risk level, payload hash, approval state, rollback/cancel option, and last checkpoint.

## STOP Behavior

STOP must be visible in System Health and critical contexts. It triggers approval revocation, outbound off, production write off, payments off, browser actions off, checkpoint, and stopped-actions report.

## Future Implementation Notes

Build after policy/STOP runtime design. Do not connect production write controls until the approval and audit contract is implemented.
