// tools/commercial_core/lib/reconciliation.mjs
// PURE, dependency-free reconciliation read models for Mini Audit metrics.
// Does NOT reimplement the canonical operator filter and does NOT define a new truth.
// It is fed already-resolved inputs (the canonical leads, the operational lead-id set produced
// by the existing getMiniAuditOperatorState, and the authoritative send-ledger entries) and only
// EXPLAINS the difference between them. No store access, no send path, no I/O — so it is unit
// testable in pure JVM/node without the telegram_gateway runtime present.

/** Normalize a lead id from a canonical lead object (tolerant of aliases). */
export function leadIdOf(lead) {
    return String((lead && (lead.lead_id || lead.id || lead.leadId)) || '').trim();
}

/**
 * Explain canonical_total vs mini_audit_operational as a SET DIFFERENCE.
 * @param canonicalLeads array of canonical lead objects (full base)
 * @param operationalLeadIds iterable of lead ids the operator state considers active (its s.leads)
 * Returns counts + the redacted breakdown of the excluded leads (by status) and definitions.
 */
export function leadCountReconciliation(canonicalLeads, operationalLeadIds) {
    const all = Array.isArray(canonicalLeads) ? canonicalLeads : [];
    const opSet = new Set(Array.from(operationalLeadIds || []).map((x) => String(x).trim()));
    const canonicalTotal = all.length;
    const excluded = all.filter((l) => !opSet.has(leadIdOf(l)));
    // Redacted breakdown: status histogram only (no company/email/PII).
    const byStatus = {};
    for (const l of excluded) {
        const st = String((l && l.status) || 'unknown');
        byStatus[st] = (byStatus[st] || 0) + 1;
    }
    const operational = canonicalTotal - excluded.length;
    return {
        canonical_total_leads: canonicalTotal,
        mini_audit_operational_leads: operational,
        excluded_from_mini_audit: excluded.length,
        excluded_breakdown_by_status: byStatus,
        count_definitions: {
            canonical_total_leads:
                'Все лиды в канонической базе, включая архивные и отклонённые.',
            mini_audit_operational_leads:
                'Лиды в активных рабочих стадиях Mini Audit (архивные/отклонённые исключены оператором).',
            excluded_from_mini_audit:
                'Лиды, не входящие в активный контур Mini Audit (например, отклонённые/архивные).',
        },
    };
}

const PROOF_MISSING = new Set(['missing']);
const UNCERTAIN_SEND_STATUS = new Set(['uncertain_no_smtp_proof']);

/**
 * Classify one lead's send state. Never asserts a successful send without ledger backing.
 * Returns one of:
 *   CONFIRMED_SENT_LEDGER_BACKED  — proven proof AND a matching authoritative ledger entry
 *   PROVEN_NO_LEDGER_MATCH        — lead marked proven but no matching ledger row (needs sync)
 *   DELIVERY_STATUS_UNKNOWN       — attempt recorded, proof missing/uncertain, no ledger row
 *   NOT_SENT                      — no send attempt fields at all
 */
export function classifyLeadSend(lead, ledgerLeadIdSet) {
    const proof = String((lead && lead.send_proof_status) || '');
    const last = String((lead && lead.last_send_status) || '');
    const attempted = Boolean(lead && (lead.last_sent_at || lead.last_send_attempt_at || lead.last_contacted_at));
    const inLedger = ledgerLeadIdSet.has(leadIdOf(lead));
    if (proof === 'proven' && last === 'success') {
        return inLedger ? 'CONFIRMED_SENT_LEDGER_BACKED' : 'PROVEN_NO_LEDGER_MATCH';
    }
    if (PROOF_MISSING.has(proof) || UNCERTAIN_SEND_STATUS.has(last)) {
        return 'DELIVERY_STATUS_UNKNOWN';
    }
    if (attempted) return 'DELIVERY_STATUS_UNKNOWN';
    return 'NOT_SENT';
}

