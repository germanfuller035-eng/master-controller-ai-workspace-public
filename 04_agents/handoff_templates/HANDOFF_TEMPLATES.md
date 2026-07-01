---
type: templates
status: canonical
related_project: claude_code_integration
updated: 2026-06-17
canonical_target: 04_agents/handoff_templates/HANDOFF_TEMPLATES.md
apply_status: PROPOSED_AFTER_SOAK
tags: [templates, handoff, agents]
---

# Handoff Templates (canonical, parameterized)

One canonical set. Parameterize by `<PROJECT_ID>` — do NOT create per-project copies.
All templates use the handoff schema from [[03_sop/ai_agent_governance_protocol]].

---
## chatgpt_to_claude
```text
TASK_ID: <project>-<seq>
PROJECT_ID: <PROJECT_ID>
AGENT: claude
GOAL: <one sentence>
CURRENT_STATE: <verified status; link context pack>
ALREADY_DONE: <ledger refs>
DO_NOT_REPEAT: <completed items>
FILES_ALLOWED: <paths>
FILES_FORBIDDEN: tools/telegram_gateway, tools/mater_controller_api, tools/master_controller, apps/mater_controller_android, dist/**, 13_sales ledgers, release tag
SAFETY: no VPS, no deploy, no send, autosend BLOCKED
TESTS_REQUIRED: <yes/no + which>
DEPLOYMENT_ALLOWED: no (freeze) | yes (explicit)
OWNER_ACTION: <if any>
DONE_DEFINITION: <measurable>
FINAL_OUTPUT: implementation block + tests + commit hash
```

---
## claude_to_chatgpt
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
AGENT: claude->chatgpt
GOAL: <what was attempted>
RESULT: IMPLEMENTED|TESTED|BLOCKED|PARTIAL
EVIDENCE: <commit, test exit codes, report path>
DO_NOT_REPEAT: <now-complete items>
BLOCKER: <if any>
NEXT_ACTION: <recommended>
OWNER_ACTION: <if any>
```

---
## chatgpt_to_cline
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
AGENT: cline
GOAL: <focused, file-level>
FILES_ALLOWED: <exact files>
FILES_FORBIDDEN: production runtime + ledgers + release artifacts
SAFETY: offline only, no send, no deploy
TESTS_REQUIRED: <which>
DONE_DEFINITION: <measurable>
FINAL_OUTPUT: changed files + test result + short report
```

---
## cline_to_chatgpt
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
AGENT: cline->chatgpt
RESULT: IMPLEMENTED|BLOCKED|PARTIAL
FILES_CHANGED: <list>
TESTS: <exit codes>
BLOCKER: <if any>
NEXT_ACTION: <recommended>
```

---
## failed_task_recovery
```text
TASK_ID: <id> (supersedes <failed_id>)
PROJECT_ID: <PROJECT_ID>
FAILURE_ROOT_CAUSE: <diagnosis, not symptom>
WHAT_WAS_TRIED: <attempts>
NEW_APPROACH: <fundamentally different>
FILES_ALLOWED / FORBIDDEN: <...>
ROLLBACK: <how to revert prior partial work>
DONE_DEFINITION: <...>
```

---
## release_closure
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
RELEASE: <tag>
GATES: tests=<n/n> build=<ok> no-send=<proven> reboot-recovery=<proven>
EVIDENCE: <report paths, commit, tag>
TAG_MOVED: NO
OWNER_ACCEPTANCE: <pending/done>
```

---
## read_only_audit
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
SCOPE: read-only
WRITES_ALLOWED: none (report only)
DELIVERABLE: findings report (no values for secrets)
SAFETY: no mutation, no send, no deploy
```

---
## production_hotfix
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
PRECONDITION: freeze lifted + owner approval REQUIRED
CHANGE: <minimal scoped fix>
TESTS_REQUIRED: targeted regression
DEPLOYMENT_ALLOWED: only after explicit owner approval
ROLLBACK: <exact steps>
LIVE_PROOF_REQUIRED: yes
```

---
## no_send_test
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
GOAL: prove pipeline with SEND blocked
ASSERT: SMTP_CALLS=0, CLIENT_MESSAGES_SENT=0, autosend BLOCKED
EVIDENCE: ledger unchanged + dry-run output
```

---
## owner_acceptance
```text
TASK_ID: <id>
PROJECT_ID: <PROJECT_ID>
CHECKLIST: <link to acceptance checklist>
OWNER_DECISION: ACCEPT|REJECT|NEEDS_CHANGES
NOTES: <owner notes>
```
