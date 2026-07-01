// tools/revenue_os/lib/messaging.mjs
// Phase 14: Sales Message Asset Factory. DRAFTS ONLY. send_allowed always false.
// No guessed recipient, no unverified facts, no pressure/urgency/social-proof/guarantee.

import { isGuessedEmail } from './evidence.mjs';

export const CHANNELS = ['email', 'telegram', 'web_form', 'max_future', 'whatsapp_future'];
export const DRAFT_TYPES = [
  'first_contact', 'follow_up', 'reply_to_interest', 'reply_to_price', 'reply_to_details',
  'call_proposal', 'not_now_response', 'opt_out_ack', 'proposal_handoff',
];

const PRESSURE_RX = /(только сегодня|срочно|последний шанс|успейте|ограничен|act now|limited time|hurry)/i;
const GUARANTEE_RX = /(гаранти|guarantee|100%|обязательно вырас)/i;
const FAKE_PROOF_RX = /(тысячи клиентов|сотни компаний|все выбирают|known brand|as seen)/i;

// inputs: { draft_type, channel, product, profile, evidence:[claims], recipient }
export function buildDraft(inputs) {
  const errors = [];
  const risk_flags = [];
  if (!DRAFT_TYPES.includes(inputs.draft_type)) errors.push(`unknown draft_type ${inputs.draft_type}`);
  if (!CHANNELS.includes(inputs.channel)) errors.push(`unknown channel ${inputs.channel}`);

  const profile = inputs.profile || {};
  // Opt-out: only an acknowledgement is allowed; never a follow-up.
  if (profile.opted_out && inputs.draft_type !== 'opt_out_ack') {
    errors.push('profile opted out — only opt_out_ack allowed, no follow-up');
  }

  // Recipient must be evidence-backed (no guessed email).
  const recipient = inputs.recipient || profile.contact_email || null;
  let recipient_evidence = false;
  if (recipient) {
    if (isGuessedEmail(recipient, inputs.evidence || profile.evidence)) {
      errors.push(`guessed/unverified recipient blocked: ${recipient}`);
    } else {
      recipient_evidence = (inputs.evidence || profile.evidence || []).some((e) =>
        (e.category === 'contact' || e.category === 'identity') && e.claim_type === 'FACT');
    }
  }

  const body = errors.length ? null : renderBody(inputs);
  if (body) {
    if (PRESSURE_RX.test(body)) risk_flags.push('pressure_language');
    if (GUARANTEE_RX.test(body)) risk_flags.push('guarantee_language');
    if (FAKE_PROOF_RX.test(body)) risk_flags.push('fake_social_proof');
  }

  const claims = extractClaims(inputs);
  const draft = {
    draft_type: inputs.draft_type,
    channel: inputs.channel,
    product_id: inputs.product ? inputs.product.product_id : null,
    recipient_evidence,
    claims,
    evidence_refs: (inputs.evidence || []).map((e) => e.source_url || e.source_type),
    risk_flags,
    body,
    approval_state: 'DRAFT_INTERNAL',
    send_allowed: false,
  };

  return { ok: errors.length === 0 && risk_flags.length === 0, errors, risk_flags, draft };
}

function extractClaims(inputs) {
  // Only verified FACTs may be stated; others are framed as inference.
  return (inputs.evidence || []).filter((e) => e.claim_type === 'FACT').map((e) => e.claim);
}

function renderBody(inputs) {
  const name = inputs.profile?.industry ? `бизнес (${inputs.profile.industry})` : 'ваш бизнес';
  const facts = (inputs.evidence || []).filter((e) => e.claim_type === 'FACT').map((e) => e.claim);
  switch (inputs.draft_type) {
    case 'first_contact':
      return `Здравствуйте. Я посмотрел ${name}. ` +
        (facts.length ? `Заметил: ${facts.slice(0, 2).join('; ')}. ` : '') +
        `Могу сделать короткий разбор с конкретными правками. Если интересно — отвечу подробнее.`;
    case 'reply_to_price':
      return `Стоимость зависит от объёма. Базовый мини-аудит — ${inputs.product?.price?.amount ? inputs.product.price.amount + ' ₽' : 'по согласованию'}. Точную цену подтвердим после уточнения деталей.`;
    case 'opt_out_ack':
      return `Понял, больше не буду писать. Ваши контакты исключим. Хорошего дня.`;
    case 'not_now_response':
      return `Понял, сейчас не время. Если будет актуально позже — на связи.`;
    case 'reply_to_interest':
      return `Спасибо за интерес. Расскажу подробнее о том, что входит, и какие данные понадобятся с вашей стороны.`;
    case 'reply_to_details':
      return `Подробности: что входит, сроки и что потребуется от вас. Готов прислать короткое описание.`;
    case 'call_proposal':
      return `Если удобно, можем коротко созвониться, чтобы обсудить детали. Когда вам удобнее?`;
    case 'follow_up':
      return `Возвращаюсь к нашему разговору. Если вопрос ещё актуален — готов продолжить.`;
    case 'proposal_handoff':
      return `Подготовил предложение по итогам разбора. Передаю на ваше рассмотрение.`;
    default:
      return `(черновик)`;
  }
}
