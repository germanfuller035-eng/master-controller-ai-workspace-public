/**
 * sales_commands_phase2.mjs — Phase 2 Owner-Only Sales Ops Commands
 *
 * Commands:
 *   /draft_followup <lead_id> <channel>          → prepare follow-up DRAFT (NO send)
 *   /log_touch <lead_id> <channel> <action>      → log a manual touch into registers
 *   /set_next <lead_id> <next_action>            → update next step for a lead
 *   /channel_hold <lead_id> <channel> <reason>   → mark a channel as hold/unverified
 *   /lead_note <lead_id> <note>                  → append a note to a lead
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - WRITE-TO-LOCAL-FILES ONLY. Never sends email / WhatsApp / Telegram to clients.
 *   - Auto-send remains BLOCKED. /draft_followup returns text only, never transmits.
 *   - Never reads .env / AI_SECRETS. Never prints BOT_TOKEN / CHAT_ID.
 *   - Never touches VPS. Never touches dashboard production files.
 *   - Does NOT break Phase 1 read-only commands.
 *   - Owner-only: dispatcher is reached only after the master bot chat-id guard.
 *
 * All writes target:
 *   13_sales/daily_lead_factory/output/
 *     - followup_queue_*.json          (next_action / channel_hold / notes updates)
 *     - sales_ops_touch_log.json       (append-only manual touch register)
 *     - sales_ops_drafts/<lead>_<channel>_<ts>.md  (generated drafts, local only)
 */

import fs   from 'fs';
import path from 'path';

// ──────────────────────────────────────────────
// Safe file helpers
// ──────────────────────────────────────────────

function readJSON(p, fb = null) {
    try {
        if (!fs.existsSync(p)) return fb;
        const raw = fs.readFileSync(p, 'utf-8').trim();
        return raw ? JSON.parse(raw) : fb;
    } catch (_) { return fb; }
}

function writeJSON(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

function findLatestFile(dir, prefix, ext) {
    try {
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith(prefix) && f.endsWith(ext) && !f.includes('.bak'))
            .sort()
            .reverse();
        if (!files.length) return null;
        return path.join(dir, files[0]);
    } catch (_) { return null; }
}

function nowISO() { return new Date().toISOString(); }
function today()  { return new Date().toISOString().slice(0, 10); }

function tsSlug() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function safeSlug(s) {
    return String(s || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60);
}

// ──────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────

function getPaths(workspace) {
    const dlf    = path.join(workspace, '13_sales', 'daily_lead_factory');
    const output = path.join(dlf, 'output');
    return {
        dlf,
        output,
        followupQueue: findLatestFile(output, 'followup_queue_',    '.json'),
        activeLeads:   findLatestFile(output, 'active_leads_queue_', '.json'),
        touchLog:      path.join(output, 'sales_ops_touch_log.json'),
        draftsDir:     path.join(output, 'sales_ops_drafts'),
    };
}

// ──────────────────────────────────────────────
// Lead resolution (read-only lookup across queues)
// ──────────────────────────────────────────────

function loadQueueArray(p, keys = ['queue', 'leads', 'active_leads']) {
    const raw = readJSON(p, null);
    if (!raw) return { raw: null, arr: [] };
    if (Array.isArray(raw)) return { raw, arr: raw };
    for (const k of keys) {
        if (Array.isArray(raw[k])) return { raw, arr: raw[k] };
    }
    return { raw, arr: [] };
}

function matchLead(rec, leadId) {
    const lid = String(leadId || '').toUpperCase();
    return String(rec.lead_id || rec.id || '').toUpperCase() === lid
        || String(rec.legacy_lead_id || '').toUpperCase() === lid;
}

/**
 * Resolve a lead by id. Returns { found, record, source } where found is bool.
 */
function resolveLead(workspace, leadId) {
    const P = getPaths(workspace);
    if (P.followupQueue) {
        const { arr } = loadQueueArray(P.followupQueue);
        const hit = arr.find(r => matchLead(r, leadId));
        if (hit) return { found: true, record: hit, source: 'followup_queue' };
    }
    if (P.activeLeads) {
        const { arr } = loadQueueArray(P.activeLeads);
        const hit = arr.find(r => matchLead(r, leadId));
        if (hit) return { found: true, record: hit, source: 'active_leads_queue' };
    }
    return { found: false, record: null, source: null };
}

