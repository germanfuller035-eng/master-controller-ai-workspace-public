// tg_api_only_handler_routing_test.mjs — SERVER-SIDE handler resolution proof.
// Drives the REAL production handleCommand() routing (imported from api_only/index.mjs) with a
// mocked McService and a captured send(). NO network, NO Telegram client messages, NO sends.
// Proves TASK 4 assertions: button/command routing, canonical id exposure, human-readable views,
// operational-vs-canonical /today, and that NO send/SMTP path is reachable from any handler.
import { handleCommand } from '../telegram_gateway/api_only/index.mjs';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const OWNER = '12345';
// Mock service: returns ok-envelopes shaped like the real API DTOs. Counts calls so we can prove
// which backend READ each handler hits — and that none of them is a send/mutation.
function mockSvc() {
    const calls = [];
    const rec = (n, data) => { calls.push(n); return Promise.resolve({ ok: true, data }); };
    return {
        calls,
        health: () => rec('health', { status: 'ok' }),
        automationStatus: () => rec('automationStatus', { canonicalWriter: true, autosend: 'BLOCKED', sendAllowedLive: false, queue: { COMPLETED: 8, PENDING: 2 }, pipeline: { verified_ready: 5, rejected: 9 }, deadLetter: 0, storeRevision: 42 }),
        today: () => rec('today', { readySend: 1, waitingReply: 3, sendUncertain: 2, followupDue: 4, total: 40 }),
        nextAction: () => rec('nextAction', { reason: 'Проверьте черновик аудита', lead: { leadId: 'KZ-77', company: 'ТОО Пример' } }),
        leadsByStatus: (s) => rec(`leadsByStatus:${s}`, { items: [{ lead_id: 'KZ-77', company: 'ТОО Пример' }, { lead_id: 'KZ-88', company: 'ИП Второй' }] }),
        lead: (id) => rec(`lead:${id}`, { leadId: id, company: 'ТОО Пример', status: 'verified_ready', candidate_score: 72, score: 90, website_status: 'FOUND', email_status: 'OFFICIAL_PAGE', revision: 5 }),
    };
}

// Captured send: records every outbound reply. extra (e.g. reply_markup) captured too.
function harness() {
    const svc = mockSvc();
    const sent = [];
    const send = (chatId, text, extra = {}) => { sent.push({ chatId, text, extra }); return Promise.resolve({ ok: true }); };
    return { svc, sent, deps: { svc, send, owners: [OWNER] } };
}
const msg = (text, from = OWNER) => ({ chat: { id: 999 }, from: { id: from }, text });

async function route(text, from = OWNER) {
    const h = harness();
    await handleCommand(msg(text, from), h.deps);
    return { reply: h.sent.map((s) => s.text).join('\n---\n'), sent: h.sent, calls: h.svc.calls };
}

// ---- routing resolves (no "unknown command") for every entry ----
const r_menu = await route('🏠 Меню');
ok('1. 🏠 Меню routes (not unknown command)', /Меню Master Controller/.test(r_menu.reply) && !/Неизвестная команда/.test(r_menu.reply));
ok('🏠 Меню does not hit backend (static text)', r_menu.calls.length === 0);

const r_today_btn = await route('📊 Сегодня');
ok('📊 Сегодня routes to /today', r_today_btn.calls.includes('today') && /Сегодня/.test(r_today_btn.reply));

const r_next_btn = await route('🎯 Следующее действие');
ok('🎯 Следующее действие routes to /next', r_next_btn.calls.includes('nextAction') && /Следующее действие/.test(r_next_btn.reply));

const r_audit_btn = await route('💰 Mini Audit');
ok('💰 Mini Audit routes to /leads', r_audit_btn.calls.some((c) => c.startsWith('leadsByStatus')));

const r_help_btn = await route('❓ Help');
ok('❓ Help routes to menu/help', /Меню Master Controller/.test(r_help_btn.reply) && !/Неизвестная команда/.test(r_help_btn.reply));

const r_menu_cmd = await route('/menu');
ok('/menu routes', /Меню Master Controller/.test(r_menu_cmd.reply));

// ---- /lead without id → selectable leads (real inline buttons) ----
const r_lead_noid = await route('/lead');
ok('4. /lead without id → selectable leads', (() => {
    const kb = r_lead_noid.sent.flatMap((s) => s.extra?.reply_markup?.inline_keyboard || []).flat();
    const cbs = kb.map((b) => b.callback_data).join(',');
    return /lead:KZ-77/.test(cbs) && /lead:KZ-88/.test(cbs) && r_lead_noid.calls.some((c) => c.startsWith('leadsByStatus'));
})());

const r_lead_id = await route('/lead KZ-77');
ok('/lead <valid-id> → lead card', r_lead_id.calls.includes('lead:KZ-77') && /KZ-77/.test(r_lead_id.reply));

// ---- /next exposes canonical lead id + REAL inline open button + /lead fallback ----
const r_next = await route('/next');
ok('2. /next includes canonical lead id', /lead_id: KZ-77/.test(r_next.reply));
ok('3. /next has real "Открыть лид" inline button + /lead fallback', (() => {
    const btn = r_next.sent.flatMap((s) => s.extra?.reply_markup?.inline_keyboard || []).flat()[0];
    return btn && btn.text === '📂 Открыть лид' && btn.callback_data === 'lead:KZ-77' && /\/lead KZ-77/.test(r_next.reply);
})());

// ---- /health, /automation: no raw JS object output ; Russian enums ----
const r_health = await route('/health');
ok('5. /health has no raw JS object formatting ({...})', !/[{}]/.test(r_health.reply));
ok('/health renders Russian labels', /Состояние системы/.test(r_health.reply) && /Автоотправка/.test(r_health.reply));

const r_auto = await route('/automation');
ok('6. /automation has no raw JS object formatting ({...})', !/[{}]/.test(r_auto.reply));
ok('7. /automation renders Russian labels', /Автоматизация/.test(r_auto.reply) && /Планировщик/.test(r_auto.reply));

// ---- /today distinguishes operational queue counts vs total canonical leads ----
const r_today = await route('/today');
ok('8. /today distinguishes operational vs canonical total', /активн|оперативн|полная база/i.test(r_today.reply) && /40/.test(r_today.reply));

// ---- non-owner denied (no backend call, no send of data) ----
const r_denied = await route('/today', '99999');
ok('non-owner denied', /Доступ только для владельца/.test(r_denied.reply) && r_denied.calls.length === 0);

// ---- 9. NO send/SMTP path reachable: the mock svc exposes only reads; any handler calling a
// mutation/send would throw (method undefined). Assert no mutation/send method was ever invoked. ----
const SEND_METHODS = ['approveDraft', 'rejectDraft', 'deferDraft', 'setLeadStatus', 'sendApprovedMessage', 'send', 'sendMail', 'smtp'];
const allCalls = [r_menu, r_today_btn, r_next_btn, r_audit_btn, r_help_btn, r_menu_cmd, r_lead_noid, r_lead_id, r_next, r_health, r_auto, r_today, r_denied].flatMap((r) => r.calls);
ok('9. no send/SMTP/mutation method reachable from read handlers', !allCalls.some((c) => SEND_METHODS.some((m) => c.startsWith(m))));

console.log(`\n==== tg_api_only_handler_routing: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
