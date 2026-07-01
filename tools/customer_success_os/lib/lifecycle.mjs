// tools/customer_success_os/lib/lifecycle.mjs
// Phase 5: Customer lifecycle transition engine. Deterministic. No auto-mutation outside fixtures.
import { LIFECYCLE, TRANSITIONS } from './common.mjs';

// ctx: { accepted, valueEvidence, healthFromPaymentOnly, customerNeed, unresolvedCriticalSupport,
//        testimonialRequested, projectAccepted, casePermission, churnSource }
export function validateTransition(from, to, ctx = {}) {
  const errors = [];
  if (!LIFECYCLE.includes(from)) errors.push(`unknown source state ${from}`);
  if (!LIFECYCLE.includes(to)) errors.push(`unknown target state ${to}`);
  if (errors.length) return { ok: false, errors };
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) errors.push(`illegal transition ${from} -> ${to} (allowed: ${allowed.join(', ') || 'none'})`);

  // Semantic guards.
  if (to === 'ONBOARDING' && ctx.accepted === false && !ctx.staged_onboarding) errors.push('no onboarding before accepted delivery');
  if (to === 'VALUE_REVIEW' && ctx.valueEvidence === false) errors.push('no value claim before evidence');
  if (to === 'HEALTHY' && ctx.healthFromPaymentOnly === true) errors.push('no HEALTHY from payment alone');
  if (to === 'EXPANSION_REVIEW' && !ctx.customerNeed) errors.push('no expansion recommendation without customer need');
  if (to === 'RENEWAL_REVIEW' && ctx.unresolvedCriticalSupport === true) errors.push('no renewal review with unresolved critical support');
  if (to === 'CLOSED' && ctx.unresolvedContractualSupport === true) errors.push('no CLOSED with unresolved contractual support item');
  if (to === 'CHURNED' && !ctx.churnSource) errors.push('no churn classification without source');

  return { ok: errors.length === 0, errors, allowed_next: allowed };
}