function listKnownLeadIds(workspace) {
    const P = getPaths(workspace);
    const ids = [];
    for (const p of [P.followupQueue, P.activeLeads]) {
        if (!p) continue;
        const { arr } = loadQueueArray(p);
        arr.forEach(r => { if (r.lead_id || r.id) ids.push(r.lead_id || r.id); });
    }
    return [...new Set(ids)];
}

function unknownLeadMessage(workspace, leadId) {
    const ids = listKnownLeadIds(workspace);
    return [
        `❌ *Лид не найден: \`${leadId}\`*`,
        '',
        `*Известные lead_id (${ids.length}):*`,
        ids.length ? ids.map(d => `  • \`${d}\``).join('\n') : '  (очереди пусты)',
        '',
        'Проверьте написание lead_id и попробуйте снова.',
    ].join('\n');
}

// ──────────────────────────────────────────────
// Touch log register (append-only)
// ──────────────────────────────────────────────

function appendTouch(workspace, entry) {
    const P = getPaths(workspace);
    let log = readJSON(P.touchLog, null);
    if (!log || typeof log !== 'object' || !Array.isArray(log.touches)) {
        log = {
            meta: {
                schema_version: '1.0',
                created: nowISO(),
                project: 'Telegram Sales Ops Phase 2',
                auto_send: false,
                write_only_local: true,
            },
            touches: [],
        };
    }
    log.meta.updated = nowISO();
    const rec = {
        touch_id: `TCH-${tsSlug()}-${(log.touches.length + 1).toString().padStart(3, '0')}`,
        ...entry,
        logged_at: nowISO(),
    };
    log.touches.push(rec);
    writeJSON(P.touchLog, log);
    return rec;
}

// ──────────────────────────────────────────────
// Followup queue mutation (local-only, safe)
// ──────────────────────────────────────────────

/**
 * Update a lead record inside the followup_queue file.
 * mutator(rec) is applied in place. Returns { ok, file, record } or { ok:false }.
 * If the lead exists only in active_leads but not followup_queue, we still create
 * a minimal followup_queue entry so the change is persisted (write-to-local-only).
 */
function updateFollowupLead(workspace, leadId, mutator) {
    const P = getPaths(workspace);
    if (!P.followupQueue) {
        return { ok: false, reason: 'followup_queue_not_found' };
    }
    const raw = readJSON(P.followupQueue, null);
    if (!raw) return { ok: false, reason: 'followup_queue_unreadable' };

    let arr;
    let container;
    if (Array.isArray(raw)) { arr = raw; container = null; }
    else if (Array.isArray(raw.queue)) { arr = raw.queue; container = raw; }
    else { return { ok: false, reason: 'followup_queue_shape_unknown' }; }

    let rec = arr.find(r => matchLead(r, leadId));

    if (!rec) {
        // Pull base data from active_leads if available
        const resolved = resolveLead(workspace, leadId);
        if (!resolved.found) return { ok: false, reason: 'lead_unknown' };
        const base = resolved.record;
        rec = {
            queue_id: `FQ-${tsSlug()}-NEW`,
            lead_id: base.lead_id || leadId,
            domain: base.domain || base.website || null,
            company_name: base.company_name || base.name || null,
            current_status: base.current_status || base.status || 'manual_tracking',
            last_contact_channel: base.last_contact_channel || null,
            last_contact_date: base.last_contact_date || null,
            next_contact_date: base.next_contact_date || null,
            next_channel: base.next_channel || null,
            next_action: base.next_action || null,
            approval_required: base.approval_required !== undefined ? base.approval_required : true,
            do_not_contact: base.do_not_contact || false,
            touch_count_total: base.touch_count_total || 0,
            priority: base.priority || 'normal',
            notes: base.notes || '',
            phase2_created: nowISO(),
        };
        arr.push(rec);
    }

    mutator(rec);

    // persist meta auto_send guard
    if (container) {
        if (!container.meta) container.meta = {};
        container.meta.auto_send = false;
        container.meta.phase2_last_update = nowISO();
    }

    writeJSON(P.followupQueue, container ? container : arr);
    return { ok: true, file: P.followupQueue, record: rec };
}

// ──────────────────────────────────────────────
// /draft_followup <lead_id> <channel>
// ──────────────────────────────────────────────

