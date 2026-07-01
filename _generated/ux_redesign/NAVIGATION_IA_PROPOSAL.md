# Navigation IA proposal

UPDATED_AT=2026-06-26 Europe/Moscow

## Target top-level zones

1. Today
2. Decisions / Approvals
3. Commerce
4. Agents / AI
5. System / STOP

## Route mapping

| Current area | New zone | Route compatibility |
|---|---|---|
| Today | Today | Keep `today`; keep `tab_today`. |
| Approvals, approval list/detail, owner decisions/incidents | Decisions | Keep routes `decisions`, `approval_list/*`, `approval_detail/*`, `owner_decisions`, `owner_incidents`. |
| Leads, Mini Audit, Replies, Offer Review, Deals/Commercial summary, Catalog, Product detail, Campaigns, Multichannel, Transport, Conversations, Test-only diagnostics | Commerce | Add top tab `commerce`; keep existing nested routes and anchors. |
| Agents, Owner queues, AI usage, Costs, Knowledge, First Touch | Agents / AI | Add top tab `agents`; keep `agents`, `owner_queues`, `ai_usage`, `cost_center`, `knowledge`, `first_touch`. |
| Operations, Reliability, Backup, Push, Automation, Source registry/telemetry, Owner settings, Reservoir, Settings/Connection, STOP | System / STOP | Keep `system`; add visible STOP component. |

## Migration rules

- No screen is deleted.
- Existing deep route strings are kept.
- Old card tags remain when they are used by acceptance, even if the card is now in a new zone.
- `exec_plan.json` nav paths must change after the UI contract is implemented:
  - `tab_leads` -> `tab_commerce` plus commerce card/route for pipeline.
  - `tab_replies` -> `tab_commerce` plus commerce card/route for replies.
  - `tab_today > card_commercial > cs_agents` -> `tab_agents` for agents dashboard.
  - Commerce children may start at `tab_commerce` instead of Today card.
  - Cost/AI/Knowledge/First Touch should start at `tab_agents` when visible there.
- `screen_anchors.json` remains unchanged unless an anchor changes; current plan is no anchor changes.

## Acceptance risks

- Bottom navigation tag changes can break runner if `exec_plan.json` is not updated.
- Data-gated empty screens must keep explicit empty markers.
- Agents and multichannel previous blockers must be regression-tested after nav changes.
