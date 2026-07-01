/**
 * sales_commands_phase1.mjs — Phase 1 Read-Only Sales Commands
 * Commands: /sales_today  /followups  /replies  /lead_status <domain>
 *
 * SAFETY CONTRACT:
 *   - READ ONLY. Zero writes to any data file.
 *   - Never sends messages to clients.
 *   - Never prints tokens / secrets / .env values.
 *   - Never changes lead status, approval queue, followup queue.
 *   - NL-router does NOT handle these commands (direct guards).
 *
 * Phase 1 = view only.
 */

import fs   from 'fs';
import path from 'path';

// ──────────────────────────────────────────────
// Safe file helpers — READ ONLY
// ──────────────────────────────────────────────

function readJSON(p, fb = null) {
    try {
        if (!fs.existsSync(p)) return fb;
        const raw = fs.readFileSync(p, 'utf-8').trim();
        return raw ? JSON.parse(raw) : fb;
    } catch (_) { return fb; }
}

function readText(p) {
    try {
        if (!fs.existsSync(p)) return null;
        return fs.readFileSync(p, 'utf-8');
    } catch (_) { return null; }
}

/**
 * Find the latest file in `dir` whose name starts with `prefix` and ends with `ext`.
 * Returns full path or null.
 */
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

// ──────────────────────────────────────────────
// Path builders
// ──────────────────────────────────────────────

function getPaths(workspace) {
    const dlf    = path.join(workspace, '13_sales', 'daily_lead_factory');
    const output = path.join(dlf, 'output');
    return {
        dlf,
        output,
        followupQueue:    findLatestFile(output, 'followup_queue_',    '.json'),
        activeLeads:      findLatestFile(output, 'active_leads_queue_', '.json'),
        salesToday:       findLatestFile(output, 'sales_today_',        '.md'),
        commStatusMap:    path.join(dlf, 'client_communication_status_map.md'),
        antiDuplicate:    path.join(dlf, 'anti_duplicate_contact_rules.md'),
        leadsmaster:      path.join(dlf, 'data', 'processed', 'leads_master.json'),
        mailReplyMonitor: path.join(workspace, 'data', 'mail_reply_monitor.json'),
        replyMonitoring:  path.join(workspace, 'data', 'reply_monitoring.json'),
        projectBoard:     path.join(workspace, '09_dashboards', 'project_control_board.md'),
        riskBoard:        path.join(workspace, '09_dashboards', 'risk_security_board.md'),
        decisionLog:      path.join(workspace, '09_dashboards', 'decision_log.md'),
    };
}

// ──────────────────────────────────────────────
// /sales_today
// ──────────────────────────────────────────────

