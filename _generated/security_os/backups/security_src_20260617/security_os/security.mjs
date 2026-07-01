#!/usr/bin/env node
// tools/security_os/security.mjs — Security / Privacy / Compliance CLI (MP45).
// OFFLINE, deterministic. No network, no secret values, no production mutation, no live scan.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp, loadData, ROLES, SECRET_TYPES, DATA_CLASSES } from './lib/common.mjs';
import { validateAll } from './lib/validators.mjs';
import { runAttack, ATTACK_IDS } from './lib/attacks.mjs';
import { buildDashboard, buildOwnerCenter } from './lib/dashboard.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fixtures() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'security_fixtures.json'), 'utf8')); }
function dataset() { return { gov: loadData('governance.json'), controls: loadData('controls.json'), comm: loadData('communication_files_disposition.json'), inv: loadData('inventory.json'), fixtures: fixtures() }; }

function main() {
  const ds = (cmd && cmd !== 'help') ? dataset() : null;
  switch (cmd) {
    case 'inventory': { console.log(`rows=${ds.inv.rows.length} secret_values_output=${ds.inv.counts.secret_values_output} tracked_live_secrets=${ds.inv.secret_scan_summary.tracked_live_secrets}`); return 0; }
    case 'assets': { ds.gov.asset_registry.forEach((a) => console.log(`  ${a.asset_id} [${a.criticality}] owner=${a.owner}`)); return 0; }
    case 'threats': { ds.gov.threat_model.forEach((t) => console.log(`  ${t.threat_id} ${t.category} ${t.status}`)); return 0; }
    case 'ownership': { ds.gov.security_ownership_matrix.forEach((r) => console.log(`  ${r.decision} -> ${r.owner}`)); return 0; }
    case 'roles': { ROLES.forEach((r) => console.log(`  ${r}`)); return 0; }
    case 'privileges': { ds.gov.least_privilege_matrix.forEach((p) => console.log(`  ${p.identity}: write=${p.write} send=${p.send} canonical=${p.canonical_mutation} network=${p.network}`)); return 0; }
    case 'secrets': { SECRET_TYPES.forEach((s) => console.log(`  ${s}`)); console.log('rules: never Git/report/context/fixture/log; reference only; fingerprint without value'); return 0; }
    case 'credentials': { Object.entries(ds.gov.credential_rotation_runbooks).forEach(([k, v]) => console.log(`  ${k}: ${v.slice(0, 60)}...`)); return 0; }
    case 'data-classes': { DATA_CLASSES.forEach((c) => console.log(`  ${c}`)); return 0; }
    case 'privacy': { ds.gov.privacy_impact_assessments.forEach((p) => console.log(`  ${p.processing_activity}: risk=${p.risk} legal=${p.legal_review_required}`)); return 0; }
    case 'consent': { const c = ds.gov.consent_reconciliation; console.log(`sources=${c.sources.length} purposes=${c.purposes.length} rules: ${c.rules.join('; ')}`); return 0; }
    case 'retention': { ds.gov.retention_policy.forEach((r) => console.log(`  ${r.data}: max_stage=${r.deletion_stage_max}`)); return 0; }
    case 'logs': { const l = ds.gov.logging_redaction; console.log(`allowed=${l.allowed_fields.length} forbidden=${l.forbidden_fields.length}`); return 0; }
    case 'audit': { ds.gov.audit_trail_standard.events.forEach((e) => console.log(`  ${e}`)); return 0; }
    case 'dependencies': { ds.controls.dependency_sbom.forEach((d) => console.log(`  ${d.component}@${d.version} [${d.ecosystem}] ${d.known_review_status}`)); return 0; }
    case 'sbom': { out('sbom.json', ds.controls.dependency_sbom); console.log(`sbom components=${ds.controls.dependency_sbom.length}`); return 0; }
    case 'findings': { console.log('secret_findings=0 (tracked); sensitive: see communication-files; live scan NOT performed'); return 0; }
    case 'vulnerabilities': { const v = ds.controls.vulnerability_management; console.log(`vuln statuses=${v.statuses.length}; no live scanning`); return 0; }
    case 'incidents': { const i = ds.controls.incident_response; console.log(`incident types=${i.types.length} lifecycle=${i.lifecycle.length} runbooks=${Object.keys(i.runbooks).length}`); return 0; }
    case 'exceptions': { const x = ds.controls.security_exceptions; console.log(`exception rules: ${x.rules.join('; ')}`); return 0; }
    case 'communication-files': { const s = ds.comm.summary; console.log(`reviewed=${ds.comm.files_reviewed} deleted=${ds.comm.files_deleted}`); Object.entries(s).forEach(([k, v]) => console.log(`  ${k}: ${v}`)); return 0; }
    case 'release-gate': { const g = ds.controls.security_release_gate; console.log(`release gate: ${g.current_status} (owner_approval=${g.evaluation.owner_approval})`); return 0; }
    case 'attack': { const r = runAttack(sub || '1', (fixtures().attacks || {})[sub] || {}); console.log(`attack ${r.id}: ${r.blocked ? 'BLOCKED' : (r.allowed ? 'ALLOWED(safe)' : 'NOT_BLOCKED')} via ${r.control}`); return (r.blocked || r.allowed) ? 0 : 1; }
    case 'dashboard-refresh': { const d = buildDashboard(ds, TS); const c = buildOwnerCenter(ds, TS); out('security_dashboard.json', d); out('owner_security_command_center.json', c); console.log(`dashboard refreshed assets=${d.critical_assets.length} open_findings=${d.open_findings} release_gate=${d.release_gate} legal_review=${d.controls_requiring_legal_review.length}`); return 0; }
    case 'validate-all': { const r = validateAll(ds); Object.entries(r.dimensions).filter(([, v]) => v !== 'PASS').forEach(([k, v]) => console.log(`  ${k}: ${v}`)); console.log(`validate-all: ${r.blockers === 0 ? 'OK' : 'BLOCKED'} blockers=${r.blockers} dimensions=${Object.keys(r.dimensions).length}`); return r.blockers === 0 ? 0 : 1; }
    default:
      console.error('security: inventory|assets|threats|ownership|roles|privileges|secrets|credentials|data-classes|privacy|consent|retention|logs|audit|dependencies|sbom|findings|vulnerabilities|incidents|exceptions|communication-files|release-gate|attack <id>|dashboard-refresh|validate-all');
      return 3;
  }
}
process.exit(main());
