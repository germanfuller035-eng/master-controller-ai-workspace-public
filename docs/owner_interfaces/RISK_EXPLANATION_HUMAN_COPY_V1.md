# Risk Explanation Human Copy V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1

R0: I am only reading or analyzing allowed evidence.

R1: I am only creating local tests, reports, or drafts.

R2: I am changing files in a worktree or preparing a commit/PR with a journal.

R3: I am making a low-risk internal change that needs a policy gate.

R4: I am about to send, publish, deploy, write production data, or use browser actions. You must approve this exact payload hash.

R5: I am about to do a payment, deletion, permission change, secret issuance, direct secret read, or irreversible action. Strong one-time approval is required.
