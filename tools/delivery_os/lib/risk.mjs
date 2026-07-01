// tools/delivery_os/lib/risk.mjs
// Phase 18: Risk register. Build product-default risks; evaluate register.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DELIVERY_ROOT } from './common.mjs';

let TAX = null;
function taxonomy() { if (!TAX) TAX = JSON.parse(readFileSync(path.join(DELIVERY_ROOT, 'data/risk_taxonomy.json'), 'utf8')); return TAX; }
function category(key) { return taxonomy().categories.find((c) => c.key === key) || null; }

export function buildRiskRegister(productId, projectId) {
  const tax = taxonomy();
  const keys = tax.product_defaults[productId] || tax.categories.slice(0, 5).map((c) => c.key);
  return keys.map((k) => {
    const c = category(k);
    return {
      risk_id: `${projectId || 'proj'}_${k}`,
      project_id: projectId || null,
      category: k,
      description: `${k} risk`,
      probability: c ? c.default_probability : 'medium',
      impact: c ? c.default_impact : 'medium',
      mitigation: c ? c.mitigation : 'monitor',
      contingency: c ? c.contingency : 'escalate',
      owner: 'owner',
      status: 'OPEN',
      trigger: c ? c.trigger : null,
    };
  });
}

// Evaluate a register: flag high/high, missing mitigation, triggered risks, open criticals.
export function evaluateRisks(risks) {
  const errors = [];
  const warnings = [];
  const highHigh = risks.filter((r) => r.probability === 'high' && r.impact === 'high');
  const missingMitigation = risks.filter((r) => !r.mitigation || r.mitigation === '');
  const triggered = risks.filter((r) => r.status === 'TRIGGERED');
  const openCritical = risks.filter((r) => r.impact === 'high' && r.status === 'OPEN' && r.probability === 'high');

  for (const r of missingMitigation) errors.push(`risk ${r.risk_id} missing mitigation`);
  for (const r of triggered) warnings.push(`risk ${r.risk_id} TRIGGERED — needs decision`);

  return {
    ok: errors.length === 0,
    errors, warnings,
    total: risks.length,
    high_high: highHigh.map((r) => r.risk_id),
    triggered: triggered.map((r) => r.risk_id),
    open_critical: openCritical.map((r) => r.risk_id),
    // open critical (high/high open) blocks project closure
    blocks_closure: openCritical.length > 0,
  };
}
