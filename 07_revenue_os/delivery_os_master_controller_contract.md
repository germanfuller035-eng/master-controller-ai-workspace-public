---
type: integration_contract
status: proposed
related_project: delivery-os
updated: 2026-06-17
canonical_target: 07_revenue_os/delivery_os_master_controller_contract.md
apply_status: PROPOSED_AFTER_SOAK
tags: [delivery_os, master_controller, integration, contract, future]
---

# Delivery OS ↔ Master Controller — Future Integration Contract

> **Future contract only.** Not implemented or deployed during the soak. Delivery OS never mutates
> Master Controller (MC) state directly.

## MC may PROVIDE to Delivery OS (read-only)
- canonical_lead_id · deal status · approved product · commercial evidence · approved offer ·
  revision · communication history.

## Delivery OS may RETURN (recommendations / status only)
- project creation recommendation · delivery status summary · owner actions · milestones ·
  deliverables · acceptance status · case evidence readiness.

## Hard prohibitions
Delivery OS must NOT directly mutate MC: lead status, approval, send state, reply/follow-up, ledgers.

## Future flow (owner-gated)
```
Delivery OS (recommendation / status)
  → Master Controller API (validation)
  → owner approval
  → canonical operational record (MC sole writer)
```

## Concurrency
- Delivery OS echoes the `revision` it consumed; MC rejects stale writes.
- No bidirectional sync. MC remains operational source of truth.

## Soak safety
No implementation or deployment during the v0.4.0-rc1 soak. Contract only.

## Related
- [[07_revenue_os/master_controller_integration_contract]] (Revenue OS)
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
