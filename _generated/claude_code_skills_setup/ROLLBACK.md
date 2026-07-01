# Rollback

This rollback affects only `feature/claude-code-skills-setup-v1` and project-local files from this stage.

## Preferred Rollback After Commit

Create a normal inverse commit:

```powershell
git log --oneline -- _generated/claude_code_skills_setup .claude
git revert <skills-setup-commit>
git status --short
git diff --check
```

Do not use `git reset --hard`, `git clean`, another worktree, or global Claude paths.

## Exact Project-Local Removal Set

If the setup is still uncommitted, remove only:

```text
.claude/skills/context-fundamentals/
.claude/skills/context-degradation/
.claude/skills/context-compression/
.claude/skills/context-optimization/
.claude/skills/filesystem-context/
.claude/skills/multi-agent-patterns/
.claude/skills/harness-engineering/
.claude/skills/ui-ux-pro-max/
.claude/skills/SKILLS_LOCK.json
.claude/PROJECT_SKILL_GUARDRAILS.md
_generated/claude_code_skills_setup/
```

Then verify:

```powershell
git status --short
git diff --stat
git diff --check
git diff -- .claude _generated/claude_code_skills_setup
```

The previous repository state is commit:

```text
6f9f9ad296aadd966dd0adc045369f921289d16d
```

To restore that content without rewriting history, revert the setup commit. Do not delete or modify `%USERPROFILE%\.claude`, `%APPDATA%`, `%LOCALAPPDATA%`, Program Files, or any global package because this stage did not touch them.
