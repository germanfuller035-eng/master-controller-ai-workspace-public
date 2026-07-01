# Provenance Model V1

Every knowledge artifact requires provenance. Missing provenance fails closed.

Required fields:

- provenance_id
- artifact_id
- source_id
- source_uri
- retrieved_at
- retrieval_method
- confidence
- source_sha256

Allowed retrieval methods in this session:

- local_synthetic_fixture
- owner_supplied_future
- approved_read_only_future

The provenance record preserves where the source came from, when it was read,
how it was read, how confident the system is, and the source hash used for
future conflict review.

Provenance cannot trigger direct memory writes. It can support a memory proposal
that must be reviewed by Memory Curator.
