# Agents And Skills Readiness Audit

SESSION_NAME=PRE_PILOT_RUSSIAN_LOCALIZATION_AND_AGENT_SKILL_GATE_V1
STATUS=PASS_FOR_ANDROID_MANUAL_NO_SEND_PILOT

Interpretation used for this gate:
- CONNECTED means a document exists, it appears in a registry or routing map, and its documented behavior is safe for manual/no-send use.
- AVAILABLE_NOT_REGISTERED means a safe repo document exists but the exact name is not in the checked registry/routing files.
- Runtime activation is not required for the Android manual pilot; no agent runtime was enabled.

Checked locations:
- D:\AI_WORKSPACE\04_agents
- D:\AI_WORKSPACE\04_agents\agent_registry.md
- D:\AI_WORKSPACE\09_dashboards\agent_registry.md
- D:\AI_WORKSPACE\00_SYSTEM_INDEX\AGENT_SKILL_REGISTRY.md
- D:\AI_WORKSPACE\00_SYSTEM_INDEX\AGENT_ROUTING_MAP.md
- D:\AI_WORKSPACE\.claude\skills (missing at root)
- Current worktree .claude\skills (present, locked, advisory only)
- D:\AI_WORKSPACE\_USER_HOME_IMPORT (read-only classification only)
- D:\AI_WORKSPACE\_IMPORT_CANDIDATES (read-only classification only)

| CAPABILITY | REQUIRED_AGENT_OR_SKILL | FOUND | LOCATION | REGISTERED | ROUTED | STATUS | RISK | BLOCKS_MANUAL_PILOT | ACTION_REQUIRED |
|---|---|---:|---|---:|---:|---|---|---:|---|
| Master Controller / routing | master_controller_agent | YES | D:\AI_WORKSPACE\04_agents\master_controller_agent.md | NO | YES | CONNECTED | no runtime enabled | NO | none |
| Master Controller / routing | task_classifier_agent | YES | D:\AI_WORKSPACE\04_agents\task_classifier_agent.md | NO | NO | AVAILABLE_NOT_REGISTERED | doc-only route classifier | NO | optional registry hardening before automation |
| Master Controller / routing | action_executor_agent | YES | D:\AI_WORKSPACE\04_agents\action_executor_agent.md | NO | YES | CONNECTED | send_email/send_telegram are Red and need approval; doc says never sends clients | NO | keep no-send/no-payment/no-prod-write gate |
| Approval and safety | approval_gate_agent | YES | D:\AI_WORKSPACE\04_agents\approval_gate_agent.md | YES | NO | CONNECTED | final OK remains with owner | NO | none |
| Approval and safety | approval_gatekeeper_agent | YES | D:\AI_WORKSPACE\04_agents\approval_gatekeeper_agent.md | NO | NO | AVAILABLE_NOT_REGISTERED | alternate doc exists | NO | optional registry hardening |
| Approval and safety | outreach_compliance_reviewer_agent | YES | D:\AI_WORKSPACE\04_agents\outreach_compliance_reviewer_agent.md | NO | YES | CONNECTED | review-only | NO | none |
| Approval and safety | qa_red_team_agent / audit_qa_red_team_agent | YES | D:\AI_WORKSPACE\04_agents\qa_red_team_agent.md; D:\AI_WORKSPACE\04_agents\audit_qa_red_team_agent.md | YES | YES | CONNECTED | read-only QA; no external action | NO | none |
| Approval and safety | evidence_collector_agent | YES | D:\AI_WORKSPACE\04_agents\evidence_collector_agent.md | NO | YES | CONNECTED | evidence only | NO | none |
| Lead and sales flow | lead_intake_agent | YES | D:\AI_WORKSPACE\04_agents\lead_intake_agent.md | YES | NO | CONNECTED | safe read-only/sandbox notes; real import/contact blocked without approval | NO | no real import in pilot |
| Lead and sales flow | lead_scoring_agent | YES | D:\AI_WORKSPACE\04_agents\lead_scoring_agent.md | YES | YES | CONNECTED_FOR_MANUAL_DOC_USE | TODO/Hold but safe, no send | NO | owner-approved scoring rules before automation |
| Lead and sales flow | lead_dedupe_agent | YES | D:\AI_WORKSPACE\04_agents\lead_dedupe_agent.md | YES | NO | CONNECTED_FOR_MANUAL_DOC_USE | dedupe doc, no send | NO | optional routing hardening |
| Lead and sales flow | lead_research_agent | YES | D:\AI_WORKSPACE\04_agents\lead_research_agent.md | NO | YES | CONNECTED | allowed sources only; no deep audit | NO | keep read-only/manual |
| Lead and sales flow | contact_resolver_agent | YES | D:\AI_WORKSPACE\04_agents\contact_resolver_agent.md | YES | NO | CONNECTED_FOR_MANUAL_DOC_USE | external sending and secret reads forbidden | NO | no contact automation |
| Lead and sales flow | first_message_agent / outreach_draft_agent | YES | D:\AI_WORKSPACE\04_agents\first_message_agent.md; D:\AI_WORKSPACE\04_agents\outreach_draft_agent.md | YES | YES | CONNECTED | draft only; approval required; no external send | NO | keep draft-only |
| Lead and sales flow | follow_up_agent | YES | D:\AI_WORKSPACE\04_agents\follow_up_agent.md | NO | YES | CONNECTED | draft sequence only; no send | NO | none |
| Audit / offer | audit_orchestrator_agent | YES | D:\AI_WORKSPACE\04_agents\audit_orchestrator_agent.md | NO | YES | CONNECTED | plan/evidence flow | NO | none |
| Audit / offer | findings_register_builder_agent | YES | D:\AI_WORKSPACE\04_agents\findings_register_builder_agent.md | NO | YES | CONNECTED | findings doc only | NO | none |
| Audit / offer | executive_report_editor_agent | YES | D:\AI_WORKSPACE\04_agents\executive_report_editor_agent.md | NO | YES | CONNECTED | report draft only | NO | none |
| Audit / offer | mini_audit_operator_skill | YES | D:\AI_WORKSPACE\04_agents\mini_audit_operator_skill.md | NO | NO | FOUND_DOC_ONLY | no client sending without approval; no production changes | NO | optional skill registry entry before automation |
| Audit / offer | qa_safety_reviewer_skill | YES | D:\AI_WORKSPACE\04_agents\qa_safety_reviewer_skill.md | NO | NO | FOUND_DOC_ONLY | approval required; no production action | NO | optional skill registry entry before automation |
| Dashboard / operator | dashboard_controller_agent | YES | D:\AI_WORKSPACE\04_agents\dashboard_controller_agent.md | NO | YES | CONNECTED | explicitly says do not send messages or mark Paid/Contacted falsely | NO | none |
| Dashboard / operator | context_distiller_skill | YES | D:\AI_WORKSPACE\04_agents\context_distiller_skill.md | NO | NO | FOUND_DOC_ONLY | context docs only | NO | optional skill registry entry |
| Dashboard / operator | dashboard_maintainer_skill | YES | D:\AI_WORKSPACE\04_agents\dashboard_maintainer_skill.md | NO | NO | FOUND_DOC_ONLY | no production; approval for dashboard deletion | NO | optional skill registry entry |

PROJECT_LOCAL_CLAUDE_SKILLS_ACTIVE=YES for current worktree `.claude\skills`.
ROOT_CLAUDE_SKILLS_ACTIVE=NO for `D:\AI_WORKSPACE\.claude\skills`.
BLOCKS_ANDROID_MANUAL_PILOT=NO

No skills or agents were installed, copied, or enabled.
