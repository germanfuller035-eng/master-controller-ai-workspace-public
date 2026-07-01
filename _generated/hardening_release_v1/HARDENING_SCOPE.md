# Hardening Scope

ALLOWED=local validators, synthetic tests, local reports, rollback bundle, release gate preparation, final commit
FORBIDDEN=tag, merge, deploy, production DB write, production restore, outbound send, payment, DNS change, VPS change, browser action against external services
EDIT_ALLOWLIST=docs/release/**, tools/hardening/**, tests/hardening/**, tests/fixtures/hardening/**, _generated/hardening_release_v1/**, CURRENT_TASK_CHECKPOINT.md
PRODUCTION_CHANGES=NO
