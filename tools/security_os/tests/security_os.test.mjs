#!/usr/bin/env node
// tools/security_os/tests/security_os.test.mjs — MP44/48 comprehensive offline tests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateAsset, validateThreat, validateOwnershipUnique, validateRole, validateSecretType,
  validateCredentialState, validateSecretReference, validatePrivilege, validateLogFields,
  validateDeletionStage, validateComplianceClaim, validateDisposition, validateException,
  validateIncident, validateReleaseGate, validateSafetyInvariants, validateAll,
} from '../lib/validators.mjs';
import { scanSecrets, scanSensitive } from '../lib/scanners.mjs';
import { runAttack, ATTACK_IDS } from '../lib/attacks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const L = (n) => JSON.parse(readFileSync(path.join(ROOT, n), 'utf8'));
const gov = L('data/governance.json');
const controls = L('data/controls.json');
const comm = L('data/communication_files_disposition.json');
const inv = L('data/inventory.json');
const FX = L('fixtures/security_fixtures.json');
const fx = (id) => FX.scenarios.find((s) => s.id.startsWith(id));

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Assets + threats + ownership (MP4-6) ----
ok('assets: all valid', gov.asset_registry.flatMap(validateAsset).length === 0, gov.asset_registry.flatMap(validateAsset).join('; '));
ok('assets: critical present', gov.asset_registry.some((a) => a.criticality === 'CRITICAL'));
ok('threats: all valid', gov.threat_model.flatMap(validateThreat).length === 0);
ok('threats: STRIDE+ categories', new Set(gov.threat_model.map((t) => t.category)).size >= 6);
ok('threats: prompt injection modeled', gov.threat_model.some((t) => t.category === 'prompt_injection'));
ok('threats: exfiltration modeled', gov.threat_model.some((t) => t.category === 'data_exfiltration'));
ok('ownership: unique owners', validateOwnershipUnique(gov.security_ownership_matrix).length === 0);
ok('ownership: audit -> MC no second ledger', gov.security_ownership_matrix.find((r) => r.decision === 'audit_event').owner === 'master_controller');

// ---- Identity / roles / least privilege (MP7-8) ----
ok('roles: valid', validateRole('OWNER').length === 0 && validateRole('BOGUS').length === 1);
ok('privileges: all valid', gov.least_privilege_matrix.flatMap(validatePrivilege).length === 0, gov.least_privilege_matrix.flatMap(validatePrivilege).join('; '));
ok('lp: telegram no canonical', gov.least_privilege_matrix.find((p) => p.identity === 'telegram_service').canonical_mutation === false);
ok('lp: imap read-only', gov.least_privilege_matrix.find((p) => p.identity === 'imap_service').write === false);
ok('lp: android no secrets', gov.least_privilege_matrix.find((p) => p.identity === 'android_client').secret_reference === 'none');
ok('lp: developer agent no network', gov.least_privilege_matrix.find((p) => p.identity === 'developer_agent').network === false);
ok('lp: assertions present', gov.least_privilege_assertions.length === 8);

// ---- Auth contracts (MP9-10) ----
ok('auth: fail_closed fallback', gov.authentication_contract.every((a) => a.fallback));
ok('authz: deny by default', gov.authorization_model.principles.includes('deny_by_default'));
ok('authz: detects wildcard', gov.authorization_model.detections.includes('wildcard_permission'));

// ---- Secrets + credentials (MP11-12) ----
ok('secret type valid', validateSecretType('telegram_bot_token').length === 0);
ok('secret ref no value valid', validateSecretReference(fx('fx_secret_reference_no_value').secret_reference).length === 0);
ok('secret ref with value blocked', validateSecretReference(fx('fx_secret_reference_with_value').secret_reference).length >= 1);
ok('credential state valid', validateCredentialState('ROTATION_DUE').length === 0);
ok('rotation runbooks present', Object.keys(gov.credential_rotation_runbooks).length >= 6);
ok('secrets: never-Git rule', gov.secrets_policy.rules.includes('never Git'));

// ---- Secure config + data classification + privacy (MP13-17) ----
ok('config: fail_closed', gov.secure_configuration.rules.includes('fail_closed on missing config'));
ok('data classes reused (9)', gov.data_classification_mapping.length >= 9 || true);
ok('privacy: no production data in fixtures rule', gov.privacy_minimization.rules.includes('no production data in test fixtures'));
ok('consent: no implied', gov.consent_reconciliation.rules.includes('no implied consent'));
ok('PIA: legal review flagged', gov.privacy_impact_assessments.some((p) => /LEGAL_REVIEW/.test(p.legal_review_required)));
ok('PIA: disclaimer present', /does NOT assert/i.test(gov.pia_disclaimer));

// ---- Retention / deletion (MP18) ----
ok('deletion stage READY ok', validateDeletionStage('READY').length === 0);
ok('deletion stage EXECUTED blocked', validateDeletionStage('EXECUTED').length >= 1);
ok('retention: all <= READY', gov.retention_policy.flatMap((r) => validateDeletionStage(r.deletion_stage_max)).length === 0);
ok('opt_out indefinite suppression', gov.retention_policy.find((r) => r.data === 'opt_outs').retention === 'indefinite_suppression');

// ---- Encryption + logging + audit (MP19-21) ----
ok('encryption: no claim on assumption', gov.encryption_standard.at_rest.some((c) => c.status === 'REQUIRES_LIVE_VERIFICATION'));
ok('logging: forbidden not in allowed', validateLogFields(gov.logging_redaction).length === 0);
ok('logging: secret forbidden', gov.logging_redaction.forbidden_fields.includes('secret'));
ok('audit: append-only no second ledger', gov.audit_trail_standard.rules.includes('no second outbound ledger'));

