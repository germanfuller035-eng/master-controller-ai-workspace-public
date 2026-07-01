// pipeline_audit_draft_offline_test.mjs — PURE offline.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auddr_'));
const storePath = path.join(dir, 'store.json');
const goodLead = {
  lead_id: 'L1', status: 'verified_ready', company: 'Ромашка', presence: 'CONFIRMED_WEBSITE',
  website: 'http://romashka.ru', website_status: 'FOUND', identity_status: 'IDENTITY_VERIFIED',
  email_status: 'OFFICIAL_PAGE', email: 'info@romashka.ru', verification_confidence: 0.9, evidence_refs: ['a','b'],
};
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 1, leads: { L1: { ...goodLead } } }, null, 2));
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');
const p = await import('../mater_controller_api/src/pipeline/service.mjs');
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');
const lead = () => readStore(storePath).leads.L1;

// findings are evidence-backed
const weakPage = { url: 'http://romashka.ru', httpStatus: 200, title: 'Ромашка', hasHttps: false, hasViewport: false, hasFormHtml: false, hasEmailLink: false, hasPhoneLink: false, ctaText: '', metaDescription: '' };
const findings = p.buildFindings(goodLead, weakPage);
ok('findings produced', findings.length >= 2);
ok('every finding has evidence + source_url', findings.every(f => f.evidence && f.source_url && f.confidence != null));
ok('no fabricated revenue/traffic claims', findings.every(f => !/выручк|трафик|конверси|теряете/i.test(f.title)));

// quality gate
ok('quality gate READY for evidence-backed', p.auditQualityGate(findings, goodLead).status === 'AUDIT_READY');
ok('identity conflict blocks', p.auditQualityGate(findings, { ...goodLead, identity_status: 'IDENTITY_CONFLICT' }).status === 'AUDIT_BLOCKED_IDENTITY');
ok('insufficient findings blocks', p.auditQualityGate([findings[0]], goodLead).status === 'AUDIT_INSUFFICIENT_EVIDENCE');

// applyAudit persists + routes to audit_ready
const a1 = p.applyAudit({ leadId: 'L1', pageData: weakPage });
ok('audit applied', a1.ok && a1.written && a1.status === 'AUDIT_READY');
ok('lead → audit_ready', lead().status === 'audit_ready' && (lead().audit_findings || []).length >= 2);
const a2 = p.applyAudit({ leadId: 'L1', pageData: weakPage });
ok('audit idempotent', a2.idempotent === true);

// draft preconditions + apply
const d1 = p.applyDraft({ leadId: 'L1', jobId: 'job_x' });
ok('draft created', d1.ok && d1.written && d1.draftId);
ok('lead → approval_pending', lead().status === 'approval_pending' && lead().approval.status === 'PENDING');
ok('draft has canonical price', /₽/.test(lead().draft.body));
ok('draft recipient is official email', lead().draft.recipient === 'info@romashka.ru');
const d2 = p.applyDraft({ leadId: 'L1', jobId: 'job_x' });
ok('draft idempotent (same content+recipient)', d2.idempotent === true);

// draft blocked for guessed email
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 9, leads: { L2: { ...goodLead, lead_id: 'L2', status: 'audit_ready', audit_status: 'AUDIT_READY', email_status: 'GUESSED' } } }, null, 2));
const dg = p.applyDraft({ leadId: 'L2' });
ok('guessed email → draft blocked', dg.ok === false && dg.blockers.includes('GUESSED_EMAIL'));

// edit invalidates approval: changing recipient produces new content_hash/approval
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 20, leads: { L3: { ...goodLead, lead_id: 'L3', status: 'audit_ready', audit_status: 'AUDIT_READY', audit_findings: findings } } }, null, 2));
const base = p.applyDraft({ leadId: 'L3' });
const beforeApproval = readStore(storePath).leads.L3.approval.approval_id;
// simulate recipient change by mutating email then re-drafting
{ const s = readStore(storePath); s.leads.L3.email = 'sales@romashka.ru'; fs.writeFileSync(storePath, JSON.stringify(s)); }
const after = p.applyDraft({ leadId: 'L3' });
ok('recipient change → new approval (old invalidated)', after.ok && after.approvalId && after.approvalId !== beforeApproval);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== pipeline_audit_draft: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
