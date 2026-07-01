# AI HQ context_pack.test — Root Cause Report

date: 2026-06-17
status: FIXED — context_pack.test 26/26, AI HQ run_all 4/4 (two distinct defects closed)

## Reproduction
- Command: `node tools/ai_hq/tests/context_pack.test.mjs` (also via `tools/ai_hq/tests/run_all.mjs`)
- Failing assertion: `4 stale source flagged`
- Actual: no source flagged STALE → assertion false → suite FAIL (3/4 at base e7eccab and e2e14e7)
- Expected: the `obsidian_hq` fixture's `stale_notes.md` flagged STALE
- Base reproduction: confirmed identical failure at base commit (pre-existing, not an Analytics regression)
- Affected file: `tools/ai_hq/context_pack_builder.mjs` (`freshnessOf`)

## Root cause
`freshnessOf()` computed source age **only** from filesystem `mtimeMs`. Git does not preserve mtimes:
after any `git checkout` / `git worktree add`, every file receives the checkout timestamp (≈ NOW).
So `ageDays ≈ 0` for all sources and nothing is ever flagged STALE. The test passed only in
environments where the fixture happened to retain an old on-disk mtime — i.e. it was
**non-deterministic and checkout-dependent**, not a code-vs-test ambiguity. The detection intent
(flagging stale sources) is correct and must be preserved; the *mechanism* was unsound.

## Fix (minimal, strengthening)
- Added `contentDateMs(raw)`: reads an explicit in-content date marker
  (`updated:` / `last_updated:` / `date:` front-matter, or `<!-- updated: YYYY-MM-DD -->`).
- `freshnessOf(mtimeMs, raw)` now prefers the declared content date (deterministic, checkout-independent)
  and falls back to filesystem mtime when no marker is present. Behaviour is otherwise unchanged.
- Fixture `stale_notes.md` carries `<!-- updated: 2026-01-01 -->` → deterministically STALE vs NOW.

## What was NOT changed
- Secret exclusion, sensitive-path exclusion, size limit, deterministic output, source checksums,
  and STALE warning text all preserved. No local fallback added beyond the existing mtime path.
  No test disabled, quarantined, or weakened; no assertion removed; no security rule relaxed.

## Regression added
- `4b stale flagged from content date, not mtime` — proves staleness survives a fresh checkout.
- `4c non-dated source not falsely stale` — proves a marker-less source (PROJECT_PASSPORT) is not
  falsely flagged.

## Verification
- context_pack.test → 22/22 ✓ · AI HQ run_all → 4/4 ✓ · safety.test → 8/8 ✓
- determinism: identical inputs → identical pack sha256 ✓
- Analytics OS run_all → 3/3 (unchanged) ✓

---

## Defect #2 — `validate.mjs` line-ending non-determinism (found by MP38 restore test)

date: 2026-06-17
status: FIXED — context_pack.test 26/26

### Reproduction
- Surfaced only by the MP38 restore test: `git clone` of the Growth OS bundle into a fresh
  checkout (default `core.autocrlf=true` on Windows) → `node tools/ai_hq/tests/context_pack.test.mjs`
  reported 23/24 in the clone while the worktree (LF on disk) reported 24/24.
- Failing assertion: `6 unknown project_id error reported`.
- Actual in clone: validator emitted only `duplicate canonical_target` (errors=1); the
  `unknown project_id: not_a_real_project` error from `unknown.md` was missing.
- Expected: both errors present (errors=2, exit 2), identical to LF behaviour.
- Affected file: `tools/ai_hq/validate.mjs` (`checkDoc`).

### Root cause
`checkDoc()` read each doc with `fs.readFileSync(file, 'utf8')` and matched front-matter with
`/^---\n([\s\S]*?)\n---/` and the `project_id:` extraction against the raw text. On a CRLF
checkout the front-matter block is `---\r\n…\r\n---`, which the `\n`-anchored regex does not match,
so the entire front-matter branch — including `project_id` validation — was **silently skipped**.
Same content, same code, different result per platform / per git `autocrlf` setting: a real
cross-platform determinism defect, not a test artifact. (The `context_pack_builder.mjs` date
regex uses `\s*` and was already CRLF-tolerant; only `validate.mjs` was affected.)

### Fix (minimal, strengthening)
- `checkDoc` now normalizes `\r\n` → `\n` at read time:
  `const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');`
- All downstream regexes (links, front-matter, registry tables) are now line-ending agnostic.
  No assertion weakened; detection is strengthened (CRLF inputs are no longer a blind spot).

### Regression added
- `6d CRLF: duplicate canonical_target error (exit 2)`
- `6d CRLF: unknown project_id still reported` — builds a CRLF copy of the dup fixtures and asserts
  identical errors to the LF run. Verified to FAIL (25/26) when the normalization is reverted.

### Verification
- context_pack.test → 26/26 ✓ · AI HQ run_all → 4/4 ✓ · safety.test → 8/8 ✓
- restore-from-bundle (CRLF clone) → AI HQ context_pack 26/26 ✓ after fix
