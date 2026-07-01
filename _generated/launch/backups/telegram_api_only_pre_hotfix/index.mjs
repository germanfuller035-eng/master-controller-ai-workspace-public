#!/usr/bin/env node
// index.mjs — API-ONLY Telegram entrypoint. The ONLY production Telegram runtime.
// Uses long-polling against Telegram Bot API; every business read/mutation goes through the
// Master Controller HTTPS API via McService. NO fs of canonical data, NO SMTP, NO localhost
// fallback. Single poller (getUpdates offset). Owner-allowlisted. Send stays blocked.
import process from 'node:process';
import { TelegramApiClient } from './api_client.mjs';
import { McService } from './mc_service.mjs';
import * as V from './views.mjs';

const API_BASE = process.env.MATER_API_BASE || 'https://195-96-132-82.sslip.io/api/v1';
const OWNERS = (process.env.TELEGRAM_OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

// Owner-allowlist + command routing. Pure of transport: `deps.svc` is the API service,
// `deps.send(chatId, text, extra)` performs the reply. Exported so server-side harnesses can
// drive the exact production routing with a mocked svc + captured send (no network, no client msg).
export async function handleCommand(msg, deps) {
    const { svc, send, owners = OWNERS } = deps;
    const chatId = msg.chat.id; const userId = msg.from?.id; const text = (msg.text || '').trim();
    if (!V.isOwner(userId, owners)) { await send(chatId, '⛔ Доступ только для владельца.'); return; }
    const cmd = text.split(/\s+/)[0].toLowerCase();
    // menu / button text routing (defect #1: 🏠 Меню not routed)
    if (text === '🏠 Меню' || cmd === '/menu') return send(chatId, V.MENU_TEXT);
    if (text === '📊 Сегодня') return handleCommand({ ...msg, text: '/today' }, deps);
    if (text === '🎯 Следующее действие') return handleCommand({ ...msg, text: '/next' }, deps);
    if (text === '⚙️ Автоматизация') return handleCommand({ ...msg, text: '/automation' }, deps);
    if (text === '💰 Mini Audit' || text === '📋 Лиды') return handleCommand({ ...msg, text: '/leads' }, deps);
    if (text === '❓ Help' || text === 'ℹ️ Помощь') return handleCommand({ ...msg, text: '/help' }, deps);
    if (cmd === '/ping') { const r = await svc.health(); return send(chatId, r.ok ? V.renderPing(r) : V.renderError(r)); }
    if (cmd === '/health') { const r = await svc.automationStatus(); return send(chatId, r.ok ? V.renderHealth(r) : V.renderError(r)); }
    if (cmd === '/today') { const r = await svc.today(); return send(chatId, r.ok ? V.renderToday(r) : V.renderError(r)); }
    if (cmd === '/automation') { const r = await svc.automationStatus(); return send(chatId, r.ok ? V.renderAutomation(r) : V.renderError(r)); }
    if (cmd === '/next') { const r = await svc.nextAction(); return send(chatId, V.renderNextAction(r)); }
    if (cmd === '/leads') { const r = await svc.leadsByStatus('verified_ready'); return send(chatId, V.renderLeadSelector(r)); }
    if (cmd === '/lead') {
        const id = text.split(/\s+/)[1];
        if (!id) { const r = await svc.leadsByStatus('verified_ready'); return send(chatId, V.renderLeadSelector(r)); } // defect #3: usable without id
        const r = await svc.lead(id); return send(chatId, r.ok ? V.renderLeadCard(r) : V.renderError(r));
    }
    if (cmd === '/help' || cmd === '/start') return send(chatId, V.MENU_TEXT);
    return send(chatId, 'Неизвестная команда. /menu');
}

// idempotency for duplicate callbacks: remember handled callback ids (bounded)
const handledCallbacks = new Set();
function onceCallback(id) { if (handledCallbacks.has(id)) return false; handledCallbacks.add(id); if (handledCallbacks.size > 2000) handledCallbacks.delete(handledCallbacks.values().next().value); return true; }

async function main() {
    const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
    const SVC_TOKEN = process.env.MATER_TELEGRAM_TOKEN_API || '';
    if (!TG_TOKEN) { console.error('TG_FATAL: TELEGRAM_BOT_TOKEN missing'); process.exit(1); }
    if (!SVC_TOKEN) { console.error('TG_FATAL: MATER_TELEGRAM_TOKEN_API missing'); process.exit(1); }
    const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
    const svc = new McService(new TelegramApiClient({ baseUrl: API_BASE, token: SVC_TOKEN }));
    let running = true; let offset = 0;
    process.on('SIGTERM', () => { running = false; });
    process.on('SIGINT', () => { running = false; });

    async function tg(method, body) {
        try {
            const res = await fetch(`${TG_API}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            return await res.json();
        } catch (e) { console.error('TG_API_ERR', method, String(e.message || e).slice(0, 80)); return null; }
    }
    const send = (chatId, text, extra = {}) => tg('sendMessage', { chat_id: chatId, text, ...extra });
    const deps = { svc, send, owners: OWNERS };

    console.log(`Telegram API-only bot starting. base=${API_BASE} owners=${OWNERS.length}`);
    while (running) {
        const upd = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
        if (upd && upd.ok && Array.isArray(upd.result)) {
            for (const u of upd.result) {
                offset = u.update_id + 1;
                try {
                    if (u.message && u.message.text) await handleCommand(u.message, deps);
                    else if (u.callback_query) {
                        const cq = u.callback_query;
                        if (onceCallback(cq.id)) { /* route callbacks here (mutations) */ await tg('answerCallbackQuery', { callback_query_id: cq.id }); }
                        else await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'уже обработано' });
                    }
                } catch (e) { console.error('HANDLER_ERR', String(e.message || e).slice(0, 80)); }
            }
        } else if (!upd) { await new Promise((r) => setTimeout(r, 3000)); }
    }
    console.log('Telegram bot stopped (SIGTERM).');
    process.exit(0);
}

// Only start the poller when run as the entrypoint — importing for tests must NOT start polling.
const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
if (invoked.endsWith('/api_only/index.mjs') || invoked.endsWith('api_only/index.mjs')) { main(); }
