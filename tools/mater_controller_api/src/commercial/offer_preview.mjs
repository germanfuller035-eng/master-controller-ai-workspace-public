// tools/mater_controller_api/src/commercial/offer_preview.mjs
// Authoritative offer-preview read model (read-only; no send, no write).
//
// Fixes RC3 defects:
//  4.2 — blockers are derived ONLY from authoritative offer state + the send ledger. The stale
//        lead-level `status=waiting_reply` is IGNORED: an offer cannot be "awaiting reply" unless a
//        SENT row for this lead exists in the authoritative send ledger.
//  4.3 — content hash + version timestamps are computed on the BACKEND from the actual draft content
//        (never generated on Android). Missing fields get an explicit owner-facing reason, not a fake.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';

function readSentLeadIds() {
    try {
        return new Set(
            fs.readFileSync(SEND_LEDGER_PATH, 'utf8').split(/\n+/).filter(Boolean)
                .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
                .filter((r) => String(r.result || r.status || '').toUpperCase() === 'SENT')
                .map((r) => String(r.lead_id || r.leadId || '')),
        );
    } catch { return new Set(); }
}

const RU_PRODUCT = { mini_audit: 'Мини-аудит сайта и пути клиента до заявки' };

// Build the authoritative preview for one offer id.
export function offerPreview(offerId) {
    const store = readStore(STORE_PATH);
    const offers = store['commercial.offers'] || {};
    const offer = offers[offerId] || Object.values(offers).find((o) => o.offer_id === offerId);
    if (!offer) return null;
    const leadId = String(offer.lead_id || '');
    const leads = leadsArray(store);
    const lead = leads.find((l) => String(l.lead_id) === leadId) || {};
    const sentLeadIds = readSentLeadIds();
    const hasConfirmedSend = sentLeadIds.has(leadId);

    // ---- authoritative blockers (NOT from stale lead.status) ----
    const blockers = [];
    const recipient = lead.email || null;
    const recipientVerified = lead.email_verified === true && lead.email_source !== 'guessed';
    if (!recipientVerified) blockers.push('RECIPIENT_NOT_VERIFIED');
    if (offer.status !== 'READY_FOR_SEND_REVIEW' && offer.status !== 'APPROVED') blockers.push('CONTENT_NOT_APPROVED');
    if (offer.owner_decision == null) blockers.push('OWNER_REVIEW_REQUIRED');
    // ALREADY_AWAITING_REPLY is allowed ONLY with authoritative send proof.
    if (hasConfirmedSend) blockers.push('AWAITING_REPLY_AFTER_CONFIRMED_SEND');
    // Evidence completeness (audit content present)
    const findings = Array.isArray(lead.audit_observations) ? lead.audit_observations : [];
    if (!lead.audit_draft_preview && findings.length === 0) blockers.push('EVIDENCE_INCOMPLETE');

    // ---- content + backend-computed hash/timestamps ----
    const subject = lead.subject || (lead.audit_preview && lead.audit_preview.subject) || null;
    const bodyText = typeof lead.audit_draft_preview === 'string' ? lead.audit_draft_preview : null;
    // next_step: authoritative source priority — explicit artifact field, then audit_preview, then a
    // deterministic safe default derived from the offer lifecycle state (NOT invented client-side).
    // This is NOT a permission to send; it only describes the safe next owner action.
    let nextStep = null, nextStepSource = null;
    if (lead.next_step) { nextStep = lead.next_step; nextStepSource = 'lead.next_step'; }
    else if (lead.audit_preview && (lead.audit_preview.next_step || lead.audit_preview.cta)) {
        nextStep = lead.audit_preview.next_step || lead.audit_preview.cta; nextStepSource = 'audit_preview';
    } else if (offer.status === 'READY_FOR_SEND_REVIEW') {
        nextStep = 'Дождаться ответа компании; при подтверждённом интересе подготовить пример мини-аудита после отдельного разрешения владельца.';
        nextStepSource = 'derived_from_offer_status';
    }
    const nextStepCreatedAt = offer.updated_at || offer.created_at || null;
    const findingsForHash = findings;
    const contentForHash = JSON.stringify({ subject, bodyText, findings: findingsForHash, nextStep, product: offer.product_id, price: offer.price_snapshot });
    const contentHash = crypto.createHash('sha256').update(contentForHash).digest('hex').slice(0, 32);

    // Missing-field reasons (explicit, never faked).
    const missing = {};
    if (!subject) missing.subject = 'тема не сформирована в черновике';
    if (!bodyText) missing.body = 'текст черновика отсутствует';
    if (findings.length === 0) missing.findings = 'выводы аудита не сформированы';
    if (!nextStep) missing.next_step = 'следующий шаг не указан в черновике';

    return {
        offer_id: offer.offer_id,
        lead_id: leadId,
        company: lead.company || lead.company_name || null,
        product_id: offer.product_id,
        product_name_ru: RU_PRODUCT[offer.product_id] || offer.product_id,
        product_version: offer.product_version || null,
        price: offer.price_snapshot ?? null,
        currency: offer.currency || 'RUB',
        channel: 'EMAIL',
        recipient, // shown to owner in-app; never logged in shared production logs
        recipient_verified: recipientVerified,
        subject,
        body_text: bodyText,
        findings: findings.slice(0, 7),
        finding_count: findings.length,
        next_step: nextStep,
        next_step_source: nextStepSource,
        next_step_created_at: nextStep ? nextStepCreatedAt : null,
        attachments: [], // explicit: no attachments
        attachments_note: 'нет вложений',
        version_created_at: offer.created_at || null,
        version_updated_at: offer.updated_at || null,
        content_hash: contentHash, // computed on backend from actual content
        status: offer.status,
        owner_decision: offer.owner_decision || null,
        send_capability: offer.send_capability || 'NONE',
        confirmed_send_exists: hasConfirmedSend,
        blockers, // authoritative — never ALREADY_AWAITING_REPLY without send proof
        missing_fields: missing,
        no_send_notice: 'Клиенту ничего не отправляется. Действия меняют только статус черновика.',
    };
}

export default { offerPreview };
