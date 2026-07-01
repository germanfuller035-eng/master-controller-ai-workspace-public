# Exa Schema Validation Report 2026-06-27

FINAL_STATUS=PASS_COMMITTED
SESSION_NAME=EXA_RESEARCH_RUNTIME_SCHEMA_VALIDATION_V1
BASELINE_COMMIT=37286f2ca70198cad38f8821eaf9e66e8d5327b9
BRANCH=feature/working-sales-mvp-launch-v1
WORKTREE=D:\AI_WORKSPACE\.claude\worktrees\working-sales-mvp-launch-v1
LIVE_EXA_CALL_EXECUTED=NO
SALES_PILOT_RUN=NO

## Changed Files

- schemas/commercial/exa_research_result.schema.json
- tools/commercial/exa_research_result.py
- tests/commercial/test_exa_research_result.py
- tests/fixtures/commercial/exa_research/valid_exa_research_result.synthetic.json
- tests/fixtures/commercial/exa_research/invalid_missing_fact_source_url.synthetic.json
- tests/fixtures/commercial/exa_research/invalid_low_confidence_confirmed.synthetic.json
- tests/fixtures/commercial/exa_research/invalid_contact_type.synthetic.json
- tests/fixtures/commercial/exa_research/invalid_source_type.synthetic.json
- tests/fixtures/commercial/exa_research/risky_high_severity_not_routable.synthetic.json
- tests/fixtures/commercial/exa_research/do_not_contact_not_routable.synthetic.json
- 09_dashboards/exa_schema_validation_report_2026-06-27.md

## Schema Location

SCHEMA_LOCATION=schemas/commercial/exa_research_result.schema.json

The schema records the canonical Exa Research Result JSON shape, including `source_type=public_web_research`, required arrays, required `source_url` fields for facts, buying signals, and contact candidates, confidence/status enums, allowed contact types, numeric `score_impact`, and boolean `do_not_contact`.

## Validator Location

VALIDATOR_LOCATION=tools/commercial/exa_research_result.py

Runtime functions added:

- `validate_exa_research_result()`
- `normalize_exa_research_result()`
- `can_route_exa_result_to_outreach()`
- camelCase aliases for the requested names: `validateExaResearchResult`, `normalizeExaResearchResult`, `canRouteExaResultToOutreach`

## Runtime Wiring

RUNTIME_WIRING_STATUS=STANDALONE_VALIDATOR_AND_ROUTE_GUARD_ADDED_NO_EXISTING_EXA_PIPELINE_INTEGRATION_POINT_FOUND
PRODUCTION_PIPELINE_WIRING_COMPLETED=NO

The existing worktree has commercial no-send helpers, contact enrichment helpers, controlled-outbound guards, and production queue boundary docs. It does not contain a concrete Exa result ingestion route or queue writer for this branch. The safe implementation is therefore a standalone runtime validator plus outreach route guard, ready to be called before any future enrichment/scoring/outreach handoff.

## Tests Added

- valid fixture passes validation
- missing `facts[].source_url` fails validation
- `confidence=low` with `status=confirmed` fails validation
- invalid `contact_type` fails validation
- wrong `source_type` fails validation
- `do_not_contact=true` is not routable to outreach
- high-severity `risk_flag` is not routable to outreach without owner review
- high-severity result is routable only when explicit owner review approval is passed to the guard

## Tests Result

TEST_RESULT=PASS

Commands:

- `python -m unittest tests.commercial.test_exa_research_result` -> PASS, 8 tests
- `python -m unittest tests.commercial.test_validate_commercial` -> PASS, 1 test
- `python tools\commercial\validate_commercial.py` -> PASS

## Safety Checks

- Live Exa call executed: NO
- Sales pilot run: NO
- Outbound/send enabled: NO
- Payment action performed: NO
- Production DB write performed: NO
- VPS/DNS/Happ proxy changed: NO
- Synthetic fixtures only: YES
- Docs contract contradiction found: NO

## Secrets Status

SECRETS_STATUS=PASS

No secret-like assigned values were added to the changed files.

## Real Lead / Contact Data Status

REAL_LEAD_CONTACT_DATA_STATUS=PASS

Fixtures use synthetic lead IDs, synthetic company names, synthetic source URLs, and synthetic contact references. No real email, real phone, real CRM data, or real lead data was added.

## Outbound / Send / Payment / Production Write Status

OUTBOUND_SEND_PAYMENT_PRODUCTION_WRITE_STATUS=PASS

The validator and tests are local and deterministic. They do not send messages, submit forms, write CRM records, write production databases, execute payments, or modify production infrastructure.

## Known Limitations

- Runtime schema validation is implemented as a standalone commercial validator module.
- Existing Exa ingestion/pipeline wiring was not found in this branch, so no production or queue integration was added.
- JSON Schema is stored as the canonical schema artifact; runtime enforcement is implemented in Python without adding external dependencies.
- Only synthetic fixtures were used.

## Next Safe Action

NEXT_SAFE_ACTION=WIRE_VALIDATE_EXA_RESEARCH_RESULT_AT_THE_FIRST_FUTURE_EXA_INGESTION_POINT_BEFORE_ENRICHMENT_SCORING_OR_OUTREACH
