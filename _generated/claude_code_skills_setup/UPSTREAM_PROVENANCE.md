# Upstream Provenance

## Official Claude Code Format

Anthropic Claude Code documentation defines project skills at:

```text
.claude/skills/<skill-name>/SKILL.md
```

This scope applies only to the current project. A top-level skill directory may contain referenced Markdown, data, templates, and scripts. No global or personal skill location is used.

Official documentation:

- https://code.claude.com/docs/en/skills

## Context Engineering Skills

- Repository: https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering
- Branch pinned: `main`
- Commit pinned: `25e1fa79a33f0985793bcab3c64dde8d020c5132`
- Commit date: `2026-05-26T01:36:55-04:00`
- Commit subject: `Update README.md`
- License: MIT
- Latest GitHub release observed: `v2.3.0`, released 2026-05-22
- Official individual-skill guidance: copy a skill into the project `.claude/skills/` area.

Installed subset:

- `context-fundamentals`
- `context-degradation`
- `context-compression`
- `context-optimization`
- `filesystem-context`
- `multi-agent-patterns`
- `harness-engineering`

Only `SKILL.md` and text references were included. Python demonstrations, tests, plugin metadata, researcher automation, hosted-agent material, MCP-oriented tool design, and unrelated skills were excluded.

Vendored text uses repository-compatible LF line endings. `SKILLS_LOCK.json` records hashes of the installed normalized files.

## UI UX Pro Max

- Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Branch pinned: `main`
- Commit pinned: `1518fec29d19ce905cd0c689255137b9dcab7ccc`
- Commit date: `2026-06-23T13:00:53+07:00`
- Commit subject: `docs: add CONTRIBUTING.md guide for new contributors (#264)`
- License: MIT
- Latest published GitHub release observed: `v2.5.0`, released 2026-03-10
- Additional tag refs through `v2.6.2` existed, but GitHub still marked `v2.5.0` as the latest published release. The installation is therefore pinned to the reviewed `main` commit, not inferred from an unpublished tag.
- Official Claude template path: `.claude/skills/ui-ux-pro-max/SKILL.md`
- Official CLI template also declares `.claude/skills/ui-ux-pro-max` as the Claude project path.

Installed subset:

- Security-hardened `SKILL.md`
- Local CSV knowledge base
- Local Python search modules
- Jetpack Compose stack dataset

Excluded:

- CLI installer and updater
- plugin and marketplace metadata
- MCP integration
- global install instructions
- other design, brand, slides, and styling skills
- preview, screenshots, binaries, fonts, hooks, and unrelated stack datasets

Vendored text uses repository-compatible LF line endings. The installed UI skill also contains the documented local hardening changes, so installed hashes intentionally differ from the untouched upstream files.
