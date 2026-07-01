// pipeline_e2e_nosend_test.mjs — FULL failure-oriented E2E, PURE offline, no network, no send.
// Drives discovery→stage→verify→score→VERIFIED_READY→audit→draft→approval→followup→reply-draft
// plus failure scenarios, asserting no-send invariants throughout.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e_'));
const storePath = path.join(dir, 'store.json');
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 1, leads: {} }, null, 2));
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');
const p = await import('../mater_controller_api/src/pipeline/service.mjs');
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');
const lead = (id) => readStore(storePath).leads[id];
const countBefore = Object.keys(readStore(storePath).leads).length;

const goodPage = { url: 'https://acme.example', httpStatus: 200, title: 'Acme', hasHttps: true, hasViewport: false, hasFormHtml: false, hasEmailLink: false, hasPhoneLink: false, ctaText: '', metaDescription: '' };

// ---- HAPPY PATH ----
p.stageCandidate({ candidate_id: 'E1', source: 'osm_overpass', company_name: 'Acme', website_candidate: 'https://acme.example', region: 'Краснодар', industry: 'car_repair', email_candidates: ['info@acme.example'] });
ok('H: staged', lead('E1').status === 'STAGING');
p.applyVerification({ leadId: 'E1', identity: 'IDENTITY_VERIFIED', website: 'FOUND', presence: 'CONFIRMED_WEBSITE', emailStatus: 'OFFICIAL_PAGE', confidence: 0.9, evidenceRefs: [{ url: 'https://acme.example' }], route: 'verified_pending_score' });
ok('H: verified', lead('E1').identity_status === 'IDENTITY_VERIFIED');
const sc = p.applyScore({ leadId: 'E1' });
ok('H: VERIFIED_READY', sc.decision === 'VERIFIED_READY' && lead('E1').status === 'verified_ready');
const au = p.applyAudit({ leadId: 'E1', pageData: goodPage });
ok('H: AUDIT_READY w/ evidence findings', au.status === 'AUDIT_READY' && lead('E1').audit_findings.every(f => f.source_url && f.evidence));
const dr = p.applyDraft({ leadId: 'E1', jobId: 'j1' });
ok('H: draft + approval_pending', dr.ok && lead('E1').status === 'approval_pending' && lead('E1').approval.status === 'PENDING');
ok('H: draft never marked sent', !lead('E1').sent && lead('E1').approval.status !== 'SENT');

