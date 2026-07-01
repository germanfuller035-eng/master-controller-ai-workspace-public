# Security Review

Status: PASS

## Review Method

Both official upstream repositories were cloned to `D:\tmp` and reviewed before project installation. No upstream installer, plugin command, package manager, model request, hook, or skill script was executed.

The review covered:

- shell, PowerShell, BAT, Python, Node, and binary files;
- hooks, plugin manifests, MCP references, and auto-run behavior;
- destructive Git and filesystem commands;
- SSH, SCP, deployment, production, and outbound instructions;
- secret and environment access;
- network libraries and hidden network calls;
- global Claude and package-manager installation;
- absolute paths and writes outside the worktree;
- auto-approval and owner-gate bypass;
- obfuscation and binary assets.

## Context Engineering Findings

The full upstream contains executable demonstrations and broad material not required by this task. In particular, hosted-agent examples contain token handling, network cloning, dependency installation, and destructive reset examples. Those components were not installed.

Installed Context Engineering content is instruction-only:

- 7 `SKILL.md` files;
- 6 text reference files;
- no scripts;
- no tests;
- no hooks;
- no plugin or MCP metadata;
- no binaries.

Illustrative mentions of deployment or agent communication are not permissions. Project guardrails keep production, outbound, Git, and owner gates authoritative.

## UI UX Pro Max Findings

The full upstream contains:

- a global npm CLI;
- plugin/marketplace metadata;
- MCP references;
- package installation instructions;
- additional unrelated skills;
- binary fonts and preview assets;
- scripts capable of generating or persisting design-system files.

Hardening actions:

- excluded the CLI, plugins, other skills, fonts, binaries, previews, and repository automation;
- removed package-manager installation instructions from the installed skill;
- removed MCP from the installed activation description;
- restricted the local project scope to audit and guidance;
- made Jetpack Compose and Material 3 the primary Android stack;
- prohibited `--persist` unless a separate task authorizes its output path;
- kept only three reviewed Python modules using the standard library;
- verified no network, subprocess, shell, registry, secret, or home-directory access in those modules;
- retained only the Jetpack Compose stack dataset.

The search modules are not auto-run. They read local CSV files. Persistence support remains dormant and is explicitly gated by project guardrails.

## Result

- Global configuration changed: NO
- Global files touched: 0
- Hooks installed: 0
- MCP servers installed: 0
- Plugins installed: 0
- Secrets read or written: 0
- Network calls from installed code: 0
- Auto-run components: 0
- Production or outbound actions: 0
