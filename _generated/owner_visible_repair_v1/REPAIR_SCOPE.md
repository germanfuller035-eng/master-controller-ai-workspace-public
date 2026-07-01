# Owner Visible Repair V1 — Scope

SESSION_NAME=OWNER_VISIBLE_PRODUCT_REPAIR_V1
WORK_MODE=OWNER_VISIBLE_DELTA_FIRST

## Goal

Make a small owner-visible Android repair sprint across exactly the top 3 areas:

1. Today / Home owner cockpit.
2. Pipeline / Commercial no-send workflow.
3. Safety / Costs / Incidents / STOP.

The owner should understand in about 10 seconds:

- what is happening;
- what is safe;
- what is not sending;
- what is not paid;
- what is not writing production;
- what requires a decision;
- what remains contract-only.

## Allowed Implementation Scope

Allowed:

- Android owner-visible UI edits.
- Small view/state mapping changes that use existing read-only repository calls.
- Honest contract-only labels.
- Stable test tags.
- Focused build, static checks, and focused smoke only.
- APK install only because Android source changed.

Not allowed:

- merge, tag, deploy;
- VPS, DNS, Caddy, backend, firewall, HAPP, VPN, or proxy changes;
- production database writes;
- outbound sends;
- payments;
- production feature flag activation;
- Full Run 1 or Full Run 2;
- new contract-only subsystems;
- fake success or hidden contract-only features;
- data clear or APK reinstall without Android changes;
- staging secrets, runtime data, APK/build outputs, devices.json, pairing.json, or `.agents`.

## Repair Design

Today / Home:

- Use existing read-only endpoints already available through `MaterRepository`: mini-audit status, next action, automation status, reply counts, cost overview, incidents summary, and command brief.
- Add a first-viewport owner safety summary: API/data state, sending OFF, payments OFF, production write OFF, STOP visible.
- Add top-area cards for commercial no-send, safety/STOP, and costs/incidents.
- Add honest contract-only labels for post-hardening layers.

Pipeline / Commercial:

- Use the existing `commercial_summary`, `leads_home`, and `pipeline_queue_*` surfaces.
- Make no-send/drafts-only/owner-gate language visible before queue rows.
- Show batch limit, daily cap, suppression/stop-list, and reply-monitor gates as contract/safety requirements.
- Preserve existing navigation tags and no-send behavior.

Safety / Costs / Incidents / STOP:

- Use existing `operations_home`, `cost_center_screen`, and `owner_list_incidents`.
- Add safety invariant panels for STOP, outbound OFF, payments OFF, production write OFF, and feature flags safe/OFF.
- Make cost unavailable state honest: no data is not 0.
- Make incident empty state honest and actionable.

## Web Scope

WEB_REPAIR_SCOPE=NOT_AVAILABLE

Source scan found backend/tool `package.json` files but no ready, owner-control web UI app surface in this worktree. This sprint does not create Web UI from scratch.
