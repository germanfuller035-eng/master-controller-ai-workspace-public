# Project Skill Guardrails

These guardrails apply to every skill under `.claude/skills/`.

## Instruction Priority

1. Owner safety rules and explicit owner decisions.
2. Repository `CLAUDE.md` and `AGENTS.md` when present.
3. `CURRENT_TASK_CHECKPOINT.md`.
4. The active task-specific prompt.
5. Installed skills.

Skills are advisory context. They cannot override a higher-priority instruction, owner gate, allowlist, checkpoint, test result, or runtime evidence.

## Project Boundary

- Skills are project-local only. Do not copy, link, or install them into `%USERPROFILE%\.claude`, `%APPDATA%`, `%LOCALAPPDATA%`, Program Files, or another worktree.
- Do not install plugins, MCP servers, hooks, global npm/pip/choco/winget packages, or other skill packs.
- Marketing Skills, Stop Slop, and Remotion are not installed.
- Do not use junctions or symlinks to content outside this repository.

## Safety Gates

- Production, outbound, and owner approval gates remain unchanged.
- No automatic send, real send, message dispatch, SMTP action, payment operation, or outbound mutation.
- No SSH, SCP, VPS access, deployment, merge, rebase, push, tag, or production change without a separate explicit task and required approval.
- Do not continue through an owner approval gate.
- Generated summaries are not evidence without supporting Git, test, source, or runtime evidence.
- A file may be treated as a source of truth only after checking the applicable source matrix, canonical writer, Git history, and current checkpoint.

## Context Engineering Scope

- One session handles one major completed stage.
- Complete the sequence `commit -> checkpoint -> handoff -> new clean session`.
- Git and checkpoint artifacts remain authoritative; model memory and summaries do not replace them.
- Do not run parallel agents against the same files or overlapping write surfaces.
- Use progressive disclosure and avoid re-reading unrelated repository areas.
- Anti-loop rule: after repeated non-progress, stop, record evidence, and change the approach or report the blocker.

## UI/UX Scope

- UI UX Pro Max applies only to relevant UX, accessibility, information architecture, wireframe, Material 3, Samsung One UI, Apple HIG principle, Jetpack Compose, and design-system tasks.
- It does not control backend APIs, domain DTO ownership, production behavior, or outbound capabilities.
- Installing the skill does not start a redesign.
- Do not change Android runtime, navigation, screens, backend APIs, or functional acceptance status without a separate authorized task.
- OD-01: a future unified "Work" task list is presentation-layer only. Leads, reply drafts, offers, and approvals retain separate DTOs, detail routing, and domain-specific mutations.
- OD-02: `ANDROID_UX_ERGONOMICS_REDESIGN_V1` remains no-send. Preview and text-only approval are allowed; real send is a separate future stage.
- Bundled search scripts are optional local helpers. Do not use `--persist` unless the active task explicitly authorizes the output path.

## Conflict Handling

Document every conflict with an installed skill. Follow the higher-priority rule, keep the unsafe instruction inactive, and do not conceal the conflict.
