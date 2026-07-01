# Knowledge Architecture V1

SESSION_NAME=KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1
STATUS=LOCAL_DETERMINISTIC_CONTRACTS

Knowledge is an audited local artifact flow, not a production ingestion system.
A document becomes a knowledge artifact only after deterministic metadata,
provenance, data classification, source date, confidence, retention, and
sensitive-data gates pass.

Flow:

1. Owner-approved or synthetic source is read locally.
2. Artifact metadata is created with source_id, source_uri, data_class,
   source_type, sha256, created_at, and optional source_date.
3. A provenance record binds the artifact to source, retrieval method,
   retrieved_at, confidence, and source hash.
4. Temporal claims are represented as temporal facts with valid_from,
   source_id, and confidence.
5. Qdrant record creation is contract-only and uses deterministic fake
   embedding IDs. No Qdrant service is deployed.
6. Docling parse handling is contract-only and accepts synthetic parse results.
   No Docling package is installed.
7. Knowledge Radar may create proposals only. It cannot install components,
   crawl, poll GitHub, monitor external sources, or write memory.

Mandatory safety:

- KNOWLEDGE_INGEST production remains OFF.
- No production filesystem ingestion.
- No production DB write.
- No external network.
- No real embeddings.
- No real sensitive personal, client, military, or medical documents.
- Secret-looking values are denied and redacted before any artifact promotion.

Evidence files live under `_generated/knowledge_memory_v1/`.
