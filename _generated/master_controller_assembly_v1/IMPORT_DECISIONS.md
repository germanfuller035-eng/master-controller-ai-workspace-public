# Import Decisions

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1
ALLOWED_IMPORT_ROOT=D:\AI_WORKSPACE\_IMPORT_CANDIDATES

## Summary

No files were copied from import candidates. Only small ideas were reimplemented locally:

- manual lead/company/domain field shape;
- owner approval packet wording;
- no-send / no-payment / no-production-write safety language;
- product-fit reason pattern;
- cost/radar/reliability as option classes, not new runtime behavior.

## Decisions

| Source candidate | File or idea | Imported | Reason | Target file | Risk | Production actions imported |
| --- | --- | --- | --- | --- | --- | --- |
| production-activation-completion-v1 | `core/model/ManualLeadDtos.kt` field shape for company/website/manual no-send entry | YES as idea only | Helps local manual lead UI without connecting backend endpoint. | `feature/sales/WorkingSalesMvpEngine.kt`, `WorkingSalesMvpScreen.kt` | LOW | NO |
| production-activation-completion-v1 | `tools/mater_controller_api/src/leads/manual_intake.mjs` URL/company validation concept | YES as idea only | Confirms manual owner input must be validated/staged and no-send; no endpoint copied. | `feature/sales/WorkingSalesMvpEngine.kt` | LOW | NO |
| production-activation-completion-v1 | `tools/mater_controller_api/src/commercial/offer_preview.mjs` / offer-preview concept | YES as idea only | Local offer draft preview is owner-visible, but no API or send path is copied. | `feature/sales/WorkingSalesMvpScreen.kt` | LOW | NO |
| production-activation-completion-v1 | First-touch package / no-send owner package concept | YES as idea only | Used to shape approval packet language; no first-touch service copied. | `feature/sales/WorkingSalesMvpEngine.kt` | LOW | NO |
| production-activation-completion-v1 | Product catalog / Mini Audit detail screens | NO | Current app already has catalog/miniaudit screens; local MVP only needs product-fit reason. | N/A | MEDIUM if bulk copied | NO |
| integration-wave-1-commercial-core-v1 | Commercial no-send owner acceptance, product catalog, Mini Audit detail | NO | Not present as a compacted candidate bundle after cleanup; current app already contains related code. | N/A | N/A | NO |
| continuous-commercial-agent-shadow-v1 | Continuous no-send multi-lead E2E, agent/queue routes | NO | Not present as a compacted candidate bundle after cleanup. | N/A | N/A | NO |
| owner-command-autonomy-center-v1 | Cost, reliability, backup, owner controls surfaces | NO source copy | Current app already contains these surfaces; dirty candidate files were forbidden runtime data. | N/A | MEDIUM | NO |
| owner-command-autonomy-center-v1 | Dirty `devices.json` / `pairing.json` | NO | Explicitly forbidden runtime/device data. | N/A | HIGH | NO |
| ai-intelligence-cost-radar-android-rc4-v1 | AI cost screen / Knowledge Radar labels | NO | Not present as compacted bundle; current app already has cost/knowledge screens. | N/A | N/A | NO |

## Guardrails Applied

- No bundle checkout.
- No cherry-pick.
- No `.env`, credential, APK/AAB, device or pairing file copied.
- No production activation code connected.
- No send/write/payment code path added.
