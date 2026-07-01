# Conflict Analysis

Status: PASS_WITH_LOCAL_GUARDRAILS

## Compatibility Matrix

| Area | Assessment | Resolution |
| --- | --- | --- |
| `CURRENT_TASK_CHECKPOINT.md` | Previous Android acceptance stage is complete and production history is recorded. This setup must not resume it. | Checkpoint remains unchanged; no runtime action was taken. |
| Git/worktree policy | Upstream examples discuss branches, PRs, rollback, and deployment. | Current branch/worktree and explicit task restrictions override all examples. No merge, rebase, push, tag, or other worktree was used. |
| One session, one stage | Context skills support long-running loops that could encourage continuation. | Guardrail fixes one session to one completed macrostage and requires commit, checkpoint, handoff, then a clean session. |
| Canonical writer | Filesystem and memory guidance can suggest new sources of truth. | No file becomes authoritative without source-matrix, canonical-writer, Git, checkpoint, and evidence verification. |
| Outbound disabled | Upstream agent examples mention messaging, APIs, PRs, and deployment. | All outbound and send operations remain disabled. Examples are non-authorizing. |
| Owner gates | Harness guidance permits actions after explicit approval. | Master Controller owner gates still require a separate task and cannot be crossed by a skill. |
| Android functional acceptance | UI guidance could imply immediate refactoring. | Installation is advisory only and does not change acceptance evidence, runtime, screens, or navigation. |
| Future UX redesign | UI skill suggests broad redesign workflows and a generated design-system master file. | No redesign starts here. Generated design summaries are not canonical evidence. OD-01 and OD-02 are fixed in guardrails. |
| Conversations recovery | Current recovery work must not be displaced by design activity. | No Conversations files or runtime state were changed. This stage only installs project-local skills. |
| Production safety | Some upstream material discusses staging and production. | No SSH, deployment, backend, Android, or production action is allowed by this installation. |
| Multi-agent coordination | Upstream supports parallel agents. | Parallel agents may not edit the same or overlapping files. Canonical writer and explicit handoffs are required. |

## Neutralized Upstream Conflicts

1. UI UX Pro Max referenced shadcn MCP integration. Removed from the installed description; no MCP is installed.
2. UI UX Pro Max instructed package-manager installation of Python. Replaced with a no-install prerequisite.
3. UI UX Pro Max promoted persisted `MASTER.md` output as a source of truth. Project guardrails prohibit treating generated summaries as evidence or canonical truth.
4. UI UX Pro Max upstream copy was React Native-oriented. The local scope now identifies Jetpack Compose and Material 3 without changing Android code.
5. Context Engineering examples may describe deployment, PR preparation, communication, or autonomous loops. They remain conceptual and cannot authorize side effects.

## Owner Decisions Preserved

- OD-01: a future unified "Work" list is presentation-layer only; domain DTOs, routing, and mutations remain separate.
- OD-02: `ANDROID_UX_ERGONOMICS_REDESIGN_V1` remains no-send; guarded real send is a separate future stage.
