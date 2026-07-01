// tools/customer_success_os/lib/feedback.mjs
// Phase 22-25: Feedback system + satisfaction interpretation + review cadence + value review.
import { PERMISSION_STATUS } from './common.mjs';

export const FEEDBACK_TYPES = ['structured_review', 'free_form', 'csat', 'ces', 'nps', 'complaint', 'praise', 'feature_request', 'product_fit', 'delivery_feedback'];

// Phase 22: record feedback (no survey sending; templates only).
export function recordFeedback(input) {
  const errors = [];
  if (!FEEDBACK_TYPES.includes(input.type)) errors.push(`unknown feedback type ${input.type}`);
  return {
    ok: errors.length === 0, errors,
    feedback: {
      feedback_id: input.feedback_id, customer_ref_id: input.customer_ref_id, type: input.type,
      score: input.score ?? null, text_reference: input.text_reference || null,
      source: input.source || 'synthetic', date: input.date || null,
      permission: input.permission || 'NOT_REQUESTED', confidence: input.confidence || (input.text_reference ? 'medium' : 'low'),
      actionability: input.score != null && input.score <= 2 ? 'high' : 'medium',
      follow_up_required: input.type === 'complaint' || (input.score != null && input.score <= 2),
    },
    note: 'No survey sent. Offline templates only.',
  };
}

// Phase 23: satisfaction interpretation rules.
export function interpretSatisfaction(feedbacks) {
  const notes = [];
  for (const f of feedbacks) {
    if (f.score != null && !f.text_reference) notes.push(`${f.feedback_id}: score without comment = limited evidence`);
    if (f.score != null && f.score <= 2) notes.push(`${f.feedback_id}: low score requires review`);
    if (f.score != null && f.score >= 4 && !f.business_outcome_evidence) notes.push(`${f.feedback_id}: high score does NOT prove business outcome`);
    if (f.type === 'complaint') notes.push(`${f.feedback_id}: complaint may concern delivery/product/communication/expectation`);
  }
  const noResponse = feedbacks.length === 0;
  return {
    interpretation: noResponse ? 'UNKNOWN (no response is not dissatisfaction)' : 'see notes',
    notes,
    rules: ['score without comment = limited', 'no response = UNKNOWN not churn', 'payment != satisfaction', 'renewal != success proof', 'churn != always product failure'],
  };
}

// Phase 24: review cadence (future contract, no real scheduling).
export function reviewCadence() {
  return {
    schema: 'cs.review_cadence.v1', label: 'FUTURE_CONTRACT (no real events scheduled)',
    types: ['post_handoff_review', '7_day_review', '30_day_value_review', 'quarterly_review', 'renewal_review', 'incident_review'],
    review_package: ['outcomes', 'adoption', 'open_support', 'risks', 'payment_status_summary', 'product_fit', 'next_actions', 'expansion_if_justified'],
  };
}

// Phase 25: value review engine. No fabricated ROI.
export function valueReview(input) {
  const outcomes = input.outcomes || [];
  const adoptionLevel = input.adoption_level ?? null;
  let verdict;
  const confirmed = outcomes.filter((o) => o.confirmed_by_customer && (o.status === 'ACHIEVED' || o.status === 'PARTIALLY_ACHIEVED'));
  if (!outcomes.length) verdict = 'value_unknown';
  else if (adoptionLevel != null && adoptionLevel < 25) verdict = 'value_blocked_by_adoption';
  else if (confirmed.length && confirmed.every((o) => o.status === 'ACHIEVED')) verdict = 'value_confirmed';
  else if (confirmed.length) verdict = 'value_partially_confirmed';
  else if (outcomes.some((o) => o.status === 'NOT_ACHIEVED')) verdict = 'value_not_achieved';
  else if (outcomes.some((o) => o.status === 'NOT_MEASURABLE')) verdict = 'measurement_unavailable';
  else verdict = 'value_unknown';
  return {
    verdict,
    delivered_value: outcomes.filter((o) => o.status !== 'PROPOSED').length,
    adopted_value: adoptionLevel,
    measured_business_value: confirmed.length ? 'see customer evidence' : 'none confirmed',
    note: 'No fabricated ROI. Business value requires customer evidence.',
  };
}
