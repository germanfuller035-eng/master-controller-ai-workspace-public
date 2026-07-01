// tools/tests/first_touch_history_gate_test.mjs
// Outbound history/suppression gate regression. Pure temp-store test: no send, no mailbox, no writes
// outside the temporary fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fthist'));
const STORE = path.join(tmp, 'store.json');
const LEDGER = path.join(tmp, 'outbound_send_ledger.jsonl');
fs.writeFileSync(LEDGER, '', 'utf8');
process.env.MATER_STORE_PATH = STORE;
process.env.MATER_SEND_LEDGER_PATH = LEDGER;

function baseLead(lead_id, history = {}) {
    return {
        lead_id,
        company: `Synthetic ${lead_id}`,
        company_name: `Synthetic ${lead_id}`,
        website: `${lead_id.toLowerCase().replaceAll('_', '-')}.example`,
        email: `${lead_id.toLowerCase()}@example.test`,
        email_source: 'manual_verified',
        niche: 'synthetic',
        source: 'site_observation',
        status: 'needs_check',
        product_route: 'mini_audit',
        identity_match_status: 'match',
        website_reachable: true,
        audit_ready: true,
        audit_observations: [
            'Кнопка заявки не видна в первом экране сайта.',
            'Путь от каталога к обращению требует дополнительного решения.',
            'На странице контактов неясно, кто отвечает за первичный запрос.',
        ],
        audit_observed_at: '2026-06-20T10:00:00.000Z',
        updated_at: '2026-06-20T10:00:00.000Z',
        created_at: '2026-06-20T10:00:00.000Z',
        test_only: false,
        no_send: true,
        ...history,
    };
}

const clear = {
    outbound_history_checked: true,
    suppression_checked: true,
    duplicate_contact_checked: true,
    prior_reply_checked: true,
};

fs.writeFileSync(STORE, JSON.stringify({
    store_revision: 1,
    leads: [
        baseLead('NEW_CLEAR', clear),
        baseLead('NO_HISTORY'),
        baseLead('PRIOR_NO_REPLY', { ...clear, prior_outreach_exists: true, no_reply_after_prior_outreach: true }),
        baseLead('DUPLICATE_CONTACT', { ...clear, duplicate_contact: true }),
        baseLead('PRIOR_REPLY', { ...clear, prior_reply_exists: true }),
        baseLead('SELF_MAIL', { ...clear, self_test_email: true }),
        baseLead('PREVIEW_ONLY', { ...clear, preview_only_not_sent: true }),
    ],
}, null, 2), 'utf8');

const svc = await import('../mater_controller_api/src/commercial/first_touch_service.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const row = (id) => svc.pilotCandidates(false).all.find((r) => r.lead_id === id);

ok('H1 new lead with clear history is eligible', row('NEW_CLEAR')?.eligible === true);
ok('H2 no history data needs owner review', row('NO_HISTORY')?.excluded_reasons.includes('NEEDS_OWNER_HISTORY_REVIEW'));
ok('H3 prior no-reply needs owner override', row('PRIOR_NO_REPLY')?.excluded_reasons.includes('NEEDS_OWNER_OVERRIDE'));
ok('H4 duplicate contact suppressed', row('DUPLICATE_CONTACT')?.excluded_reasons.includes('SUPPRESSED_DUPLICATE_OR_NO_REPLY'));
ok('H5 prior reply uses existing thread only', row('PRIOR_REPLY')?.excluded_reasons.includes('FOLLOW_UP_ONLY_EXISTING_THREAD'));
ok('H6 self-test is not real lead', row('SELF_MAIL')?.excluded_reasons.includes('NOT_A_REAL_LEAD'));
ok('H7 preview-only is not counted as sent', row('PREVIEW_ONLY')?.eligible === true);
ok('H8 no-send invariant', svc.pilotCandidates(false).no_send === true);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n==== first_touch_history_gate: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
