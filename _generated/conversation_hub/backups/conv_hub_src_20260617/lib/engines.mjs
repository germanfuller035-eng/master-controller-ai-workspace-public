// tools/conversation_hub/lib/engines.mjs
// MP7-14 — deterministic processing engines over SYNTHETIC fixtures. Pure, offline, no network.
//   normalize (MP7) · dedupe (MP8) · thread correlation (MP9) · identity resolution (MP10)
//   classification (MP11) · reply routing (MP12) · opt-out/consent (MP13) · bounce/delivery (MP14)
import { checksum, normalizeTs } from './common.mjs';

// ---------------------------------------------------------------------------
// MP22 redaction — secret + PII patterns. Applied during normalization.
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'api_key_assign', re: /\b(api[_-]?key|secret|token|password|smtp_pass)\b\s*[:=]\s*\S{8,}/gi },
  { name: 'bearer', re: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/g },
  { name: 'card_number', re: /\b(?:\d[ -]?){13,19}\b/g },
  { name: 'iban', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
];
const PII_PATTERNS = [
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: 'phone', re: /\+?\d[\d ()-]{8,}\d/g },
];

export function redactBody(raw) {
  if (!raw) return { body_redacted: '', sensitivity: 'NONE', flags: [] };
  let text = raw;
  const flags = [];
  let sensitivity = 'NONE';
  for (const p of SECRET_PATTERNS) {
    if (p.re.test(text)) { flags.push(`secret:${p.name}`); sensitivity = 'SECRET_RISK'; }
    text = text.replace(p.re, `[REDACTED:${p.name}]`);
  }
  for (const p of PII_PATTERNS) {
    if (p.re.test(text)) { flags.push(`pii:${p.name}`); if (sensitivity === 'NONE') sensitivity = 'PII'; }
    text = text.replace(p.re, `[PII:${p.name}]`);
  }
  // strip simple HTML tags (sanitize)
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { body_redacted: text, sensitivity, flags };
}

// ---------------------------------------------------------------------------
// MP7 — Message normalization. Input = synthetic raw envelope. Output = NormalizedMessage.
// ---------------------------------------------------------------------------
export function normalizeMessage(envelope) {
  const { body_redacted, sensitivity, flags } = redactBody(envelope.body_raw || envelope.body || '');
  const norm = {
    message_id: envelope.message_id || `msg_${checksum(envelope).slice(7, 19)}`,
    conversation_id: envelope.conversation_id || null,
    thread_id: envelope.thread_id || null,
    channel: envelope.channel,
    direction: envelope.direction || 'INBOUND',
    message_type: envelope.message_type || 'UNKNOWN',
    external_message_ref: envelope.external_message_ref || envelope.message_id_header || null,
    sender_ref: envelope.sender_ref || envelope.from || null,
    recipient_refs: envelope.recipient_refs || (envelope.to ? [envelope.to] : []),
    subject: envelope.subject || null,
    body_reference: envelope.body_reference || `vault://synthetic/${envelope.message_id || 'unknown'}`,
    body_redacted,
    received_at: normalizeTs(envelope.received_at || envelope.date),
    created_at: normalizeTs(envelope.created_at || envelope.date),
    delivery_state: envelope.delivery_state || (envelope.direction === 'OUTBOUND' ? 'UNKNOWN' : 'DELIVERED_CONFIRMED'),
    classification: null,
    confidence: null,
    attachments: envelope.attachments || [],
    source: envelope.source || { channel: envelope.channel, synthetic: true },
    sensitivity,
    redaction_flags: flags,
    revision: 1,
    synthetic: true,
  };
  norm.checksum = checksum({
    channel: norm.channel, ext: norm.external_message_ref, sender: norm.sender_ref,
    subject: norm.subject, body: norm.body_redacted, ts: norm.received_at,
  });
  return norm;
}

