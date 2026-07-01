# Docling Adapter Contract V1

DOCLING_STATUS=CONTRACT_ONLY_NOT_INSTALLED

This session defines how a future Docling parser would return parse results. It
does not install Docling and does not import Docling as a dependency.

Required parse result fields:

- parse_id
- artifact_id
- synthetic=true
- pages
- text_chunks
- parser_status=CONTRACT_ONLY_NOT_INSTALLED

The local implementation accepts only synthetic parse result fixtures. Future
real parsing requires an owner-approved stage, dependency review, sensitive data
policy, and rollback evidence.
