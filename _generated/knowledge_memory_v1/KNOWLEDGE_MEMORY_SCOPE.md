# Knowledge Memory Scope

SESSION_NAME=KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1
SCOPE=LOCAL_SYNTHETIC_CONTRACTS_ONLY

Allowed changes:

- docs/knowledge/**
- docs/memory/**
- config/knowledge/**
- config/memory/**
- schemas/knowledge/**
- schemas/memory/**
- tools/knowledge/**
- tools/memory/**
- tools/knowledge_memory/**
- tests/knowledge/**
- tests/memory/**
- tests/fixtures/knowledge/**
- tests/fixtures/memory/**
- _generated/knowledge_memory_v1/**
- CURRENT_TASK_CHECKPOINT.md

Forbidden in this session:

- real Qdrant server
- Docling internet install
- production vector DB
- real embedding provider
- external LLM calls
- persistent memory write
- production Knowledge Radar automation
- crawler
- browser automation
- real GitHub polling
- legal, tax, or government source monitoring
- production ingestion pipeline
- production DB write
- production file ingestion
- VPS change
- production deploy
- Full Run 1
- Full Run 2
- Android acceptance
- APK install

Default state:

MEMORY_WRITE=OFF
KNOWLEDGE_INGEST=OFF_IN_PRODUCTION
QDRANT=CONTRACT_ONLY_NOT_DEPLOYED
DOCLING=CONTRACT_ONLY_NOT_INSTALLED
OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
