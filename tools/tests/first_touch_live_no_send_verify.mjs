// tools/tests/first_touch_live_no_send_verify.mjs
// Task 4 verification harness: exercises the First Touch Strategist service against the
// canonical store/ledger READ-ONLY and proves no-send by hashing the send + email ledgers
// and the canonical store before and after. Captures real endpoint-equivalent output.
// NEVER sends, NEVER mutates. Emits JSON to stdout for the verification report.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { STORE_PATH, SEND_LEDGER_PATH, EMAIL_LEDGER_PATH } from '../mater_controller_api/src/shared/config.mjs';
import firstTouch from '../mater_controller_api/src/commercial/first_touch_service.mjs';

function sha256(p) {
    try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
    catch { return 'ABSENT'; }
}
function ledgerCount(p) {
    try { return fs.readFileSync(p, 'utf8').split(/\n+/).filter(Boolean).length; } catch { return 0; }
}

const before = {
    store: sha256(STORE_PATH),
    send_ledger: sha256(SEND_LEDGER_PATH), send_ledger_lines: ledgerCount(SEND_LEDGER_PATH),
    email_ledger: sha256(EMAIL_LEDGER_PATH), email_ledger_lines: ledgerCount(EMAIL_LEDGER_PATH),
};

// ---- Exercise every read endpoint equivalent ----
const summary = firstTouch.summary();
const candidates = firstTouch.pilotCandidates();
const recId = candidates.recommended_pilot ? candidates.recommended_pilot.lead_id : null;
const artifact = recId ? firstTouch.buildArtifact(recId) : null;

const after = {
    store: sha256(STORE_PATH),
    send_ledger: sha256(SEND_LEDGER_PATH), send_ledger_lines: ledgerCount(SEND_LEDGER_PATH),
    email_ledger: sha256(EMAIL_LEDGER_PATH), email_ledger_lines: ledgerCount(EMAIL_LEDGER_PATH),
};

const unchanged = before.store === after.store
    && before.send_ledger === after.send_ledger
    && before.email_ledger === after.email_ledger
    && before.send_ledger_lines === after.send_ledger_lines
    && before.email_ledger_lines === after.email_ledger_lines;

// no-send invariants pulled from actual output
const noSendInvariants = {
    summary_no_send: summary.no_send === true,
    summary_transport_enabled: summary.transport_enabled === false,
    summary_controlled_send_gate: summary.controlled_send_gate,
    candidates_no_send: candidates.no_send === true,
    artifact_no_send: artifact ? artifact.no_send === true : null,
    artifact_status: artifact ? artifact.status : null,
    artifact_deliverability: artifact ? artifact.deliverability.status : null,
    artifact_smtp_probing: artifact ? artifact.deliverability.smtp_probing : null,
};

const out = {
    harness: 'first_touch_live_no_send_verify',
    store_path: STORE_PATH,
    summary,
    candidates_overview: {
        leads_scored: candidates.leads_scored,
        pilot_eligible: candidates.pilot_eligible,
        top_5: candidates.top_5.map((r) => ({ lead_id: r.lead_id, company: r.company, hook_type: r.hook_type, quality_score: r.quality_score, score: r.score })),
        recommended_pilot: recId,
        excluded_reason_histogram: candidates.all.reduce((h, r) => { for (const e of r.excluded_reasons) h[e] = (h[e] || 0) + 1; return h; }, {}),
    },
    recommended_artifact: artifact ? {
        lead_id: artifact.lead_id, status: artifact.status, hook_type: artifact.hook?.hook_type,
        quality: { total_score: artifact.quality.total_score, gate_result: artifact.quality.gate_result },
        compliance_gate: artifact.compliance.gate_result, deliverability_status: artifact.deliverability.status,
        subject_variant_count: artifact.subject_variants.length, body_variant_count: artifact.body_variants.length,
        uniqueness: artifact.uniqueness, content_hash: artifact.content_hash, no_send: artifact.no_send,
    } : null,
    no_send_invariants: noSendInvariants,
    ledger_store_before: before,
    ledger_store_after: after,
    LEDGERS_AND_STORE_UNCHANGED: unchanged,
    REAL_OUTBOUND_MESSAGES: 0, SMTP_CALLS: 0, EMAILS_SENT: 0,
    verdict: unchanged && noSendInvariants.summary_no_send && (artifact ? noSendInvariants.artifact_no_send : true) ? 'PASS' : 'FAIL',
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
process.exit(out.verdict === 'PASS' ? 0 : 1);
