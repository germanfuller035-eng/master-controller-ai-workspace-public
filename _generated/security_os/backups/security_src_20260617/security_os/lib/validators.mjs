// tools/security_os/lib/validators.mjs
// MP47 — validators across the security model + safety boundary. Pure, offline.
import {
  DATA_CLASSES, ROLES, SECRET_TYPES, CREDENTIAL_LIFECYCLE, DELETION_STAGES, COMM_DISPOSITION,
  COMPLIANCE_STATUS, RELEASE_GATE_STATUS, MAX_DELETION_STAGE, LEGAL_ASSERTION_ALLOWED,
  NETWORK_ALLOWED, LIVE_SCAN_ALLOWED, LIVE_PENTEST_ALLOWED, SECRET_USE_ALLOWED, SECRET_PRINT_ALLOWED,
  CREDENTIAL_ROTATION_ALLOWED, PRODUCTION_MUTATION_ALLOWED, CANONICAL_WRITE_ALLOWED, SEND_ALLOWED,
  DEPLOY_ALLOWED, MERGE_ALLOWED, FILE_DELETE_ALLOWED, DOC_APPLY_ALLOWED,
} from './common.mjs';

const inSet = (s, v) => s.includes(v);

export function validateAsset(a) {
  const e = [];
  if (!a.asset_id) e.push('asset_id required');
  if (!a.owner) e.push(`${a.asset_id}: owner required`);
  for (const c of (a.data_classes || [])) if (!inSet(DATA_CLASSES, c)) e.push(`${a.asset_id}: bad data class ${c}`);
  return e;
}
export function validateThreat(t) {
  const e = [];
  if (!t.threat_id) e.push('threat_id required');
  if (!t.mitigation) e.push(`${t.threat_id}: mitigation required`);
  if (!t.owner) e.push(`${t.threat_id}: owner required`);
  return e;
}
export function validateOwnershipUnique(matrix) {
  const e = [];
  const seen = new Map();
  for (const r of matrix) {
    if (!r.owner) e.push(`${r.decision}: missing owner`);
    if (Array.isArray(r.owner)) e.push(`${r.decision}: exactly one owner required`);
  }
  return e;
}
export function validateRole(r) { return inSet(ROLES, r) ? [] : [`bad role: ${r}`]; }
export function validateSecretType(t) { return inSet(SECRET_TYPES, t) ? [] : [`bad secret type: ${t}`]; }
export function validateCredentialState(s) { return inSet(CREDENTIAL_LIFECYCLE, s) ? [] : [`bad credential state: ${s}`]; }

// Secret reference must NOT carry a value.
export function validateSecretReference(ref) {
  const e = [];
  if (ref.value != null || ref.secret != null || ref.plaintext != null) e.push(`${ref.name || 'secret'}: must not carry a value (reference only)`);
  if (!ref.storage_reference) e.push(`${ref.name || 'secret'}: storage_reference required`);
  return e;
}

// Privilege: deny-by-default; flag over-broad grants.
export function validatePrivilege(p) {
  const e = [];
  if (p.send === true && !['vps_worker'].includes(p.identity)) e.push(`${p.identity}: send must be owner_gated/false`);
  if (p.canonical_mutation === true && !['vps_api_service', 'vps_worker'].includes(p.identity)) e.push(`${p.identity}: unexpected canonical_mutation`);
  if (p.network === '*' || p.network === 'any') e.push(`${p.identity}: wildcard network not allowed`);
  return e;
}

// Log redaction: forbidden fields must not appear in allowed list.
export function validateLogFields(spec) {
  const e = [];
  const FORBIDDEN = ['secret', 'token', 'password', 'raw_authorization_header', 'private_key', 'complete_message_body', 'financial_credential', 'attachment_body'];
  for (const f of (spec.allowed_fields || [])) if (FORBIDDEN.includes(f)) e.push(`forbidden field in allowed log fields: ${f}`);
  return e;
}

// Deletion stage cannot exceed READY this task.
export function validateDeletionStage(stage) {
  const e = [];
  if (!inSet(DELETION_STAGES, stage)) { e.push(`bad deletion stage: ${stage}`); return e; }
  if (DELETION_STAGES.indexOf(stage) > DELETION_STAGES.indexOf(MAX_DELETION_STAGE)) e.push(`deletion stage ${stage} exceeds max ${MAX_DELETION_STAGE}`);
  return e;
}

