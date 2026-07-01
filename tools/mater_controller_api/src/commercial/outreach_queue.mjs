// Owner outreach queue over the canonical lead store.
// This is not a second CRM and not a second transport path:
//   - reads/writes the existing lead_pipeline_store.json;
//   - uses outbound_channel_router for the single approved-send seam;
//   - records to the canonical send ledger only after a provider-confirmed one-message send;
//   - blocks duplicate, mass, autosend, opt-out, bounced and stale-text sends.
import crypto from 'node:crypto';
import { STORE_PATH, SEND_LEDGER_PATH } from '../shared/config.mjs';
import { readStore, updateStoreWithRevision, leadsArray } from '../shared/store_access.mjs';
import { sendApprovedMessage } from '../../../telegram_gateway/outbound_channel_router.mjs';
import { hasBeenSent, recordSendOnce, readLedger, RESULT_SENT } from '../../../telegram_gateway/outbound_send_ledger.mjs';

const UNSUPPORTED_RE = /(гарантируем|гарантия|100%|x\d|икс\d|roi|окупаемость|без риска|точно получите|увеличим продажи)/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LIVE_SEND_ENABLED = () => process.env.EMAIL_REAL_SEND_ENABLED === 'true' && process.env.MATER_NO_SEND !== 'true';
const MOCK_SEND_ENABLED = () => process.env.MATER_ALLOW_MOCK_OUTREACH_SEND === 'true';

