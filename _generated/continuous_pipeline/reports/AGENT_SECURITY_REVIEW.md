# Agent Security Review
- CANONICAL_WRITER_COUNT=1; DIRECT_AGENT_WRITERS=0; agents go event→task→artifact→QA→approved API command→single writer.
- AGENT_SEND=OFF, AGENT_PAYMENT=OFF, AGENT_CANONICAL_DIRECT_WRITE=OFF, AGENT_DEPLOY=none.
- Untrusted website/email text passes sanitizeUntrusted (prompt-injection containment); injection flagged, never executed.
- No agent text can enable send, change flags, request secrets, or call shell — agents emit a validated schema only.
- API key presence is boolean; key never read into artifacts, never returned via API/Android, never in canonical store.
- security.test.mjs (15) + continuous_pipeline.test.mjs safety cases pass. AGENT_SECRET_EXPOSURE=0, PROMPT_INJECTION_BYPASS=0.
