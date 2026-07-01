# Owner Visible Repair V1 - Screenshots Index

Evidence root:

- `_generated/owner_visible_repair_v1/device_smoke/`

Screenshots:

- `screenshots/home.png` - Today / Home owner cockpit.
- `screenshots/commercial.png` - Commercial summary no-send panel.
- `screenshots/pipeline.png` - Pipeline no-send workflow.
- `screenshots/system.png` - System / STOP safety panel.
- `screenshots/cost.png` - Costs safety panel.
- `screenshots/approvals.png` - Approvals no-send entry.
- `screenshots/owner_incidents.png` - Incidents list / empty state.

UI hierarchy:

- `ui_hierarchy/home.xml`
- `ui_hierarchy/commercial.xml`
- `ui_hierarchy/_find_tap_cs_leads.xml`
- `ui_hierarchy/pipeline.xml`
- `ui_hierarchy/system.xml`
- `ui_hierarchy/cost.xml`
- `ui_hierarchy/approvals.xml`
- `ui_hierarchy/owner_incidents.xml`

Logcat:

- `logcat/focused_smoke_logcat_tail.txt`
- `logcat/logcat_buffer_state.txt`

Note:

- The device reported `0 B readable` for logcat buffers at evidence time, so
  screenshot and UI hierarchy files are the primary owner-visible smoke proof.
