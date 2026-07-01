# Phase 0 — Safe Isolation Decision (AI WORKSPACE HQ CONSOLIDATION v1)

date: 2026-06-17
status: COMPLETE

## Environment baseline (read-only proof)
- WORKSPACE_ROOT: `D:\AI_WORKSPACE`
- GIT_ROOT: `D:\AI_WORKSPACE` (single repo; tracks **code/tools only**, 525 files)
- OBSIDIAN_VAULT_ROOT: `D:\AI_WORKSPACE` (`.obsidian` present)
- Main-tree branch: `feature/master-controller-lead-hunter-integration`
- Base/HEAD commit: `dd9a63a5aa9fcd08f5ae8fb0f8b4d0f8574469fe`
- Release tag present: `v0.4.0-rc1` (will NOT move)
- Main-tree working changes: 1137 (1081 untracked generated, 44 modified runtime, 12 deleted) — left untouched
- Free disk on D: ~98 GB

## Critical architectural finding
The git repository **does not track the Obsidian knowledge vault** (`00_MASTER_CONTEXT/`,
most of `09_dashboards/`, `03_sop/`, etc.). Those canonical markdown files are **untracked**
and exist only in the main working tree. Git tracks only the Node tools + code (525 files, 99 `.md`).

Implication: "updating canonical files" cannot be done via the worktree's git checkout alone,
and writing into the main vault during the soak risks disturbing live state.

## Isolation strategy chosen
1. Created a separate **git worktree** from the safe HEAD (no in-place branch switch, no service disturbance):
   - Path: `D:\AI_WORKSPACE_WORKTREES\ai-workspace-hq-v1`
   - Branch: `feature/ai-workspace-hq-consolidation-v1`
2. The main vault `D:\AI_WORKSPACE` is treated as **READ-ONLY** for this entire task.
3. All deliverables (tools, generated artifacts, updated canonical docs) are authored **in the worktree**.
4. Updated canonical docs are authored under their **real canonical relative paths** in the worktree,
   so they are a reviewable, diff-able, apply-after-soak set. An apply manifest lists exact destinations.
5. Nothing is deployed; the VPS, Master Controller, Telegram/Android runtime, soak timer, ledgers,
   and release tag are never touched.

## Phase 0 backups
- Canonical files + dashboards/SOP/templates markdown copied to:
  `_generated/ai_hq/backups/canonical_20260617_025903/` (771 files, 6.0 MB)
- Checksum manifest: `_generated/ai_hq/backups/canonical_20260617_025903_manifest.sha256`
- Restore-readability: re-verified, **771/771 OK**.

## Invariants held (Phase 0)
```
VPS_CHANGES=0
PRODUCTION_SERVICE_RESTARTS=0
CANONICAL_WRITES=0        (no writes to main vault)
LEADS_CHANGED=0
EMAILS_SENT=0
CLIENT_MESSAGES_SENT=0
SMTP_CALLS=0
AUTOSEND=BLOCKED
SEND_ALLOWED_LIVE=OFF
RELEASE_TAG_UNCHANGED=YES
```
