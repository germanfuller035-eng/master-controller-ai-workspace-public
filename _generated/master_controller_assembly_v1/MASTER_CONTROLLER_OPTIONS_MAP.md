# Master Controller Options Map

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1

## Classification Key

- A. WORKING_NOW
- B. VISIBLE_DRAFT_ONLY
- C. CONTRACT_ONLY
- D. DISABLED_UNTIL_OWNER_GATE
- E. NOT_IMPORTED_YET

| Option | Class | Current owner-visible status | Notes |
| --- | --- | --- | --- |
| Sales MVP | A. WORKING_NOW | Visible in Android via Today, Commercial, Leads and local `Working Sales MVP` screen | Manual/demo lead to approval packet is local and deterministic. |
| Manual lead | A. WORKING_NOW | Editable local fields in Android | Backend POST `/leads/manual` is not connected. |
| Qualification | A. WORKING_NOW | Fit score, readiness, missing data and reason visible | Local deterministic logic. |
| Mini audit / digital presence draft | A. WORKING_NOW | Issues, assumptions and evidence source visible | Manual/synthetic facts only, no scraping. |
| Product strategy | A. WORKING_NOW | Selected product and product-fit reason visible | Not always Mini Audit. |
| Offer draft | A. WORKING_NOW | Offer preview card visible | Draft only, not sent. |
| ROI | A. WORKING_NOW | Assumptions visible | No fake promises or revenue guarantees. |
| QA/red-team | A. WORKING_NOW | Checks and blockers visible | Blocks unsupported claims, fake numbers, send attempts, payment requests, production write. |
| No-send | A. WORKING_NOW | Visible in safety panels and offer packet | Outbound count remains 0. |
| Manual approval packet | A. WORKING_NOW | Visible as manual send readiness / approval packet | Manual owner action required before any future gate. |
| Approvals | B. VISIBLE_DRAFT_ONLY | Existing approval screens plus local approval packet | MVP packet does not write backend approval. |
| Cost/radar | B. VISIBLE_DRAFT_ONLY | Existing cost and knowledge/radar owner screens | Read-only; no paid action. |
| Agents | B. VISIBLE_DRAFT_ONLY | Existing agent screens | Read-only/no-send in this session. |
| MCP | C. CONTRACT_ONLY | Not changed in Android sales MVP | No MCP gateway connected here. |
| Memory | B. VISIBLE_DRAFT_ONLY | Used as local evidence, not product feature | No runtime memory write. |
| Knowledge | B. VISIBLE_DRAFT_ONLY | Existing Knowledge Radar screen | Read-only. |
| Multichannel | D. DISABLED_UNTIL_OWNER_GATE | Existing multichannel owner UI | No outbound or channel send. |
| Browser automation | D. DISABLED_UNTIL_OWNER_GATE | Not used | No browser/social automation connected. |
| Voice | E. NOT_IMPORTED_YET | Not visible in this MVP | Out of scope. |
| CRM/payment/mail | D. DISABLED_UNTIL_OWNER_GATE | Explicitly shown as not connected | No send, no payment, no production write. |
| Backup/recovery | B. VISIBLE_DRAFT_ONLY | Existing owner control surfaces | Not modified. |
| STOP | A. WORKING_NOW | Existing STOP/safety surfaces plus MVP safety panels | No-send/no-payment/no-production-write visible. |
| Production deploy | D. DISABLED_UNTIL_OWNER_GATE | Not performed | VPS/DNS/Caddy/backend unchanged. |
| Payments | D. DISABLED_UNTIL_OWNER_GATE | Payment OFF visible | Payment count remains 0. |
