# Pre-Pilot Known Limitations

No blocking limitations for the first Android manual no-send pilot.

Non-blocking limitations:
- Some required agent/skill capabilities are safe repo documents rather than active runtime agents.
- Several 04_agents skill-style documents are not exact-name registered/routed; this does not block manual pilot because runtime automation is not enabled.
- `lead_scoring_agent` remains documented as TODO/Hold for automated scoring rules; Android manual pilot uses local deterministic/manual draft flow and remains no-send.
- Root `D:\AI_WORKSPACE\.claude\skills` is absent; current worktree `.claude\skills` is present and locked as project-local advisory-only.
- Real outbound, payments, production writes, deploy, merge, push, and tags remain outside this stage.

Recommended follow-up before automation:
- Owner-approved registry/routing hardening for doc-only skill entries.
- Separate automation gate before any runtime agent execution.
