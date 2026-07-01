# Document Ingestion Contract V1

Document ingestion is a local deterministic contract for synthetic fixtures.
It does not run a production pipeline.

Required request fields:

- request_id
- artifact
- provenance
- environment=LOCAL_SYNTHETIC
- owner_approval when the source is a synthetic sensitive fixture

Artifact requirements:

- artifact_id
- source_id
- source_uri
- source_type
- data_class
- sha256
- created_at or source_date
- synthetic marker for test fixtures

Denials:

- missing provenance
- missing source
- missing date
- unknown data_class
- missing sha256
- secret-looking content
- raw client, personal, military, or medical documents
- production filesystem ingestion
- production DB write
- external network or crawler action

Accepted result is still local. It may produce metadata, provenance, temporal
facts, and contract records, but it does not write production knowledge stores.