async function cmdSalesToday(chatId, sendFn, workspace) {
    const P  = getPaths(workspace);
    const ts = new Date().toISOString();

    // Active leads
    let activeLeads = [];
    let activeFile  = P.activeLeads || '(не найден)';
    if (P.activeLeads) {
        const raw = readJSON(P.activeLeads, null);
        if (raw) {
            if (Array.isArray(raw)) activeLeads = raw;
            else if (Array.isArray(raw.leads)) activeLeads = raw.leads;
            else if (Array.isArray(raw.queue)) activeLeads = raw.queue;
        }
    }

    // Followup queue
    let followups  = [];
    let fqFile     = P.followupQueue || '(не найден)';
    if (P.followupQueue) {
        const raw = readJSON(P.followupQueue, null);
        if (raw) {
            if (Array.isArray(raw))       followups = raw;
            else if (Array.isArray(raw.queue)) followups = raw.queue;
        }
    }

    // Sales today MD summary (first 300 chars as context)
    let todaySummary = '';
    if (P.salesToday) {
        const md = readText(P.salesToday);
        if (md) todaySummary = md.substring(0, 400).replace(/\n{3,}/g, '\n\n');
    }

    // Today's date
    const today = new Date().toISOString().slice(0, 10);

    // Which leads need attention today
    const dueTodayFQ = followups.filter(f => {
        const nc = f.next_contact_date || '';
        return nc <= today && f.current_status !== 'done' && f.current_status !== 'archived';
    });

    const lines = [
        '📊 *SALES TODAY — Phase 1 Read-Only*',
        `🕐 Timestamp: ${ts}`,
        '',
        `*Активных лидов:* ${activeLeads.length}`,
        `*Followup queue:* ${followups.length} записей`,
        `*Требует внимания сегодня:* ${dueTodayFQ.length}`,
        '',
    ];

    if (activeLeads.length > 0) {
        lines.push('*📋 Активные лиды:*');
        for (const l of activeLeads.slice(0, 10)) {
            const dom    = l.domain       || l.website || '—';
            const status = l.status       || l.current_status || '—';
            const lid    = l.lead_id      || l.id || '—';
            const nc     = l.next_contact_date || '—';
            lines.push(`  • \`${lid}\` ${dom} | статус: ${status} | след: ${nc}`);
        }
        if (activeLeads.length > 10) lines.push(`  … ещё ${activeLeads.length - 10}`);
        lines.push('');
    }

    if (dueTodayFQ.length > 0) {
        lines.push('*⚡ Followup требует действий сегодня:*');
        for (const f of dueTodayFQ) {
            lines.push(`  • ${f.lead_id || '?'} (${f.domain || '—'}) → ${f.next_action || '—'}`);
            lines.push(`    approval_required: ${f.approval_required ? '✅ ДА' : '—'}`);
        }
        lines.push('');
    }

    if (todaySummary) {
        lines.push('*📄 Сводка (sales_today):*');
        lines.push(todaySummary.substring(0, 350));
        lines.push('');
    }

    lines.push('*✅ Что можно делать:*');
    lines.push('  /followups — просмотр очереди follow-up');
    lines.push('  /replies — проверка ожидающих ответов');
    lines.push('  /lead_status <domain> — карточка лида');
    lines.push('');
    lines.push('*🚫 Что запрещено (Phase 1):*');
    lines.push('  ❌ Отправка клиентам (email / WA / Telegram)');
    lines.push('  ❌ Изменение статусов лидов');
    lines.push('  ❌ Approve/send без ручного подтверждения');
    lines.push('  ❌ Изменение followup_queue / active_leads_queue');
    lines.push('');
    lines.push('*📁 Источники данных:*');
    lines.push(`  active_leads: \`${path.basename(activeFile)}\``);
    lines.push(`  followup_queue: \`${path.basename(fqFile)}\``);
    if (P.salesToday) lines.push(`  sales_today: \`${path.basename(P.salesToday)}\``);

    await sendFn(chatId, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /followups
// ──────────────────────────────────────────────

async function cmdFollowups(chatId, sendFn, workspace) {
    const P   = getPaths(workspace);
    const today = new Date().toISOString().slice(0, 10);

    if (!P.followupQueue) {
        await sendFn(chatId, [
            '📭 *Followup queue не найден.*',
            '',
            'Ожидаемое расположение:',
            '`13_sales/daily_lead_factory/output/followup_queue_*.json`',
            '',
            '🚫 Phase 1: изменения запрещены. Только просмотр.',
        ].join('\n'));
        return true;
    }

    const raw = readJSON(P.followupQueue, null);
    let queue = [];
    if (raw) {
        if (Array.isArray(raw))            queue = raw;
        else if (Array.isArray(raw.queue)) queue = raw.queue;
    }

    if (queue.length === 0) {
        await sendFn(chatId, [
            '📭 *Followup queue пуст.*',
            `Файл: \`${path.basename(P.followupQueue)}\``,
            '',
            '🚫 Phase 1 = read-only. Изменения запрещены.',
        ].join('\n'));
        return true;
    }

    const due    = queue.filter(f => (f.next_contact_date || '') <= today && f.current_status !== 'done');
    const notDue = queue.filter(f => (f.next_contact_date || '') > today  || f.current_status === 'done');

    const lines = [
        '📅 *FOLLOWUP QUEUE — Phase 1 Read-Only*',
        `Файл: \`${path.basename(P.followupQueue)}\``,
        `Всего: ${queue.length} | Срочных: ${due.length} | Не срочных: ${notDue.length}`,
        '',
    ];

    if (due.length > 0) {
        lines.push(`*⚡ Требуют действия (due ≤ ${today}):*`);
        for (const f of due) {
            lines.push(`\n📌 *${f.lead_id || '?'}* — ${f.domain || '—'} (${f.company_name || '—'})`);
            lines.push(`  Статус: \`${f.current_status || '—'}\``);
            lines.push(`  Последний контакт: ${f.last_contact_date || '—'} / ${f.last_contact_channel || '—'}`);
            lines.push(`  Следующий контакт: *${f.next_contact_date || '—'}* / ${f.next_channel || '—'}`);
            lines.push(`  Действие: ${f.next_action || '—'}`);
            lines.push(`  Approval required: ${f.approval_required ? '✅ ДА — нужно ручное подтверждение' : 'нет'}`);
            if (f.notes) lines.push(`  📝 ${f.notes.substring(0, 200)}`);
        }
        lines.push('');
    }

    if (notDue.length > 0) {
        lines.push(`*⏳ Ожидают (next contact > ${today}):*`);
        for (const f of notDue) {
            const flag = f.current_status === 'waiting_reply' ? '📨 waiting_reply' : f.current_status || '—';
            lines.push(`  • \`${f.lead_id || '?'}\` ${f.domain || '—'} | ${flag} | след: ${f.next_contact_date || '—'} (${f.next_channel || '—'})`);
            lines.push(`    approval_required: ${f.approval_required ? '✅ ДА' : 'нет'}`);
        }
        lines.push('');
    }

    // Special ZB23 highlight if present
    const zb23 = queue.find(f => (f.lead_id || '').toUpperCase() === 'ZB23' || (f.domain || '').toLowerCase() === 'zb23.ru');
    if (zb23) {
        lines.push('*⚠️ ZB23 (zb23.ru) — особый статус:*');
        lines.push(`  Статус: \`${zb23.current_status}\``);
        lines.push(`  Следующий контакт: *${zb23.next_contact_date}*`);
        lines.push(`  Канал: ${zb23.next_channel || '—'}`);
        lines.push(`  Approval required: ${zb23.approval_required ? '✅ ДА' : 'нет'}`);
        lines.push('');
    }

    lines.push('*🚫 Запрещено (Phase 1):*');
    lines.push('  ❌ Изменение очереди  ❌ Отправка клиентам  ❌ Approve/send');

    await sendFn(chatId, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /replies
// ──────────────────────────────────────────────

async function cmdReplies(chatId, sendFn, workspace) {
    const P = getPaths(workspace);

    // Collect waiting_reply leads from followup_queue
    let waitingReply = [];
    if (P.followupQueue) {
        const raw = readJSON(P.followupQueue, null);
        let q = [];
        if (raw) {
            if (Array.isArray(raw))            q = raw;
            else if (Array.isArray(raw.queue)) q = raw.queue;
        }
        waitingReply = q.filter(f => f.current_status === 'waiting_reply');
    }

    // Mail reply monitor state
    let mailMonitor = readJSON(P.mailReplyMonitor, null);
    let replyMonitoring = readJSON(P.replyMonitoring, null);

    // Live mail monitor status
    const liveMailActive =
        (mailMonitor && (mailMonitor.active === true || mailMonitor.enabled === true)) ||
        (replyMonitoring && (replyMonitoring.active === true || replyMonitoring.enabled === true));

    const lines = [
        '📨 *REPLIES MONITOR — Phase 1 Read-Only*',
        '',
        `*Ждут ответа от клиентов:* ${waitingReply.length}`,
        `*Live mail monitor:* ${liveMailActive ? '🟢 активен' : '🔴 НЕ активен — бот не читает живую почту автоматически'}`,
        '',
    ];

    if (waitingReply.length > 0) {
        lines.push('*📋 Лиды waiting_reply:*');
        for (const f of waitingReply) {
            lines.push(`\n📌 *${f.lead_id || '?'}* — ${f.domain || '—'} (${f.company_name || '—'})`);
            lines.push(`  Последнее письмо: ${f.last_contact_date || '—'} / ${f.last_contact_channel || '—'}`);
            lines.push(`  Ожидаем ответа до: *${f.next_contact_date || '—'}*`);
            lines.push(`  Следующий канал при нет ответа: ${f.next_channel || '—'}`);
            lines.push(`  Approval required: ${f.approval_required ? '✅ ДА — нужно Дмитрий' : 'нет'}`);
            if (f.notes) lines.push(`  📝 ${f.notes.substring(0, 180)}`);
        }
        lines.push('');
    } else {
        lines.push('✅ Нет лидов в статусе waiting_reply.');
        lines.push('');
    }

    if (mailMonitor) {
        const checked = mailMonitor.last_checked || mailMonitor.updated_at || '—';
        const inbox   = mailMonitor.inbox_count   || mailMonitor.unread_count || '—';
        lines.push('*📬 Mail reply monitor состояние:*');
        lines.push(`  Последняя проверка: ${checked}`);
        lines.push(`  Писем в inbox: ${inbox}`);
        if (mailMonitor.leads_monitored) {
            lines.push(`  Отслеживаемых лидов: ${Array.isArray(mailMonitor.leads_monitored) ? mailMonitor.leads_monitored.length : '—'}`);
        }
        lines.push('');
    }

    lines.push('*⚠️ Важно:*');
    if (!liveMailActive) {
        lines.push('  🔴 Бот НЕ проверяет живую почту автоматически.');
        lines.push('  Для проверки входящих — откройте Yandex Mail вручную.');
    } else {
        lines.push('  🟢 Live mail monitor активен. Входящие отслеживаются.');
    }
    lines.push('  Ручная проверка: смотрите Yandex Mail → папка Входящие.');
    lines.push('');
    lines.push('*🚫 Запрещено (Phase 1):*');
    lines.push('  ❌ Авто-ответ  ❌ Изменение статусов  ❌ Отправка черновиков');

    await sendFn(chatId, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /lead_status <domain>
// ──────────────────────────────────────────────

async function cmdLeadStatus(chatId, domain, sendFn, workspace) {
    if (!domain) {
        await sendFn(chatId, [
            '⚠️ *Укажите домен:*',
            '  `/lead_status zb23.ru`',
            '',
            'Формат: `/lead_status <domain>`',
            'Пример: `/lead_status zb23.ru`',
        ].join('\n'));
        return true;
    }

    const P   = getPaths(workspace);
    const dom = domain.trim().toLowerCase();

    // Search sources
    let found     = null;
    let foundFrom = '';

    // 1. Search followup_queue
    if (!found && P.followupQueue) {
        const raw = readJSON(P.followupQueue, null);
        let q = [];
        if (raw) {
            if (Array.isArray(raw))            q = raw;
            else if (Array.isArray(raw.queue)) q = raw.queue;
        }
        const hit = q.find(f =>
            (f.domain || '').toLowerCase() === dom ||
            (f.domain || '').toLowerCase().replace(/^www\./, '') === dom.replace(/^www\./, '')
        );
        if (hit) { found = hit; foundFrom = 'followup_queue'; }
    }

    // 2. Search active_leads_queue
    if (!found && P.activeLeads) {
        const raw = readJSON(P.activeLeads, null);
        let q = [];
        if (raw) {
            if (Array.isArray(raw))            q = raw;
            else if (Array.isArray(raw.leads)) q = raw.leads;
            else if (Array.isArray(raw.queue)) q = raw.queue;
        }
        const hit = q.find(l =>
            (l.domain || l.website || '').toLowerCase() === dom ||
            (l.domain || l.website || '').toLowerCase().replace(/^www\./, '') === dom.replace(/^www\./, '')
        );
        if (hit) { found = { ...hit }; foundFrom = 'active_leads_queue'; }
    }

    // 3. Search leads_master.json
    if (!found && P.leadsmaster) {
        const raw = readJSON(P.leadsmaster, null);
        let all = [];
        if (raw) {
            if (Array.isArray(raw))            all = raw;
            else if (Array.isArray(raw.leads)) all = raw.leads;
        }
        const hit = all.find(l =>
            (l.domain || l.website || '').toLowerCase() === dom ||
            (l.domain || l.website || '').toLowerCase().replace(/^www\./, '') === dom.replace(/^www\./, '')
        );
        if (hit) { found = { ...hit }; foundFrom = 'leads_master'; }
    }

    if (!found) {
        // Fallback: list available domains
        const available = [];
        if (P.followupQueue) {
            const raw = readJSON(P.followupQueue, null);
            let q = [];
            if (raw) q = Array.isArray(raw) ? raw : (raw.queue || []);
            q.forEach(f => { if (f.domain) available.push(f.domain); });
        }
        if (P.activeLeads) {
            const raw = readJSON(P.activeLeads, null);
            let q = [];
            if (raw) q = Array.isArray(raw) ? raw : (raw.leads || raw.queue || []);
            q.forEach(l => { if (l.domain || l.website) available.push(l.domain || l.website); });
        }
        const unique = [...new Set(available)];

        await sendFn(chatId, [
            `❌ *Лид не найден: \`${dom}\`*`,
            '',
            `*Доступные активные домены (${unique.length}):*`,
            unique.length > 0
                ? unique.map(d => `  • ${d}`).join('\n')
                : '  (нет активных лидов в очереди)',
            '',
            '*Формат команды:*',
            '  `/lead_status <domain>`',
            '  Пример: `/lead_status zb23.ru`',
            '',
            'Если лид был добавлен недавно — проверьте:',
            '  `13_sales/daily_lead_factory/output/active_leads_queue_*.json`',
        ].join('\n'));
        return true;
    }

    // Build lead card
    const status      = found.status || found.current_status || '—';
    const score       = found.score   !== undefined ? found.score : (found.grade || '—');
    const grade       = found.grade   || found.tier  || '—';
    const channel     = found.current_channel || found.last_contact_channel || '—';
    const lastContact = found.last_contact_date || found.last_contact || '—';
    const nextContact = found.next_contact_date || '—';
    const nextChannel = found.next_channel || '—';
    const nextAction  = found.next_action || '—';
    const approval    = found.approval_required;
    const lid         = found.lead_id || found.id || '—';
    const company     = found.company_name || found.name || '—';

    const lines = [
        `🏢 *LEAD STATUS — ${dom}*`,
        '',
        `*lead_id:* \`${lid}\``,
        `*domain:* ${found.domain || found.website || dom}`,
        `*company:* ${company}`,
        `*status:* \`${status}\``,
        `*score:* ${score !== '—' ? score : '—'}${grade !== '—' ? ` / grade: ${grade}` : ''}`,
        '',
        `*current_channel:* ${channel}`,
        `*last_contact:* ${lastContact}`,
        `*next_contact_date:* *${nextContact}*`,
        `*next_channel:* ${nextChannel}`,
        `*next_action:* ${nextAction}`,
        '',
        `*approval_required:* ${approval ? '✅ ДА — нужно ручное подтверждение Дмитрия' : 'нет'}`,
        '',
        '*✅ Следующий безопасный шаг:*',
        approval
            ? '  Ждём ответа. При необходимости — подготовить черновик follow-up вручную и передать на одобрение.'
            : '  Проверить статус вручную. Phase 1 = только просмотр.',
        '',
        '*🚫 Запрещённые действия (Phase 1):*',
        '  ❌ Авто-отправка клиенту',
        '  ❌ Изменение статуса лида',
        '  ❌ Добавление/удаление из очереди',
        '  ❌ Approve / send команды',
        '',
        `*📁 Источник:* \`${foundFrom}\``,
    ];

    if (found.notes) lines.push(`\n*📝 Заметки:* ${String(found.notes).substring(0, 250)}`);

    await sendFn(chatId, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// Unknown command fallback helper
// ──────────────────────────────────────────────

export function salesPhase1UnknownFallback() {
    return [
        '❓ *Команда не распознана.*',
        '',
        '*Доступные Sales команды (Phase 1):*',
        '  /sales_today — активные лиды и план на сегодня',
        '  /followups — очередь follow-up',
        '  /replies — лиды ожидающие ответа',
        '  /lead_status <domain> — карточка лида',
        '',
        '*Системные команды:*',
        '  /ping — проверка связи',
        '  /health — диагностика системы',
        '  /debug_last — последние команды',
        '',
        '💡 Phase 1 = только просмотр. Отправка клиентам заблокирована.',
    ].join('\n');
}

// ──────────────────────────────────────────────
// Voice fallback helper
// ──────────────────────────────────────────────

export function salesPhase1VoiceFallback(reason) {
    return [
        '🎙 *Голосовая команда не распознана.*',
        reason ? `Причина: ${reason}` : '',
        '',
        'Используйте текстовые команды:',
        '  /sales_today',
        '  /followups',
        '  /replies',
        '  /lead_status <domain>',
        '  /ping',
        '  /health',
    ].filter(Boolean).join('\n');
}

// ──────────────────────────────────────────────
// Main dispatcher — called from telegram_master_bot.mjs
// ──────────────────────────────────────────────

/**
 * handleSalesPhase1(chatId, textRaw, sendFn, workspace)
 * Returns true if the command was handled, false otherwise.
 * sendFn = async (chatId, text) => void
 * workspace = absolute path to AI_WORKSPACE root
 */
export async function handleSalesPhase1(chatId, textRaw, sendFn, workspace) {
    const t  = (textRaw || '').trim();
    const tl = t.toLowerCase().replace(/@[a-z0-9_]+/, '').trim();

    // /sales_today
    if (tl === '/sales_today') {
        await cmdSalesToday(chatId, sendFn, workspace);
        return true;
    }

    // /followups
    if (tl === '/followups') {
        await cmdFollowups(chatId, sendFn, workspace);
        return true;
    }

    // /replies
    if (tl === '/replies') {
        await cmdReplies(chatId, sendFn, workspace);
        return true;
    }

    // /lead_status [domain]
    if (tl.startsWith('/lead_status')) {
        // Extract domain argument — strip command, strip @bot suffix from cmd part
        const parts  = t.replace(/@[a-z0-9_]+/i, '').trim().split(/\s+/);
        const domain = parts.slice(1).join('').trim().toLowerCase();
        await cmdLeadStatus(chatId, domain, sendFn, workspace);
        return true;
    }

    return false;
}
