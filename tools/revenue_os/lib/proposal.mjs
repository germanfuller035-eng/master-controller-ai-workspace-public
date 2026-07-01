// tools/revenue_os/lib/proposal.mjs
// Phase 13: Proposal Document Generator. Markdown + JSON (+ optional HTML preview). No PDF.
// CLIENT_READY requires owner-approved price + evidence gate + scope validation.

import { APPROVAL_STATE } from './common.mjs';

// Determine the highest allowable approval label for a proposal given gates.
export function resolveApprovalLabel(offerResult, requested) {
  const { offer, evidence_check, scope_check, price_guard } = offerResult;
  const gatesPass = evidence_check.ok && scope_check.ok && price_guard.ok &&
    offer.price.approved_by_owner === true && offer.not_client_ready_label === null;

  // Default INTERNAL_REVIEW. Never auto CLIENT_READY without gates.
  if (requested === 'CLIENT_READY') return gatesPass ? 'CLIENT_READY' : 'INTERNAL_REVIEW';
  if (requested === 'OWNER_APPROVED') return offer.price.approved_by_owner ? 'OWNER_APPROVED' : 'INTERNAL_REVIEW';
  return requested && APPROVAL_STATE.includes(requested) ? requested : 'INTERNAL_REVIEW';
}

export function generateProposal(offerResult, opts = {}) {
  const { offer } = offerResult;
  const label = resolveApprovalLabel(offerResult, opts.requested_label || 'INTERNAL_REVIEW');
  const client = opts.client_name || '[client]';

  const json = {
    schema: 'revenue_os.proposal.v1',
    title: `Предложение: ${offer.recommended_product.client_name || offer.recommended_product.name}`,
    client,
    approval_state: label,
    send_allowed: false,
    current_situation: offer.problem_statement,
    verified_observations: offer.evidence_summary,
    objectives: ['address the verified problem with a scoped deliverable'],
    proposed_solution: offer.recommended_product,
    scope: offer.deliverables,
    deliverables: offer.deliverables,
    timeline: offer.timeline,
    price: offer.price,
    responsibilities: offer.client_inputs,
    exclusions: offer.exclusions,
    acceptance: offer.approval_checklist,
    next_step: offer.next_step,
    validity: offer.validity_period,
    blockers: offer.blockers,
  };

  const md = renderMarkdown(json);
  return { json, markdown: md, html: opts.html ? renderHtml(json) : null, approval_state: label };
}

function renderMarkdown(j) {
  const L = [];
  L.push(`# ${j.title}`);
  L.push('');
  L.push(`> **${j.approval_state}** · send_allowed=false · черновик, не для отправки без approval`);
  L.push('');
  L.push(`**Клиент:** ${j.client}`);
  L.push('');
  L.push('## Текущая ситуация'); L.push(j.current_situation); L.push('');
  L.push('## Проверенные наблюдения');
  if (j.verified_observations.length === 0) L.push('- (нет проверенных наблюдений)');
  for (const o of j.verified_observations) L.push(`- [${o.type}] ${o.claim} (${o.source || 'no source'})`);
  L.push('');
  L.push('## Цель'); j.objectives.forEach((o) => L.push(`- ${o}`)); L.push('');
  L.push('## Предлагаемое решение'); L.push(`- ${j.proposed_solution.name}`); L.push('');
  L.push('## Что входит (deliverables)'); j.deliverables.forEach((d) => L.push(`- ${d}`)); L.push('');
  L.push('## Сроки'); L.push(`- ${j.timeline}`); L.push('');
  L.push('## Стоимость'); L.push(`- ${j.price.display} (${j.price.status}${j.price.approved_by_owner ? ', approved' : ', NOT approved'})`); L.push('');
  L.push('## Ответственность клиента'); j.responsibilities.forEach((r) => L.push(`- ${r}`)); L.push('');
  L.push('## Что не входит'); j.exclusions.forEach((e) => L.push(`- ${e}`)); L.push('');
  L.push('## Приёмка'); j.acceptance.forEach((a) => L.push(`- ${a}`)); L.push('');
  L.push('## Следующий шаг'); L.push(`- ${j.next_step}`); L.push('');
  L.push(`## Срок действия`); L.push(`- ${j.validity}`); L.push('');
  if (j.blockers.length) { L.push('## Блокеры (внутреннее)'); j.blockers.forEach((b) => L.push(`- ${b}`)); L.push(''); }
  return L.join('\n');
}

function renderHtml(j) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(j.title)}</title></head>` +
    `<body><div style="border:2px solid #c33;padding:4px;font-weight:bold">${esc(j.approval_state)} · send_allowed=false</div>` +
    `<h1>${esc(j.title)}</h1><p><b>Клиент:</b> ${esc(j.client)}</p>` +
    `<h2>Текущая ситуация</h2><p>${esc(j.current_situation)}</p>` +
    `<h2>Что входит</h2><ul>${j.deliverables.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` +
    `<h2>Стоимость</h2><p>${esc(j.price.display)} (${esc(j.price.status)})</p>` +
    `<h2>Следующий шаг</h2><p>${esc(j.next_step)}</p></body></html>`;
}