// ---------------------------------------------------------------------------
// MP8 — Deduplication. Compares a candidate against already-seen normalized messages.
// Never auto-merges probable identity conflicts.
// ---------------------------------------------------------------------------
export function dedupe(candidate, seen) {
  // exact external message id match on same channel+account => EXACT
  for (const m of seen) {
    if (candidate.external_message_ref && m.external_message_ref === candidate.external_message_ref && m.channel === candidate.channel) {
      // same ref but different content => CONFLICT (replay tampering or id reuse)
      if (m.checksum !== candidate.checksum) return { outcome: 'CONFLICT', against: m.message_id, reason: 'same external_ref, different checksum' };
      return { outcome: 'EXACT_DUPLICATE', against: m.message_id, reason: 'same external_message_ref + checksum' };
    }
  }
  // identical content checksum => EXACT
  for (const m of seen) {
    if (m.checksum === candidate.checksum) return { outcome: 'EXACT_DUPLICATE', against: m.message_id, reason: 'identical content checksum' };
  }
  // retry: same idempotency/attempt of an outbound request
  if (candidate.idempotency_key) {
    for (const m of seen) {
      if (m.idempotency_key === candidate.idempotency_key) return { outcome: 'RETRY_DUPLICATE', against: m.message_id, reason: 'same idempotency_key' };
    }
  }
  // probable: same sender + subject within a small timestamp window
  for (const m of seen) {
    if (m.sender_ref && m.sender_ref === candidate.sender_ref && m.subject && m.subject === candidate.subject && m.channel === candidate.channel) {
      const dt = Math.abs(Date.parse(m.received_at || 0) - Date.parse(candidate.received_at || 0));
      if (Number.isFinite(dt) && dt <= 5 * 60 * 1000) return { outcome: 'PROBABLE_DUPLICATE', against: m.message_id, reason: 'same sender+subject within 5min', manual_review: true };
    }
  }
  return { outcome: 'UNIQUE', against: null, reason: 'no match' };
}

// ---------------------------------------------------------------------------
// MP9 — Thread correlation. Email headers first, then subject/participant fallback.
// Never correlate by company name alone or guessed email.
// ---------------------------------------------------------------------------
export function correlateThread(msg, ourSentMessageIds = [], existingThreads = []) {
  const reasons = [];
  // 1. email header thread: In-Reply-To / References contains one of OUR sent Message-IDs
  if (msg.channel === 'EMAIL') {
    const refs = [].concat(msg.in_reply_to || [], msg.references || []);
    const hit = refs.find((r) => ourSentMessageIds.includes(r));
    if (hit) return { thread_match: 'HEADER', thread_id: threadForSentId(hit, existingThreads), confidence: 0.95, reasons: ['in_reply_to/references matches our sent Message-ID'] };
    // existing thread by external_thread_ref
    const t = existingThreads.find((t) => t.channel === 'EMAIL' && t.external_thread_ref && refs.includes(t.external_thread_ref));
    if (t) return { thread_match: 'HEADER', thread_id: t.thread_id, confidence: 0.9, reasons: ['references existing thread ref'] };
  }
  // 2. Telegram reply reference within chat
  if (msg.channel === 'TELEGRAM' && msg.reply_to_message_id) {
    const t = existingThreads.find((tt) => tt.channel === 'TELEGRAM' && tt.external_thread_ref === msg.chat_id);
    if (t) return { thread_match: 'REPLY_REF', thread_id: t.thread_id, confidence: 0.9, reasons: ['telegram reply within known chat'] };
  }
  // 3. web form submission id => new thread (explicit identity)
  if (msg.channel === 'WEB_FORM') {
    return { thread_match: 'NEW', thread_id: null, confidence: 0.8, reasons: ['web form submission -> new thread, explicit identity'] };
  }
  // 4. subject fallback (email) — same normalized subject + same participant
  if (msg.channel === 'EMAIL' && msg.subject) {
    const subjNorm = msg.subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, '').trim().toLowerCase();
    const t = existingThreads.find((tt) => tt.channel === 'EMAIL' && (tt.subject || '').replace(/^\s*(re|fwd|fw)\s*:\s*/i, '').trim().toLowerCase() === subjNorm
      && (tt.participants || []).includes(msg.sender_ref));
    if (t) return { thread_match: 'SUBJECT_FALLBACK', thread_id: t.thread_id, confidence: 0.6, reasons: ['subject + participant fallback'], manual_review: true };
  }
  return { thread_match: 'NONE', thread_id: null, confidence: 0.0, reasons: ['no header/reply/subject correlation; not correlating by company name or guessed email'] };
}
function threadForSentId(sentId, threads) {
  const t = threads.find((tt) => (tt.our_sent_ids || []).includes(sentId));
  return t ? t.thread_id : null;
}