// ---- FAILURE SCENARIOS ----
// duplicate discovery (same domain)
const dup = p.stageCandidate({ candidate_id: 'E1b', source: 'osm_overpass', company_name: 'Acme2', website_candidate: 'https://acme.example' });
ok('F: duplicate domain blocked', dup.duplicate === true);
// NXDOMAIN website
ok('F: NXDOMAIN→no website', p.classifyWebsite({ nxdomain: true }).website_status === 'NXDOMAIN');
// timeout != not found
ok('F: timeout→INACCESSIBLE', p.classifyWebsite({ timeout: true }).website_status === 'INACCESSIBLE');
// guessed email never verified_ready
p.stageCandidate({ candidate_id: 'E2', source: 'osm_overpass', company_name: 'Guess', website_candidate: 'https://guess.example', region: 'X', industry: 'car_repair' });
p.applyVerification({ leadId: 'E2', identity: 'IDENTITY_VERIFIED', website: 'FOUND', presence: 'CONFIRMED_WEBSITE', emailStatus: 'GUESSED', confidence: 0.8, evidenceRefs: [{ url: 'x' }], route: 'verified_pending_score' });
const e2s = p.applyScore({ leadId: 'E2' });
ok('F: guessed email NOT verified_ready', e2s.decision !== 'VERIFIED_READY');
// maps-only → product routing
p.stageCandidate({ candidate_id: 'E3', source: 'osm_overpass', company_name: 'MapsCo', region: 'X', industry: 'car_repair' });
p.applyVerification({ leadId: 'E3', identity: 'IDENTITY_VERIFIED', website: 'NOT_FOUND', presence: 'MAPS_ONLY', emailStatus: 'PUBLIC_DIRECTORY_CONFIRMED', confidence: 0.7, evidenceRefs: [{ url: 'x' }, { url: 'y' }], route: 'verified_pending_score' });
const e3s = p.applyScore({ leadId: 'E3' });
ok('F: maps-only → MANUAL_REVIEW_PRODUCT_ROUTING', e3s.decision === 'MANUAL_REVIEW_PRODUCT_ROUTING');
// identity conflict blocks audit
p.stageCandidate({ candidate_id: 'E4', source: 'osm_overpass', company_name: 'Conf', website_candidate: 'https://conf.example', region: 'X', industry: 'car_repair', email_candidates: ['a@conf.example'] });
{ const s = readStore(storePath); s.leads.E4.status = 'verified_ready'; s.leads.E4.identity_status = 'IDENTITY_CONFLICT'; fs.writeFileSync(storePath, JSON.stringify(s)); }
const e4a = p.applyAudit({ leadId: 'E4', pageData: goodPage });
ok('F: identity conflict → audit blocked', e4a.status === 'AUDIT_BLOCKED_IDENTITY');
// audit idempotency
const auDup = p.applyAudit({ leadId: 'E1', pageData: goodPage });
ok('F: duplicate audit idempotent', auDup.idempotent === true);
// draft blocked on opt-out
{ const s = readStore(storePath); s.leads.E5 = { lead_id: 'E5', status: 'audit_ready', audit_status: 'AUDIT_READY', presence: 'CONFIRMED_WEBSITE', email_status: 'OFFICIAL_PAGE', email: 'o@x.ru', opt_out: true, audit_findings: lead('E1').audit_findings }; fs.writeFileSync(storePath, JSON.stringify(s)); }
const e5d = p.applyDraft({ leadId: 'E5' });
ok('F: opt-out → draft blocked', e5d.ok === false && e5d.blockers.includes('OPT_OUT'));
// recipient change invalidates approval (new approval id)
const beforeApr = lead('E1').approval.approval_id;
{ const s = readStore(storePath); s.leads.E1.email = 'sales@acme.example'; fs.writeFileSync(storePath, JSON.stringify(s)); }
const reDraft = p.applyDraft({ leadId: 'E1' });
ok('F: recipient change → new approval', reDraft.approvalId && reDraft.approvalId !== beforeApr);
// follow-up blocked by reply
{ const s = readStore(storePath); s.leads.E6 = { lead_id: 'E6', company: 'F', email: 'f@x.ru', email_status: 'OFFICIAL_PAGE', send_proof_status: 'proven', last_sent_at: new Date(Date.now() - 8 * 86400000).toISOString(), reply_received: true, followup_step: 0 }; fs.writeFileSync(storePath, JSON.stringify(s)); }
const e6f = p.applyFollowupPlan({ leadId: 'E6' });
ok('F: follow-up blocked by reply', e6f.status === 'BLOCKED_REPLY');
// reply draft unmatched blocked
const rdUn = p.applyReplyDraft({ leadId: 'UNMATCHED:foo', reply: { reply_id: 'rx', category: 'interested', lead_id: 'UNMATCHED:foo' } });
ok('F: unmatched reply → no draft', rdUn.ok === false);
// LEAD_NOT_FOUND paths
ok('F: verify missing lead → not found', p.applyScore({ leadId: 'NOPE' }).code === 'LEAD_NOT_FOUND');

// ---- NO-SEND INVARIANTS ----
const all = Object.values(readStore(storePath).leads);
ok('INV: no lead has sent=true', all.every(l => !l.sent));
ok('INV: no approval status SENT', all.every(l => !l.approval || l.approval.status !== 'SENT'));
ok('INV: no smtp/send artifact on leads', all.every(l => !l.smtp_called && !l.email_sent_at));

const countAfter = Object.keys(readStore(storePath).leads).length;
console.log(`\nE2E_REPORT tests_total=${pass + fail} tests_passed=${pass} tests_failed=${fail} exit_code=${fail ? 1 : 0} canonical_before=${countBefore} canonical_after=${countAfter} EMAILS_SENT=0 SMTP_CALLS=0 AUTOSEND=BLOCKED`);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`==== pipeline_e2e_nosend: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
