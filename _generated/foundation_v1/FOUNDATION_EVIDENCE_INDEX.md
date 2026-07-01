# Foundation Evidence Index

SESSION_NAME=AI_SYSTEM_FOUNDATION_AND_OWNER_UX_ARCHITECTURE_V1

## Baseline

- `_generated/foundation_v1/FOUNDATION_SESSION_STATE.md`
- `_generated/foundation_v1/FOUNDATION_BASELINE_READ.md`
- `_generated/foundation_v1/FOUNDATION_SCOPE.md`

## Architecture

- `docs/adr/ADR-0001-master-controller-control-plane.md`
- `docs/adr/ADR-0002-canonical-writer-and-state-ownership.md`
- `docs/adr/ADR-0003-agent-runtime-boundaries.md`
- `docs/adr/ADR-0004-tool-access-through-mcp-gateway.md`
- `docs/adr/ADR-0005-risk-based-approvals-r0-r5.md`
- `docs/adr/ADR-0006-feature-flag-lifecycle.md`
- `docs/adr/ADR-0007-owner-interfaces-web-android-telegram.md`
- `docs/adr/ADR-0008-stop-and-emergency-control.md`
- `docs/adr/ADR-0009-data-classification-and-memory-boundaries.md`
- `docs/adr/ADR-0010-no-production-runtime-installation-in-foundation.md`
- `docs/architecture/COMPONENT_MAP_V1.md`
- `docs/architecture/CONTROL_PLANE_SEQUENCE_V1.md`
- `docs/architecture/TOOL_GATEWAY_SEQUENCE_V1.md`
- `docs/architecture/TASK_LIFECYCLE_V1.md`
- `docs/architecture/RECOVERY_AND_CHECKPOINTING_V1.md`

## Security And Policy

- `docs/security/DATA_CLASSIFICATION.md`
- `docs/security/MEMORY_BOUNDARIES.md`
- `docs/security/SECRET_HANDLING_V1.md`
- `docs/security/HIGH_RISK_AUDIT_LOG_SPEC.md`
- `docs/policies/RISK_APPROVAL_MODEL_R0_R5.md`
- `docs/policies/APPROVAL_PAYLOAD_HASHING.md`
- `docs/policies/OWNER_APPROVAL_CONTRACT.md`
- `docs/policies/STOP_ALL_AGENTS_CONTRACT.md`

## Owner Interfaces And Rollout

- `docs/owner_interfaces/WEB_COMMAND_CENTER_IA_V1.md`
- `docs/owner_interfaces/ANDROID_ALIGNMENT_V1.md`
- `docs/owner_interfaces/TELEGRAM_RESERVE_CHANNEL_V1.md`
- `docs/owner_interfaces/VOICE_PUSH_TO_TALK_V1.md`
- `docs/owner_interfaces/OWNER_DAILY_BRIEF_V1.md`
- `docs/owner_interfaces/APPROVALS_AND_STOP_UX_V1.md`
- `docs/feature_flags/AI_SYSTEM_FEATURE_FLAGS_V1.md`
- `docs/release/FOUNDATION_ROLLOUT_PLAN.md`

## Registries And Schemas

- `.claude/agents/AGENTS_LOCK.json`
- `.claude/skills/SKILLS_LOCK.json`
- `config/components/COMPONENTS_LOCK.json`
- `config/mcp/MCP_SERVERS_LOCK.json`
- `config/models/MODEL_REGISTRY.json`
- `config/policies/CAPABILITY_MATRIX.json`
- `config/policies/RISK_MODEL_R0_R5.json`
- `config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json`
- `schemas/foundation/`
- `tools/foundation/validate_foundation.py`

## Validation

- `_generated/foundation_v1/FOUNDATION_VALIDATION_RESULTS.md`
- `python tools/foundation/validate_foundation.py` result: PASS
- `git diff --check` result: PASS
- light secret-value scan result: SECRETS_FOUND=NO

## Handoff

- `_generated/foundation_v1/FOUNDATION_FINAL_REPORT.md`
- `_generated/foundation_v1/FOUNDATION_ROLLBACK.md`
- `_generated/foundation_v1/FOUNDATION_HANDOFF.md`
- `_generated/foundation_v1/FOUNDATION_KNOWN_LIMITATIONS.md`
