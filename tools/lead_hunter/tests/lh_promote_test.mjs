// lh_promote_test.mjs — Phase 7: API-only promotion. PURE offline with mock API client.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const P = await import('../src/promote.mjs');

const approved = { id: 'cand1', state: 'PROMOTION_APPROVED', company: 'Бетон-Юг', source: 'overpass', website: 'http://beton-yug.ru', phones: ['78612001020'], emails: ['info@beton-yug.ru'], region: 'Krasnodar', category: 'concrete', evidence: [{ source: 'overpass' }] };

// guards
ok('approved candidate has no blockers', P.promotionBlockers(approved).length === 0);
ok('unapproved blocked', P.promotionBlockers({ ...approved, state: 'SCORED' }).includes('NOT_APPROVED'));
ok('opt-out blocked', P.promotionBlockers({ ...approved, opt_out: true }).includes('OPT_OUT'));
ok('no candidate blocked', P.promotionBlockers(null).includes('NO_CANDIDATE'));

// payload shape
const payload = P.buildPromotionPayload(approved);
ok('payload has operation_id (idempotency)', payload.operation_id === 'lh-promote-cand1');
ok('payload maps to promotion candidate', payload.normalized_company === 'Бетон-Юг' && payload.website_candidates[0] === 'http://beton-yug.ru');
ok('payload carries provenance/evidence', payload.evidence_refs.length === 1 && payload.candidate_score_version === 'score_v2');

// dry-run: no API call, returns would-be call
let called = 0;
const dry = await P.promote(approved, { dryRun: true });
ok('dry-run ok, no api needed', dry.ok && dry.dryRun && dry.wouldCall === 'POST /lead-intelligence/promote');

// live with mock api → success
const okClient = { post: async (path, body) => { called++; return { status: 200, data: { ok: true, data: { ok: true, promotion_result: 'CREATED', canonical_lead_id: 'KZ-NEW_RU', canonical_revision: 99 } } }; } };
const live = await P.promote(approved, { apiClient: okClient, dryRun: false });
ok('live promote → masterLeadId', live.ok && live.masterLeadId === 'KZ-NEW_RU' && live.revision === 99);
ok('live promote emits audit event', live.auditEvent && live.auditEvent.type === 'promotion');
ok('api client was called', called === 1);

// duplicate handling
const dupClient = { post: async () => ({ status: 200, data: { ok: true, data: { ok: true, promotion_result: 'DUPLICATE_BLOCKED', canonical_lead_id: 'EXIST_RU' } } }) };
const dup = await P.promote(approved, { apiClient: dupClient, dryRun: false });
ok('duplicate → not promoted but ok', dup.ok && dup.duplicate === true && dup.promoted === false);

// revision conflict (409)
const conflictClient = { post: async () => ({ status: 409, data: { error: { code: 'STORE_REVISION_CONFLICT' } } }) };
const conf = await P.promote(approved, { apiClient: conflictClient, dryRun: false });
ok('409 → REVISION_CONFLICT', conf.ok === false && conf.code === 'REVISION_CONFLICT');

// read-only / maintenance (503)
const roClient = { post: async () => ({ status: 503, data: { error: { code: 'READ_ONLY' } } }) };
const ro = await P.promote(approved, { apiClient: roClient, dryRun: false });
ok('503 → MASTER_READ_ONLY_OR_MAINTENANCE', ro.code === 'MASTER_READ_ONLY_OR_MAINTENANCE');

// blocked candidate never calls API
let called2 = 0;
const guardClient = { post: async () => { called2++; return { status: 200, data: { ok: true, data: {} } }; } };
const blk = await P.promote({ ...approved, state: 'SCORED' }, { apiClient: guardClient, dryRun: false });
ok('blocked candidate → no API call', blk.ok === false && called2 === 0);

// NO direct-write invariant: promote module imports no fs write of canonical path
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/promote.mjs', import.meta.url), 'utf8');
ok('promote.mjs never writes canonical JSON', !/lead_pipeline_store|writeFileSync|fs\./.test(src));

console.log(`\n==== lh_promote: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
