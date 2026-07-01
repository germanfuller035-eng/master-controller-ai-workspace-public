# Temporal Facts V1

Temporal facts represent claims whose truth depends on date or time.

Required fields:

- fact_id
- subject
- predicate
- value
- valid_from
- source_id
- confidence

Optional fields:

- valid_to
- observed_at
- provenance_id

Validation:

- valid_from must be an ISO date.
- source_id is mandatory.
- confidence must meet the configured threshold.
- unknown date is denied.
- conflicts are detected by subject, predicate, and valid_from.

When two facts share a conflict key but have different values, the result is
FLAG_FOR_CURATOR. The system does not silently overwrite facts.
