# Owner Visible Repair V1 - Before / After

## 1. Today / Home Owner Cockpit

Before:

- Acceptance proved the screen was reachable, but the first viewport did not
  make the owner safety state obvious.
- The owner had to infer whether sending, payment, and production writes were
  off.
- Costs, incidents, and commercial next steps were not grouped as a clear owner
  cockpit.

After:

- First viewport states API/data availability and safety boundaries.
- Sending, payments, and production write are explicitly OFF.
- STOP, costs, incidents, and commercial no-send are visible as owner decisions.
- Contract-only capabilities are listed honestly.

Acceptance:

TODAY_HOME_REPAIR_STATUS=PASS

## 2. Pipeline / Commercial No-Send Workflow

Before:

- Commercial and pipeline surfaces were reachable, but no-send meaning was not
  prominent enough for a quick owner read.
- Empty queues could be misread as successful sends.
- Draft-only, owner approval, suppression, daily cap, and reply-monitor gates
  were not grouped as a clear safety model.

After:

- Commercial summary starts with a no-send safety panel.
- Pipeline hub states drafts-only, owner approval required, no payment, and no
  production write.
- Queue screens state that empty does not mean sent; future send still requires
  owner approval.
- Existing tags and route behavior are preserved.

Acceptance:

PIPELINE_COMMERCIAL_REPAIR_STATUS=PASS

## 3. Safety / Costs / Incidents / STOP

Before:

- Safety and cost screens were reachable, but the owner did not get a compact
  cross-cutting safety read.
- Cost empty state could be misunderstood as zero spend.
- Incident empty state could be misunderstood as proof that all contract-only
  risk is gone.

After:

- Operations/System shows STOP, outbound OFF, payments OFF, production DB write
  OFF, and production flags safe/OFF.
- Cost center repeats the money safety boundaries and labels missing spend data
  as unavailable, not zero.
- Incidents list empty state is honest and actionable.
- Contract-only risks stay visible.

Acceptance:

SAFETY_COSTS_INCIDENTS_STOP_REPAIR_STATUS=PASS
