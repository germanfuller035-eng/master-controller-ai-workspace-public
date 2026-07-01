# UI Defects Fixed

- Unified owner app default appearance around the light Material theme.
- Replaced hardcoded root navigation colors with Material color tokens.
- Shortened bottom navigation labels to stable owner wording.
- Replaced old Today and Decisions cockpit routes with production owner screens.
- Removed legacy cockpit source generation from the Android app.
- Replaced old `pilot/...` manual-sales deep routes with neutral `sales/...` routes.
- Reworked Commerce first viewport from old MVP wording to the owner sales workflow.
- Reworked Agents first viewport from technical runtime status to owner-readable assistant readiness.
- Reworked System first viewport into a system center with safety boundaries and owner actions.
- Reordered Leads so the primary manual review action is visible before secondary metrics.
- Reordered the manual sales workflow so the current step content is visible before the import helper.
- Removed the reachable demo offer fallback from offer review.
- Replaced owner-visible production/runtime wording with human-readable safety language.
- Replaced stale/offline wording with explicit stale-data handling: last refresh, refresh action, and reason.
