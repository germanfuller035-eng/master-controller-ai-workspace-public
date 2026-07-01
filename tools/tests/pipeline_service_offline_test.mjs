// pipeline_service_offline_test.mjs — PURE offline, no network.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe_'));
const storePath = path.join(dir, 'store.json');
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 1, leads: {} }, null, 2));
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');

const p = await import('../mater_controller_api/src/pipeline/service.mjs');
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');

// pure helpers
ok('normalizeCompanyName strips form', p.normalizeCompanyName('ООО "Ромашка"') === 'ромашка');
ok('normalizeDomain', p.normalizeDomain('https://www.Example.ru/path') === 'example.ru');
ok('normalizePhone 8->7', p.normalizePhone('8 (905) 123-45-67') === '79051234567');
ok('dedupeKey prefers domain', p.dedupeKey({ company: 'X', website: 'http://a.ru' }) === 'dom:a.ru');
ok('dedupeKey phone fallback', p.dedupeKey({ company: 'X', phone: '89051234567' }) === 'tel:79051234567');

// staging + idempotency (dedupe)
const c1 = p.stageCandidate({ candidate_id: 'cand_1', source: 'osm', company_name: 'Ромашка', website_candidate: 'http://romashka.ru', region: 'Краснодар', industry: 'shop' });
ok('stage created', c1.ok && c1.written && !c1.duplicate);
const c2 = p.stageCandidate({ candidate_id: 'cand_2', source: 'osm', company_name: 'Ромашка 2', website_candidate: 'http://romashka.ru' });
ok('dedupe blocks same domain', c2.ok && c2.duplicate === true);
ok('only one staged on disk', Object.keys(readStore(storePath).leads).length === 1);

// scoring determinism
const lead = { identity_status: 'IDENTITY_VERIFIED', industry: 'shop', website_status: 'BROKEN', presence: 'HAS_WEAK_WEBSITE', region: 'X', email_status: 'OFFICIAL_PAGE', evidence_refs: ['a', 'b'] };
const s1 = p.computeScore(lead); const s2 = p.computeScore(lead);
ok('score deterministic', JSON.stringify(s1.score_components) === JSON.stringify(s2.score_components));
ok('score versioned', s1.score_version === 'score_v1');
ok('good lead qualifies', ['QUALIFIED', 'HIGH_PRIORITY'].includes(s1.result));

// risk → REJECT
const optout = p.computeScore({ ...lead, opt_out: true });
ok('opt_out → REJECT', optout.result === 'REJECT' && optout.score_components.risk_penalty < 0);
const guessed = p.computeScore({ ...lead, email_status: 'GUESSED' });
ok('guessed email penalized', guessed.score_components.risk_penalty < 0);

// VERIFIED_READY gate
const gateOk = p.verifiedReadyDecision(lead, s1);
ok('clean lead → VERIFIED_READY', gateOk.decision === 'VERIFIED_READY');
const noEmail = p.verifiedReadyDecision({ ...lead, email_status: 'GUESSED' }, p.computeScore({ ...lead, email_status: 'GUESSED' }));
ok('guessed email NOT verified_ready', noEmail.decision !== 'VERIFIED_READY');
const mapsOnly = p.verifiedReadyDecision({ ...lead, presence: 'MAPS_ONLY' }, s1);
ok('maps-only → product routing (not audit)', mapsOnly.decision === 'MANUAL_REVIEW_PRODUCT_ROUTING');
const noId = p.verifiedReadyDecision({ ...lead, identity_status: 'IDENTITY_UNKNOWN' }, s1);
ok('unverified identity blocks', noId.decision !== 'VERIFIED_READY' && noId.blockers.includes('IDENTITY_NOT_VERIFIED'));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== pipeline_service: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
