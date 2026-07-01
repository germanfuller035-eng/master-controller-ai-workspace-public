// tg_api_only_test.mjs — service wrappers + views + auth + invariants. PURE offline.
import fs from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const { TelegramApiClient } = await import('../telegram_gateway/api_only/api_client.mjs');
const { McService } = await import('../telegram_gateway/api_only/mc_service.mjs');
const V = await import('../telegram_gateway/api_only/views.mjs');

const base = 'https://195-96-132-82.sslip.io/api/v1';
const mk = (status, body) => new McService(new TelegramApiClient({ baseUrl: base, token: 't', fetchImpl: async () => ({ status, json: async () => body }) }));

// service wrappers reach correct routes (capture path)
let path = null;
const capClient = new TelegramApiClient({ baseUrl: base, token: 't', fetchImpl: async (url) => { path = url; return { status: 200, json: async () => ({ ok: true, data: {} }) }; } });
const svc = new McService(capClient);
await svc.lead('KZ-X'); ok('lead() hits canonical route', path.endsWith('/mini-audit/leads/KZ-X'));
await svc.automationStatus(); ok('automationStatus route', path.endsWith('/automation/status'));
await svc.leadsByStatus('verified_ready'); ok('leadsByStatus route', path.endsWith('/pipeline/by-status/verified_ready'));

// mutation wrappers carry op/idem
let body = null;
const capMut = new TelegramApiClient({ baseUrl: base, token: 't', fetchImpl: async (u, o) => { body = JSON.parse(o.body); return { status: 200, json: async () => ({ ok: true, data: { rejected: true } }) }; } });
await new McService(capMut).rejectDraft('apr1', { operationId: 'op1', idempotencyKey: 'k1', reason: 'x' });
ok('rejectDraft carries op+idem', body.operationId === 'op1' && body.idempotencyKey === 'k1');

// auth
ok('owner allowed', V.isOwner('123', ['123', '456']));
ok('non-owner denied', !V.isOwner('999', ['123']));
ok('empty allowlist denies all', !V.isOwner('123', []));

// views render
const today = await mk(200, { ok: true, data: { readySend: 0, waitingReply: 3, sendUncertain: 2, total: 50 } }).today();
ok('today renders', /Сегодня/.test(V.renderToday(today)) && /Ожидают ответа: 3/.test(V.renderToday(today)));
const lc = { data: { leadId: 'KZ-X', company: 'Co', status: 'verified_ready', candidate_score: 72, score: 90, website: 'co.kz', email: 'info@co.kz', revision: 5 } };
ok('lead card shows localized scores when present', /Предварительная оценка: 72/.test(V.renderLeadCard(lc)) && /Каноническая оценка: 90/.test(V.renderLeadCard(lc)) && /Ревизия: 5/.test(V.renderLeadCard(lc)));
ok('lead card has NO raw score keys', !/candidate_score_v2|canonical_score_v1/.test(V.renderLeadCard(lc)));
ok('health shows autosend blocked (RU)', /Автоотправка: заблокирована/.test(V.renderHealth({ data: { autosend: 'BLOCKED' } })));

// NO FALSE SUCCESS: failed result renders error, never success
ok('401 renders error not success', /отклонён|credential/i.test(V.renderError({ ok: false, code: 'CREDENTIAL_INVALID' })));
ok('409 renders conflict', /изменились|обнов/i.test(V.renderError({ ok: false, code: 'REVISION_CONFLICT' })));
ok('timeout renders error', /Таймаут/i.test(V.renderError({ ok: false, code: 'TIMEOUT' })));

// approval result NEVER claims delivery while send blocked
ok('approval no-send wording (sent:false)', /ЗАБЛОКИРОВАНА|не отправлено/i.test(V.renderApprovalResult({ ok: true, data: { sent: false } })));
ok('approval ok still says not sent', /не отправлено|заблокирована/i.test(V.renderApprovalResult({ ok: true, data: {} })));

