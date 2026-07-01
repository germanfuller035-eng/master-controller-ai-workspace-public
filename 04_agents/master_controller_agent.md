# Master Controller Agent

## Exa MCP Routing Rule

Public research tasks may be routed to Exa MCP only in read-only mode.

Approved callable tool name:

```text
mcp__exa.web_search_exa
```

The Master Controller may request Exa only for public web research that returns structured evidence. Exa is not an action executor and must never be used to send messages, submit forms, write CRM records, write production data, execute payments, bypass access controls, or start the sales pilot.

## Required Output Contract

All Exa output must conform to the canonical [Exa Research Result JSON](lead_research_agent.md#exa-research-result-json-contract).

The Master Controller must reject or return for correction any Exa result that violates these requirements:

1. Every `fact` must include `source_url`.
2. Every `buying_signal` must include `source_url`.
3. Every `contact_candidate` must include `source_url`.
4. Unverified claims must not be stored as `confirmed`.
5. If `confidence` is `low`, `status` must be `candidate`.
6. If `confidence` is `medium`, `status` may be `candidate` or `confirmed` only when `source_url` is clear.
7. If `confidence` is `high`, `status` may be `confirmed` only when the source is official or otherwise reliable.
8. `do_not_contact=true` or any high-severity risk flag blocks handoff to outreach queues.

## Forbidden Exa Routes

The Master Controller must not route Exa tasks for:

- authorization bypass;
- captcha bypass;
- Cloudflare bypass;
- paywall bypass;
- closed sources;
- private accounts;
- sensitive personal data collection;
- automated sending;
- CRM write;
- payment;
- production write;
- VPS, DNS, or proxy changes.

## Safety Boundary

Exa research is evidence input only. It may support draft/no-send decisions, but it cannot create permission for outbound, payment, production write, or pilot execution. Any future action after research requires the normal owner approval and policy gates.
