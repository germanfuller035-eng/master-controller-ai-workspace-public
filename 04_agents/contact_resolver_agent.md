# Contact Resolver Agent

## Exa MCP Usage Rules

The Contact Resolver Agent may use Exa MCP only for read-only public research.

Approved callable tool name:

```text
mcp__exa.web_search_exa
```

The agent may return only public company-level contact candidates. It must not collect private personal contacts, hidden employee contacts, private account data, or sensitive personal data. It must not send messages, submit forms, write CRM records, write production data, execute payments, or start outreach.

## Contact Candidate JSON Contract

Contact candidates must be returned inside the canonical [Exa Research Result JSON](lead_research_agent.md#exa-research-result-json-contract) structure:

```json
{
  "contact_candidates": [
    {
      "contact_type": "email|phone|contact_page|form|official_social",
      "value": "",
      "source_url": "",
      "source_title": "",
      "confidence": "low|medium|high",
      "status": "candidate|confirmed"
    }
  ],
  "risk_flags": [
    {
      "risk_type": "",
      "description": "",
      "severity": "low|medium|high",
      "source_url": ""
    }
  ],
  "do_not_contact": false
}
```

## Allowed Contact Types

- General company email published publicly by the company.
- Company phone published publicly by the company.
- Contact page.
- Public contact form.
- Official company social profile.

## Forbidden Contact Types

- Private personal employee email.
- Private personal phone.
- Private social profile.
- Scraped account data from closed or authenticated sources.
- Sensitive personal data.
- Any contact candidate without `source_url`.

An employee-level contact may be included only when it is explicitly published as a business contact on an official or reliable public source. Otherwise it must be omitted.

## Confidence And Status Rules

1. Every contact candidate must have `source_url`.
2. Low-confidence contact candidates must remain `candidate`.
3. Medium-confidence candidates may be `confirmed` only when the source URL clearly supports the value.
4. High-confidence candidates may be `confirmed` only when the source is official or otherwise reliable.
5. A contact candidate copied from an aggregator remains `candidate` unless verified against an official or reliable source.

## Suppression And Risk Behavior

If `do_not_contact=true` or any `risk_flags.severity=high`, the Contact Resolver must not pass the result to an outreach queue. It may return the research artifact with `recommended_next_action` set to a safe manual review or suppression action.

Contact resolution is evidence only. It does not authorize outbound, CRM write, production DB write, payment, or pilot execution.
