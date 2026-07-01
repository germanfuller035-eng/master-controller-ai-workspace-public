// tools/consolidation_os/lib/validators.mjs
// MP45 — consolidation validators + safety boundary. Pure, offline.
import {
  NETWORK_ALLOWED, PRODUCTION_ACCESS_ALLOWED, PRODUCTION_CANONICAL_WRITE_ALLOWED, SEND_ALLOWED,
  DEPLOY_ALLOWED, PRODUCTION_BRANCH_MERGE_ALLOWED, TAG_CREATE_ALLOWED, TAG_MOVE_ALLOWED,
  GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED, BRANCH_DELETE_ALLOWED, WORKTREE_DELETE_ALLOWED, FILE_DELETE_ALLOWED,
} from './common.mjs';

export function validateAncestry(proof) {
  const e = [];
  if (proof.result?.FULL_CHAIN_LINEAR !== 'YES') e.push('chain not linear');
  if (proof.result?.ALL_REQUIRED_HEADS_INCLUDED !== 'YES') e.push('not all heads included');
  if (proof.result?.LOST_COMMITS !== 0) e.push('lost commits detected');
  for (const c of proof.chain || []) if (!c.is_ancestor_of_a6048a8) e.push(`${c.system}: not ancestor`);
  return e;
}
export function validateSystemRegistry(reg) {
  const e = [];
  const ids = new Set();
  for (const s of reg.systems || []) {
    if (!s.system_id) e.push('system missing id');
    if (ids.has(s.system_id)) e.push(`duplicate system_id: ${s.system_id}`);
    ids.add(s.system_id);
    if (!s.canonical_source) e.push(`${s.system_id}: missing canonical_source`);
    if (s.status === 'ACTIVE_IN_PRODUCTION' && !/production|active|released/i.test(s.production_status || '')) e.push(`${s.system_id}: ACTIVE_IN_PRODUCTION without evidence`);
  }
  return e;
}
export function validateSourceOfTruth(reg) {
  const e = [];
  const m = reg.source_of_truth_matrix || {};
  const writers = new Map();
  for (const ent of m.entities || []) {
    if (!ent.canonical_writer) e.push(`${ent.entity}: missing canonical_writer`);
    if (Array.isArray(ent.canonical_writer)) e.push(`${ent.entity}: multiple writers`);
  }
  if (m.duplicate_canonical_writers !== 0) e.push('duplicate canonical writers present');
  return e;
}
export function validateDocCollisions(doc) {
  const e = [];
  if (doc.totals?.collisions !== 0) e.push('doc collisions present');
  if (doc.totals?.exact_duplicate_content !== 0) e.push('exact duplicate docs present');
  if (doc.result?.DESTRUCTIVE_COLLISION === true) e.push('destructive collision');
  return e;
}
export function validateDecisions(gov) {
  const e = [];
  for (const d of gov.owner_decision_backlog || []) {
    if (!d.decision_id) e.push('decision missing id');
    if (!d.owner_status) e.push(`${d.decision_id}: missing owner_status`);
    // consolidation must not resolve owner decisions itself
    if (d.owner_status === 'RESOLVED' && !d.resolved_by_owner) e.push(`${d.decision_id}: resolved without owner`);
  }
  if ((gov.decision_summary?.blocking_consolidation || 0) !== 0) e.push('a decision blocks consolidation (should be 0)');
  return e;
}
export function validateProductReconciliation(gov) {
  const e = [];
  const p = gov.product_reconciliation || {};
  if (p.mini_audit && p.mini_audit.price !== '10000 RUB CONFIRMED') e.push('mini audit price changed');
  if (p.mini_audit && p.mini_audit.detailed_stages !== 18) e.push('mini audit stages != 18');
  if (p.mini_audit && p.mini_audit.macro_phases !== 5) e.push('mini audit macro != 5');
  return e;
}
export function validateReleaseCandidate(rc) {
  const e = [];
  if (rc.production_changes !== 0) e.push('release candidate shows production changes');
  if (!/NONE/.test(rc.release_tag)) e.push('release tag should not be created');
  if (rc.status !== 'CANONICAL_CONSOLIDATION_CANDIDATE') e.push('bad candidate status');
  return e;
}

export function validateSafetyInvariants() {
  const e = [];
  const must = {
    NETWORK_ALLOWED, PRODUCTION_ACCESS_ALLOWED, PRODUCTION_CANONICAL_WRITE_ALLOWED, SEND_ALLOWED,
    DEPLOY_ALLOWED, PRODUCTION_BRANCH_MERGE_ALLOWED, TAG_CREATE_ALLOWED, TAG_MOVE_ALLOWED,
    GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED, BRANCH_DELETE_ALLOWED, WORKTREE_DELETE_ALLOWED, FILE_DELETE_ALLOWED,
  };
  for (const [k, v] of Object.entries(must)) if (v !== false) e.push(`${k} must be false`);
  return e;
}

export function validateAll(ds) {
  const dims = {}; let blockers = 0;
  const add = (n, errs) => { dims[n] = errs.length === 0 ? 'PASS' : `FAIL(${errs.length})`; blockers += errs.length; };
  add('safety_invariants', validateSafetyInvariants());
  add('ancestry', validateAncestry(ds.ancestry || {}));
  add('system_registry', validateSystemRegistry(ds.system_registry || {}));
  add('source_of_truth', validateSourceOfTruth(ds.system_registry || {}));
  add('doc_collisions', validateDocCollisions(ds.docs || {}));
  add('decisions', validateDecisions(ds.governance || {}));
  add('product_reconciliation', validateProductReconciliation(ds.governance || {}));
  add('release_candidate', validateReleaseCandidate(ds.release_candidate || { production_changes: 0, release_tag: 'NONE', status: 'CANONICAL_CONSOLIDATION_CANDIDATE' }));
  return { blockers, dimensions: dims };
}