const DRAFT_TEMPLATES = {
    email: (lead) => [
        `Тема: ${lead.company_name || lead.lead_id} — продолжение по аудиту сайта`,
        '',
        'Здравствуйте!',
        '',
        `Ранее писали по поводу мини-аудита сайта ${lead.domain || ''}. Хотели уточнить,`,
        'успели ли посмотреть материалы и остались ли вопросы.',
        '',
        'Готовы созвониться в удобное время или прислать короткое резюме по точкам роста.',
        '',
        'С уважением,',
        'Дмитрий',
    ].join('\n'),
    whatsapp: (lead) => [
        `Здравствуйте! Это Дмитрий по аудиту сайта ${lead.domain || lead.company_name || ''}.`,
        'Писали на email — хотел уточнить, дошло ли письмо и удобно ли коротко обсудить результаты?',
    ].join('\n'),
    telegram: (lead) => [
        `Здравствуйте! По мини-аудиту сайта ${lead.domain || lead.company_name || ''}.`,
        'Подскажите, успели посмотреть материалы? Готов ответить на вопросы.',
    ].join('\n'),
    call: (lead) => [
        `Скрипт звонка — ${lead.company_name || lead.lead_id}:`,
        '1. Представиться, напомнить про отправленный аудит.',
        '2. Спросить, успели ли ознакомиться.',
        '3. Предложить короткий разбор 2-3 точек роста.',
        '4. Зафиксировать следующий шаг.',
    ].join('\n'),
};

