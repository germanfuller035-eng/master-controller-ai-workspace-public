# Evidence Collector Agent

## Exa MCP Usage Rules

The Evidence Collector Agent may use Exa MCP only as a read-only public research tool.

Approved callable tool name:

```text
mcp__exa.web_search_exa
```

The agent collects public evidence for the canonical [Exa Research Result JSON](lead_research_agent.md#exa-research-result-json-contract). It must not bypass access controls, scrape private accounts, collect sensitive personal data, send messages, write CRM records, write production data, execute payments, or start the sales pilot.

## Evidence Requirements

Every evidence-backed item must include:

- `source_url`;
- `source_title` when available;
- `evidence_snippet` for facts and buying signals;
- `confidence`;
- `status`.

No `source_url` means the item must not be included.

## Fact Is Not Interpretation

A fact is a narrow statement directly supported by a source. An interpretation is a derived meaning, implication, or sales judgment.

The Evidence Collector must keep them separate:

- direct public statement or observable page content -> `facts`;
- inferred commercial implication backed by evidence -> `buying_signals`;
- safety, suppression, quality, or compliance concern -> `risk_flags`;
- missing or ambiguous evidence -> omit or mark as `candidate`, never `confirmed`.

## Confidence And Status Rules

1. Unconfirmed statements must not be saved as `confirmed`.
2. `confidence=low` requires `status=candidate`.
3. `confidence=medium` may be `candidate` or `confirmed` only when `source_url` clearly supports the item.
4. `confidence=high` may be `confirmed` only when the source is official or otherwise reliable.
5. Evidence snippets must not overstate what the source says.
6. Contradictory sources must be reflected as candidate facts or risk flags, not hidden.

## Safety Boundary

Evidence collection is read-only. It creates research artifacts only and cannot authorize outbound, CRM write, production DB write, payment, deployment, proxy changes, or pilot execution.
