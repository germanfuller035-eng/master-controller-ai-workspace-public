---
type: sop
status: canonical
related_project: claude_code_integration
updated: 2026-06-17
canonical_target: 03_sop/ai_agent_governance_protocol.md
apply_status: PROPOSED_AFTER_SOAK
tags: [sop, governance, agents, handoff]
---

# AI Agent Governance Protocol (canonical)

Single canonical governance protocol for how ChatGPT, Claude Code, and Cline collaborate, hand off
work, and avoid duplication. Obsidian is the knowledge + control layer.

## Roles

### ChatGPT
- Strategy, architecture, large master prompts.
- Acceptance criteria, risk review, interpretation of reports.
- Does NOT execute production actions.

### Claude Code
- Large autonomous implementation blocks; tests; commits.
- Deployment **only when explicitly permitted** (never during freeze).
- Live verification; release closure.

### Cline
- Focused local implementation; emergency repair; code navigation.
- Precise file-level changes; offline scripts.
- No independent architecture rewrite.

### Obsidian
- Knowledge source; project registry; decisions; dashboards; lessons; handoffs; evidence indexes.

## Handoff schema

Every handoff (any direction) carries these fields:

```text
TASK_ID
PROJECT_ID
AGENT
GOAL
CURRENT_STATE
ALREADY_DONE
DO_NOT_REPEAT
FILES_ALLOWED
FILES_FORBIDDEN
SAFETY
TESTS_REQUIRED
DEPLOYMENT_ALLOWED
OWNER_ACTION
DONE_DEFINITION
FINAL_OUTPUT
```

## Standard templates
Templates are parameterized by `PROJECT_ID` (one set, not per-project copies). See
`04_agents/handoff_templates/`:
- `chatgpt_to_claude.md`
- `claude_to_chatgpt.md`
- `chatgpt_to_cline.md`
- `cline_to_chatgpt.md`
- `failed_task_recovery.md`
- `release_closure.md`
- `read_only_audit.md`
- `production_hotfix.md`
- `no_send_test.md`
- `owner_acceptance.md`

## Anti-loop discipline
Before starting any task an agent MUST:
1. Read `00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS.md` (compact index).
2. Generate/read a context pack: `node tools/ai_hq/context_pack_builder.mjs --project <id> --agent <agent> --task "<task>"`.
3. Check the task ledger (`_generated/ai_hq/task_ledger.jsonl`) for `IMPLEMENTED/DEPLOYED/ACCEPTED`
   work matching the goal. If found, do NOT repeat — supersede or extend instead.
4. Confirm `FILES_FORBIDDEN` and freeze boundary.

An agent MUST NOT:
- Repeat a completed audit/module/fix already in the ledger.
- Create a second script/dashboard/registry/ledger/store.
- Claim PASS without tests; claim DEPLOYED without commit; claim production PASS without live proof.

## Evidence rules
- IMPLEMENTED requires a commit hash.
- TESTED requires test output/exit code.
- DEPLOYED requires a commit + deployment record.
- LIVE_VERIFIED requires live proof (during freeze: not allowed).
- ACCEPTED requires owner sign-off.

## Related
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- [[00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS]]
- [[03_sop/pre_task_context_gate]]