async function cmdDraftFollowup(chatId, args, sendFn, workspace) {
    const [leadId, channelRaw] = args;
    if (!leadId || !channelRaw) {
        await sendFn(chatId, [
            '⚠️ *Неверный формат.*',
            '',
            'Формат: `/draft_followup <lead_id> <channel>`',
            'Пример: `/draft_followup ZB23 email`',
            '',
            'Каналы: email | whatsapp | telegram | call',
        ].join('\n'));
        return true;
    }

    const resolved = resolveLead(workspace, leadId);
    if (!resolved.found) {
        await sendFn(chatId, unknownLeadMessage(workspace, leadId));
        return true;
    }

    const channel = channelRaw.toLowerCase();
    const tmpl = DRAFT_TEMPLATES[channel];
    const lead = resolved.record;
    const body = tmpl ? tmpl(lead) : [
        `Черновик follow-up для ${lead.company_name || lead.lead_id} (канал: ${channel}):`,
        '',
        `Напомнить про мини-аудит ${lead.domain || ''}, уточнить статус, предложить следующий шаг.`,
    ].join('\n');

    // Save draft to LOCAL file only (no send)
    const P = getPaths(workspace);
    const draftFile = path.join(P.draftsDir, `${safeSlug(leadId)}_${safeSlug(channel)}_${tsSlug()}.md`);
    const draftDoc = [
        `# Follow-up DRAFT — ${lead.company_name || leadId}`,
        '',
        `- lead_id: ${lead.lead_id || leadId}`,
        `- domain: ${lead.domain || '—'}`,
        `- channel: ${channel}`,
        `- generated_at: ${nowISO()}`,
        '- status: DRAFT_ONLY — NOT SENT',
        '- auto_send: BLOCKED',
        '',
        '## Текст черновика',
        '',
        body,
        '',
        '---',
        '⚠️ Это локальный черновик. Бот ничего не отправил клиенту.',
        'Отправка только вручную после проверки Дмитрием.',
    ].join('\n');
    fs.mkdirSync(P.draftsDir, { recursive: true });
    fs.writeFileSync(draftFile, draftDoc + '\n', 'utf-8');

    await sendFn(chatId, [
        `📝 *FOLLOW-UP DRAFT — ${lead.company_name || leadId}*`,
        `lead_id: \`${lead.lead_id || leadId}\` | канал: ${channel}`,
        '',
        '```',
        body,
        '```',
        '',
        '🚫 *Авто-отправка ЗАБЛОКИРОВАНА.* Бот ничего не отправил.',
        `💾 Черновик сохранён локально: \`${path.basename(draftFile)}\``,
        '',
        'Отправляйте клиенту только вручную после проверки.',
    ].join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /log_touch <lead_id> <channel> <action>
// ──────────────────────────────────────────────

async function cmdLogTouch(chatId, args, sendFn, workspace) {
    const [leadId, channel, ...actionParts] = args;
    const action = actionParts.join(' ').trim();
    if (!leadId || !channel || !action) {
        await sendFn(chatId, [
            '⚠️ *Неверный формат.*',
            '',
            'Формат: `/log_touch <lead_id> <channel> <action>`',
            'Пример: `/log_touch ZB23 email followup_sent`',
        ].join('\n'));
        return true;
    }

    const resolved = resolveLead(workspace, leadId);
    if (!resolved.found) {
        await sendFn(chatId, unknownLeadMessage(workspace, leadId));
        return true;
    }

    // Append to touch log
    const touch = appendTouch(workspace, {
        lead_id: resolved.record.lead_id || leadId,
        domain: resolved.record.domain || null,
        channel,
        action,
        source: 'telegram_manual_log_touch',
        auto_send: false,
    });

    // Update followup queue: bump touch count, set last contact
    const upd = updateFollowupLead(workspace, leadId, (rec) => {
        rec.touch_count_total = (rec.touch_count_total || 0) + 1;
        rec.last_contact_channel = channel;
        rec.last_contact_date = today();
        rec.last_manual_action = action;
        rec.phase2_last_touch = nowISO();
    });

    const lines = [
        '✅ *Ручное касание залогировано.*',
        '',
        `lead_id: \`${resolved.record.lead_id || leadId}\``,
        `канал: ${channel}`,
        `действие: ${action}`,
        `touch_id: \`${touch.touch_id}\``,
        '',
        upd.ok
            ? `📊 followup_queue обновлён (touch_count=${upd.record.touch_count_total}).`
            : `⚠️ followup_queue не обновлён: ${upd.reason} (касание всё равно записано в журнал).`,
        '',
        '🚫 Клиенту ничего не отправлено. Запись только локальная.',
        'Проверьте /sales_today — очередь обновлена.',
    ];
    await sendFn(chatId, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /set_next <lead_id> <next_action>
// ──────────────────────────────────────────────

async function cmdSetNext(chatId, args, sendFn, workspace) {
    const [leadId, ...rest] = args;
    const nextAction = rest.join(' ').trim();
    if (!leadId || !nextAction) {
        await sendFn(chatId, [
            '⚠️ *Неверный формат.*',
            '',
            'Формат: `/set_next <lead_id> <next_action>`',
            'Пример: `/set_next ZB23 call_tomorrow_1030`',
        ].join('\n'));
        return true;
    }

    const resolved = resolveLead(workspace, leadId);
    if (!resolved.found) {
        await sendFn(chatId, unknownLeadMessage(workspace, leadId));
        return true;
    }

    const upd = updateFollowupLead(workspace, leadId, (rec) => {
        rec.next_action = nextAction;
        rec.phase2_next_set_at = nowISO();
    });

    if (!upd.ok) {
        await sendFn(chatId, `⚠️ Не удалось обновить следующий шаг: ${upd.reason}`);
        return true;
    }

    appendTouch(workspace, {
        lead_id: resolved.record.lead_id || leadId,
        channel: 'internal',
        action: `set_next:${nextAction}`,
        source: 'telegram_set_next',
        auto_send: false,
    });

    await sendFn(chatId, [
        '✅ *Следующий шаг обновлён.*',
        '',
        `lead_id: \`${upd.record.lead_id || leadId}\``,
        `next_action: \`${nextAction}\``,
        '',
        '🚫 Локальная запись. Клиенту ничего не отправлено.',
        'Проверьте /sales_today или /followups.',
    ].join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /channel_hold <lead_id> <channel> <reason>
// ──────────────────────────────────────────────

async function cmdChannelHold(chatId, args, sendFn, workspace) {
    const [leadId, channel, ...reasonParts] = args;
    const reason = reasonParts.join(' ').trim();
    if (!leadId || !channel || !reason) {
        await sendFn(chatId, [
            '⚠️ *Неверный формат.*',
            '',
            'Формат: `/channel_hold <lead_id> <channel> <reason>`',
            'Пример: `/channel_hold ZB23 whatsapp not_found`',
        ].join('\n'));
        return true;
    }

    const resolved = resolveLead(workspace, leadId);
    if (!resolved.found) {
        await sendFn(chatId, unknownLeadMessage(workspace, leadId));
        return true;
    }

    const upd = updateFollowupLead(workspace, leadId, (rec) => {
        if (!Array.isArray(rec.channel_holds)) rec.channel_holds = [];
        rec.channel_holds = rec.channel_holds.filter(h => (h.channel || '').toLowerCase() !== channel.toLowerCase());
        rec.channel_holds.push({
            channel,
            status: 'hold_unverified',
            reason,
            set_at: nowISO(),
        });
        rec.phase2_channel_hold_at = nowISO();
    });

    if (!upd.ok) {
        await sendFn(chatId, `⚠️ Не удалось отметить канал: ${upd.reason}`);
        return true;
    }

    appendTouch(workspace, {
        lead_id: resolved.record.lead_id || leadId,
        channel,
        action: `channel_hold:${reason}`,
        source: 'telegram_channel_hold',
        auto_send: false,
    });

    await sendFn(chatId, [
        '⏸ *Канал отмечен как hold / unverified.*',
        '',
        `lead_id: \`${upd.record.lead_id || leadId}\``,
        `канал: ${channel}`,
        `причина: ${reason}`,
        '',
        'Этот канал не будет использоваться, пока не подтверждён вручную.',
        '🚫 Локальная запись. Клиенту ничего не отправлено.',
    ].join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /lead_note <lead_id> <note>
// ──────────────────────────────────────────────

async function cmdLeadNote(chatId, args, sendFn, workspace) {
    const [leadId, ...noteParts] = args;
    const note = noteParts.join(' ').trim();
    if (!leadId || !note) {
        await sendFn(chatId, [
            '⚠️ *Неверный формат.*',
            '',
            'Формат: `/lead_note <lead_id> <note>`',
            'Пример: `/lead_note ZB23 WhatsApp not found, call tomorrow`',
        ].join('\n'));
        return true;
    }

    const resolved = resolveLead(workspace, leadId);
    if (!resolved.found) {
        await sendFn(chatId, unknownLeadMessage(workspace, leadId));
        return true;
    }

    const stamp = `[${nowISO()}] ${note}`;
    const upd = updateFollowupLead(workspace, leadId, (rec) => {
        if (!Array.isArray(rec.phase2_notes)) rec.phase2_notes = [];
        rec.phase2_notes.push(stamp);
        rec.notes = (rec.notes ? rec.notes + ' | ' : '') + note;
    });

    if (!upd.ok) {
        await sendFn(chatId, `⚠️ Не удалось добавить заметку: ${upd.reason}`);
        return true;
    }

    appendTouch(workspace, {
        lead_id: resolved.record.lead_id || leadId,
        channel: 'internal',
        action: `note:${note}`.slice(0, 200),
        source: 'telegram_lead_note',
        auto_send: false,
    });

    await sendFn(chatId, [
        '📝 *Заметка добавлена к лиду.*',
        '',
        `lead_id: \`${upd.record.lead_id || leadId}\``,
        `заметка: ${note}`,
        '',
        '🚫 Локальная запись. Клиенту ничего не отправлено.',
    ].join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// Help
// ──────────────────────────────────────────────

export function salesPhase2Help() {
    return [
        '🛠 *Sales Ops Phase 2 — owner-only команды (write-to-local-only):*',
        '  /draft_followup <lead_id> <channel> — черновик follow-up (НЕ отправляет)',
        '  /log_touch <lead_id> <channel> <action> — записать ручное касание',
        '  /set_next <lead_id> <next_action> — обновить следующий шаг',
        '  /channel_hold <lead_id> <channel> <reason> — отметить канал hold/unverified',
        '  /lead_note <lead_id> <note> — добавить заметку к лиду',
        '',
        '🚫 Авто-отправка ЗАБЛОКИРОВАНА. Клиентам ничего не отправляется.',
    ].join('\n');
}

// ──────────────────────────────────────────────
// Main dispatcher
// ──────────────────────────────────────────────

/**
 * handleSalesPhase2(chatId, textRaw, sendFn, workspace)
 * Returns true if the command was handled, false otherwise.
 */
export async function handleSalesPhase2(chatId, textRaw, sendFn, workspace) {
    const t = (textRaw || '').trim();
    if (!t.startsWith('/')) return false;

    // strip @botname from the command token
    const cleaned = t.replace(/^(\/[a-zA-Z_]+)@[a-zA-Z0-9_]+/, '$1');
    const parts = cleaned.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
        case '/draft_followup': return cmdDraftFollowup(chatId, args, sendFn, workspace);
        case '/log_touch':      return cmdLogTouch(chatId, args, sendFn, workspace);
        case '/set_next':       return cmdSetNext(chatId, args, sendFn, workspace);
        case '/channel_hold':   return cmdChannelHold(chatId, args, sendFn, workspace);
        case '/lead_note':      return cmdLeadNote(chatId, args, sendFn, workspace);
        default:                return false;
    }
}
