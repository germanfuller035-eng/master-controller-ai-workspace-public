# MCP Tool Registry

## Exa MCP

STATUS=APPROVED_READ_ONLY_PUBLIC_RESEARCH_TOOL
CALLABLE_TOOL_NAME=mcp__exa.web_search_exa
SOURCE_TYPE=public_web_research
MODE=READ_ONLY

Exa MCP is approved only for read-only public research tasks routed through Master Controller policy. It may collect public facts, public buying signals, public company-level contact candidates, and public risk flags for a lead research task. It must not execute outbound, write, payment, CRM, production DB, browser bypass, or private-data collection actions.

Canonical output contract: [Exa Research Result JSON](../04_agents/lead_research_agent.md#exa-research-result-json-contract)

## Allowed Use Cases

- Read-only public web research for company identity, website, industry, public positioning, and business context.
- Public evidence collection for facts that include `source_url`, `source_title`, `evidence_snippet`, `confidence`, and `status`.
- Public buying signal discovery when the signal is tied to evidence and a source URL.
- Public company-level contact discovery limited to generic email, company phone, contact page, public form, or official company social profile.
- Public risk flag discovery when the source URL is included and the flag is separated from factual evidence.
- Candidate enrichment for draft/no-send workflows where production writes, CRM writes, outbound sends, and payments remain disabled.

## Forbidden Use Cases

- Authorization bypass, captcha bypass, Cloudflare bypass, paywall bypass, or closed-source access.
- Scraping private accounts, private groups, private profiles, or sensitive personal data.
- Collecting personal private employee contacts unless the contact is explicitly published as a business contact on an official source.
- Automatic message sending, form submission, outbound email/social, Telegram send, CRM write, production DB write, production filesystem write, payment, invoice payment, or deployment.
- Storing secrets, access tokens, credentials, provider keys, private lead/contact data, or real outbound payloads in the workspace.
- Treating low-confidence or unsourced claims as confirmed facts.

## Registry Rules

1. Every Exa task must be routed as read-only public research.
2. Every Exa result must conform to the Exa Research Result JSON contract.
3. No `fact`, `buying_signal`, or `contact_candidate` may be emitted without `source_url`.
4. Low-confidence items must remain `candidate`.
5. High-confidence confirmed items require an official or otherwise reliable public source.
6. Exa output is evidence only; it does not authorize send, payment, CRM, production write, or pilot execution.