function nowIso(now = null) { return now || new Date().toISOString(); }
function textMarker(subject, body) {
    return crypto.createHash('sha256').update(`${String(subject || '')}\n${String(body || '')}`).digest('hex').slice(0, 24);
}
function packageMarker(input) {
    return crypto.createHash('sha256').update(JSON.stringify(input || {})).digest('hex').slice(0, 32);
}
const CONTACT_OPT_OUT_FOOTER = 'Если обращения не нужны, ответьте одним словом, и я больше не напишу.';
function leadId(lead) { return String(lead?.lead_id || lead?.id || '').trim(); }
function companyName(lead) { return String(lead?.company || lead?.company_name || leadId(lead) || 'Компания').trim(); }
function recipientOf(lead) { return String(lead?.email || lead?.recipient || '').trim(); }
function websiteOf(lead) { return String(lead?.website || lead?.domain || '').trim(); }
function scoreOf(lead) {
    const n = Number(lead?.score?.overall_priority_score ?? lead?.overall_priority_score ?? lead?.candidate_score ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
function sourceOf(lead) { return String(lead?.source || lead?.source_provider || lead?.lead_source || 'lead_pipeline_store').trim(); }
function collectedAtOf(lead) { return lead?.discovered_at || lead?.collected_at || lead?.staged_at || lead?.updated_at || null; }
function contactSourceOf(lead) { return String(lead?.email_source_url || lead?.contact_source_url || lead?.source_url || '').trim(); }
function contactConfidenceOf(lead) {
    if (lead?.email_verified === true || /manual_verified|owner_verified|official/i.test(String(lead?.email_source || lead?.email_status || ''))) return 'high';
    if (lead?.email) return 'medium';
    if (lead?.contact_form_url || lead?.website) return 'low';
    return 'missing';
}
function whatSells(lead) {
    const fields = [
        lead?.products_services,
        lead?.products,
        lead?.services,
        lead?.niche,
        lead?.industry,
        lead?.segment,
        lead?.category,
    ].flat().filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
    return fields.length ? [...new Set(fields)].slice(0, 3).join(', ') : 'не удалось уверенно определить';
}
function primaryContactChannel(lead) {
    if (recipientOf(lead)) return 'email';
    if (lead?.contact_form_url || lead?.contact_form) return 'contact_form';
    if (lead?.telegram) return 'telegram';
    if (lead?.phone) return 'phone';
    return 'not_found';
}
function readSentGuards(ledgerPath = ledgerFile()) {
    return new Set(readLedger(ledgerPath)
        .filter((e) => e?.result === RESULT_SENT && e?.duplicate_guard_id)
        .map((e) => e.duplicate_guard_id));
}
function ledgerFile() { return process.env.MATER_OUTREACH_LEDGER_PATH || SEND_LEDGER_PATH; }

function ensureContactOptOut(body = '') {
    const text = String(body || '').trim();
    if (!text) return '';
    if (/если обращения не нужны|больше не напиш/i.test(text)) return text;
    return `${text}\n\n${CONTACT_OPT_OUT_FOOTER}`;
}

function leadRef(store, id) {
    const sid = String(id || '').trim();
    if (!sid) return null;
    if (store.leads && !Array.isArray(store.leads)) {
        if (store.leads[sid]) return { get: () => store.leads[sid], set: (v) => { store.leads[sid] = v; } };
        for (const key of Object.keys(store.leads)) {
            const v = store.leads[key];
            if (v && leadId(v) === sid) return { get: () => store.leads[key], set: (nv) => { store.leads[key] = nv; } };
        }
    }
    if (Array.isArray(store.leads)) {
        const idx = store.leads.findIndex((x) => leadId(x) === sid);
        if (idx >= 0) return { get: () => store.leads[idx], set: (v) => { store.leads[idx] = v; } };
    }
    return null;
}

export function qualityCheck({ subject = '', body = '' } = {}) {
    const checks = [];
    const add = (id, label_ru, state, reason_ru = '') => checks.push({ id, label_ru, state, reason_ru });
    const text = `${subject}\n${body}`;
    add('unsupported_claims', 'Неподтверждённые обещания', UNSUPPORTED_RE.test(text) ? 'BLOCKED' : 'PASS',
        UNSUPPORTED_RE.test(text) ? 'Уберите гарантии результата, ROI и абсолютные обещания.' : '');
    add('tone', 'Тон', /срочно|последний шанс|купите/i.test(text) ? 'NEEDS_EDIT' : 'PASS',
        /срочно|последний шанс|купите/i.test(text) ? 'Текст звучит давяще.' : '');
    add('length', 'Длина', body.length > 1200 ? 'NEEDS_EDIT' : 'PASS',
        body.length > 1200 ? 'Сократите письмо до одного короткого действия.' : '');
    add('personalization', 'Персонализация', /Компания|сайт|разбор/i.test(text) ? 'PASS' : 'NEEDS_EDIT',
        /Компания|сайт|разбор/i.test(text) ? '' : 'Добавьте привязку к компании или сайту.');
    add('compliance', 'Аккуратность контакта', /если обращения не нужны|больше не напиш/i.test(text) ? 'PASS' : 'NEEDS_EDIT',
        /если обращения не нужны|больше не напиш/i.test(text) ? '' : 'Добавьте простой отказ от дальнейших сообщений.');
    add('deliverability', 'Доставляемость', subject.length <= 90 && !/[!?]{2,}/.test(subject) ? 'PASS' : 'NEEDS_EDIT',
        subject.length <= 90 && !/[!?]{2,}/.test(subject) ? '' : 'Сделайте тему короче и спокойнее.');
    const status = checks.some((c) => c.state === 'BLOCKED') ? 'BLOCKED'
        : checks.some((c) => c.state === 'NEEDS_EDIT') ? 'NEEDS_EDIT'
            : 'PASS';
    return { status, checks };
}

export function buildDraftForLead(lead = {}) {
    const company = companyName(lead);
    const site = websiteOf(lead);
    const product = whatSells(lead);
    const fact = product === 'не удалось уверенно определить'
        ? 'по сайту не буду додумывать, что именно вы продаёте'
        : `по открытым данным вижу направление: ${product}`;
    const subject = `Короткий разбор сайта ${company}`;
    const body = [
        'Здравствуйте.',
        '',
        `Посмотрел сайт ${site || company}: ${fact}.`,
        'Могу прислать короткий разбор первого экрана, пути заявки и точек, где посетитель может не дойти до обращения.',
        '',
        'Без обещаний результата: только конкретные наблюдения по сайту и что можно поправить.',
        'Кому у вас удобнее передать такой разбор?',
        '',
        CONTACT_OPT_OUT_FOOTER,
    ].join('\n');
    const marker = textMarker(subject, body);
    return {
        draft_id: `draft_${marker.slice(0, 12)}`,
        subject,
        body,
        text_marker: marker,
        quality: qualityCheck({ subject, body }),
        generated_at: nowIso(),
        status: 'DRAFT_READY',
    };
}

function readinessForLead(lead = {}, { ledgerPath = ledgerFile() } = {}) {
    const id = leadId(lead);
    const recipient = recipientOf(lead);
    const blockers = [];
    const warnings = [];
    if (!recipient) blockers.push('CONTACT_MISSING');
    else if (!EMAIL_RE.test(recipient)) blockers.push('RECIPIENT_INVALID');
    const status = String(lead.status || '').toLowerCase();
    if (lead.do_not_contact === true || lead.opt_out === true || status === 'opt_out') blockers.push('DO_NOT_CONTACT');
    if (lead.bounce_suppressed === true || lead.email_status === 'BOUNCED' || status.includes('bounce')) blockers.push('BOUNCE_BLOCK');
    if (lead.duplicate === true || lead.duplicate_contact === true || lead.duplicate_domain === true || lead.duplicate_of) blockers.push('DUPLICATE');
    if (lead.prior_reply_exists === true || lead.reply_received === true || status === 'replied') blockers.push('EXISTING_REPLY');
    if (lead.prior_outreach_exists === true || status === 'waiting_reply') warnings.push('PRIOR_OUTREACH_VISIBLE');
    if (hasBeenSent({ lead_id: id, recipient }, ledgerPath) || lead.outreach?.send_status === 'SENT' || lead.last_sent_at || lead.sent_at) blockers.push('ALREADY_SENT');
    if (lead.outreach?.decision === 'REJECT') blockers.push('OWNER_REJECTED');
    if (lead.outreach?.decision === 'HOLD') warnings.push('OWNER_HOLD');
    const quality = lead.outreach?.draft?.quality || (lead.draft ? qualityCheck({ subject: lead.draft.subject, body: lead.draft.body }) : null);
    if (quality?.status === 'BLOCKED') blockers.push('QUALITY_BLOCKED');
    return {
        ready: blockers.length === 0 && recipient !== '',
        blockers: [...new Set(blockers)],
        warnings: [...new Set(warnings)],
        owner_action_ru: blockers.length
            ? 'Исправьте данные или выберите отложить/отклонить.'
            : warnings.length
                ? 'Проверьте историю контакта и подтвердите точный текст.'
                : 'Проверьте текст и отправьте одно письмо.',
    };
}

function rowForLead(lead = {}, ctx = {}) {
    const draft = lead.outreach?.draft || lead.draft || buildDraftForLead(lead);
    const readiness = readinessForLead(lead, ctx);
    const priority = scoreOf(lead) + (readiness.ready ? 1000 : 0) - (String(lead.status || '').includes('rejected') ? 500 : 0);
    return {
        lead_id: leadId(lead),
        company_name: companyName(lead),
        website: websiteOf(lead),
        what_sells: whatSells(lead),
        niche: lead.niche || lead.industry || lead.segment || '',
        region: lead.region || lead.city || '',
        source: sourceOf(lead),
        source_url_present: !!lead.source_url,
        confidence: String(lead.confidence || lead.verification_confidence || contactConfidenceOf(lead)),
        collected_at: collectedAtOf(lead),
        contact_channel: primaryContactChannel(lead),
        contact_present: !!recipientOf(lead),
        contact_source_present: !!contactSourceOf(lead),
        contact_confidence: contactConfidenceOf(lead),
        prior_outreach_status: lead.prior_outreach_exists === true || lead.last_sent_at || lead.sent_at ? 'FOUND' : 'NONE_VISIBLE',
        contact_restriction_status: lead.do_not_contact === true || lead.opt_out === true ? 'DO_NOT_CONTACT' : 'PASS',
        duplicate_status: lead.duplicate === true || lead.duplicate_contact === true || lead.duplicate_domain === true ? 'DUPLICATE' : 'NONE_VISIBLE',
        status: lead.outreach?.send_status || lead.outreach?.decision || lead.status || 'UNKNOWN',
        priority_score: priority,
        fit_score: scoreOf(lead),
        draft_subject: draft.subject || '',
        draft_body_preview: String(draft.body || '').slice(0, 260),
        text_marker: draft.text_marker || draft.content_hash || textMarker(draft.subject, draft.body),
        readiness,
        next_action_ru: readiness.ready ? 'Проверить и отправить одно письмо' : readiness.owner_action_ru,
    };
}

export function queue({ limit = 25, includeBlocked = true, storePath = STORE_PATH, ledgerPath = ledgerFile() } = {}) {
    const store = readStore(storePath);
    const rows = leadsArray(store)
        .filter((l) => l && !l.test_only)
        .map((l) => rowForLead(l, { ledgerPath }))
        .filter((r) => includeBlocked || r.readiness.ready)
        .sort((a, b) => (b.priority_score - a.priority_score) || a.company_name.localeCompare(b.company_name))
        .slice(0, Math.max(1, Math.min(100, Number(limit) || 25)));
    const ready = rows.filter((r) => r.readiness.ready).length;
    return {
        items: rows,
        total: rows.length,
        ready_count: ready,
        blocked_count: rows.length - ready,
        live_send_enabled: LIVE_SEND_ENABLED(),
        mock_send_enabled: MOCK_SEND_ENABLED(),
        payments_live: false,
        production_db_write: false,
        next_action_ru: ready ? 'Откройте первый готовый лид.' : 'Исправьте блокеры или запустите поиск новых лидов.',
    };
}

export function detail(leadId, { storePath = STORE_PATH, ledgerPath = ledgerFile() } = {}) {
    const store = readStore(storePath);
    const ref = leadRef(store, leadId);
    const lead = ref?.get();
    if (!lead) return null;
    const draft = lead.outreach?.draft || lead.draft || buildDraftForLead(lead);
    return {
        ...rowForLead(lead, { ledgerPath }),
        exact_recipient: recipientOf(lead),
        contact_source_url: contactSourceOf(lead),
        draft,
        history: {
            prior_outreach_exists: lead.prior_outreach_exists === true || !!lead.last_sent_at || !!lead.sent_at,
            prior_reply_exists: lead.prior_reply_exists === true || lead.reply_received === true,
            sent_at: lead.last_sent_at || lead.sent_at || null,
            send_proof_status: lead.send_proof_status || null,
        },
    };
}

export function saveDraft({ leadId, subject, body, operationId = null, updatedBy = 'owner_app', expectedRevision = null } = {}) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const ref = leadRef(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const base = buildDraftForLead(lead);
        const nextSubject = String(subject ?? base.subject).trim();
        const nextBody = ensureContactOptOut(String(body ?? base.body));
        if (!nextSubject || !nextBody) { outcome = { ok: false, code: 'DRAFT_EMPTY' }; return null; }
        const draft = {
            draft_id: `draft_${textMarker(nextSubject, nextBody).slice(0, 12)}`,
            subject: nextSubject,
            body: nextBody,
            text_marker: textMarker(nextSubject, nextBody),
            quality: qualityCheck({ subject: nextSubject, body: nextBody }),
            status: 'DRAFT_READY',
            updated_at: nowIso(),
        };
        lead.outreach = { ...(lead.outreach || {}), draft, decision: 'DRAFT_READY', updated_at: nowIso() };
        ref.set(lead);
        outcome = { ok: true, lead_id: leadId, draft, revision: null };
        return store;
    }, { expectedRevision, updatedBy, operationId, storePath: STORE_PATH });
    if (res.written) return { ...outcome, revision: res.revision };
    return outcome;
}