// STATIC INVARIANTS: api_only modules contain no forbidden imports
for (const f of ['api_client.mjs', 'mc_service.mjs', 'views.mjs']) {
    const code = fs.readFileSync(new URL('../telegram_gateway/api_only/' + f, import.meta.url), 'utf8')
        .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    ok(`${f}: no fs/store/smtp/ledger in code`, !/require\(['"]fs|from ['"]node:fs|lead_store|saveStore|nodemailer|outbound_send_ledger|outbound_channel_router|127\.0\.0\.1|http:\/\/localhost/.test(code));
}

// ---- v0.4.0 Telegram UX patch proofs ----
const V2 = await import('../telegram_gateway/api_only/views.mjs');
ok('UX: menu text exists + routed entries', /Меню Master Controller/.test(V2.MENU_TEXT) && /\/today/.test(V2.MENU_TEXT) && /\/next/.test(V2.MENU_TEXT));
ok('UX: health human-readable (no raw JSON braces)', !/[{}]/.test(V2.renderHealth({ data: { canonicalWriter: true, queue: { COMPLETED: 8 }, pipeline: { rejected: 9 } } })));
ok('UX: automation human-readable (no raw JSON)', !/[{}]/.test(V2.renderAutomation({ data: { queue: { COMPLETED: 8 }, pipeline: { rejected: 9 } } })));
ok('UX: today explains operational vs canonical count', /активн|оперативн|полная база/i.test(V2.renderToday({ data: { total: 40 } })));
ok('UX: next action exposes lead_id + open (object shape)', (() => { const r = V2.renderNextAction({ ok: true, data: { reason: 'review', lead: { leadId: 'KZ-X', company: 'Co' } } }); return /lead_id: KZ-X/.test(r.text) && /\/lead KZ-X/.test(r.text); })());
ok('UX: lead selector lists leads (object shape)', (() => { const r = V2.renderLeadSelector({ ok: true, data: { items: [{ lead_id: 'A', company: 'CoA' }, { lead_id: 'B', company: 'CoB' }] } }); return /CoA/.test(r.text) && /CoB/.test(r.text); })());
ok('UX: lead selector empty offers other queues', (() => { const r = V2.renderLeadSelector({ ok: true, data: { items: [] } }); return /нет/i.test(r.text) && r.extra.reply_markup.inline_keyboard.length >= 1; })());

// ---- Telegram owner-smoke UX hotfix proofs (defects 1-5) ----
const { handleCommand, handleCallback } = await import('../telegram_gateway/api_only/index.mjs');
const RAW_KEYS = ['rejected', 'needs_identity_verification', 'hold_no_public_email', 'written_channel_search_queue', 'hold_later', 'waiting_reply', 'send_uncertain'];
const healthTxt = V2.renderHealth({ data: { canonicalWriter: true, autosend: 'BLOCKED', deadLetter: 0, storeRevision: 66, queue: { COMPLETED: 28 }, pipeline: { rejected: 9, needs_identity_verification: 1, hold_no_public_email: 10, written_channel_search_queue: 12, hold_later: 10, waiting_reply: 5, send_uncertain: 3 } } });
ok('HF1 /health has NO raw status keys', !RAW_KEYS.some((k) => healthTxt.includes(k)));
ok('HF2 /health uses Russian labels', /Отклонены: 9/.test(healthTxt) && /Не найден публичный email: 10/.test(healthTxt) && /Ожидают ответа: 5/.test(healthTxt));
ok('HF3 unknown status -> safe generic label', V2.statusLabelRu('some_new_internal_key') === 'Другой рабочий статус');
ok('HF4 /next returns REAL inline keyboard', (() => { const r = V2.renderNextAction({ ok: true, data: { action: 'followup_due', lead: { leadId: 'DKBI_RU', company: 'DKBI' } } }); return !!r.extra?.reply_markup?.inline_keyboard; })());
ok('HF5 inline button text is "📂 Открыть лид"', (() => { const r = V2.renderNextAction({ ok: true, data: { action: 'followup_due', lead: { leadId: 'DKBI_RU' } } }); return r.extra.reply_markup.inline_keyboard[0][0].text === '📂 Открыть лид'; })());
ok('HF6 callback uses canonical id (lead:DKBI_RU)', (() => { const r = V2.renderNextAction({ ok: true, data: { action: 'followup_due', lead: { leadId: 'DKBI_RU' } } }); return r.extra.reply_markup.inline_keyboard[0][0].callback_data === 'lead:DKBI_RU'; })());
ok('HF7 /next keeps /lead fallback', (() => { const r = V2.renderNextAction({ ok: true, data: { action: 'followup_due', lead: { leadId: 'DKBI_RU' } } }); return /\/lead DKBI_RU/.test(r.text); })());
ok('HF8 follow-up reason is readable Russian', /Доставка письма подтверждена/.test(V2.renderNextActionReason({ action: 'followup_due' })));
ok('HF9 unknown reason -> safe Russian fallback', V2.renderNextActionReason({ reason: 'totally_unknown_code_xyz' }) === 'Требуется проверить следующее действие.');
ok('HF10 no raw English reason leaks', !/review|followup_due|waiting_reply/i.test(V2.renderNextActionReason({ action: 'waiting_reply' })));

// menu alias routing — all variants reach the SAME menu handler (one menu text)
async function capRoute(text) { let out = null; await handleCommand({ chat: { id: 1 }, from: { id: 7 }, text }, { svc: {}, send: (c, t) => { out = t; }, owners: ['7'] }); return out; }
ok('HF11 text "меню" routes to menu (not unknown)', (await capRoute('меню')) === V2.MENU_TEXT);
ok('HF12 "Меню" routes to menu', (await capRoute('Ме　ню'.replace('　', '')) === V2.MENU_TEXT) || (await capRoute('Меню')) === V2.MENU_TEXT);
ok('HF13 "🏠 Меню" routes to menu', (await capRoute('🏠 Меню')) === V2.MENU_TEXT);
ok('HF14 "/menu" routes to menu', (await capRoute('/menu')) === V2.MENU_TEXT);

// callback: open lead is READ-ONLY (uses svc.lead, no mutation wrapper)
let leadCalled = null, mutated = false;
const cbSvc = { lead: (id) => { leadCalled = id; return { ok: true, data: { leadId: id, company: 'X', status: 'verified_ready', revision: 1 } }; }, rejectDraft: () => { mutated = true; }, setLeadStatus: () => { mutated = true; } };
let cbOut = null;
const cbRes = await handleCallback({ id: 'c1', from: { id: 7 }, message: { chat: { id: 1 } }, data: 'lead:DKBI_RU' }, { svc: cbSvc, send: (c, t) => { cbOut = t; }, owners: ['7'] });
ok('HF15 lead callback opens correct lead', leadCalled === 'DKBI_RU' && /DKBI_RU/.test(cbOut));
ok('HF16 lead callback performs NO mutation', cbRes.mutated === false && mutated === false);
ok('HF17 unauthorized callback returns no data', (await handleCallback({ id: 'c2', from: { id: 999 }, message: { chat: { id: 1 } }, data: 'lead:DKBI_RU' }, { svc: cbSvc, send: () => {}, owners: ['7'] })).authorized === false);
ok('HF18 invalid lead id fail-safe (no false success)', (() => { const t = V2.renderLeadCard ? V2.renderError({ ok: false, code: 'NOT_FOUND' }) : ''; return /не найден|обновите/i.test(t); })());
ok('HF19 API unavailable -> error not success', /недоступен|повторите/i.test(V2.renderError({ ok: false, code: 'BACKEND_UNAVAILABLE' })));
ok('HF20 lead selector states applied filter', (() => { const r = V2.renderLeadSelector({ ok: true, data: { items: [{ lead_id: 'A', company: 'CoA' }] } }, { statusFilter: 'verified_ready' }); return /Показаны лиды со статусом/.test(r.text) && /Готовы к отправке/.test(r.text); })());

// ---- FINAL UX proofs: next-action reason + lead card localization (Phase 6) ----
// The LIVE next-action DTO is { kind, reason, lead } (getMiniAuditOperatorState).
// For DKBI_RU: kind='followup', reason='proven SMTP 250 and >48h since send' (raw English).
const FUX_DKBI_NEXT = { kind: 'followup', reason: 'proven SMTP 250 and >48h since send', lead: { leadId: 'DKBI_RU', company: 'ДКБИ' } };
const FUX_DKBI_REASON = V2.renderNextActionReason(FUX_DKBI_NEXT);
// The DKBI lead card DTO as produced by leadDto() (no candidate_score / no revision; score null).
const FUX_DKBI_CARD = V2.renderLeadCard({ data: { leadId: 'DKBI_RU', company: 'ДКБИ', status: 'waiting_reply', nextActionHint: 'waiting_reply', website: 'dkbi.ru', email: 'info@dkbi.ru', score: null, blockingReasons: ['ALREADY_WAITING_REPLY'] } });

// 1. DKBI payload does NOT use the generic fallback.
ok('FUX1 DKBI reason is NOT the generic fallback', FUX_DKBI_REASON !== 'Требуется проверить следующее действие.');
// 2. DKBI reason is the specific Russian follow-up message.
ok('FUX2 DKBI reason is specific Russian follow-up', /Доставка письма подтверждена\. Прошло более 48 часов/.test(FUX_DKBI_REASON));
// 3. Raw English reason absent.
ok('FUX3 no raw English reason text', !/proven|SMTP|since send|followup|waiting/i.test(FUX_DKBI_REASON));
// 4. Known reason codes mapped (canonical allowlist).
ok('FUX4 reason_code FOLLOWUP_DUE_DELIVERY_CONFIRMED_48H mapped', /Доставка письма подтверждена/.test(V2.renderNextActionReason({ reasonCode: 'FOLLOWUP_DUE_DELIVERY_CONFIRMED_48H' })));
ok('FUX4b reason_code WAITING_FOR_REPLY mapped', /ответа пока нет/.test(V2.renderNextActionReason({ reasonCode: 'WAITING_FOR_REPLY' })));
ok('FUX4c kind ready_send mapped', /готов к отправке/i.test(V2.renderNextActionReason({ kind: 'ready_send' })));
// 5. Unknown reason uses safe fallback.
ok('FUX5 unknown code -> safe fallback', V2.renderNextActionReason({ reasonCode: 'TOTALLY_UNKNOWN_XYZ', reason: 'also unknown' }) === 'Требуется проверить следующее действие.');
// 6. Missing reason never outputs undefined.
ok('FUX6 empty action never undefined', (() => { const r = V2.renderNextActionReason({}); return typeof r === 'string' && !/undefined/.test(r) && r.length > 0; })());
ok('FUX6b null action never undefined', (() => { const r = V2.renderNextActionReason(null); return typeof r === 'string' && !/undefined/.test(r); })());

// 7. waiting_reply displays as "ожидает ответа".
ok('FUX7 lead status waiting_reply -> ожидает ответа', /Статус: ожидает ответа/.test(FUX_DKBI_CARD));
// 8. Raw waiting_reply absent from card.
ok('FUX8 no raw waiting_reply in card', !/waiting_reply/.test(FUX_DKBI_CARD));
// 9-11. Raw internal score/revision keys absent.
ok('FUX9 no raw candidate_score_v2 key', !/candidate_score_v2|candidate_score/.test(FUX_DKBI_CARD));
ok('FUX10 no raw canonical_score_v1 key', !/canonical_score_v1/.test(FUX_DKBI_CARD));
ok('FUX11 no raw revision label', !/revision/i.test(FUX_DKBI_CARD));
// 12. Russian labels used when values exist.
const FUX_FULL_CARD = V2.renderLeadCard({ data: { leadId: 'KZ-9', company: 'Co', status: 'verified_ready', nextActionHint: 'send', website: 'co.kz', email: 'a@co.kz', candidate_score: 71, score: 88, revision: 4, blockingReasons: [] } });
ok('FUX12 Russian labels when values exist', /Предварительная оценка: 71/.test(FUX_FULL_CARD) && /Каноническая оценка: 88/.test(FUX_FULL_CARD) && /Ревизия: 4/.test(FUX_FULL_CARD) && /Маршрут: готов к отправке/.test(FUX_FULL_CARD));
// 13-14. Missing scores / revision hidden entirely.
ok('FUX13 missing scores hidden', !/оценка/i.test(FUX_DKBI_CARD));
ok('FUX14 missing revision hidden', !/Ревизия/.test(FUX_DKBI_CARD));
// 15. Empty blockers -> "отсутствуют".
ok('FUX15 empty blockers -> отсутствуют', /Блокеры: отсутствуют/.test(FUX_DKBI_CARD));
// 16-18. No null / undefined / technical "—" placeholders.
ok('FUX16 no literal null in card', !/\bnull\b/.test(FUX_DKBI_CARD));
ok('FUX17 no literal undefined in card', !/undefined/.test(FUX_DKBI_CARD));
ok('FUX18 no "—" placeholder in card', !/—/.test(FUX_DKBI_CARD));
// 19. Website and email remain readable.
ok('FUX19 website + email readable', /Сайт: dkbi\.ru/.test(FUX_DKBI_CARD) && /Email: info@dkbi\.ru/.test(FUX_DKBI_CARD));
// 20. Lead callback remains read-only (uses svc.lead only, no mutation).
let fuxLeadCalled = null, fuxMutated = false;
const fuxCbRes = await handleCallback({ id: 'fux', from: { id: 7 }, message: { chat: { id: 1 } }, data: 'lead:DKBI_RU' }, { svc: { lead: (id) => { fuxLeadCalled = id; return { ok: true, data: { leadId: id, company: 'ДКБИ', status: 'waiting_reply', nextActionHint: 'waiting_reply', website: 'dkbi.ru', email: 'info@dkbi.ru', blockingReasons: ['ALREADY_WAITING_REPLY'] } }; }, setLeadStatus: () => { fuxMutated = true; } }, send: () => {}, owners: ['7'] });
ok('FUX20 lead callback remains read-only', fuxLeadCalled === 'DKBI_RU' && fuxCbRes.mutated === false && fuxMutated === false);
// extra: localization helpers behave (Phase 3).
ok('FUX21 renderLeadStatusRu unknown -> safe generic', V2.renderLeadStatusRu('weird_new_key') === 'другой рабочий статус' && V2.renderLeadStatusRu(null) === 'другой рабочий статус');
ok('FUX22 card route hidden when no hint present', !/Маршрут/.test(V2.renderLeadCard({ data: { leadId: 'X', company: 'C', status: 'waiting_reply', website: 'x.ru' } })));
ok('FUX23 DKBI card shows both status and route (target layout)', /Статус: ожидает ответа/.test(FUX_DKBI_CARD) && /Маршрут: ожидание ответа/.test(FUX_DKBI_CARD));

// static safety still holds for index.mjs (the routing entrypoint)
const idxCode = fs.readFileSync(new URL('../telegram_gateway/api_only/index.mjs', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok('HF21 index.mjs no fs/smtp/localhost/ledger', !/require\(['"]fs|from ['"]node:fs|lead_store|saveStore|nodemailer|outbound_send_ledger|127\.0\.0\.1|http:\/\/localhost/.test(idxCode));
ok('HF22 callback router has no mutation wrapper calls', !/\.(rejectDraft|approveDraft|setLeadStatus|deferDraft|rejectLeadDraft)\(/.test(idxCode.split('handleCallback')[1]?.split('async function main')[0] || ''));
console.log(`\n==== tg_api_only (incl UX patch): ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