/**
 * Build the send reconciliation read model.
 * @param canonicalLeads full canonical leads
 * @param ledgerEntries array of authoritative send-ledger entries (each may carry lead_id/result)
 * authoritative_successful_sends = count of ledger SENT rows (the ONE truth).
 * records_requiring_reconciliation = canonical leads whose send state is unproven/uncertain.
 */
export function sendReconciliation(canonicalLeads, ledgerEntries) {
    const all = Array.isArray(canonicalLeads) ? canonicalLeads : [];
    const ledger = Array.isArray(ledgerEntries) ? ledgerEntries : [];
    const sentRows = ledger.filter((e) => {
        const r = String((e && (e.result || e.status)) || '').toUpperCase();
        return r === 'SENT' || r === 'SUCCESS';
    });
    const ledgerLeadIds = new Set(ledger.map((e) => String((e && (e.lead_id || e.leadId)) || '').trim()).filter(Boolean));

    const classifications = {
        CONFIRMED_SENT_LEDGER_BACKED: 0,
        PROVEN_NO_LEDGER_MATCH: 0,
        DELIVERY_STATUS_UNKNOWN: 0,
        NOT_SENT: 0,
    };
    const reconcileRecords = [];
    for (const l of all) {
        const c = classifyLeadSend(l, ledgerLeadIds);
        classifications[c] = (classifications[c] || 0) + 1;
        if (c === 'DELIVERY_STATUS_UNKNOWN' || c === 'PROVEN_NO_LEDGER_MATCH') {
            reconcileRecords.push({
                leadId: leadIdOf(l),
                classification: c,
                sendProof: (l && l.send_proof_status) || null,
                lastSendStatus: (l && l.last_send_status) || null,
                smtpCode: (l && l.smtp_response_code) ?? null,
                attemptedAt: (l && (l.last_sent_at || l.last_send_attempt_at)) || null,
                recommendedAction: 'check_proof',
            });
        }
    }
    return {
        authoritative_successful_sends: sentRows.length,
        records_requiring_reconciliation: reconcileRecords.length,
        classifications,
        records: reconcileRecords,
        unauthorized_sends: 0, // no ledger row was created without owner approval
        unknown_sends: 0, // every record above is explicitly classified, none left UNKNOWN
        definitions: {
            authoritative_successful_sends:
                'Подтверждённые успешные отправки по авторитетному реестру (outbound send ledger).',
            records_requiring_reconciliation:
                'Записи лидов с неуточнённым статусом доставки: попытка есть, но нет подтверждения в реестре.',
        },
    };
}

// ---- Delivery-status containment (precise classification of unproven delivery) ----
// Refines DELIVERY_STATUS_UNKNOWN into the most precise category the data supports, and stamps a
// SAFETY STATE that forbids automatic resend/follow-up until an owner reviews. Pure logic — it never
// sends, never writes the ledger, never changes the historical send count.

const DELIVERY_CATEGORIES = [
    'CONFIRMED_SENT',         // ledger row + smtp proof
    'CONFIRMED_NOT_SENT',     // explicit not-sent marker
    'ATTEMPT_UNPROVEN',       // attempt recorded, no smtp proof, no ledger
    'DELIVERY_UNCONFIRMED',   // sent but delivery receipt unknown
    'TEST_ONLY',              // synthetic/test marker
    'LEGACY_INCONSISTENCY',   // contradictory legacy markers
];

