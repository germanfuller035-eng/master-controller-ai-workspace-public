# AI Operations HQ Toolkit (`tools/ai_hq`)

Local, offline, read-only-by-default tooling for running `D:\AI_WORKSPACE` as a single AI Operations HQ.
Built during **AI WORKSPACE HQ CONSOLIDATION v1** in an isolated worktree, with the Master Controller
`v0.4.0-rc1` production soak frozen and untouched.

## Safety model
- Never writes to the live vault. Generated output goes to `_generated/ai_hq/`.
- Proposed canonical docs live in `docs_canonical_proposed/<real-path>` and are applied only
  post-soak via `apply_canonical.mjs --apply` (owner-gated by `AI_HQ_APPLY_OK=1`).
- Never reads/prints secret values (see `lib/redact.mjs`). No network, no SSH, no SMTP, no send.
- Deterministic: no `Date.now()`/`Math.random()`; timestamps passed via `--ts`/`AI_HQ_TS`.

## Commands (`node tools/ai_hq/hq.mjs <cmd>`)
| Command | What it does |
| --- | --- |
| `workspace-health` | Summary from latest inventory |
| `project-list` | List all registered projects + status/priority |
| `project-status <id>` | Full project record |
| `context-pack <id> --agent <claude\|cline\|chatgpt>` | Build a compact, secret-free context pack |
| `registry-validate` / `links-check` | Validate canonical docs (links, dup canonicals, stale, unknown IDs) |
| `orphans-report` | Classify orphans/duplicates (no deletes) |
| `backup-verify` | Build backup manifest + checksums |
| `git-bundle-create` / `git-bundle-verify <bundle>` | Create/verify full git bundle |
| `secret-scan-safe` | Read-only secret hygiene (locations only) |
| `dashboard-refresh` | Regenerate the operations dashboard from live data |
| `task-ledger-validate` | Validate the anti-loop task ledger |

## Direct tools
- `inventory.mjs` — full read-only workspace inventory → JSON + MD.
- `context_pack_builder.mjs` — per-project/agent context packs.
- `validate.mjs` — canonical doc validator.
- `task_ledger_validate.mjs` — anti-loop ledger validator.
- `file_intake.mjs` — DRY-RUN file intake (hash/dedup/sensitivity/routing). `--apply` is refused.
- `chatgpt_import.mjs` — offline idempotent ChatGPT export → routed notes.
- `orphans.mjs` — orphan/duplicate classifier (no deletes).
- `backup_verify.mjs` — manifest / bundle / verify / restore-test.
- `secret_scan.mjs` — read-only secret hygiene.
- `dashboard.mjs` — operations dashboard generator.
- `apply_canonical.mjs` — apply proposed canonical docs post-soak (owner-gated).

## Tests
`node tools/ai_hq/tests/run_all.mjs` — 4 suites, 57 assertions (inventory, context pack, file
pipeline, safety invariants). All offline, fixtures only, real exit codes.

## Layout
```
tools/ai_hq/
  lib/        common.mjs, redact.mjs, projects.mjs
  fixtures/   ws/ incoming/ chatgpt/ docs_dup/   (fake data for tests)
  tests/      *.test.mjs + run_all.mjs
  *.mjs       tools above
_generated/ai_hq/   inventory/ context_packs/ orphans/ security/ backups/ reports/ task_ledger.jsonl
docs_canonical_proposed/   updated canonical docs (apply post-soak)
```