export async function sendOne({ leadId, exactRecipient, exactSubject, exactBody, ownerConfirmation = false, provider = 'live', operationId = null, updatedBy = 'owner_app', expectedRevision = null } = {}) {
    if (ownerConfirmation !== true) return { ok: false, code: 'OWNER_CONFIRMATION_REQUIRED', sent_count: 0 };
    const isMock = provider === 'mock';
    const isLive = provider === 'live';
    if (!isMock && !isLive) return { ok: false, code: 'UNKNOWN_PROVIDER_MODE', sent_count: 0 };
    if (isMock && !MOCK_SEND_ENABLED()) return { ok: false, code: 'MOCK_SEND_DISABLED', sent_count: 0 };
    if (isLive && !LIVE_SEND_ENABLED()) return { ok: false, code: 'LIVE_SEND_DISABLED', sent_count: 0 };

    const before = detail(leadId);
    if (!before) return { ok: false, code: 'LEAD_NOT_FOUND', sent_count: 0 };
    const recipient = String(exactRecipient || '').trim();
    const subject = String(exactSubject || '').trim();
    const body = String(exactBody || '').trim();
    if (recipient !== before.exact_recipient) return { ok: false, code: 'RECIPIENT_MISMATCH', sent_count: 0 };
    if (!subject || !body) return { ok: false, code: 'DRAFT_EMPTY', sent_count: 0 };
    const quality = qualityCheck({ subject, body });
    if (quality.status === 'BLOCKED') return { ok: false, code: 'QUALITY_BLOCKED', quality, sent_count: 0 };
    const readiness = before.readiness;
    const hard = readiness.blockers.filter((b) => b !== 'QUALITY_BLOCKED');
    if (hard.length) return { ok: false, code: 'SEND_BLOCKED', blockers: hard, sent_count: 0 };

    const ledgerPath = ledgerFile();
    if (hasBeenSent({ lead_id: leadId, recipient }, ledgerPath)) return { ok: false, code: 'DUPLICATE_SEND_BLOCKED', sent_count: 0 };
    const marker = textMarker(subject, body);
    const pkgMarker = packageMarker({ leadId, recipient, subject, body, marker });
    const result = await sendApprovedMessage({
        to: recipient,
        subject,
        body,
        channel: 'email',
        lead: { lead_id: leadId, email: recipient },
        company: before.company_name,
        website: before.website,
    }, {
        owner_confirmed: true,
        approved_by: 'Dmitry',
        autosend: false,
        mass_send: false,
        message_count: 1,
        channel: 'email',
        real_send_enabled: isLive,
        env: process.env,
        adapters: isMock ? {
            email: {
                send: async () => ({
                    ok: true,
                    status: 'sent',
                    smtp_accepted: true,
                    smtp_response_code: 250,
                    accepted_recipients: 1,
                    messageId: `mock-${pkgMarker}`,
                    sent_count: 1,
                }),
            },
        } : undefined,
    });
    if (result.ok !== true || Number(result.sent_count || 0) !== 1) {
        return { ok: false, code: result.code || 'PROVIDER_SEND_FAILED', provider_result: { code: result.code, status: result.status, reason: result.reason }, sent_count: 0 };
    }

    let outcome = null;
    const res = updateStoreWithRevision((store) => {
        const ref = leadRef(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND_AFTER_SEND' }; return null; }
        const lead = ref.get();
        const recorded = recordSendOnce({
            lead_id: leadId,
            company: before.company_name,
            website: before.website,
            recipient,
            subject,
            draft_id: `draft_${marker.slice(0, 12)}`,
            result: RESULT_SENT,
            smtp_message_id: result.messageId || result.message_id || result.adapter_result?.messageId || '',
            approved_by: 'Dmitry',
            contacted_marked: true,
        }, ledgerPath);
        if (!recorded.written) { outcome = { ok: false, code: 'DUPLICATE_SEND_BLOCKED', sent_count: 0 }; return null; }
        const sentAt = recorded.entry.timestamp;
        lead.status = 'waiting_reply';
        lead.last_sent_at = sentAt;
        lead.send_proof_status = isMock ? 'mock_proven' : 'proven';
        lead.smtp_response_code = Number(result.smtp_response_code || result.adapter_result?.smtp_response_code || 250);
        lead.outreach = {
            ...(lead.outreach || {}),
            send_status: 'SENT',
            provider,
            sent_at: sentAt,
            recipient,
            subject,
            text_marker: marker,
            package_marker: pkgMarker,
            duplicate_guard_id: recorded.entry.duplicate_guard_id,
            updated_at: sentAt,
        };
        ref.set(lead);
        outcome = {
            ok: true,
            status: 'SENT',
            lead_id: leadId,
            sent_count: 1,
            provider,
            text_marker: marker,
            package_marker: pkgMarker,
            duplicate_guard_id: recorded.entry.duplicate_guard_id,
        };
        return store;
    }, { expectedRevision, updatedBy, operationId, storePath: STORE_PATH });
    if (outcome?.ok) return { ...outcome, revision: res.revision };
    return outcome || { ok: false, code: 'SEND_RECORD_FAILED', sent_count: 0 };
}

export function decide({ leadId, decision, reason = '', operationId = null, updatedBy = 'owner_app', expectedRevision = null } = {}) {
    const normalized = String(decision || '').trim().toUpperCase();
    if (!['SKIP', 'POSTPONE', 'HOLD', 'REJECT'].includes(normalized)) return { ok: false, code: 'UNKNOWN_DECISION' };
    let outcome = null;
    const res = updateStoreWithRevision((store) => {
        const ref = leadRef(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const mapped = normalized === 'SKIP' || normalized === 'POSTPONE' ? 'HOLD' : normalized;
        lead.outreach = {
            ...(lead.outreach || {}),
            decision: mapped,
            decision_reason: String(reason || '').slice(0, 500),
            decided_at: nowIso(),
            updated_at: nowIso(),
        };
        if (mapped === 'HOLD') lead.status = 'hold_later';
        if (mapped === 'REJECT') lead.status = 'rejected';
        ref.set(lead);
        outcome = { ok: true, lead_id: leadId, decision: mapped };
        return store;
    }, { expectedRevision, updatedBy, operationId, storePath: STORE_PATH });
    if (res.written) return { ...outcome, revision: res.revision };
    return outcome || { ok: false, code: 'DECISION_NOT_WRITTEN' };
}

export function stats({ ledgerPath = ledgerFile() } = {}) {
    const q = queue({ limit: 100, includeBlocked: true, ledgerPath });
    const ledger = readLedger(ledgerPath).filter((e) => e?.result === RESULT_SENT);
    return {
        queue_total: q.total,
        ready_count: q.ready_count,
        blocked_count: q.blocked_count,
        sent_count: ledger.length,
        duplicate_guards: readSentGuards(ledgerPath).size,
        auto_send: 'OFF',
        mass_send: 'OFF',
        payments: 'OFF',
        production_db_write: 'OFF',
    };
}

export default { queue, detail, saveDraft, sendOne, decide, stats, buildDraftForLead, qualityCheck };
