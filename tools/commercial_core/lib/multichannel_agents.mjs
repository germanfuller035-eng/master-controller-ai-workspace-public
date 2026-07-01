// tools/commercial_core/lib/multichannel_agents.mjs
// PURE multichannel AI agents (shadow, no-send). Extend the existing 5-agent chain with Source Quality,
// Channel Intelligence, Conversation, and Channel QA. Agents emit validated verdicts only; never send,
// never write canonical, never act on untrusted instructions. Reuses sanitizeUntrusted for injection.
import { sanitizeUntrusted } from './agent_shadow.mjs';
import { evaluatePolicy } from './consent_policy.mjs';

// 19.1 Source Quality Agent
export function sourceQuality(candidate, sourceMeta = {}) {
    const issues = [];
    if (!candidate.company_name_normalized) issues.push('no_company_identity');
    if (candidate.guessed_email) issues.push('guessed_email');
    if (sourceMeta.freshness === 'stale') issues.push('stale_source');
    const evidence = [candidate.website_domain, (candidate.phones || []).length, (candidate.emails || []).length, candidate.is_business_evidence].filter(Boolean).length;
    let verdict;
    if (issues.includes('guessed_email') || issues.includes('no_company_identity')) verdict = 'SOURCE_REJECTED';
    else if (evidence >= 2) verdict = 'SOURCE_APPROVED';
    else verdict = 'SOURCE_NEEDS_REVIEW';
    return { artifact_type: 'SOURCE_QUALITY', candidate_id: candidate.candidate_id, verdict, issues, evidence_signals: evidence };
}

// 19.2 Channel Intelligence Agent — determines available/verified channels + best next (no send).
export function channelIntelligence(company = {}) {
    const links = company.links || [];
    const verified = links.filter((l) => l.status === 'VERIFIED').map((l) => l.identity_type);
    const available = [...new Set(links.filter((l) => l.status !== 'REVOKED').map((l) => l.identity_type))];
    const typeToChannel = { email: 'EMAIL', vk_community: 'VK', max_chat: 'MAX', telegram_user: 'TELEGRAM', whatsapp_number: 'WHATSAPP' };
    const channels = available.map((t) => typeToChannel[t]).filter(Boolean);
    const preferred = company.preferred_channel || (verified.includes('email') ? 'EMAIL' : channels[0] || null);
    return {
        artifact_type: 'CHANNEL_INTELLIGENCE', company_id: company.company_id,
        available_channels: channels, verified_channels: verified.map((t) => typeToChannel[t]).filter(Boolean),
        preferred_channel: preferred, best_next_channel: preferred,
        allowed_actions: ['PREPARE_DRAFT', 'OWNER_REVIEW'], // never includes SEND this wave
        channel_risk: channels.length === 0 ? 'no_channel' : 'ok',
        owner_review_required: true, send_capability: 'NONE',
    };
}

// 19.3 Conversation Agent — intent/urgency/sentiment + reply draft (untrusted text contained).
const INTENT_RULES = [
    [/audit|аудит|проверк/i, 'START_MINI_AUDIT'],
    [/сайт|website|http/i, 'SEND_WEBSITE'],
    [/цена|стоит|сколько|price/i, 'PRICING_QUESTION'],
    [/перезвон|звонок|консультац|call/i, 'REQUEST_CONSULTATION'],
    [/не интересно|отписат|stop|unsubscribe/i, 'NOT_INTERESTED'],
];
export function conversationAgent(message = {}) {
    const safe = sanitizeUntrusted(message.body || '');
    let intent = 'UNKNOWN';
    for (const [re, label] of INTENT_RULES) if (re.test(safe.text)) { intent = label; break; }
    const urgency = /срочно|сегодня|urgent|asap/i.test(safe.text) ? 'high' : 'normal';
    const objection = /дорого|подумаю|не уверен|expensive/i.test(safe.text);
    return {
        artifact_type: 'CONVERSATION', intent, urgency,
        sentiment: /спасибо|отлично|интересно|👍/i.test(safe.text) ? 'positive' : objection ? 'hesitant' : 'neutral',
        product_interest: intent === 'START_MINI_AUDIT' || intent === 'PRICING_QUESTION' ? 'mini_audit' : null,
        objection_detected: objection,
        reply_draft_ref: `reply_draft_${message.message_id || 'x'}`, // reference only, not sent
        injection_flagged: safe.injectionFlagged,
        next_action: intent === 'NOT_INTERESTED' ? 'RECORD_OPT_OUT_CANDIDATE' : 'OWNER_REVIEW',
        send_capability: 'NONE',
    };
}

// 19.4 Channel QA Agent — policy/consent/format/duplicate/approval check before owner review.
export function channelQa({ company = {}, channel = 'EMAIL', consentStatus = 'UNKNOWN', draft = {}, duplicate = false }) {
    const policy = evaluatePolicy({ channel, consentStatus, direction: 'reply' });
    const issues = [];
    if (policy.outbound_allowed) issues.push('unexpected_outbound_allowed'); // must never be true for new channels
    if (duplicate) issues.push('duplicate');
    if (draft.injection_flagged) issues.push('prompt_injection_in_content');
    if (consentStatus === 'OPTED_OUT') issues.push('opted_out');
    let verdict;
    if (issues.includes('opted_out') || issues.includes('unexpected_outbound_allowed')) verdict = 'REJECTED';
    else if (duplicate || draft.injection_flagged) verdict = 'QUARANTINED';
    else verdict = 'APPROVED_FOR_OWNER_REVIEW';
    return { artifact_type: 'CHANNEL_QA', verdict, issues, policy_reason_codes: policy.reason_codes, ready_for_owner_review: verdict === 'APPROVED_FOR_OWNER_REVIEW', send_allowed: false };
}

// Full multichannel chain for an inbound message + candidate (shadow).
export function runMultichannelChain({ candidate, company, message, channel, consentStatus, duplicate = false }) {
    const sq = candidate ? sourceQuality(candidate) : null;
    const ci = channelIntelligence(company || {});
    const conv = message ? conversationAgent(message) : null;
    const qa = channelQa({ company, channel, consentStatus, draft: conv || {}, duplicate });
    return {
        artifacts: [sq, ci, conv, qa].filter(Boolean),
        owner_review_required: true,
        send_attempts: 0,
        agent_mode: 'SHADOW_NO_SEND',
    };
}
