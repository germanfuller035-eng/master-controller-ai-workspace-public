# Owner Control Architecture V1

SESSION_NAME=WEB_COMMAND_CENTER_ANDROID_OWNER_CONTROL_V1
SCOPE=LOCAL_SYNTHETIC_CONTRACT_ONLY

Web Command Center is the owner decision surface, not an autonomous actor. It shows drafts, decisions, evidence, costs, health, and next actions so the owner can inspect state without triggering production effects.

Android remains the primary mobile owner control surface. Web Command Center mirrors the same owner concepts for desktop review: Today, Decisions, Approvals, Leads, Offer Preview, Replies, Deals, Agents, Costs, Incidents, Memory proposals, Global STOP, and Voice.

Telegram remains a reserve channel only. It is visible as backup context, not as a sending surface in this stage.

STOP is visible, high-priority, and global. A STOP-active state blocks outbound, browser actions, voice risky actions, payments, and production writes.

R4/R5 approvals require an exact payload hash plus human-readable risk explanation. R5 also requires strong approval fields for future UI confirmation.

This session performs no send, no deploy, no payment, no production write, no real approval execution, and no Android installation. All owner-control actions are local, deterministic, synthetic, and evidence-backed.
