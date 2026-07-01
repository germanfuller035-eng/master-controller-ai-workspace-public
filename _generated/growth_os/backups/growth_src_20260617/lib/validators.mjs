// tools/growth_os/lib/validators.mjs
// Growth OS validators (MP28 QA + MP35). Read-only, deterministic.
// Hard blockers enforce: supported claims, product readiness, approved price, no real contacts,
// opt-out present, measurement + stop criteria, capacity-known-if-READY, no publish/send/track/prod.
import { CAMPAIGN_ACTIVE_ALLOWED, EXPERIMENT_RUNNING_ALLOWED } from './common.mjs';

const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)(?!.*acme\.test)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
const PHONE_RX = /(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;

// --- product readiness map from Revenue catalog (ACTIVE + approved price => marketable) ---
export function readinessMap(catalog) {
  const m = {};
  for (const p of (catalog.products || [])) {
    const lifecycle = p.status || p.state;
    const approved = p.price && p.price.approved_by_owner === true;
    m[p.product_id] = { state: lifecycle, approved, marketable: (lifecycle === 'ACTIVE' && approved) };
  }
  return m;
}

// --- claim validator: prohibited_claims must not appear in claims ---
export function validateClaims(positioning) {
  const errors = [];
  const prohibited = (positioning.prohibited_claims || []).map((s) => s.toLowerCase());
  for (const c of positioning.claims || []) {
    const lc = String(c).toLowerCase();
    if (prohibited.some((p) => lc.includes(p) || p.includes(lc))) errors.push(`${positioning.positioning_id}: claim "${c}" overlaps a prohibited claim`);
    if (/guarantee|guaranteed|гаранти|#1|рост на \d/i.test(c)) errors.push(`${positioning.positioning_id}: claim "${c}" is an unsupported guarantee`);
  }
  return errors;
}

// --- ICP validator: PLANNED/unapproved product cannot be READY_TO_MARKET ---
export function validateICP(icp, rmap) {
  const errors = [];
  const r = rmap[icp.product_id];
  if (icp.READY_TO_MARKET === true && (!r || !r.marketable)) errors.push(`${icp.icp_id}: READY_TO_MARKET=true but product ${icp.product_id} not ACTIVE+approved`);
  if (!Array.isArray(icp.must_have) || !icp.must_have.length) errors.push(`${icp.icp_id}: no must_have`);
  if (!Array.isArray(icp.disqualifiers) || !icp.disqualifiers.length) errors.push(`${icp.icp_id}: no disqualifiers`);
  return errors;
}

// --- campaign validator: test_only, not ACTIVE, has measurement + stop criteria ---
export function validateCampaign(c, rmap) {
  const errors = [];
  if (c.test_only !== true) errors.push(`${c.campaign_id}: not test_only`);
  if (c.status === 'ACTIVE' && !CAMPAIGN_ACTIVE_ALLOWED) errors.push(`${c.campaign_id}: ACTIVE prohibited this task`);
  if (c.status === 'READY' || c.status === 'MEASUREMENT_READY') {
    if (!c.metrics || !c.metrics.length) errors.push(`${c.campaign_id}: READY without metrics`);
    if (!c.stop_gate && !c.stop_criteria) errors.push(`${c.campaign_id}: READY without stop criteria`);
  }
  // product readiness for a READY campaign
  if (c.status === 'READY') {
    for (const pid of c.product_ids || []) if (rmap[pid] && !rmap[pid].marketable) errors.push(`${c.campaign_id}: READY but product ${pid} not marketable`);
  }
  return errors;
}

// --- asset/content/landing/lead-magnet: must not be published; no real contacts ---
export function validateNotPublished(obj, idField) {
  const errors = [];
  if (obj.published !== false) errors.push(`${obj[idField]}: published must be false`);
  const json = JSON.stringify(obj);
  if (REAL_EMAIL_RX.test(json)) errors.push(`${obj[idField]}: contains a real email`);
  if (PHONE_RX.test(json)) errors.push(`${obj[idField]}: contains a real phone`);
  return errors;
}

// --- landing: needs price status + privacy + no tracking + no production form ---
export function validateLanding(l) {
  const errors = [...validateNotPublished(l, 'landing_id')];
  if (!l.price_status) errors.push(`${l.landing_id}: missing price_status`);
  if (!l.privacy_note) errors.push(`${l.landing_id}: missing privacy note`);
  if (l.tracking !== false) errors.push(`${l.landing_id}: tracking must be false`);
  if (l.form_connected !== false) errors.push(`${l.landing_id}: form_connected must be false`);
  if (l.readiness === 'READY') {
    if (!/CONFIRMED/.test(l.price_status)) errors.push(`${l.landing_id}: READY but price not CONFIRMED`);
  }
  return errors;
}

// --- referral: requires permission + eligibility, no auto-request ---
export function validateReferral(policy) {
  const errors = [];
  if (policy.auto_request !== false) errors.push('referral: auto_request must be false');
  if (!policy.eligibility || !policy.eligibility.includes('customer permission')) errors.push('referral: customer permission not required');
  return errors;
}

// --- social proof: no publication without permission ---
export function validateSocialProof(sp) {
  const errors = [];
  if (sp.published !== false) errors.push(`${sp.proof_id}: published must be false`);
  if (sp.type !== 'anonymized_case' && sp.permission !== 'OBTAINED' && /testimonial|named_case|quote|logo/.test(sp.type)) {
    if (sp.status !== 'BLOCKED_NO_PERMISSION' && sp.permission !== 'n/a (synthetic, not real client)') errors.push(`${sp.proof_id}: real proof without obtained permission`);
  }
  return errors;
}

// --- experiment: never RUNNING ---
export function validateExperiment(e) {
  const errors = [];
  if (e.status === 'RUNNING' && !EXPERIMENT_RUNNING_ALLOWED) errors.push(`${e.experiment_id}: RUNNING prohibited`);
  if (!e.primary_metric) errors.push(`${e.experiment_id}: no primary metric`);
  if (!Array.isArray(e.guardrails)) errors.push(`${e.experiment_id}: no guardrails array`);
  return errors;
}

// --- controlled cycle: must not be executing ---
export function validateControlledCycle(rb) {
  const errors = [];
  if (rb.execution_state?.cycle_started !== false) errors.push('controlled cycle: cycle_started must be false');
  if (rb.execution_state?.running_allowed !== false) errors.push('controlled cycle: running_allowed must be false');
  if (rb.rules?.send !== false) errors.push('controlled cycle: send must be false');
  return errors;
}