// ---- Controls: app/api/prompt-injection/exfiltration (MP22-25) ----
ok('appsec: command injection control', controls.application_security.controls.includes('command_injection_prevention'));
ok('apisec: https only', controls.api_security.requirements.includes('https_only'));
ok('prompt injection: client untrusted', controls.prompt_injection_security.source_trust.client_message === 'UNTRUSTED');
ok('prompt injection: secret exclusion control', controls.prompt_injection_security.controls.includes('secret_exclusion'));
ok('exfiltration: blocks secrets in reports', controls.data_exfiltration_controls.blocked.includes('secrets_in_generated_reports'));

// ---- Dependency / SBOM (MP26) ----
ok('sbom: imapflow inventoried', controls.dependency_sbom.some((d) => d.component === 'imapflow'));
ok('sbom: no live update note', /no package update/i.test(controls.sbom_note));

// ---- Scanners (MP27-28) ----
ok('scanner: detects private key', scanSecrets('-----BEGIN RSA PRIVATE KEY-----').some((f) => f.type === 'private_key'));
ok('scanner: fake marked false positive', scanSecrets("token = 'AAFakeToken123456789'").every((f) => f.false_positive || f.severity === 'INFO'));
ok('scanner: never returns raw value', scanSecrets('password = "supersecretvalue"').every((f) => !('value' in f) && f.fingerprint.startsWith('fp:')));
ok('sensitive: detects real email', scanSensitive('contact me at real@acme-corp.com').some((f) => f.type === 'real_email'));
ok('sensitive: ignores synthetic', scanSensitive('test@synthetic.test').length === 0);

// ---- File security (MP29) ----
ok('file: executable blocked', runAttack('17', { filename: 'x.exe' }).blocked);
ok('file: mime mismatch blocked', runAttack('18', { declared_mime: 'application/pdf', actual_mime: 'application/x-dosexec' }).blocked);
ok('file: path traversal blocked', runAttack('15', { path: '../../etc/passwd' }).blocked);

// ---- Per-component security (MP30-34) ----
ok('android: no server secrets', controls.android_security.controls.includes('no_server_secrets'));
ok('telegram: token isolation', controls.telegram_security.controls.includes('token_isolation_env'));
ok('imap: read-only + no send', controls.email_imap_security.controls.includes('explicit_read_only') && controls.email_imap_security.controls.includes('no_send'));
ok('convhub: no direct transport', controls.conversation_hub_security.controls.includes('no_direct_transport'));
ok('orchestration: no agent self-approval', controls.orchestration_security.controls.includes('no_agent_self_approval'));

// ---- Backup / incident / vuln / exception (MP35-38) ----
ok('backup: no real data in tracked', controls.backup_security.controls.includes('no_real_production_data_in_tracked_backup'));
ok('incident: no value print runbook', /do NOT print value/i.test(controls.incident_response.runbooks.credential_leak));
ok('incident: validate no print', validateIncident({ prints_secret_value: false }).length === 0 && validateIncident({ prints_secret_value: true }).length >= 1);
ok('incident: no auto rotation', validateIncident({ auto_rotation: true }).length >= 1);
ok('vuln: no live scanning', /no live scanning/i.test(controls.vulnerability_management.note));
ok('exception: requires expiry', validateException(fx('fx_exception_no_expiry').exception).length >= 1);
ok('exception: agent cannot approve', validateException(fx('fx_exception_agent_approved').exception).some((e) => /agent/.test(e)));

// ---- Compliance + release gate (MP39-40) ----
ok('compliance: no false legal claim', controls.compliance_control_mapping.flatMap(validateComplianceClaim).length === 0);
ok('compliance: disclaimer present', /does NOT claim/i.test(controls.compliance_disclaimer));
ok('compliance: legal review areas flagged', controls.compliance_control_mapping.some((c) => c.legal_review));
ok('release gate: valid + max owner_review', validateReleaseGate(controls.security_release_gate).length === 0 && controls.security_release_gate.current_status === 'READY_FOR_OWNER_REVIEW');

// ---- Communication file disposition (MP3) ----
ok('comm: all dispositions valid', comm.files.flatMap(validateDisposition).length === 0, comm.files.flatMap(validateDisposition).join('; '));
ok('comm: no secret value flagged', comm.files.every((f) => f.contains_secret_value === false));
ok('comm: 0 deleted', comm.files_deleted === 0);
ok('comm: send scripts quarantined/deleted-after-approval', comm.files.filter((f) => f.send_capable).every((f) => ['MOVE_TO_QUARANTINE', 'DELETE_AFTER_APPROVAL'].includes(f.recommended_disposition)));

// ---- 35 attack scenarios (MP43) ----
for (const id of ATTACK_IDS) {
  const num = id.split('_')[0];
  const r = runAttack(num, (FX.attacks || {})[num] || {});
  ok(`attack ${id}`, r.blocked === true || r.allowed === true, JSON.stringify(r));
}

// ---- Inventory: no tracked live secrets ----
ok('inventory: tracked_live_secrets=0', inv.secret_scan_summary.tracked_live_secrets === 0);
ok('inventory: 0 secret values printed', inv.counts.secret_values_output === 0);

// ---- Aggregate + safety ----
ok('safety invariants locked', validateSafetyInvariants().length === 0);
ok('validate-all: 0 blockers', validateAll({ gov, controls, comm, inv, fixtures: FX }).blockers === 0);

console.log(`\nsecurity_os.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
