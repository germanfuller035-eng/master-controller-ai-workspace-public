# Qdrant Adapter Contract V1

QDRANT_STATUS=CONTRACT_ONLY_NOT_DEPLOYED

This session defines the record contract that a future Qdrant adapter may use.
It does not deploy Qdrant, create a production collection, connect over the
network, or generate real embeddings.

Required record fields:

- record_id
- artifact_id
- payload
- embedding_id
- adapter_status=CONTRACT_ONLY_NOT_DEPLOYED

The local implementation creates deterministic fake embedding IDs from artifact
hashes so tests can validate the contract without a vector DB.

Denied:

- real Qdrant server
- production collection
- connection URL
- provider credentials
- real embedding provider
- production vector DB write
