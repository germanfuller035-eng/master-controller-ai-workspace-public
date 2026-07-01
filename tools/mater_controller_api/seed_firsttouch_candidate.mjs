// seed_firsttouch_candidate.mjs — server-side TEST_ONLY First Touch candidate seeder for Android
// acceptance v3. Writes a single SYNTHETIC TEST_ONLY lead into the canonical lead store through the
// SOLE canonical writer (updateStoreWithRevision), so the firsttouch candidate dialog + 6 post-draft
// controls can be verified WITHOUT touching any real lead. NEVER sends. NEVER appends to the send
// ledger. NEVER enables transport. Real leads are never read-modified.
//
// Place + run on the VPS inside tools/mater_controller_api/ (same convention as
// seed_acceptance_fixtures.mjs), with the production env loaded so STORE_PATH points at the canonical
// store:
//   set -a && . /etc/master-controller/master-controller.env && set +a
//   node seed_firsttouch_candidate.mjs seed-firsttouch
//   node seed_firsttouch_candidate.mjs verify-firsttouch
//   node seed_firsttouch_candidate.mjs cleanup-firsttouch
//
// The synthetic lead is built to PASS every safety hard-gate of pilotCandidates (identity match,
// evidenced contact, real audit, quality+compliance) so it appears as eligible — but ONLY when the
// caller requests includeTest=true. With includeTest=false it is skipped entirely (zero KPI leak).

import { readStore, updateStoreWithRevision, STORE_PATH, leadsArray } from './src/shared/store_access.mjs';

const mode = process.argv[2] || 'verify-firsttouch';

// Deterministic identifiers. The lead_id prefix matches isTestLead (^TEST_ONLY) AND test_only=true.
const FIXTURE_ID = 'ACCEPTANCE_V3_FIRSTTOUCH_CANDIDATE';
const RUN_ID = 'acceptance_v3_firsttouch';
const LEAD_ID = 'TEST_ONLY_FT_ACCEPT_V3';

const DRAFTS = 'first_touch.drafts';
const DECISIONS = 'first_touch.decisions';
const PILOT = 'first_touch.pilot';
const IDEM = '_first_touch_idem';

// Fully synthetic lead. No real client data. Crafted to clear pilotCandidates() hard gates:
//  - email + manual_verified source            -> contact evidenced (not guess/unverified/scraped)
//  - identity_match_status='match'             -> not BLOCKED_IDENTITY_MISMATCH
//  - audit_observations (evidence) + website   -> miniAudit audit_ready=true (not MISSING_REAL_AUDIT)
//  - no send history flags                      -> not BLOCKED_PRIOR_SEND / UNCERTAIN
//  - status not 'rejected'                      -> not REJECTED
function syntheticLead() {
    return {
        lead_id: LEAD_ID,
        company: 'Акцепт-Тест Стройсервис (TEST_ONLY)',
        company_name: 'Акцепт-Тест Стройсервис (TEST_ONLY)',
        website: 'accept-v3-firsttouch.example',
        email: 'accept-v3-firsttouch@example.test',
        email_source: 'manual_verified',
        email_verified: true,
        phone: null,
        niche: 'acceptance',
        segment: 'acceptance',
        region: 'TEST',
        source: 'site_observation',
        status: 'needs_check',
        product_route: 'mini_audit',
        identity_match_status: 'match',
        website_reachable: true,
        audit_ready: true,
        audit_observations: [
            'Кнопка отправки заявки не видна на главной странице — путь до обращения неочевиден новому посетителю.',
            'Форма обратной связи требует много полей, что усложняет первичное обращение клиента.',
            'На странице каталога отсутствует явный переход к расчёту или заявке по выбранному товару.',
        ],
        audit_observations_count: 3,
        audit_observed_at: '2026-06-20T10:00:00.000Z',
        audit_created_at: '2026-06-20T10:00:00.000Z',
        updated_at: '2026-06-20T10:00:00.000Z',
        created_at: '2026-06-20T10:00:00.000Z',
        // explicit TEST_ONLY markers + acceptance exclusions
        test_only: true,
        no_send: true,
        excluded_from_commercial_KPI: true,
        excluded_from_owner_brief: true,
        excluded_from_campaigns: true,
        excluded_from_followup: true,
        excluded_from_payment: true,
        cleanup_supported: true,
        fixture_id: FIXTURE_ID,
        created_by_run_id: RUN_ID,
    };
}

function leadKeyShape(store) {
    // Match the on-disk leads container shape (array vs object map) so we write it back the same way.
    if (Array.isArray(store.leads)) return 'array';
    if (store.leads && typeof store.leads === 'object') return 'object';
    return 'array'; // default: create an array
}

