# Agent Runtime Integration

date: 2026-06-18 · AGENT_MODE=SHADOW_NO_SEND

## Reuse, not rebuild
The existing orchestrator_os runtime (engines: analyzeDag, canRun, antiLoop, buildPlan, selectAgent,
routeModel, evaluateBudget, evaluateLease, makeCheckpoint, validateResume, evaluateRetry) and the
15_agent_orchestration contracts are reused. No new Agent OS, no second store/queue.

## Integration layer (shadow, no-send)
`commercial_core/lib/agent_shadow.mjs` (pure) + `mater_controller_api/src/commercial/agents.mjs`
(read-only adapter). Flow:
```
Master Controller event → orchestration task → agent artifact → QA review → owner queue/API command
```
Caps enforced in code: canonicalDirectWrite=false, send=false, payment=false, deploy=false. Agents read
provided evidence fields only; all lead-derived text passes sanitizeUntrusted (prompt-injection
containment). API key presence is a boolean; the key is never read into artifacts or returned.

## Claude provider
ANTHROPIC_API_KEY is present in the operator shell env but NOT in the API service env, so the live
agent status reports provider_available=false and the DETERMINISTIC analyzer is authoritative. This is
the safe default: agents never depend on an external call to produce evidence, and no key is deployed to
the canonical store or returned via API/Android. AGENT_RUNTIME_DEPLOYED with provider pending secure
secret deployment.

## Endpoints (gated by AGENT_RUNTIME; read-only)
/agents/status, /agents/shadow-wave, /pipeline/state-model, /owner-queues, /executive-brief.

```
AGENT_CONTROL_PLANE=PRODUCTION_CONNECTED  AGENT_RUNTIME=ON  AGENT_MODE=SHADOW_NO_SEND
AGENT_CANONICAL_DIRECT_WRITE=OFF  AGENT_SEND=OFF  AGENT_PAYMENT=OFF  AGENT_SECRET_EXPOSURE=0
```
