// telegram_command_registry.mjs
// ============================================================
// BLOCK A — Telegram Core Command Registry (single source of truth)
// ------------------------------------------------------------
// Purpose:
//   ONE place that declares every Telegram command the system supports:
//   slash commands, free-form Russian text intents, and voice (transcribed
//   to text → same registry). Later blocks (B..I) consume THIS contract.
//
// SCOPE CONTRACT (Block A):
//   - This module is a PURE declaration + lookup layer.
//   - It NEVER sends Telegram messages, runs shell, writes queues, or sends mail.
//   - It does NOT itself wire handlers into telegram_master_bot.mjs (that is a
//     later, separately-tested step). It records the *contract* so nothing is lost.
//   - "handler" is a string reference (module#export or DIRECT) describing where
//     the live implementation lives today, so the registry mirrors reality.
//
// status values:
//   active   — supported, primary path
//   fallback — kept working but not the primary daily path
//   planned  — declared for v1; handler fully wired in a later block
//
// type values:
//   slash | text | voice
// ============================================================

// ---- Canonical slash commands ----------------------------------------------
// Each entry: name, aliases[], type, status, handler (where it lives), block, desc
export const SLASH_COMMANDS = [
    // --- Core liveness / status (Block H surfaces these in UI) ---
    { name: '/ping',    aliases: ['пинг'],                 type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'A', desc: 'Проверка связи / uptime / PID' },
    { name: '/health',  aliases: [],                       type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Статус системы (lock, heartbeat)' },
    { name: '/status',  aliases: [],                       type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Состояние из STATE_FILE' },
    { name: '/start',   aliases: [],                       type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Приветствие / список команд' },
    { name: '/today',   aliases: ['на сегодня', 'сегодня'],type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Сводка дня' },
    { name: '/help',    aliases: [],                       type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Справка по командам (должна включать sales)' },
    { name: '/menu',    aliases: [],                       type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Главное меню (без T1/T2 placeholder)' },
    { name: '/keepalive', aliases: [],                     type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Heartbeat keepalive' },
    { name: '/debug_last', aliases: [],                    type: 'slash', status: 'fallback',handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Последние N событий' },
    { name: '/probe',   aliases: [],                       type: 'slash', status: 'fallback',handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Диагностический probe' },
    { name: '/voice_status', aliases: [],                  type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'A', desc: 'Статус voice → text → registry' },

    // --- Mail / gateway status ---
    { name: '/mail status', aliases: ['mail status'],      type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'F', desc: 'Статус почтового канала' },
    { name: '/gateway status', aliases: ['gateway status'],type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'H', desc: 'Статус gateway' },
    { name: '/intake_status', aliases: [],                 type: 'slash', status: 'fallback',handler: 'telegram_master_bot.mjs#DIRECT', block: 'B', desc: 'Статус intake' },
    { name: '/import_status', aliases: [],                 type: 'slash', status: 'fallback',handler: 'telegram_master_bot.mjs#DIRECT', block: 'B', desc: 'Статус импорта лидов' },
    { name: '/emergency_stop', aliases: [],                type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'F', desc: 'Аварийная остановка' },

    // --- File vault ---
    { name: '/vault_status', aliases: ['vault_status'],    type: 'slash', status: 'active',  handler: 'file_vault_controller.mjs',      block: 'H', desc: 'Статус file vault' },
    { name: '/vault_recent', aliases: ['vault_recent'],    type: 'slash', status: 'active',  handler: 'file_vault_controller.mjs',      block: 'H', desc: 'Недавние файлы vault' },
    { name: '/vault_inbox',  aliases: ['vault_inbox'],     type: 'slash', status: 'active',  handler: 'file_vault_controller.mjs',      block: 'H', desc: 'Inbox vault' },
    { name: '/vault_help',   aliases: ['vault_help'],      type: 'slash', status: 'active',  handler: 'file_vault_controller.mjs',      block: 'H', desc: 'Справка vault' },

    // --- Leads: status / templates / add / new (Block B) ---
    { name: '/lead_status',   aliases: [],                 type: 'slash', status: 'active',  handler: 'sales_commands_phase1.mjs + lead_import_readonly_live_control.mjs', block: 'B', desc: 'Статус лида/лидов' },
    { name: '/lead_template', aliases: [],                 type: 'slash', status: 'active',  handler: 'sales_commands_phase1.mjs',      block: 'B', desc: 'Шаблон лида' },
    { name: '/lead_add',      aliases: ['/leadadd'],       type: 'slash', status: 'active',  handler: 'lead_intake_router.mjs',         block: 'B', desc: 'Добавить лид' },
    { name: '/newleads',      aliases: [],                 type: 'slash', status: 'active',  handler: 'telegram_master_bot.mjs#DIRECT', block: 'B', desc: 'Новые лиды' },
    { name: '/lead_queue',    aliases: ['очередь лидов'],  type: 'slash', status: 'fallback',handler: 'lead_import_readonly_live_control.mjs', block: 'B', desc: 'Очередь лидов (read-only)' },
    { name: '/lead_review',   aliases: [],                 type: 'slash', status: 'fallback',handler: 'lead_import_readonly_live_control.mjs', block: 'B', desc: 'Ревью лида' },
    { name: '/lead_health',   aliases: [],                 type: 'slash', status: 'fallback',handler: 'lead_import_readonly_live_control.mjs', block: 'B', desc: 'Health лидов' },
    { name: '/lead_import_review',  aliases: [],           type: 'slash', status: 'fallback',handler: 'lead_import_approval_review_bot_glue.mjs', block: 'B', desc: 'Ревью импорта' },
    { name: '/lead_import_approve', aliases: [],           type: 'slash', status: 'fallback',handler: 'lead_import_approval_review_bot_glue.mjs', block: 'B', desc: 'Подтвердить импорт' },
    { name: '/lead_import_reject',  aliases: [],           type: 'slash', status: 'fallback',handler: 'lead_import_approval_review_bot_glue.mjs', block: 'B', desc: 'Отклонить импорт' },
    { name: '/lead_scout',    aliases: [],                 type: 'slash', status: 'fallback',handler: 'telegram_daily_lead_scout_l1.mjs',block: 'B', desc: 'Скаут лидов' },
    { name: '/lead_scout_100',aliases: ['/daily100'],      type: 'slash', status: 'fallback',handler: 'telegram_daily_lead_scout_l1.mjs',block: 'B', desc: 'Скаут 100 лидов' },

    // --- Lead pipeline (Block B core v1 contract) ---
    { name: '/lead_run_pipeline', aliases: ['/leadrunpipeline'], type: 'slash', status: 'active', handler: 'lead_pipeline.handleLeadRunPipeline', block: 'B', desc: 'Подготовка лидов: ready/blocked counts. НИЧЕГО не отправляет.' },

    // --- Contact resolver (Block C) ---
    { name: '/contact_resolve top1', aliases: ['/contact_resolve'], type: 'slash', status: 'active', handler: 'telegram_contact_resolver.mjs', block: 'C', desc: 'Резолв реального email для top1' },
    { name: '/contact_show',         aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_commands.mjs',      block: 'C', desc: 'Показать контакт' },
    { name: '/contact_add_email',    aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_commands.mjs',      block: 'C', desc: 'Добавить email' },
    { name: '/contact_verify_email', aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_commands.mjs',      block: 'C', desc: 'Проверить email' },
    { name: '/contact_add_phone',    aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_commands.mjs',      block: 'C', desc: 'Добавить телефон' },
    { name: '/contact_hold_whatsapp',aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_commands.mjs',      block: 'C', desc: 'Hold WhatsApp' },
    { name: '/contact_registry',     aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_commands.mjs',      block: 'C', desc: 'Реестр контактов' },
    { name: '/contact_enrich_text',  aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_enrichment_commands.mjs', block: 'C', desc: 'Обогащение из текста' },
    { name: '/contact_channels',     aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_enrichment_commands.mjs', block: 'C', desc: 'Каналы контакта' },
    { name: '/contact_best_channel', aliases: [],          type: 'slash', status: 'fallback',handler: 'lead_contact_enrichment_commands.mjs', block: 'C', desc: 'Лучший канал' },
    { name: '/contact_enrichment_status', aliases: [],     type: 'slash', status: 'fallback',handler: 'lead_contact_enrichment_commands.mjs', block: 'C', desc: 'Статус обогащения' },

    // --- Audit engine / draft (Blocks D + E) ---
    { name: '/audit',        aliases: [],                  type: 'slash', status: 'fallback',handler: 'telegram_mini_audit_cockpit.mjs', block: 'D', desc: 'Mini audit cockpit' },
    { name: '/audit_top',    aliases: [],                  type: 'slash', status: 'fallback',handler: 'telegram_mini_audit_cockpit.mjs', block: 'D', desc: 'Top лиды для аудита' },
    { name: '/audit_leads',  aliases: [],                  type: 'slash', status: 'fallback',handler: 'telegram_mini_audit_cockpit.mjs', block: 'D', desc: 'Лиды аудита' },
    { name: '/audit_status', aliases: [],                  type: 'slash', status: 'fallback',handler: 'telegram_mini_audit_cockpit.mjs', block: 'D', desc: 'Статус аудита' },
    { name: '/audit_run',    aliases: ['/auditrun'],       type: 'slash', status: 'active',  handler: 'audit_run.handleAuditRun', block: 'D', desc: 'Экспресс-аудит сайта: 3 проблемы + риск + оффер. Анализ, НЕ отправка.' },

    { name: '/audit_draft top1',   aliases: ['/audit_draft'], type: 'slash', status: 'active', handler: 'telegram_outbound_draft_center.mjs', block: 'E', desc: 'Черновик письма по top1' },
    { name: '/audit_preview top1', aliases: ['/audit_preview'], type: 'slash', status: 'active', handler: 'telegram_outbound_draft_center.mjs', block: 'E', desc: 'Превью письма top1' },
    { name: '/audit_send_preview_to_me top1', aliases: ['/audit_send_preview_to_me'], type: 'slash', status: 'active', handler: 'approved_email_send_commands.mjs', block: 'E', desc: 'Прислать превью мне' },
    { name: '/audit_send_selftest', aliases: ['тест почты', '/email_test_self'], type: 'slash', status: 'active', handler: 'telegram_master_bot.mjs#DIRECT', block: 'F', desc: 'Self-test почты (на себя)' },
    { name: '/email_preflight',  aliases: ['email preflight'], type: 'slash', status: 'active', handler: 'telegram_master_bot.mjs#DIRECT', block: 'F', desc: 'Preflight почты' },

    // --- Approval / send (Block F) ---
    { name: '/sales_next',  aliases: ['/salesnext', 'следующий клиент', 'следующая продажа'], type: 'slash', status: 'active', handler: 'telegram_outbound_draft_center.mjs → approval ✅ → telegram_approved_email_send_adapter.mjs', block: 'F', desc: 'Следующий лид → preview → ✅ → SMTP. Пропускает уже отправленных.' },
    { name: '/audit_send_approve', aliases: [],            type: 'slash', status: 'active',  handler: 'telegram_approved_send_controller.mjs', block: 'F', desc: 'Подтверждение отправки (✅)' },
    { name: '/audit_send_reject',  aliases: [],            type: 'slash', status: 'active',  handler: 'telegram_approved_send_controller.mjs', block: 'F', desc: 'Отклонение отправки' },

    // --- Sales status / history (Blocks H + G) ---
    { name: '/sales_status',  aliases: ['/salesstatus'],   type: 'slash', status: 'planned', handler: 'PLANNED:sales_status (Block H)', block: 'H', desc: 'Текущее состояние sales-конвейера' },
    { name: '/sales_history', aliases: ['/saleshistory'],  type: 'slash', status: 'planned', handler: 'PLANNED:sales_history (Block G ledger)', block: 'G', desc: 'Последние 10 отправок из ledger' },
    { name: '/sales_today',   aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase1.mjs',      block: 'G', desc: 'Продажи сегодня' },
    { name: '/followups',     aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase1.mjs',      block: 'G', desc: 'Follow-up задачи' },
    { name: '/replies',       aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase1.mjs',      block: 'G', desc: 'Статус ответов' },
    { name: '/draft_followup',aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase2.mjs',      block: 'E', desc: 'Черновик follow-up' },
    { name: '/log_touch',     aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase2.mjs',      block: 'G', desc: 'Зафиксировать касание' },
    { name: '/set_next',      aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase2.mjs',      block: 'G', desc: 'Назначить следующий шаг' },
    { name: '/channel_hold',  aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase2.mjs',      block: 'G', desc: 'Hold канала' },
    { name: '/lead_note',     aliases: [],                 type: 'slash', status: 'fallback',handler: 'sales_commands_phase2.mjs',      block: 'G', desc: 'Заметка по лиду' },

    // --- Ops / regression (Block I) ---
    { name: '/ops',           aliases: [],                 type: 'slash', status: 'fallback',handler: 'telegram_ops_executor.mjs',      block: 'I', desc: 'Ops меню' },
    { name: '/ops_status',    aliases: [],                 type: 'slash', status: 'fallback',handler: 'telegram_ops_executor.mjs',      block: 'I', desc: 'Ops статус' },
    { name: '/ops_watchdog',  aliases: [],                 type: 'slash', status: 'fallback',handler: 'telegram_ops_executor.mjs',      block: 'I', desc: 'Watchdog' },
    { name: '/ops_regression',aliases: ['/r4'],            type: 'slash', status: 'active',  handler: 'telegram_ops_executor.mjs',      block: 'I', desc: 'Регрессия R4' },
];

// ---- Free-form Russian text intents -----------------------------------------
// These map natural phrases to a registry intent. Voice transcripts route here too.
// Sourced from telegram_text_voice_intent_router.mjs + task-required phrases.
export const TEXT_INTENTS = [
    { intent: 'menu',            phrases: ['меню', 'главное меню', 'покажи меню', 'открой меню', 'что можно делать'], maps_to: '/menu',         status: 'active' },
    { intent: 'health',          phrases: ['здоровье', 'проверь здоровье', 'что с ботом', 'бот живой', 'бот жив', 'система живая', 'статус бота', 'что с системой', 'ты работаешь'], maps_to: '/health', status: 'active' },
    { intent: 'today',           phrases: ['сегодня', 'что сегодня', 'план на сегодня', 'задачи на сегодня', 'задачи', 'на сегодня', 'что делать сейчас'], maps_to: '/today', status: 'active' },
    { intent: 'regression_info', phrases: ['проверка', 'проверь систему', 'прогони проверку', 'регрессия', 'smoke', 'r4', 'все зеленое'], maps_to: '/ops_regression', status: 'active' },
    { intent: 'lead_100_info',   phrases: ['100 лидов', 'парсинг лидов', 'ежедневный парсинг', 'найти 100 лидов', 'когда парсим лиды', 'запусти поиск лидов', 'лиды'], maps_to: '/newleads', status: 'active' },
    { intent: 'sales',           phrases: ['пора заработать', 'продажи', 'деньги', 'следующий клиент', 'следующая продажа'], maps_to: '/sales_next', status: 'active' },
    { intent: 'mini_audit',      phrases: ['мини аудит', 'mini audit', 'что по мини аудиту', 'покажи лиды', 'топ лиды', 'что по лидам'], maps_to: '/audit_top', status: 'active' },
    { intent: 'queue',           phrases: ['очередь', 'approval', 'апрув', 'что в очереди', 'покажи очередь'], maps_to: '/sales_status', status: 'active' },
    { intent: 'freeze',          phrases: ['freeze', 'заморозка', 'что заморожено', 'что заблокировано', 'можно ли импорт', 'можно ли отправлять'], maps_to: '/sales_status', status: 'active' },
    { intent: 'help',            phrases: ['помощь', 'help', 'команды', 'что ты умеешь'], maps_to: '/help', status: 'active' },
    { intent: 'ping',            phrases: ['пинг', 'ping', 'бот жив?', 'ты работаешь?'], maps_to: '/ping', status: 'active' },
];

// ---- Voice contract ----------------------------------------------------------
// Voice audio is transcribed elsewhere; the transcript is treated as text and
// routed through TEXT_INTENTS → SLASH_COMMANDS. The voice fallback help must
// surface the CURRENT sales commands.
export const VOICE_FALLBACK_COMMANDS = [
    '/sales_status',
    '/lead_run_pipeline',
    '/sales_next',
    '/sales_history',
    '/health',
    '/ping',
];

// ---- Required-working set (Block I preflight enforces these) -----------------
export const REQUIRED_WORKING = [
    '/sales_status',
    '/lead_run_pipeline',
    '/sales_next',
    '/sales_history',
    '/help',
    '/menu',
    '/ping',
    '/health',
    '/today',
    '/mail status',
    '/lead_status',
    '/lead_template',
    '/lead_add',
    '/leadadd',
    '/newleads',
    '/gateway status',
];

// ---- Required text/voice intents that must never be lost ---------------------
export const REQUIRED_TEXT_PHRASES = [
    'задачи',
    'пора заработать',
    'лиды',
    'на сегодня',
    'что с системой?',
    'бот жив?',
    'пинг',
    'ты работаешь?',
    'что делать сейчас',
];

// ---- Lookup helpers ----------------------------------------------------------
function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[?.!]+$/g, '').trim();
}

// Resolve a raw slash/text token to a registry slash command entry, or null.
export function resolveCommand(rawText) {
    const t = norm(rawText);
    if (!t) return null;

    // 1) Direct slash / alias match (slash commands)
    for (const cmd of SLASH_COMMANDS) {
        if (norm(cmd.name) === t) return cmd;
        for (const a of cmd.aliases) {
            if (norm(a) === t) return cmd;
        }
        // token-prefix match for "name arg" style (e.g. "/lead_status acme")
        const head = norm(cmd.name).split(' ')[0];
        if (head.startsWith('/') && (t === head || t.startsWith(head + ' '))) return cmd;
    }

    // 2) Free-form text/voice intent → maps_to slash command
    for (const it of TEXT_INTENTS) {
        for (const p of it.phrases) {
            if (t === norm(p) || t.includes(norm(p))) {
                return SLASH_COMMANDS.find((c) => c.name === it.maps_to) || null;
            }
        }
    }
    return null;
}

// Return entry by exact canonical name (no alias resolution).
export function getCommand(name) {
    const t = norm(name);
    return SLASH_COMMANDS.find((c) => norm(c.name) === t) || null;
}

// All canonical names.
export function allCommandNames() {
    return SLASH_COMMANDS.map((c) => c.name);
}

// Commands with a real (non-PLANNED, non-empty) handler.
export function commandsWithHandler() {
    return SLASH_COMMANDS.filter((c) => c.handler && !c.handler.startsWith('PLANNED:'));
}

export default {
    SLASH_COMMANDS,
    TEXT_INTENTS,
    VOICE_FALLBACK_COMMANDS,
    REQUIRED_WORKING,
    REQUIRED_TEXT_PHRASES,
    resolveCommand,
    getCommand,
    allCommandNames,
    commandsWithHandler,
};
