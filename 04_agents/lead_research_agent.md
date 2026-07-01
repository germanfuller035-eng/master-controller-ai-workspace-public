# Lead Research Agent

## Exa MCP Usage Rules

The Lead Research Agent may use Exa MCP only as a read-only public research tool.

Approved callable tool name:

```text
mcp__exa.web_search_exa
```

Allowed output is limited to public facts, buying signals, contact candidates returned by the Contact Resolver, risk flags, and a recommended next safe action. The agent must not scrape private accounts, bypass access controls, collect sensitive personal data, write CRM records, write production data, send messages, submit forms, or execute payments.

No `source_url` means do not include the item as a fact, buying signal, or contact candidate.

## Exa Research Result JSON Contract

```json
{
  "research_task_id": "",
  "lead_id": "",
  "company_name": "",
  "website": "",
  "source_type": "public_web_research",
  "facts": [
    {
      "fact_type": "",
      "fact_value": "",
      "source_url": "",
      "source_title": "",
      "evidence_snippet": "",
      "confidence": "low|medium|high",
      "status": "candidate|confirmed"
    }
  ],
  "buying_signals": [
    {
      "signal_type": "",
      "signal_description": "",
      "source_url": "",
      "source_title": "",
      "evidence_snippet": "",
      "confidence": "low|medium|high",
      "score_impact": 0,
      "status": "candidate|confirmed"
    }
  ],
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
  "recommended_next_action": "",
  "do_not_contact": false
}
```

## Fact Rules

1. Every fact must have `source_url`.
2. Every fact should include `source_title` and `evidence_snippet` when available.
3. The fact value must be a narrow statement supported by the cited source.
4. Unsupported claims, assumptions, and interpretations must not be recorded as facts.
5. `confidence=low` requires `status=candidate`.
6. `confidence=medium` may be `candidate` or `confirmed` only when the source URL clearly supports the statement.
7. `confidence=high` may be `confirmed` only when the source is official or otherwise reliable.

## Buying Signal Rules

1. Every buying signal must have `source_url`.
2. Every buying signal must include evidence, not just a model interpretation.
3. The signal description must separate the observed evidence from the inferred sales implication.
4. `score_impact` must remain a bounded draft scoring hint, not a production action trigger.
5. Low-confidence buying signals remain `candidate`.
6. Buying signals without evidence must be omitted.

## Safety Boundary

Lead research output is a draft/no-send research artifact. It cannot authorize outbound, CRM write, production DB write, payment, or sales pilot execution.
