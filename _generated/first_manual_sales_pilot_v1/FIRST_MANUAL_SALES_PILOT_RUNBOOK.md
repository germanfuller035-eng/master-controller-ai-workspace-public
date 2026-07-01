# First Manual Sales Pilot Runbook V1

SESSION_NAME=FIRST_MANUAL_SALES_PILOT_V1
WORK_MODE=REAL_OWNER_OPERATIONS_NO_AUTOSEND
MASTER_CONTROLLER_HEAD=7032564d63e9f0754243c8daba569f49f7ab48b8

## Scope

This runbook prepares an owner-controlled pilot for 3 to 5 manually selected leads.

Hard rules:

- Do not send from the system.
- Do not request or process payment.
- Do not write production data.
- Do not connect CRM, mail, Telegram, social, browser automation, or payment systems.
- Do not commit real lead data, contact details, websites, domains, or personal data.
- Use real lead working sheets outside the repo.

## Per-Lead Owner Process

For each lead:

1. Open Android Master Controller.
2. Go to Today/Home.
3. Open Pipeline/Commercial.
4. Add or load the manual/demo lead.
5. Review qualification.
6. Review mini-audit / digital presence draft.
7. Review product strategy.
8. Open Offer Preview.
9. Check ROI assumptions.
10. Run QA checklist manually.
11. Confirm no-send / no-payment / no-production-write.
12. Copy/send message manually outside the app only after owner decision.
13. Record outcome manually.

## Pilot Batch Flow

1. Owner selects 3 to 5 leads outside git.
2. Owner fills one copy of `LEAD_INPUT_TEMPLATE.md` outside the repo per lead.
3. Owner uses Android Master Controller to build a local draft packet.
4. Owner reviews the packet against all templates and checklists in this folder.
5. Owner decides whether to send manually outside the app.
6. Owner records the result outside the repo using `PILOT_RESULT_TRACKER_TEMPLATE.md`.
7. After the batch, owner reviews lessons and decides whether a separate controlled-send gate is worth designing.

## Artifact Index

- `LEAD_INPUT_TEMPLATE.md`
- `QUALIFICATION_TEMPLATE.md`
- `MINI_AUDIT_TEMPLATE.md`
- `PRODUCT_STRATEGY_TEMPLATE.md`
- `OFFER_DRAFT_TEMPLATE.md`
- `ROI_ASSUMPTIONS_TEMPLATE.md`
- `QA_RED_TEAM_CHECKLIST.md`
- `MANUAL_SEND_CHECKLIST.md`
- `PILOT_RESULT_TRACKER_TEMPLATE.md`
- `ANDROID_OPERATOR_GUIDE.md`
- `APP_READINESS_CHECK.md`
- `KNOWN_LIMITATIONS.md`
- `HANDOFF.md`

## Completion Criteria

- Pilot pack created with no real lead data.
- Previous Master Controller readiness evidence remains PASS.
- No outbound, payment, production write, deploy, merge, tag, build, install, or Android smoke was run during this prep.
