---
type: dashboard
status: canonical
related_project: revenue_os
updated: 2026-06-17
canonical_target: 09_dashboards/revenue_portfolio_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, revenue, prioritization]
---

# Revenue Portfolio & Prioritization (canonical)

> Based only on **confirmed project facts** from the registry/inventory. No invented revenue
> figures. No real client outreach performed. Numbers are separated into
> confirmed / owner-target / AI-estimate / unknown.

## Revenue projects (confirmed facts only)

| Project | Offer | Readiness | Revenue potential | Time to first revenue | Owner effort | Automation readiness | Current blocker | Next milestone | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mini_audit_10k | Paid mini website audit (PDF after payment) | build/test, funnel defined | direct (per-audit) | short (after first paid loop) | medium | high (Telegram/Android approval flow) | first paid send loop not yet proven | one USE_NOW deliverable, no send | medium |
| revenue_os | Sales operating layer / offers ladder | index/summaries | enabler | n/a | low | medium | none | safe dashboards/summaries | medium |
| kgbi_b2b_audit | B2B site audit (КЖБИ) | build/test | direct | medium | medium | medium | confirm deliverable scope | scope confirmation | low |
| edera_rest_mini_audit | Restaurant mini audit | build (paused) | direct | medium | low | medium | go/hold decision | owner decision | low |
| lead_gen_test_jbi | Lead-gen test (JBI Krasnodar) | test (paused) | direct (validation) | medium | medium | medium | outreach approval (owner) | conclude or scale | low |
| lead_hunter | Discovery intelligence (enables all above) | build/test | enabler (multiplier) | n/a | low | medium | external API credentials | credentials decision | medium |

## Number classes (transparency)
- **Confirmed numbers:** none recorded in workspace (no closed-deal ledger present).
- **Owner targets:** Mini Audit positioned as paid deliverable (price set per-funnel by owner).
- **AI estimates:** none asserted (avoid inventing figures).
- **Unknown:** actual conversion rate, average deal size, current pipeline value.

> Owner action: provide confirmed revenue numbers (closed deals, average price) to upgrade this
> from "readiness-based" to "performance-based" prioritization.

## Prioritization model (transparent criteria)
Each criterion scored Low/Med/High from confirmed facts only:
- Speed to revenue · Margin · Readiness · Dependency risk · Owner time · Automation leverage · Legal/operational risk.

| Project | Speed | Margin | Readiness | Dep. risk | Owner time | Automation | Risk | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mini_audit_10k | High | High | Med-High | Low | Med | High | Low | **Top revenue priority** |
| lead_hunter | n/a | n/a | Med | Med (creds) | Low | Med | Low | **Top infrastructure priority** |
| kgbi_b2b_audit | Med | Med | Med | Low | Med | Med | Low | Active, secondary |
| revenue_os | n/a | n/a | Med | Low | Low | Med | Low | Support layer |
| edera_rest_mini_audit | Med | Med | Low | Low | Low | Med | Low | **Candidate to pause/hold** |
| lead_gen_test_jbi | Med | Med | Low | High (approval) | Med | Med | Med | Blocked (approval) |

## Conclusions
- **Top current revenue project:** `mini_audit_10k` (highest readiness × automation × speed; needs first paid-loop proof, no send during freeze).
- **Top infrastructure project:** `lead_hunter` (multiplier for all revenue projects; blocked on owner credentials decision).
- **Top blocked project:** `lead_gen_test_jbi` (outreach approval).
- **Top project to pause:** `edera_rest_mini_audit` (lowest readiness, low urgency).
- **Next 30-day focus:** close soak → owner acceptance → prove one Mini Audit paid loop (no send until approved).

> This prioritization must NOT alter Master Controller production during the soak.

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]]
- [[09_dashboards/project_portfolio_dashboard]]
