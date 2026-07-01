// tools/delivery_os/lib/qa.mjs
// Phase 15: Quality Management System. 6 QA levels, 12 dimensions, quality score + hard blockers.
import { SEVERITY } from './common.mjs';

export const QA_LEVELS = ['automated_validation', 'agent_self_check', 'peer_review', 'owner_review', 'client_review', 'acceptance'];
export const QA_DIMENSIONS = [
  'completeness', 'correctness', 'evidence', 'consistency', 'scope', 'usability',
  'security', 'privacy', 'performance', 'maintainability', 'commercial_fit', 'client_readiness',
];

// Hard blockers that force client_ready=false regardless of score.
const HARD_BLOCKER_RULES = [
  { key: 'missing_deliverable', test: (c) => c.category === 'completeness' && c.status === 'FAIL' },
  { key: 'unsupported_claim', test: (c) => c.category === 'evidence' && c.status === 'FAIL' },
  { key: 'secret_exposure', test: (c) => c.category === 'security' && /secret|credential|token/i.test(c.requirement) && c.status === 'FAIL' },
  { key: 'broken_link', test: (c) => /broken link|404/i.test(c.requirement) && c.status === 'FAIL' },
  { key: 'invalid_output', test: (c) => c.category === 'correctness' && c.status === 'FAIL' },
  { key: 'missing_acceptance', test: (c) => c.category === 'client_readiness' && /acceptance/i.test(c.requirement) && c.status === 'FAIL' },
  { key: 'missing_evidence', test: (c) => c.category === 'evidence' && /missing/i.test(c.requirement) && c.status === 'FAIL' },
  { key: 'unapproved_commercial', test: (c) => c.category === 'commercial_fit' && c.status === 'FAIL' },
  { key: 'guessed_contact', test: (c) => /guessed|unverified contact/i.test(c.requirement) && c.status === 'FAIL' },
  { key: 'send_enabled', test: (c) => /send.*enabled|send_allowed.*true/i.test(c.requirement) && c.status === 'FAIL' },
];

// checks: [{check_id, category, requirement, status, severity, checked_by}]
export function scoreQA(checks) {
  const total = checks.length;
  const fails = checks.filter((c) => c.status === 'FAIL');
  const critical = fails.filter((c) => c.severity === 'CRITICAL');
  const high = fails.filter((c) => c.severity === 'HIGH');
  const warnings = checks.filter((c) => c.status === 'WARNING');

  const hardBlockers = [];
  for (const c of checks) {
    for (const rule of HARD_BLOCKER_RULES) {
      if (rule.test(c)) hardBlockers.push({ rule: rule.key, check_id: c.check_id });
    }
  }

  const passed = checks.filter((c) => c.status === 'PASS').length;
  const score = total ? Math.round((passed / total) * 100) : 0;
  const ownerReviewRequired = critical.length > 0 || high.length > 0 || hardBlockers.length > 0;
  const clientReady = critical.length === 0 && hardBlockers.length === 0 && fails.length === 0;

  return {
    quality_score: score,
    critical_failures: critical.length,
    high_failures: high.length,
    warnings: warnings.length,
    hard_blockers: hardBlockers,
    owner_review_required: ownerReviewRequired,
    client_ready: clientReady,
  };
}

// Build a default QA checklist for a deliverable from product playbook QA dimensions.
export function buildQAChecklist(deliverableId, qaDimensions) {
  return (qaDimensions || QA_DIMENSIONS).map((dim, i) => ({
    check_id: `${deliverableId}_qa${i + 1}`,
    deliverable_id: deliverableId,
    category: QA_DIMENSIONS.includes(dim) ? dim : 'completeness',
    requirement: `${dim} meets standard`,
    status: 'NOT_RUN',
    evidence: null,
    checked_by: 'claude',
    checked_at: null,
    severity: 'MEDIUM',
  }));
}
