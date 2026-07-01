// pipeline_verify_offline_test.mjs — PURE offline, no network.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify_'));
const storePath = path.join(dir, 'store.json');
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 1, leads: {
  L1: { lead_id: 'L1', status: 'STAGING', company: 'Ромашка', region: 'Краснодар', industry: 'car_repair', website: 'http://romashka.ru', email_candidates: ['info@romashka.ru'] },
} }, null, 2));
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');
const p = await import('../mater_controller_api/src/pipeline/service.mjs');
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');
const lead = () => readStore(storePath).leads.L1;

// website classification
ok('NXDOMAIN→no website', p.classifyWebsite({ nxdomain: true }).website_status === 'NXDOMAIN');
ok('timeout→INACCESSIBLE not NOT_FOUND', p.classifyWebsite({ timeout: true }).website_status === 'INACCESSIBLE');
ok('403→INACCESSIBLE not no-site', p.classifyWebsite({ httpStatus: 403 }).website_status === 'INACCESSIBLE');
ok('500→BROKEN', p.classifyWebsite({ httpStatus: 500 }).website_status === 'BROKEN');
ok('200→FOUND/CONFIRMED', p.classifyWebsite({ httpStatus: 200, title: 'Ромашка' }).presence === 'CONFIRMED_WEBSITE');
ok('parked→BROKEN', p.classifyWebsite({ httpStatus: 200, title: 'domain for sale' }).website_status === 'BROKEN');

// identity needs >1 signal incl name on site
ok('osm-only→not verified', p.classifyIdentity({ listingPresent: true }).identity_status !== 'IDENTITY_VERIFIED');
ok('name+region→verified', p.classifyIdentity({ nameOnSite: true, regionMatch: true }).identity_status === 'IDENTITY_VERIFIED');
ok('conflict→CONFLICT', p.classifyIdentity({ nameOnSite: true, conflict: true }).identity_status === 'IDENTITY_CONFLICT');

// email classification — guessed/osm not official
ok('guessed→GUESSED', p.classifyEmail({ guessed: true }) === 'GUESSED');
ok('official page→OFFICIAL_PAGE', p.classifyEmail({ onOfficialPage: true }) === 'OFFICIAL_PAGE');
ok('directory→PUBLIC_DIRECTORY_CONFIRMED', p.classifyEmail({ inPublicDirectory: true }) === 'PUBLIC_DIRECTORY_CONFIRMED');
ok('nothing→UNCONFIRMED', p.classifyEmail({}) === 'UNCONFIRMED');

// applyVerification persists + routes; idempotent on same version+evidence
const v1 = p.applyVerification({ leadId: 'L1', identity: 'IDENTITY_VERIFIED', website: 'FOUND', presence: 'CONFIRMED_WEBSITE', emailStatus: 'OFFICIAL_PAGE', confidence: 0.9, evidenceRefs: [{ url: 'http://romashka.ru', type: 'site' }], route: 'verified_pending_score' });
ok('verification written', v1.ok && v1.written);
ok('verification persisted', lead().identity_status === 'IDENTITY_VERIFIED' && lead().status === 'verified_pending_score');
const v2 = p.applyVerification({ leadId: 'L1', identity: 'IDENTITY_VERIFIED', website: 'FOUND', presence: 'CONFIRMED_WEBSITE', emailStatus: 'OFFICIAL_PAGE', confidence: 0.9, evidenceRefs: [{ url: 'http://romashka.ru', type: 'site' }], route: 'verified_pending_score' });
ok('verification idempotent', v2.idempotent === true);

// applyScore → VERIFIED_READY for the good lead
const s1 = p.applyScore({ leadId: 'L1' });
ok('score applied', s1.ok && s1.written);
ok('good lead → verified_ready', lead().status === 'verified_ready' && s1.decision === 'VERIFIED_READY');

// a maps-only lead routes to product routing, not verified_ready
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 5, leads: {
  L2: { lead_id: 'L2', status: 'STAGING', company: 'X', region: 'Краснодар', industry: 'car_repair', identity_status: 'IDENTITY_VERIFIED', website_status: 'NOT_FOUND', presence: 'MAPS_ONLY', email_status: 'PUBLIC_DIRECTORY_CONFIRMED', evidence_refs: ['a','b'] },
} }, null, 2));
const s2 = p.applyScore({ leadId: 'L2' });
ok('maps-only → product routing (not verified_ready)', s2.decision === 'MANUAL_REVIEW_PRODUCT_ROUTING' && readStore(storePath).leads.L2.status !== 'verified_ready');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== pipeline_verify: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