// ---------------------------------------------------------------------------
// MP10 — Identity resolution. Only canonical/strong evidence allows auto-link recommendation.
// Conversation Hub NEVER creates a new canonical lead.
// ---------------------------------------------------------------------------
export function resolveIdentity(signals) {
  // signals: { canonical_lead_id?, verified_email?, verified_phone?, external_channel_id?, deal_ref?, candidates? }
  const reasons = [];
  if (signals.canonical_lead_id) return { state: 'CANONICAL_MATCH', canonical_lead_id: signals.canonical_lead_id, auto_link: true, reasons: ['explicit canonical_lead_id reference'] };
  const matches = signals.candidates || [];
  if (signals.verified_email) {
    const m = matches.filter((c) => c.verified_email && c.verified_email === signals.verified_email);
    if (m.length === 1) return { state: 'STRONG_MATCH', canonical_lead_id: m[0].canonical_lead_id, auto_link: true, reasons: ['unique verified email match'] };
    if (m.length > 1) return { state: 'CONFLICT', canonical_lead_id: null, auto_link: false, blocked: true, reasons: ['verified email matches multiple canonical leads'] };
  }
  if (signals.verified_phone) {
    const m = matches.filter((c) => c.verified_phone && c.verified_phone === signals.verified_phone);
    if (m.length === 1) return { state: 'STRONG_MATCH', canonical_lead_id: m[0].canonical_lead_id, auto_link: true, reasons: ['unique verified phone match'] };
    if (m.length > 1) return { state: 'CONFLICT', canonical_lead_id: null, auto_link: false, blocked: true, reasons: ['verified phone matches multiple'] };
  }
  if (signals.external_channel_id) {
    const m = matches.filter((c) => (c.external_channel_ids || []).includes(signals.external_channel_id));
    if (m.length === 1) return { state: 'PROBABLE_MATCH', canonical_lead_id: m[0].canonical_lead_id, auto_link: false, owner_review: true, reasons: ['single external channel id match -> owner review'] };
    if (m.length > 1) return { state: 'AMBIGUOUS', canonical_lead_id: null, auto_link: false, owner_review: true, reasons: ['multiple external channel id matches'] };
  }
  return { state: 'NO_MATCH', canonical_lead_id: null, auto_link: false, reasons: ['no canonical/strong/probable evidence; no new canonical lead created'] };
}

