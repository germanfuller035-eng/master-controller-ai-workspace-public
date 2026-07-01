# MCP Gateway Security Boundaries V1

## Agent Boundary

Agents do not receive direct MCP configuration, credentials, unrestricted shell, Docker socket, SSH access, production filesystem access, or production DB access.

## Filesystem Boundary

`filesystem_read` resolves paths against the assigned worktree, denies traversal, denies symlink escape, denies binary files by default, enforces max size, and blocks credential-like paths.

## Git Boundary

`git_read` only allows read commands: status, log, show, diff, branch current, and rev-parse. Commit, merge, push, checkout, reset, clean, tag, and rebase are denied.

## Production Boundary

No production MCP server is enabled. Contract-only adapters for GitHub, VPS, MySQL, mail draft, and browser remain OFF and disconnected.

## STOP Boundary

STOP blocks outbound, production, payment, and browser classes before adapter execution.
