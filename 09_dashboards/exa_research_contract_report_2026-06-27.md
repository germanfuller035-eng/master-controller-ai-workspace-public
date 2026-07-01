# Exa Research Contract Report 2026-06-27

FINAL_STATUS=PASS_COMMITTED
SESSION_NAME=EXA_RESEARCH_JSON_CONTRACT_AGENT_DOCS_V1
BRANCH=feature/working-sales-mvp-launch-v1
MODE=DOCS_ONLY_READ_ONLY_CONTRACT
EXA_CALLABLE_TOOL_NAME=mcp__exa.web_search_exa
EXA_TOOL_STATUS=APPROVED_READ_ONLY_PUBLIC_RESEARCH_TOOL

## Changed Files

- 00_SYSTEM_INDEX/MCP_TOOL_REGISTRY.md
- 04_agents/master_controller_agent.md
- 04_agents/lead_research_agent.md
- 04_agents/contact_resolver_agent.md
- 04_agents/evidence_collector_agent.md
- 09_dashboards/exa_research_contract_report_2026-06-27.md

## What Was Added

- Exa MCP registry entry with status `APPROVED_READ_ONLY_PUBLIC_RESEARCH_TOOL`.
- Callable tool name `mcp__exa.web_search_exa`.
- Read-only routing rule for Master Controller.
- Canonical Exa Research Result JSON contract for public research results.
- Fact, buying signal, contact candidate, risk flag, confidence, and status rules.
- Contact Resolver restriction to public company-level contacts.
- Evidence Collector rule that fact and interpretation must remain separate.
- Suppression behavior for `do_not_contact=true` and high-severity risk flags.

## Allowed Use Cases

- Read-only public company research.
- Evidence-backed facts with source URLs.
- Evidence-backed buying signals with source URLs.
- Public company-level contact candidates.
- Public risk flags with source URLs.
- Draft/no-send research artifacts for safe manual review.

## Forbidden Use Cases

- Authorization bypass, captcha bypass, Cloudflare bypass, paywall bypass, or closed sources.
- Private accounts, sensitive personal data, or private personal employee contacts.
- Automatic outbound, form submission, Telegram send, email/social send, or outreach execution.
- CRM write, production DB write, production filesystem write, deployment, VPS/DNS/proxy changes, payment, or pilot execution.
- Workspace storage of secrets, real private lead data, or real private contact data.

## JSON Contract Summary

The canonical Exa result includes:

- `research_task_id`, `lead_id`, `company_name`, `website`, and `source_type=public_web_research`.
- `facts[]` with `source_url`, `source_title`, `evidence_snippet`, `confidence`, and `status`.
- `buying_signals[]` with evidence, source URL, confidence, score impact, and candidate/confirmed status.
- `contact_candidates[]` limited to public company-level contact types.
- `risk_flags[]` with severity and source URL.
- `recommended_next_action`.
- `do_not_contact`.

## Safety Checks

- No Exa live call was executed in this docs-only stage.
- No sales pilot was started.
- No outbound, send, form submit, CRM write, production DB write, payment, VPS, DNS, or Happ proxy change was performed.
- No real leads or real private contact data were added.
- No secrets were added.
- All changed documents reference Exa read-only mode.
- Callable tool name is recorded as `mcp__exa.web_search_exa`.

## Known Limitations

- This stage documents the JSON contract and routing rules only.
- It does not implement runtime schema validation.
- It does not enable Exa as a production write-capable tool.
- It does not start the first manual sales pilot.

## Next Safe Action

NEXT_SAFE_ACTION=ADD_SCHEMA_VALIDATION_OR_RUN_OWNER_APPROVED_READ_ONLY_EXA_RESEARCH_DRY_RUN