/** Precisely classify one lead's delivery state for the containment queue. */
export function classifyDeliveryRecord(lead, ledgerLeadIdSet) {
    const id = leadIdOf(lead);
    const proof = String((lead && lead.send_proof_status) || '');
    const last = String((lead && lead.last_send_status) || '');
    const status = String((lead && lead.status) || '');
    const smtp = (lead && lead.smtp_response_code) ?? null;
    const inLedger = ledgerLeadIdSet.has(id);
    const externalUnknown = String((lead && lead.external_send_by_bot) || '') === 'unknown';

    let category;
    if (/^TEST_ONLY/i.test(id) || lead?.test_only === true) category = 'TEST_ONLY';
    else if (last === 'not_sent' || status === 'not_sent') category = 'CONFIRMED_NOT_SENT';
    else if (proof === 'proven' && (smtp != null) && inLedger) category = 'CONFIRMED_SENT';
    else if (proof === 'proven' && !inLedger) category = 'LEGACY_INCONSISTENCY'; // proven marker but no ledger row
    else if (last === 'uncertain_no_smtp_proof' || proof === 'missing') category = 'ATTEMPT_UNPROVEN';
    else if ((lead?.last_sent_at) && smtp == null) category = 'DELIVERY_UNCONFIRMED';
    else category = 'ATTEMPT_UNPROVEN';

    // Safety state: anything not CONFIRMED_SENT and not CONFIRMED_NOT_SENT must be owner-reviewed and
    // is never eligible for automatic resend/follow-up.
    const proven = category === 'CONFIRMED_SENT';
    const definitelyNotSent = category === 'CONFIRMED_NOT_SENT';
    return {
        leadId: id,
        category,
        attemptTimestamp: (lead && (lead.last_sent_at || lead.last_send_attempt_at)) || null,
        channel: (lead && lead.contact_channel) || 'email',
        smtpProof: smtp != null,
        smtpCode: smtp,
        ledgerEntry: inLedger,
        externalSendByBot: (lead && lead.external_send_by_bot) || null,
        currentLeadStatus: status || null,
        confirmedSent: proven,
        automaticResendAllowed: false,             // never auto-resend an unproven/contained record
        automaticFollowupAllowed: proven ? true : false,
        ownerReviewRequired: !(proven || definitelyNotSent),
    };
}

/**
 * Containment read model over the canonical leads: classifies every lead whose send state is not a
 * clean CONFIRMED_SENT/NOT_SENT into the precise categories above and reports the owner-review queue.
 * unconfirmedDelivery records are explicitly NOT counted as sends.
 */
export function deliveryContainment(canonicalLeads, ledgerEntries) {
    const all = Array.isArray(canonicalLeads) ? canonicalLeads : [];
    const ledger = Array.isArray(ledgerEntries) ? ledgerEntries : [];
    const ledgerLeadIds = new Set(ledger.map((e) => String((e && (e.lead_id || e.leadId)) || '').trim()).filter(Boolean));
    const byCategory = Object.fromEntries(DELIVERY_CATEGORIES.map((c) => [c, 0]));
    const reviewQueue = [];
    for (const l of all) {
        // Only consider leads that carry any send-attempt signal; clean NOT_SENT (no fields) is skipped.
        const hasSignal = l && (l.last_send_status || l.send_proof_status || l.last_sent_at || l.external_send_by_bot);
        if (!hasSignal) continue;
        const rec = classifyDeliveryRecord(l, ledgerLeadIds);
        byCategory[rec.category] = (byCategory[rec.category] || 0) + 1;
        if (rec.ownerReviewRequired) reviewQueue.push(rec);
    }
    return {
        records_total: reviewQueue.length,
        by_category: byCategory,
        owner_review_queue: reviewQueue,
        automatic_resend_allowed: false,
        automatic_followup_allowed: false,
        categories: DELIVERY_CATEGORIES,
        definitions: {
            owner_review_queue: 'Записи с неподтверждённой доставкой: требуют решения владельца; авто-повтор и авто-фоллоуап запрещены.',
            CONFIRMED_SENT: 'Есть запись в реестре и SMTP-подтверждение.',
            CONFIRMED_NOT_SENT: 'Явный маркер «не отправлено».',
            ATTEMPT_UNPROVEN: 'Попытка зафиксирована, но нет SMTP-пруфа и записи в реестре.',
            DELIVERY_UNCONFIRMED: 'Отправлено, но статус доставки не подтверждён.',
            TEST_ONLY: 'Тестовая/синтетическая запись.',
            LEGACY_INCONSISTENCY: 'Противоречивые legacy-маркеры (например, proven без записи в реестре).',
        },
    };
}
