# Commercial Factory Baseline Read

Read before implementation:

- CURRENT_TASK_CHECKPOINT.md
- _generated/foundation_v1/FOUNDATION_HANDOFF.md
- _generated/policy_security_v1/POLICY_SECURITY_HANDOFF.md
- _generated/mcp_gateway_v1/MCP_GATEWAY_HANDOFF.md
- _generated/runtime_router_v1/RUNTIME_ROUTER_HANDOFF.md
- _generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_HANDOFF.md
- _generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_HANDOFF.md
- _generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_FINAL_REPORT.md
- _generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_EVIDENCE_INDEX.md
- _generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_KNOWN_LIMITATIONS.md
- config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json
- config/policies/CAPABILITY_MATRIX.json
- config/policies/RISK_MODEL_R0_R5.json
- config/policies/STOP_POLICY.json
- config/runtime/AGENT_RUNTIME_POLICY.json
- config/mcp/GATEWAY_ADAPTERS.json
- config/knowledge/KNOWLEDGE_INGEST_POLICY.json
- config/memory/MEMORY_POLICY.json
- config/evals/EVAL_SUITES.json

Baseline accepted: HEAD 734789b0d80ba01156aae6ac823c3c565037b61b, branch feature/commercial-agent-factory-v1, new isolated worktree D:\AI_WORKSPACE\.claude\worktrees\commercial-agent-factory-v1.

Inherited gates: feature flags remain OFF; no production runtime, no outbound, no real lead scraping, no production DB write, no payments, no Qdrant deployment, no Docling installation.