// Compliance: never assert legal compliance.
export function validateComplianceClaim(area) {
  const e = [];
  if (!inSet(COMPLIANCE_STATUS, area.status)) e.push(`${area.area}: bad status ${area.status}`);
  if (/\b(gdpr|152-?фз|152-?fz|iso\s?27001|fully compliant|certified)\b/i.test(JSON.stringify(area)) && !/legal_review/i.test(JSON.stringify(area))) {
    e.push(`${area.area}: legal-compliance claim without legal_review flag`);
  }
  return e;
}

// Communication-file disposition.
export function validateDisposition(f) {
  const e = [];
  if (!inSet(COMM_DISPOSITION, f.recommended_disposition)) e.push(`${f.path}: bad disposition ${f.recommended_disposition}`);
  if (f.recommended_disposition === 'DELETE_AFTER_APPROVAL' && f.owner_approval_required !== true) e.push(`${f.path}: delete requires owner approval`);
  if (f.contains_secret_value === true) e.push(`${f.path}: secret value must not be present`);
  return e;
}

export function validateException(x) {
  const e = [];
  if (!x.expiry) e.push('exception requires expiry');
  if (!x.review) e.push('exception requires review');
  if (x.approved_by === 'agent') e.push('agent cannot approve exception');
  return e;
}

export function validateIncident(i) {
  const e = [];
  if (i.prints_secret_value === true) e.push('incident must not print secret value');
  if (i.auto_rotation === true) e.push('no automatic credential rotation');
  return e;
}

export function validateReleaseGate(g) {
  const e = [];
  if (!inSet(RELEASE_GATE_STATUS, g.current_status)) e.push(`bad gate status: ${g.current_status}`);
  if (g.current_status === 'OWNER_ACCEPTED_REFERENCE' && g.evaluation?.owner_approval !== 'ACCEPTED') e.push('owner accept requires owner_approval=ACCEPTED');
  return e;
}

export function validateSafetyInvariants() {
  const e = [];
  const must = {
    NETWORK_ALLOWED, LIVE_SCAN_ALLOWED, LIVE_PENTEST_ALLOWED, SECRET_USE_ALLOWED, SECRET_PRINT_ALLOWED,
    CREDENTIAL_ROTATION_ALLOWED, PRODUCTION_MUTATION_ALLOWED, CANONICAL_WRITE_ALLOWED, SEND_ALLOWED,
    DEPLOY_ALLOWED, MERGE_ALLOWED, FILE_DELETE_ALLOWED, DOC_APPLY_ALLOWED, LEGAL_ASSERTION_ALLOWED,
  };
  for (const [k, v] of Object.entries(must)) if (v !== false) e.push(`${k} must be false`);
  return e;
}

export function validateAll(ds) {
  const dims = {};
  let blockers = 0;
  const add = (n, errs) => { dims[n] = errs.length === 0 ? 'PASS' : `FAIL(${errs.length})`; blockers += errs.length; };
  add('safety_invariants', validateSafetyInvariants());
  add('assets', (ds.gov?.asset_registry || []).flatMap(validateAsset));
  add('threats', (ds.gov?.threat_model || []).flatMap(validateThreat));
  add('ownership', validateOwnershipUnique(ds.gov?.security_ownership_matrix || []));
  add('privileges', (ds.gov?.least_privilege_matrix || []).flatMap(validatePrivilege));
  add('log_redaction', validateLogFields(ds.gov?.logging_redaction || {}));
  add('compliance_claims', (ds.controls?.compliance_control_mapping || []).flatMap(validateComplianceClaim));
  add('communication_files', (ds.comm?.files || []).flatMap(validateDisposition));
  add('release_gate', validateReleaseGate(ds.controls?.security_release_gate || {}));
  // deletion stages
  const delErrs = (ds.gov?.retention_policy || []).flatMap((r) => validateDeletionStage(r.deletion_stage_max));
  add('retention_deletion', delErrs);
  return { blockers, dimensions: dims };
}