// ---------------------------------------------------------------------------
// MP11 — Classification. Deterministic rule engine. Russian + English signals.
// ---------------------------------------------------------------------------
const RULES = [
  { intent: 'bounce', conf: 0.97, type: 'BOUNCE', test: (m) => /mailer-daemon|delivery status notification|undeliverable|550|5\.1\.1|host or domain name not found/i.test(joined(m)) || m.message_type === 'BOUNCE' },
  { intent: 'auto_reply', conf: 0.9, type: 'AUTO_REPLY', test: (m) => /auto.?reply|out of office|автоответ|отпуск|вне офиса|i am currently away/i.test(joined(m)) || m.message_type === 'AUTO_REPLY' },
  { intent: 'unsubscribe', conf: 0.95, type: 'UNSUBSCRIBE', test: (m) => /unsubscribe|отписат|отпишите/i.test(joined(m)) },
  { intent: 'opt_out', conf: 0.92, type: 'OPT_OUT', test: (m) => /не пишите|не присылайте|не надо.{0,12}присылать|ничего (не )?присылать|удалите (мои|меня)|remove me|stop emailing|больше не пишите|отказываюсь/i.test(joined(m)) },
  { intent: 'complaint', conf: 0.85, type: 'COMPLAINT', test: (m) => /жалоб|возмут|безобразие|complaint|unacceptable|это спам|spam complaint/i.test(joined(m)) },
  { intent: 'incident', conf: 0.85, type: 'SUPPORT', test: (m) => /не работает|сломал|упал сайт|down|outage|critical|срочно не работает|ошибка 500/i.test(joined(m)) },
  { intent: 'billing', conf: 0.8, type: 'BILLING', test: (m) => /счёт|счет|оплат|invoice|payment|акт|реквизит|billing/i.test(joined(m)) },
  { intent: 'support', conf: 0.75, type: 'SUPPORT', test: (m) => /помогите|не получается|как настроить|support|вопрос по работе|инструкци/i.test(joined(m)) },
  { intent: 'referral', conf: 0.78, type: 'REFERRAL', test: (m) => /порекоменд|посоветовал|referral|my colleague|коллега|знакомый/i.test(joined(m)) },
  { intent: 'testimonial_permission', conf: 0.7, type: 'PLAIN', test: (m) => /можете использовать отзыв|разрешаю отзыв|testimonial|use my quote/i.test(joined(m)) },
  { intent: 'case_permission', conf: 0.7, type: 'PLAIN', test: (m) => /кейс|case study|можете рассказать о нашем проекте/i.test(joined(m)) },
  { intent: 'meeting_request', conf: 0.8, type: 'REPLY', test: (m) => /созвон|встреч|давайте обсудим|call|meeting|zoom|let's talk|когда удобно/i.test(joined(m)) },
  { intent: 'price_question', conf: 0.8, type: 'REPLY', test: (m) => /сколько стоит|цена|стоимост|price|quote|во сколько обойдется|бюджет/i.test(joined(m)) },
  { intent: 'details_question', conf: 0.7, type: 'REPLY', test: (m) => /подробнее|расскажите больше|что входит|details|what is included|как это работает/i.test(joined(m)) },
  { intent: 'rejection', conf: 0.8, type: 'REPLY', test: (m) => /не интересно|не актуально|откажемся|not interested|no thanks|не нужно/i.test(joined(m)) },
  { intent: 'not_now', conf: 0.7, type: 'REPLY', test: (m) => /не сейчас|позже|перезвоните через|may be later|следующ(ий|ем) квартал|пока не готов/i.test(joined(m)) },
  { intent: 'interest', conf: 0.72, type: 'REPLY', test: (m) => /интересно|расскажите|да, хочу|готовы начать|интересует|давайте|yes, interested/i.test(joined(m)) },
  { intent: 'delivery_receipt', conf: 0.95, type: 'DELIVERY_RECEIPT', test: (m) => m.message_type === 'DELIVERY_RECEIPT' || /read receipt|disposition-notification/i.test(joined(m)) },
  { intent: 'spam', conf: 0.6, type: 'PLAIN', test: (m) => /viagra|crypto investment|вы выиграли|казино|loan offer/i.test(joined(m)) },
];
function joined(m) { return `${m.subject || ''}\n${m.body_redacted || m.body || ''}`; }

export function classify(msg) {
  const triggered = [];
  let best = null;
  for (const r of RULES) {
    let hit = false;
    try { hit = r.test(msg); } catch { hit = false; }
    if (hit) {
      triggered.push(r.intent);
      if (!best || r.conf > best.conf) best = r;
    }
  }
  if (!best) {
    return { classification_id: `cls_${(msg.message_id || 'x')}`, message_id: msg.message_id, primary_intent: 'unknown', secondary_intents: [], urgency: 'P3_LOW', confidence: 0.3, rules_triggered: [], manual_review: true };
  }
  const urgency = best.intent === 'incident' || best.intent === 'complaint' ? 'P0_CRITICAL'
    : best.intent === 'opt_out' || best.intent === 'unsubscribe' || best.intent === 'billing' ? 'P1_HIGH'
    : best.intent === 'interest' || best.intent === 'price_question' || best.intent === 'meeting_request' ? 'P2_NORMAL'
    : 'P3_LOW';
  return {
    classification_id: `cls_${msg.message_id}`,
    message_id: msg.message_id,
    primary_intent: best.intent,
    secondary_intents: triggered.filter((t) => t !== best.intent),
    urgency,
    confidence: best.conf,
    rules_triggered: triggered,
    manual_review: best.conf < 0.7,
  };
}

// ---------------------------------------------------------------------------
// MP12 — Reply routing. Recommendation only.
// ---------------------------------------------------------------------------
const ROUTE_MAP = {
  price_question: 'REVENUE_OS', interest: 'REVENUE_OS', meeting_request: 'REVENUE_OS', details_question: 'REVENUE_OS',
  not_now: 'REVENUE_OS', rejection: 'REVENUE_OS',
  billing: 'FINANCE_OS',
  support: 'CUSTOMER_SUCCESS_OS', referral: 'CUSTOMER_SUCCESS_OS', testimonial_permission: 'CUSTOMER_SUCCESS_OS', case_permission: 'CUSTOMER_SUCCESS_OS',
  incident: 'EXECUTIVE_OS', complaint: 'EXECUTIVE_OS',
  opt_out: 'MASTER_CONTROLLER_REPLY_QUEUE', unsubscribe: 'MASTER_CONTROLLER_REPLY_QUEUE',
  bounce: 'MASTER_CONTROLLER_REPLY_QUEUE', delivery_receipt: 'MASTER_CONTROLLER_REPLY_QUEUE', auto_reply: 'MASTER_CONTROLLER_REPLY_QUEUE',
  spam: 'OWNER_MANUAL_REVIEW', unknown: 'OWNER_MANUAL_REVIEW',
};
export function route(classification, identity) {
  const reasons = [];
  // identity conflict blocks routing
  if (identity && (identity.state === 'CONFLICT')) {
    return { routing_id: `rt_${classification.message_id}`, message_id: classification.message_id, target_system: 'BLOCKED_UNKNOWN', target_queue: 'identity_conflict', reason_codes: ['identity_conflict'], priority: 'REVIEW_REQUIRED', manual_review: true, blocked: true };
  }
  let target = ROUTE_MAP[classification.primary_intent] || 'OWNER_MANUAL_REVIEW';
  reasons.push(`intent=${classification.primary_intent} -> ${target}`);
  // high-risk escalation
  let priority = classification.urgency;
  if (classification.primary_intent === 'incident' || classification.primary_intent === 'complaint') { priority = 'P0_CRITICAL'; reasons.push('high-risk -> Executive escalation'); }
  if (classification.manual_review && target === 'OWNER_MANUAL_REVIEW') reasons.push('low confidence -> owner review');
  return {
    routing_id: `rt_${classification.message_id}`,
    message_id: classification.message_id,
    target_system: target,
    target_queue: target.toLowerCase(),
    reason_codes: reasons,
    priority,
    manual_review: !!classification.manual_review,
    blocked: false,
    note: 'recommendation only; Conversation Hub does not mutate any canonical state',
  };
}

// ---------------------------------------------------------------------------
// MP13 — Opt-out / consent. Detection + scope + recommendation (never canonical mutation).
// ---------------------------------------------------------------------------
export function detectOptOut(msg, classification) {
  const intent = classification?.primary_intent;
  if (intent !== 'opt_out' && intent !== 'unsubscribe' && intent !== 'complaint') return null;
  const text = joined(msg).toLowerCase();
  let scope = 'UNKNOWN';
  if (intent === 'unsubscribe') scope = 'ALL_COMMERCIAL';
  else if (/все|всё|любые|никогда|all|everything/.test(text)) scope = 'ALL_COMMERCIAL';
  else if (/по этому (адресу|каналу)|this channel|на email/.test(text)) scope = 'CHANNEL_ONLY';
  else if (/по этой рассылке|по этой кампании|this campaign/.test(text)) scope = 'CAMPAIGN_ONLY';
  else if (intent === 'opt_out') scope = 'ALL_COMMERCIAL';
  return {
    opt_out_id: `oo_${msg.message_id}`,
    canonical_lead_id: msg.canonical_lead_id || null,
    channel: msg.channel,
    scope,
    source_message_id: msg.message_id,
    status: 'RECOMMENDED',
    evidence: `intent=${intent}; text reference ${msg.body_reference}`,
    detected_at: msg.received_at,
    owner_review_required: true,
    priority: 'P1_HIGH',
    note: 'RECOMMENDATION ONLY. No automatic legal conclusion. Master Controller applies canonical opt-out. Support comms may remain allowed when contractually necessary (SUPPORT_EXCLUDED).',
    canonical_applied: false,
  };
}

// ---------------------------------------------------------------------------
// MP14 — Bounce / delivery model. Maps signals to delivery states with correct semantics.
// ---------------------------------------------------------------------------
export function classifyDelivery(signal) {
  // signal: { smtp_code?, dsn?, event? }
  const code = signal.smtp_code;
  if (signal.event === 'transport_accepted' || code === 250) return { delivery_state: 'TRANSPORT_ACCEPTED', note: 'SMTP 250 != recipient read; not delivered-confirmed' };
  if (signal.event === 'delivered_confirmed') return { delivery_state: 'DELIVERED_CONFIRMED', note: 'delivered != replied; no read tracking unless lawful source' };
  if (code && code >= 400 && code < 500) return { delivery_state: 'BOUNCED_SOFT', note: 'soft bounce; retry policy may apply; not identity-invalid' };
  if (code && code >= 500) return { delivery_state: 'BOUNCED_HARD', note: 'hard bounce; may block future email recommendation; not necessarily identity-invalid' };
  if (signal.event === 'deferred') return { delivery_state: 'DEFERRED', note: 'temporary deferral' };
  if (signal.event === 'rejected') return { delivery_state: 'REJECTED', note: 'rejected by transport' };
  return { delivery_state: 'UNKNOWN', note: 'ambiguous transport result; reconcile before retry' };
}