function findExisting(store) {
    return leadsArray(store).find((l) => String(l.lead_id) === LEAD_ID) || null;
}

function counts(store) {
    const drafts = Object.entries(store[DRAFTS] || {}).filter(([, d]) => String(d.lead_id) === LEAD_ID);
    const decisions = Object.entries(store[DECISIONS] || {}).filter(([, d]) => String(d.lead_id) === LEAD_ID);
    const idemKeys = Object.entries(store[IDEM] || {}).filter(([, v]) => String(v.lead_id) === LEAD_ID);
    const pilotIsTest = store[PILOT] && String(store[PILOT].selected_lead_id) === LEAD_ID;
    return {
        lead_present: !!findExisting(store),
        ft_drafts_linked: drafts.length,
        ft_decisions_linked: decisions.length,
        ft_idem_linked: idemKeys.length,
        pilot_is_test: !!pilotIsTest,
        real_leads: leadsArray(store).filter((l) => l.test_only !== true && !/^TEST_ONLY/i.test(String(l.lead_id || ''))).length,
        store_revision: store.store_revision || null,
    };
}

if (mode === 'verify-firsttouch') {
    const store = readStore(STORE_PATH);
    console.log('VERIFY_FT ' + JSON.stringify(counts(store)));
    process.exit(0);
}

if (mode === 'seed-firsttouch') {
    const before = counts(readStore(STORE_PATH));
    const res = updateStoreWithRevision((store) => {
        if (findExisting(store)) { console.log('SEED_FT_IDEMPOTENT already_present'); return null; } // no double-write
        const shape = leadKeyShape(store);
        const lead = syntheticLead();
        if (shape === 'array') { store.leads = Array.isArray(store.leads) ? store.leads : []; store.leads.push(lead); }
        else { store.leads = store.leads || {}; store.leads[LEAD_ID] = lead; }
        return store;
    }, { updatedBy: 'acceptance_firsttouch_seeder' });
    const after = counts(readStore(STORE_PATH));
    console.log('SEED_FT_BEFORE ' + JSON.stringify(before));
    console.log('SEED_FT_RESULT ' + JSON.stringify({ written: res.written, revision: res.revision }));
    console.log('SEED_FT_AFTER ' + JSON.stringify(after));
    process.exit(0);
}

if (mode === 'cleanup-firsttouch') {
    const before = counts(readStore(STORE_PATH));
    const res = updateStoreWithRevision((store) => {
        let changed = false;
        // 1. remove the synthetic lead
        if (Array.isArray(store.leads)) {
            const n = store.leads.length;
            store.leads = store.leads.filter((l) => String(l.lead_id) !== LEAD_ID);
            if (store.leads.length !== n) changed = true;
        } else if (store.leads && typeof store.leads === 'object') {
            if (store.leads[LEAD_ID]) { delete store.leads[LEAD_ID]; changed = true; }
        }
        // 2. remove linked first_touch.drafts
        for (const [id, d] of Object.entries(store[DRAFTS] || {})) {
            if (String(d.lead_id) === LEAD_ID) { delete store[DRAFTS][id]; changed = true; }
        }
        // 3. remove linked first_touch.decisions (audit events)
        for (const [id, d] of Object.entries(store[DECISIONS] || {})) {
            if (String(d.lead_id) === LEAD_ID) { delete store[DECISIONS][id]; changed = true; }
        }
        // 4. clear pilot selection if it points at the synthetic lead
        if (store[PILOT] && String(store[PILOT].selected_lead_id) === LEAD_ID) {
            delete store[PILOT].selected_lead_id; delete store[PILOT].selected_at;
            delete store[PILOT].send_allowed_live; delete store[PILOT].approval_token_issued;
            changed = true;
        }
        // 5. drop idempotency records tied to the synthetic lead (replay map)
        for (const [k, v] of Object.entries(store[IDEM] || {})) {
            if (v && String(v.lead_id) === LEAD_ID) { delete store[IDEM][k]; changed = true; }
        }
        return changed ? store : null;
    }, { updatedBy: 'acceptance_firsttouch_cleanup' });
    const after = counts(readStore(STORE_PATH));
    console.log('CLEANUP_FT_BEFORE ' + JSON.stringify(before));
    console.log('CLEANUP_FT_RESULT ' + JSON.stringify({ written: res.written, revision: res.revision }));
    console.log('CLEANUP_FT_AFTER ' + JSON.stringify(after));
    process.exit(0);
}

console.log('UNKNOWN_MODE ' + mode + ' (use seed-firsttouch | verify-firsttouch | cleanup-firsttouch)');
process.exit(2);
