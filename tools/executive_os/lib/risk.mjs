// tools/executive_os/lib/risk.mjs
// Phase 15: Executive Risk Register. Aggregates domain risks by REFERENCE (no duplication of detail).
import { SEVERITY } from './common.mjs';

export const RISK_CATEGORIES = ['strategic', 'revenue', 'delivery', 'finance', 'operational', 'security', 'infrastructure', 'data_quality', 'compliance', 'capacity', 'concentration', 'dependency', 'continuity', 'owner_availability'];

const SEV_SCORE = { low: 1, medium: 2, high: 3 };

// domainRisks: [{source_system, source_risk_id, category, probability, impact, trigger, mitigation, owner, status}]
export function aggregateRisks(domainRisks) {
  const errors = [];
  const out = domainRisks.map((r) => {
    const sev = (SEV_SCORE[r.probability] || 1) * (SEV_SCORE[r.impact] || 1);
    const severity = sev >= 6 ? 'CRITICAL' : sev >= 4 ? 'HIGH' : sev >= 2 ? 'MEDIUM' : 'LOW';
    if (!RISK_CATEGORIES.includes(r.category)) errors.push(`unknown risk category ${r.category}`);
    return {
      risk_id: `exec_${r.source_system}_${r.source_risk_id}`,
      source_system: r.source_system,
      source_risk_id: r.source_risk_id,           // reference, not full copy
      category: r.category,
      probability: r.probability, impact: r.impact, severity,
      trigger: r.trigger || null,
      mitigation_ref: r.mitigation ? 'see source system' : 'MISSING',
      owner: r.owner || 'owner',
      status: r.status || 'OPEN',
      executive_action: severity === 'CRITICAL' ? 'immediate owner attention' : (severity === 'HIGH' ? 'this week' : 'monitor'),
    };
  });
  return {
    ok: errors.length === 0, errors,
    total: out.length,
    by_severity: { CRITICAL: out.filter((r) => r.severity === 'CRITICAL').length, HIGH: out.filter((r) => r.severity === 'HIGH').length, MEDIUM: out.filter((r) => r.severity === 'MEDIUM').length, LOW: out.filter((r) => r.severity === 'LOW').length },
    critical: out.filter((r) => r.severity === 'CRITICAL'),
    risks: out,
    note: 'Executive register references source risks; full detail stays in domain systems.',
  };
}
