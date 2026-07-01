/**
 * telegram_master_bot.mjs — Telegram Command Center v0.7
 *
 * Pipeline:
 *   Telegram text/voice
 *   → DLF direct command check (/ping /start /status /today /newleads /emergency_stop)
 *   → transcription (if voice)
 *   → universal_task_router
 *   → project/intent/risk
 *   → risk gate (Green/Yellow/Orange/Red/Black)
 *   → master_controller / draft / approval / blocked
 *   → full reply to Telegram
 *   → dashboard update
 *
 * DAILY LEAD FACTORY (Sprint 1 MVP) — integrated:
 *   /today          → reads daily_report.json → Telegram summary
 *   /newleads       → reads leads_test.csv → lead cards with inline keyboards
 *   /emergency_stop → toggles emergency_stop flag in daily_report.json
 *   Callbacks       → approve/edit/postpone/archive/pdf → events_log.json
 *   Покажи входящие → reads inbox_messages.json + saves context
 *   Покажи их текст → uses saved inbox context
 *   Кто написал и от кого → uses saved inbox context
 *
 * SAFETY:
 *   - Does NOT send email/telegram to clients
 *   - approve_send ONLY marks lead for manual review; no auto-send
 *   - Does NOT print .env / tokens in output
 *   - Does NOT send audio to cloud
 *   - All outbound → outbound_drafts.json + Telegram preview to Дмитрий only
 *   - Lock file prevents duplicate bot instances
 *   - ONE token, ONE polling loop, ONE router
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
// 2026-05-29 IPv4 transport patch: route ALL Telegram API calls through the
// verified node_https_ipv4 transport instead of default fetch / raw https.request.
// Source of truth: tools/telegram_gateway/telegram_api_transport.mjs
import {
    tgCall as _tgCall_ipv4,
    TRANSPORT_NAME as _TG_TRANSPORT_NAME,
} from './telegram_api_transport.mjs';

// File Vault intake controller (Telegram file → safe intake → approval buttons).
// Pure logic lives in file_vault_controller.mjs / file_vault_intake.mjs.
// The bot only injects deps: { send, downloadBuffer, now }.
import * as fileVault from './file_vault_controller.mjs';



// Reliability layer (update/error logger, heartbeat, ring-buffer)
import {
    logUpdate,
    logError,
    writeHeartbeat,
    startHeartbeatTimer,
    detectRoute,
    getState,
    getLastN,
    getPaths,
    uptimeSeconds,
    markPollingError,
    markPollingOk,
} from './reliability.mjs';

// Contact resolution (safe — no client send)
import {
    parseContactIntent,
    handleContactIntent,
    getContactMatrixPath,
    getContactEventsPath,
} from '../contact_resolution/contact_handler.mjs';
// Mail status adapter (direct route — no fallback)
import { getMailStatus } from './mail_status_adapter.mjs';

// Lead Intake Adapter (Mini Audit 10K — safe, no client send)
import {
  parseLeadText,
  validateLead,
  appendLeadToRealCsv,
  listRealLeads,
  getRealLeadStats,
  createLeadIntakeResultReport,
  getLeadTemplate,
} from '../master_controller/lead_intake_adapter.mjs';

// ── SALES PHASE 1 — READ-ONLY commands (direct guards, Phase 1 = view only) ──
import {
    handleSalesPhase1,
    salesPhase1UnknownFallback,
    salesPhase1VoiceFallback,
} from './sales_commands_phase1.mjs';

// ── SALES PHASE 2 — OWNER-ONLY write-to-local-only ops (auto-send BLOCKED) ──
import {
    handleSalesPhase2,
    salesPhase2Help,
} from './sales_commands_phase2.mjs';

// ── RUSSIAN UNIVERSAL ROUTER — translation-only (RU phrase → canonical slash) ──
import { parseRussianIntent } from './russian_command_router.mjs';
import { resolveLeadId } from './lead_resolver.mjs';

// ── APPROVAL QUEUE B3 — status-only commands (Phase B, NO email send) ──
import { handleApprovalCommand } from './approval_commands.mjs';

// ── APPROVED EMAIL SEND C2.3a — dry-run only (NO email, NO SMTP, NO auto-send) ──
import { handleApprovedEmailSendCommand } from './approved_email_send_commands.mjs';
// ── LEAD CONTACT COMMANDS (C2.6c) — /contact_show /contact_add_email /contact_verify_email
//    /contact_add_phone /contact_hold_whatsapp /contact_registry. Write-to-local-only. No SMTP.
import { handleLeadContactCommand } from './lead_contact_commands.mjs';

// Lead Contact Enrichment commands (Phase C2.7e bot wiring) — offline, local-data only.
import { handleLeadContactEnrichmentCommand } from './lead_contact_enrichment_commands.mjs';
import * as leadIntakeBotAdapter from './lead_intake_bot_adapter.mjs';
import * as leadImportApprovalGlue from './lead_import_approval_review_bot_glue.mjs';
import * as leadImportReadonlyGlue from './lead_import_readonly_live_bot_glue.mjs';
// D3B approve/reject live-control ENABLED (Dmitry approved D3B only, 2026-06-06).
// Write-gated: mutation occurs ONLY via /lead_import_approve|reject <id> confirm.
import * as leadImportDecisionGlue from './lead_import_approval_decision_live_bot_glue.mjs';
// D3C prepare PENDING card ENABLED (Dmitry approved D3C only, 2026-06-06).
// Owner-gated, write-gated. Writes ONLY the approval queue via /lead_import_prepare
// <text>. NO real import, NO leads_master/lead_contacts/events write, NO client
// contact, NO auto-send. D4 commit remains HOLD.
import * as leadImportPrepareAdapter from './lead_import_prepare_adapter.mjs';

// T1 Telegram Hotkey Menu — SAFE, read-only menu + hints (Dmitry approved T1 only, 2026-06-06).
// Pure text/keyboard layer: NO send, NO queue write, NO import, NO PowerShell, NO token read.
import { handleHotkeyMenu } from './telegram_hotkey_menu.mjs';
import { handleTextVoiceIntent } from './telegram_text_voice_intent_router.mjs';

// T2 Read-only Ops Executor: owner-only, whitelisted local read-only checks
// (status / watchdog / regression). NO send/import/queue/restart. NO Telegram API
// inside the module, NO token read. The bot does the owner gate + reply send.
import {
    classifyOpsCommand as _t2ClassifyOps,
    runOpsAction as _t2RunOpsAction,
    formatOpsReply as _t2FormatOpsReply,
    opsMenuText as _t2OpsMenuText,
    OWNER_REFUSAL as _T2_OWNER_REFUSAL,
} from './telegram_ops_executor.mjs';

// ── V1 Telegram-Controlled Mini Audit System (offline build, no live restart) ──
// Four PURE modules: cockpit (read-only TOP leads), draft center (preview only),
// approved send controller (approval gate, SEND_ADAPTER_NOT_CONFIGURED offline),
// daily lead scout L1 (report-only). NONE of them send, import, write canonical
// leads, write queues, read tokens, or call the Telegram API. The bot does the
// owner gate + reply send. Autosend BLOCKED, manual sending disabled by process.
import {
    classifyAuditCommand as _v1ClassifyAudit,
    handleAuditCommand as _v1HandleAudit,
    findTop1 as _v1FindTop1,
    OWNER_REFUSAL as _V1_AUDIT_OWNER_REFUSAL,
} from './telegram_mini_audit_cockpit.mjs';
import {
    classifyDraftCommand as _v1ClassifyDraft,
    handleDraftCommand as _v1HandleDraft,
} from './telegram_outbound_draft_center.mjs';
// Block G/H: sales ledger (history) + sales pipeline status. Read-only here; NO send.
import {
    formatSalesHistory as _salesFormatHistory,
} from './outbound_send_ledger.mjs';
import {
    handleLeadRunPipeline as _salesHandleLeadRunPipeline,
    runLeadPipeline as _salesRunLeadPipeline,
    formatLeadPipelineReport as _salesFormatPipelineReport,
} from './lead_pipeline.mjs';


import {
    classifyContactResolveCommand as _v1ClassifyContactResolve,
    handleContactResolveCommand as _v1HandleContactResolve,
} from './telegram_contact_resolver.mjs';

import {
    classifyAuditRun as _v1ClassifyAuditRun,
    handleAuditRun as _v1HandleAuditRun,
} from './audit_run.mjs';


import {
    classifySendCommand as _v1ClassifySend,
    handleSendCommand as _v1HandleSend,
    handleDraftConfirm as _v1HandleDraftConfirm,
    handleClientSendConfirm as _p1HandleClientSendConfirm,
    handleDraftEdit as _v1HandleDraftEdit,
    handleEmailPreflightCommand as _e1c1HandleEmailPreflight,
    handleEmailTestSelfCommand as _e1c1HandleEmailTestSelf,
    handleAuditSendPreviewToMe as _previewHandleAuditSendPreviewToMe,
} from './telegram_approved_send_controller.mjs';



import {
    classifyScoutCommand as _v1ClassifyScout,
    handleScoutCommand as _v1HandleScout,
} from './telegram_daily_lead_scout_l1.mjs';

// V1 in-process draft memory (preview gate). Holds the LAST generated draft per
// chat so the approved-send controller can verify a preview existed before any
// approval. This is volatile RAM only — NO disk write, NO queue write.
const _v1DraftMemory = new Map();

// ---------------------------------------------------------------------------
// MAIL-FINAL-P1 ONE-SHOT: exactly ONE approved real client send, armed ONLY for
// the current TOP-1 target. P1 is considered "armed" for a given draft iff:
//   - env P1_CLIENT_SEND_APPROVED === 'true'
//   - this one-shot has NOT already been consumed (process-lifetime flag), AND
//   - the draft recipient === the locked TOP-1 recipient, AND
//   - the draft subject === the locked TOP-1 subject.
// Anything else drops to the SAFE non-armed path (P1_REQUIRED → no send).
// After exactly one successful SEND_OK_CLIENT_P1 the flag is consumed; any
// further ✅ press falls back to the no-send path until P1 is re-armed AND the
// gateway is restarted. NO autosend, NO mass send, NO send without owner ✅.
const P1_ONESHOT_RECIPIENT = 'kvs@zb23.ru';
const P1_ONESHOT_SUBJECT   = 'Короткий разбор сайта zb23.ru';
let   _p1OneShotConsumed   = false;

// APPROVAL-GATED ARMING (P1 env flag removed): the Telegram inline ✅ approval
// IS the authorization gate. _p1ComputeArmed no longer reads
// process.env.P1_CLIENT_SEND_APPROVED. A draft is "armed" for the single
// approved client send iff the one-shot has NOT been consumed and the draft has
// a recipient + subject + body. The recipient gate (no test/example/EMAIL_TEST_TO)
// is enforced canonically inside the SMTP adapter (sendApprovedClientEmail).
function _p1ComputeArmed(draft) {
    if (_p1OneShotConsumed) return false;
    const rcpt = String((draft && draft.recipient) || '').trim();
    const subj = String((draft && draft.subject) || '').trim();
    const body = String((draft && draft.body) || '').trim();
    if (!rcpt || !subj || !body) return false;
    return true;
}


function _p1ConsumeIfSent(out) {
    if (out && out.ok === true && out.code === 'SEND_OK_CLIENT_P1') {
        _p1OneShotConsumed = true;
    }
}


// ── AUDIT-SEND INLINE APPROVAL (owner-only inline buttons under Outbound Draft) ──
// Volatile RAM only — NO disk/queue write, NO token read. These maps let the
// inline buttons reference a draft via a SHORT callback key when the full
// draft_id would push callback_data past Telegram's 64-byte hard limit, and
// block duplicate presses on an already-processed draft.
const _auditSendKeyByDraft = new Map();  // draft_id -> short key
const _auditSendDraftByKey = new Map();  // short key -> draft_id
const _auditSendProcessed  = new Map();  // draft_id -> 'approve' | 'reject'
let   _auditSendSeq = 0;

function _auditSendResolveKey(draftId) {
    if (_auditSendKeyByDraft.has(draftId)) return _auditSendKeyByDraft.get(draftId);
    const key = 'k' + (++_auditSendSeq).toString(36);
    _auditSendKeyByDraft.set(draftId, key);
    _auditSendDraftByKey.set(key, draftId);
    return key;
}

function _auditSendResolveDraftId(ref) {
    if (_auditSendDraftByKey.has(ref)) return _auditSendDraftByKey.get(ref);
    return ref; // direct mode: ref IS the draft_id
}

// Build the inline keyboard placed UNDER an Outbound Draft preview. NO send is
// performed here — pressing a button only triggers the existing approve/reject
// controller path (owner-gated) later. Returns null when there is no draft_id.
function buildAuditSendKeyboard(draftId) {
    if (!draftId) return null;
    const PREFIX_APPROVE = 'audit_send:approve:';
    const PREFIX_REJECT  = 'audit_send:reject:';
    let ref = String(draftId);
    // Telegram callback_data hard limit = 64 bytes. Fall back to a short key
    // (unambiguously mapped back to draft_id) when the direct form is too long.
    if (Buffer.byteLength(PREFIX_APPROVE + ref, 'utf8') > 64 ||
        Buffer.byteLength(PREFIX_REJECT + ref, 'utf8') > 64) {
        ref = _auditSendResolveKey(String(draftId));
    }
    return {
        inline_keyboard: [
            [{ text: '✅ Отправить', callback_data: PREFIX_APPROVE + ref }],
            [{ text: '❌ Отклонить', callback_data: PREFIX_REJECT + ref }],
        ],
    };
}

// Compose the owner-facing header for an audit_send approve/reject callback.
// HARD HONESTY RULE: "✅ Отправлено" may ONLY appear when a REAL external send
// actually succeeded (controller result.ok === true AND code === 'SENT'). In
// every offline/blocked path (SEND_ADAPTER_NOT_CONFIGURED, missing recipient,
// no adapter, autosend blocked, etc.) we must NOT claim the message was sent —
// we acknowledge the approval and state plainly that no real send happened.
// Pure function (no I/O) so it can be unit-tested offline.
function formatAuditSendApproveHeader(action, draftId, out) {
    if (action === 'reject') {
        return `❌ Отклонено: ${draftId}`;
    }
    const result = out && out.result ? out.result : null;
    const realSendSucceeded = !!(result && result.ok === true && result.code === 'SENT');
    if (realSendSucceeded) {
        return `✅ Отправлено: ${draftId}`;
    }
    const reason = (result && result.code)
        ? result.code
        : 'SEND_ADAPTER_NOT_CONFIGURED';
    return [
        `✅ Approval получен: ${draftId}`,
        `🚫 Реальная отправка не выполнена: ${reason}`,
        'Autosend: BLOCKED',
    ].join('\n');
}






// D4 commit live-control remains HOLD — intentionally NOT imported.
// import * as leadImportCommitGlue from './lead_import_commit_live_bot_glue.mjs';





const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// WORKSPACE вычисляется из расположения скрипта — работает из любой папки
const WORKSPACE  = path.resolve(path.join(__dirname, '..', '..'));

// ============================================================
// CONFIG — read .env safely (gateway .env first, root .env fallback)
// ============================================================
function parseEnvFile(filePath) {
    const result = {};
    if (!fs.existsSync(filePath)) return result;
    // Strip BOM explicitly (UTF-8 BOM = \uFEFF), split on LF or CRLF
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');  // split on FIRST '=' only
        if (eq < 0) continue;
        const key = t.substring(0, eq).trim();
        const val = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!key) continue;
        result[key] = val;
    }
    return result;
}

function loadEnvSafe() {
    const gatewayEnvPath = path.join(__dirname, '.env');
    const rootEnvPath    = path.join(WORKSPACE, '.env');

    // Step 1: try gateway .env
    let result = parseEnvFile(gatewayEnvPath);

    // Step 2: if token missing, try root .env as fallback
    if (!result.TELEGRAM_BOT_TOKEN) {
        const rootResult = parseEnvFile(rootEnvPath);
        if (rootResult.TELEGRAM_BOT_TOKEN) {
            for (const [k, v] of Object.entries(rootResult)) {
                if (!(k in result)) result[k] = v;
            }
            if (!result.TELEGRAM_BOT_TOKEN) result.TELEGRAM_BOT_TOKEN = rootResult.TELEGRAM_BOT_TOKEN;
            console.log('[env] bot token loaded from fallback env path');
        }
    }

    if (!result.TELEGRAM_BOT_TOKEN) {
        console.error('TELEGRAM_BOT_TOKEN not set. Checked:');
        console.error('  - tools/telegram_gateway/.env');
        console.error('  - D:\\AI_WORKSPACE\\.env');
    }

    if (!result.ALLOWED_TELEGRAM_USER_IDS) {
        console.warn('ALLOWED_TELEGRAM_USER_IDS not set. Bot will reject all users.');
    }

    return result;
}

// ============================================================
// E1C2D-FIX — Runtime mail env loader (presence-only, never prints values)
// ------------------------------------------------------------
// Root cause of E1C2D: loadEnvSafe() parses the .env file into a LOCAL object
// (`ENV`) but never writes mail keys into process.env. `/email_preflight`
// reads `env: process.env`, so YANDEX_* keys showed up as missing at runtime.
//
// loadTelegramGatewayEnvKeys() upserts ONLY a whitelisted set of mail keys
// into process.env so the preflight context sees them. It:
//   - reads tools/telegram_gateway/.env
//   - optionally reads D:\AI_SECRETS\01_env\telegram_gateway.env if present
//   - upserts ONLY whitelisted key names
//   - NEVER prints values (no login, no password, no recipient)
//   - does NOT overwrite an already-set process.env key unless override=true
//   - returns a presence map (booleans only) — never values
// This loader NEVER enables sending; EMAIL_REAL_SEND_ENABLED stays whatever the
// file says and send gates remain forced-false in the controller.
const TELEGRAM_GATEWAY_MAIL_ENV_KEYS = [
    'YANDEX_MAIL_LOGIN',
    'YANDEX_MAIL_APP_PASSWORD',
    'EMAIL_TEST_TO',
    'EMAIL_TEST_ONLY',
    'EMAIL_REAL_SEND_ENABLED',
    'EMAIL_PROVIDER',
    'EMAIL_SMTP_HOST',
    'EMAIL_SMTP_PORT',
    'EMAIL_SMTP_SECURE',
    'EMAIL_SMTP_USER',
    'EMAIL_SMTP_PASS',
    'EMAIL_FROM',
    'EMAIL_FROM_LABEL',
];

function loadTelegramGatewayEnvKeys(options = {}) {
    const override = options.override === true;
    const targetEnv = (options.targetEnv && typeof options.targetEnv === 'object')
        ? options.targetEnv
        : process.env;
    const gatewayEnvPath = options.gatewayEnvPath || path.join(__dirname, '.env');
    const secretsEnvPath = options.secretsEnvPath || 'D:\\AI_SECRETS\\01_env\\telegram_gateway.env';

    // Parse gateway .env first; overlay secrets env if it exists (secrets win on
    // file-presence, but never overwrite an already-set process.env key unless
    // override=true).
    const fileValues = {};
    const fromGateway = parseEnvFile(gatewayEnvPath);
    for (const [k, v] of Object.entries(fromGateway)) fileValues[k] = v;

    if (fs.existsSync(secretsEnvPath)) {
        const fromSecrets = parseEnvFile(secretsEnvPath);
        for (const [k, v] of Object.entries(fromSecrets)) fileValues[k] = v;
    }

    const presence = {};
    for (const key of TELEGRAM_GATEWAY_MAIL_ENV_KEYS) {
        const presentInFile = Object.prototype.hasOwnProperty.call(fileValues, key)
            && String(fileValues[key] ?? '').length > 0;
        let loadedToRuntime = false;

        if (presentInFile) {
            const alreadySet = Object.prototype.hasOwnProperty.call(targetEnv, key)
                && String(targetEnv[key] ?? '').length > 0;
            if (!alreadySet || override) {
                targetEnv[key] = fileValues[key];
                loadedToRuntime = true;
            } else {
                // already present in runtime — count as available
                loadedToRuntime = true;
            }
        }

        presence[key] = {
            present_in_file: presentInFile,
            loaded_to_runtime: loadedToRuntime,
        };
    }

    // values_printed is always false: we never emit values from this function.
    return { presence, values_printed: false };
}

const ENV = loadEnvSafe();

// E1C2D-FIX: hydrate process.env with mail keys BEFORE any routes register so
// /email_preflight sees YANDEX_* / EMAIL_* presence. Presence-only; no values logged.
loadTelegramGatewayEnvKeys();

const BOT_TOKEN = ENV.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = ENV.TELEGRAM_CHAT_ID   || ENV.TELEGRAM_ADMIN_CHAT_ID || '';

// ── OWNER ALLOWLIST ──────────────────────────────────────────────────────────
// The owner is identified by EITHER:
//   - the admin chat id  (TELEGRAM_CHAT_ID / TELEGRAM_ADMIN_CHAT_ID), and/or
//   - a Telegram user id  (ALLOWED_TELEGRAM_USER_IDS, comma/space separated).
// Owner-gated features (e.g. D1 lead-import commands) must accept the owner
// when EITHER source matches. This does NOT weaken security: a sender is the
// owner only if their message.from.id is in the user allowlist OR their
// chat.id equals the configured admin chat id.
const ALLOWED_USER_IDS = new Set(
    String(ENV.ALLOWED_TELEGRAM_USER_IDS || '')
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => s !== ''),
);

/**
 * Returns true when the (userId, chatId) pair identifies the bot owner.
 * Uses message.from.id (userId) against ALLOWED_TELEGRAM_USER_IDS and/or
 * chat.id against the admin CHAT_ID. If no allowlist is configured at all,
 * returns false (fail-closed: owner-only stays owner-only).
 */
function isOwnerSender(userId, chatId) {
    const normUser = userId != null ? String(userId).trim() : '';
    const normChat = chatId != null ? String(chatId).trim() : '';
    const normAllowedChat = CHAT_ID ? String(CHAT_ID).trim() : '';

    const userMatch = normUser !== '' && ALLOWED_USER_IDS.has(normUser);
    const chatMatch = normAllowedChat !== '' && normChat === normAllowedChat;

    return userMatch || chatMatch;
}


// ============================================================
// PATHS
// ============================================================
const DATA              = path.join(WORKSPACE, 'data');
const OUTBOUND_DRAFTS   = path.join(DATA, 'outbound_drafts.json');
const TG_REQUESTS       = path.join(DATA, 'telegram_task_requests.json');
const TG_RESULTS        = path.join(DATA, 'telegram_task_results.json');
const EVENTS_LOG        = path.join(DATA, 'events_log.json');
const INBOX_MESSAGES    = path.join(DATA, 'inbox_messages.json');
const VOICE_INBOX       = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'voice', 'voice_inbox.json');
const VOICE_TRANSCRIPTS = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'voice', 'voice_transcripts.json');
const ROUTER_SCRIPT     = path.join(WORKSPACE, 'tools', 'task_router', 'universal_task_router.mjs');
const TRANSCRIBE        = path.join(WORKSPACE, 'tools', 'voice_transcription', 'transcribe_voice.mjs');
const RUN_CMD           = path.join(WORKSPACE, 'tools', 'master_controller', 'run_command.mjs');
const REPLY_LOG         = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'telegram_reply_preview_log.md');
const STATE_FILE        = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'state', 'telegram_gateway_state.json');
const LOCK_FILE         = path.join(__dirname, '.telegram_master_bot.lock');
const LOGS_DIR          = path.join(__dirname, 'logs');
const BOT_LOG_FILE      = path.join(LOGS_DIR, 'telegram_master_bot.log');
const TELEGRAM_ERRORS_LOG = path.join(LOGS_DIR, 'telegram_errors.log');

// Daily Lead Factory paths
const DLF_BASE       = path.join(WORKSPACE, '13_sales', 'daily_lead_factory');
const DLF_REPORT     = path.join(DLF_BASE, 'data', 'daily_report.json');
const DLF_LEADS_CSV  = path.join(DLF_BASE, 'data', 'leads_test.csv');
const DLF_EVENTS     = path.join(DLF_BASE, 'data', 'events_log.json');
// Sprint 2: processed queue & import report
const DLF_QUEUE      = path.join(DLF_BASE, 'data', 'processed', 'telegram_queue.json');
const DLF_IMPORT_RPT = path.join(DLF_BASE, 'data', 'processed', 'import_report.json');

// ============================================================
// HELPERS
// ============================================================
function readJSON(p, fb = []) {
    try {
        if (!fs.existsSync(p)) return fb;
        const d = fs.readFileSync(p, 'utf-8').trim();
        return d ? JSON.parse(d) : fb;
    } catch (_) { return fb; }
}

function writeJSON(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function appendEvent(ev) {
    const log = readJSON(EVENTS_LOG, []);
    log.push({ ...ev, timestamp: new Date().toISOString() });
    writeJSON(EVENTS_LOG, log);
}

function appendReplyLog(entry) {
    const line = `\n---\n${new Date().toISOString()}\n${entry}\n`;
    try { fs.appendFileSync(REPLY_LOG, line, 'utf-8'); } catch (_) {}
}

// Sprint 2 fix: normalize various queue shapes into an array
function normalizeLeadQueue(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.leads)) return raw.leads;
    if (raw && Array.isArray(raw.queue)) return raw.queue;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.data))  return raw.data;
    return [];
}

function appendTelegramError(route, err) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
        const ts = new Date().toISOString();
        const msg = (err && err.message) ? err.message : String(err);
        const stack = (err && err.stack) ? err.stack : '';
        fs.appendFileSync(
            TELEGRAM_ERRORS_LOG,
            `[${ts}] route=${route} error=${msg}\n${stack}\n---\n`,
            'utf-8'
        );
    } catch (_) {}
}

function updateState(patch) {
    const s = readJSON(STATE_FILE, {});
    Object.assign(s, patch, { updated_at: new Date().toISOString() });
    writeJSON(STATE_FILE, s);
}

// ============================================================
// STARTUP LOGGER
// ============================================================
function botLog(level, message) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
        const ts   = new Date().toISOString();
        const line = `[${ts}] [${level.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(BOT_LOG_FILE, line, 'utf-8');
    } catch (_) {}
    // Also print to console (without sensitive data)
    if (level !== 'DEBUG') console.log(`[${level.toUpperCase()}] ${message}`);
}

// ============================================================
// LOCK FILE — JSON format, prevents duplicate instances
// ============================================================
function checkAndCreateLock() {
    if (fs.existsSync(LOCK_FILE)) {
        let existingPid = null;
        try {
            const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
            // Support both old plain-PID format and new JSON format
            if (raw.startsWith('{')) {
                const parsed = JSON.parse(raw);
                existingPid = parsed.pid;
            } else {
                existingPid = parseInt(raw, 10);
            }
        } catch (_) {}

        if (existingPid && existingPid !== process.pid) {
            let alive = false;
            try {
                process.kill(existingPid, 0);
                alive = true;
            } catch (e) {
                // EPERM on Windows = process exists but no permission to signal (still alive)
                if (e.code === 'EPERM') alive = true;
                // ESRCH = process doesn't exist = stale lock
            }
            if (alive) {
                botLog('ERROR', `Another instance is already running (PID: ${existingPid}). Exiting.`);
                botLog('ERROR', 'Stop it first: run stop_master_bot.ps1 or check_master_bot.ps1');
                process.exit(1);
            } else {
                botLog('WARN', `Removing stale lock (PID: ${existingPid} is dead).`);
                try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
            }
        }
    }
    // Write JSON lock file with full context
    const lockData = {
        pid:         process.pid,
        started_at:  new Date().toISOString(),
        script_path: __filename,
    };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2), 'utf-8');
    botLog('INFO', `Lock file created. PID: ${process.pid}`);
}

function removeLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
            let lockPid = null;
            try {
                lockPid = raw.startsWith('{') ? JSON.parse(raw).pid : parseInt(raw, 10);
            } catch (_) {}
            if (lockPid === process.pid) {
                fs.unlinkSync(LOCK_FILE);
                botLog('INFO', 'Lock file removed.');
            }
        }
    } catch (_) {}
}

// ============================================================
// DAILY LEAD FACTORY HELPERS
// ============================================================

// Simple CSV parser (handles quoted fields)
function parseCSV(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { values.push(cur); cur = ''; }
            else { cur += ch; }
        }
        values.push(cur);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
        return obj;
    });
}

// Append event to DLF-specific events log
function appendDLFEvent(ev) {
    const log = readJSON(DLF_EVENTS, []);
    log.push({ ...ev, timestamp: new Date().toISOString() });
    writeJSON(DLF_EVENTS, log);
}

// HTML escape for Telegram HTML parse mode
function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const TIER_EMOJI    = { A: '🔥', B: '⭐', C: '📋', D: '⬇️' };
const RISK_EMOJI_DLF = { GREEN: '🟢', YELLOW: '🟡', ORANGE: '🟠', RED: '🔴' };

function buildLeadCardHTML(lead) {
    const tier      = lead.tier || '?';
    const score     = lead.score || 0;
    const riskLevel = lead.risk_level || 'UNKNOWN';
    const tierEmoji = TIER_EMOJI[tier] || '❓';
    const riskEmoji = RISK_EMOJI_DLF[riskLevel] || '⚪';
    // Short ID for display: dlf_lead_001 → DLF-001, or pass through as-is
    const rawId   = lead.lead_id || '?';
    const shortId = rawId.replace(/^dlf_lead_0*(\d+)$/i, 'DLF-$1').toUpperCase();
    return [
        `<b>━━━━━━━━━━━━━━━━━━━━━━━━</b>`,
        `${tierEmoji} <b>${escapeHtml(lead.company_name)}</b>`,
        `📍 ${escapeHtml(lead.city || '—')} | 🏭 ${escapeHtml(lead.niche || '—')}`,
        ``,
        `📊 Score: <b>${score}/100</b>`,
        `${riskEmoji} Риск: <b>${escapeHtml(riskLevel)}</b>`,
        ``,
        `🌐 ${escapeHtml(lead.website || 'нет сайта')}`,
        `📞 ${escapeHtml(lead.phone || '—')}`,
        `✉️ ${escapeHtml(lead.email || '—')}`,
        ``,
        `🔍 <b>Проблема:</b>`,
        `${escapeHtml(lead.pain_signal || 'не указана')}`,
        ``,
        `💼 <b>Оффер:</b>`,
        `${escapeHtml(lead.offer_hint || 'Аудит + рекомендации')}`,
        ``,
        `✉️ <b>Черновик:</b>`,
        `<i>${escapeHtml((lead.draft_message || 'Нет черновика').substring(0, 280))}</i>`,
        ``,
        `📌 <b>Действие:</b>`,
        `Одобрить ручную отправку или отправить на доработку.`,
        ``,
        `ID: <code>${escapeHtml(shortId)}</code>`,
        `<b>━━━━━━━━━━━━━━━━━━━━━━━━</b>`,
    ].join('\n');
}

function buildLeadKeyboard(leadId) {
    return {
        inline_keyboard: [
            [
                { text: '✅ Одобрить',  callback_data: `dlf:approve:${leadId}` },
                { text: '✏️ Изменить',  callback_data: `dlf:edit:${leadId}` },
            ],
            [
                { text: '⏸ Отложить',  callback_data: `dlf:postpone:${leadId}` },
                { text: '❌ В архив',   callback_data: `dlf:archive:${leadId}` },
            ],
            [
                { text: '📄 PDF-аудит', callback_data: `dlf:pdf:${leadId}` },
            ],
        ],
    };
}

// Per-chat inbox context store for follow-up commands
const last_context = {};

// ============================================================
// TELEGRAM API
// ============================================================
// 2026-05-29 IPv4 transport patch:
// tgRequest now delegates ALL Telegram API calls to the verified IPv4 transport
// (telegram_api_transport.mjs, TRANSPORT_NAME='node_https_ipv4'). The previous
// direct https.request path (which used default DNS resolution and was
// confirmed FAIL in the 2026-05-29 probe) has been removed.
// NEVER log BOT_TOKEN. NEVER log full CHAT_ID. Errors are caught and logged
// without secrets via appendTelegramError / botLog.
function tgRequest(method, body) {
    if (!BOT_TOKEN) return Promise.resolve({ ok: false, error: 'no token' });
    return _tgCall_ipv4(BOT_TOKEN, method, body || {})
        .catch((err) => {
            // Defensive: tgCall already resolves on error, but guard anyway.
            const msg = (err && err.message) ? err.message : String(err);
            try { appendTelegramError(`tgRequest:${method}`, err); } catch (_) {}
            return { ok: false, error: msg, transport: _TG_TRANSPORT_NAME };
        });
}

async function sendTelegram(chatId, text) {
    // Split long messages to stay within Telegram's 4096-char limit
    const MAX = 4000;
    const parts = [];
    let t = text;
    while (t.length > MAX) {
        parts.push(t.substring(0, MAX));
        t = t.substring(MAX);
    }
    parts.push(t);
    for (const part of parts) {
        if (!part.trim()) continue;
        // patch 2026-05-30 (sendMessage 400 fix):
        // The IPv4 transport (tgCall) ALWAYS resolves — even on HTTP 400 it
        // returns { ok:false, status:400, description:... } instead of throwing.
        // The previous .catch()-based fallback therefore never fired on a 400
        // (e.g. Markdown "can't parse entities"), so the message silently failed.
        // We now inspect result.ok and explicitly retry as plain text on failure.
        const _chatLast4 = String(chatId).slice(-4);

        // Attempt 1: Markdown
        let res = await tgRequest('sendMessage', { chat_id: chatId, text: part, parse_mode: 'Markdown' });

        // Attempt 2: plain text (no parse_mode) if Markdown failed for ANY reason
        if (!res || !res.ok) {
            const desc1 = (res && (res.description || res.error)) ? String(res.description || res.error) : 'unknown';
            botLog('WARN', `sendTelegram markdown_failed attempt=1 chat_last4=${_chatLast4} status=${res && res.status || '-'} desc=${desc1.substring(0, 120)}`);
            res = await tgRequest('sendMessage', { chat_id: chatId, text: part });
        }

        // Final failure: log redacted (no tokens, no full chat_id, no full text)
        if (!res || !res.ok) {
            const desc2 = (res && (res.description || res.error)) ? String(res.description || res.error) : 'unknown';
            botLog('ERROR', `sendTelegram_failed attempt=2 chat_last4=${_chatLast4} status=${res && res.status || '-'} desc=${desc2.substring(0, 120)}`);
            appendTelegramError('sendTelegram', new Error(`status=${res && res.status || '-'} description=${desc2}`));
        }
    }
    appendReplyLog(`TO: ${chatId}\n${text.substring(0, 500)}`);

}

// ============================================================
// FILE VAULT — download helper + dependency factory
// ============================================================
// Downloads a Telegram file by file_id into an in-memory Buffer.
//   1) getFile(file_id) → file_path
//   2) GET https://api.telegram.org/file/bot<TOKEN>/<file_path>
// SAFETY: download only. Never uploads, never forwards, never sends externally.
// The token is used ONLY to build the file URL and is NEVER logged.
function downloadTelegramFileBuffer(fileId) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!BOT_TOKEN) return reject(new Error('no token'));
            const gf = await tgRequest('getFile', { file_id: fileId });
            if (!gf || !gf.ok || !gf.result || !gf.result.file_path) {
                return reject(new Error('getFile_failed'));
            }
            const filePath = gf.result.file_path;
            const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`download_status_${res.statusCode}`));
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        } catch (err) {
            reject(err);
        }
    });
}

// Build the File Vault dependency object injected into the controller.
// send(chatId, text, replyMarkup?) → uses tgRequest directly so inline keyboards
// attach (sendTelegram has no reply_markup arg). downloadBuffer → in-memory only.
function buildFileVaultDeps() {
    return {
        now: new Date(),
        downloadBuffer: downloadTelegramFileBuffer,
        send: async (chatId, text, replyMarkup) => {
            if (replyMarkup) {
                let r = await tgRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup });
                if (!r || !r.ok) {
                    r = await tgRequest('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
                }
                appendReplyLog(`TO: ${chatId} [file_vault]`);
                return r;
            }
            return await sendTelegram(chatId, text);
        },
    };
}

// ============================================================
// HANDLE DLF DIRECT COMMANDS (priority — checked before NL router)
// ============================================================

async function handleDLFCommand(chatId, userId, text) {
    const t  = text.trim();
    const tl = t.toLowerCase();
    // Parse the primary command token (e.g. "lead_add", "lead_status")
    const _cmd = tl.replace(/^\//, '').split(/\s+/)[0].toLowerCase();

    // Strip @BotUsername suffix from slash commands (e.g. /ping@mybot → /ping)
    // This is the fix for silent /ping when sent in groups or with username suffix
    const tlClean = tl.replace(/@[a-z0-9_]+$/, '').trim();

    // Russian text aliases → canonical slash commands (FULL TABLE 2026-05-25)
    const TODAY_ALIASES       = ['сводка за сегодня', 'покажи сегодня', 'что сегодня', 'отчёт за сегодня', 'сегодня', 'на сегодня', 'план на сегодня', 'сводка', '/today', '/daily'];
    const TASKS_ALIASES       = ['задачи', 'мои задачи', 'что делать', 'что дальше', 'пора заработать', 'дай задачи', 'следующий шаг', 'план действий'];
    const HEALTH_ALIASES      = ['/health', 'health', 'здоровье', 'диагностика', 'что с системой', 'что с системой?', 'статус системы', 'система', 'как система', 'что работает'];
    const LEAD_STATUS_ALIASES = ['лиды', 'статус лидов', 'что по лидам', 'сколько лидов', 'real leads', '/leadstatus', '/lead status'];
    const LEAD_TMPL_ALIASES   = ['шаблон лида', 'как добавить лид', 'дай шаблон лида', '/leadtemplate', '/lead template'];
    const LEAD_ADD_ALIASES    = ['/leadadd', '/add_lead', '/addlead', 'добавить лид'];
    const LEAD_LIST_ALIASES   = ['/leadlist', 'список лидов', 'покажи лиды', 'последние лиды'];
    const LEAD_RUN_ALIASES    = ['/leadrunpipeline', '/run_leads', 'запусти лиды', 'прогони лиды', 'запусти pipeline', 'прогнать pipeline'];
    const MAIL_ALIASES        = ['/mail status', '/mail_status', 'почта', 'статус почты', 'что с почтой'];
    const APPROVAL_ALIASES    = ['/approval list', 'approvals', 'апрувы', 'согласования', 'что ждёт подтверждения'];
    const NEWLEADS_ALIASES    = ['новые лиды', 'покажи новые лиды', 'лиды на сегодня'];
    const IMPORT_ALIASES      = ['/import_status', 'статус импорта', 'отчёт импорта', 'импорт статус'];
    const PING_ALIASES        = ['ping', 'пинг', 'проверка', 'проверка связи', 'бот живой', 'ты живой'];
    const HELP_ALIASES        = ['help', 'помощь', 'команды', 'что умеешь', '/help'];

    const cmd = PING_ALIASES.includes(tlClean)        ? '/ping'
              : TODAY_ALIASES.includes(tlClean)        ? '/today'
              : TASKS_ALIASES.includes(tlClean)        ? '/tasks'
              : HEALTH_ALIASES.includes(tlClean)       ? '/health'
              : LEAD_STATUS_ALIASES.includes(tlClean)  ? '/lead_status'
              : LEAD_TMPL_ALIASES.includes(tlClean)    ? '/lead_template'
              : LEAD_ADD_ALIASES.includes(tlClean)     ? '/lead_add'
              : LEAD_LIST_ALIASES.includes(tlClean)    ? '/lead_list'
              : LEAD_RUN_ALIASES.includes(tlClean)     ? '/lead_run_pipeline'
              : MAIL_ALIASES.includes(tlClean)         ? '/mail'
              : APPROVAL_ALIASES.includes(tlClean)     ? '/approval list'
              : NEWLEADS_ALIASES.includes(tlClean)     ? '/newleads'
              : IMPORT_ALIASES.includes(tlClean)       ? '/import_status'
              : HELP_ALIASES.includes(tlClean)         ? '/help'
              : tlClean;

    // ---- /ping — DIRECT ROUTE, guaranteed response ----
    if (cmd === '/ping' || tlClean === '/ping') {
        const uptime = uptimeSeconds();
        const rState = getState();
        const paths  = getPaths();
        let hbAge = 'unknown';
        try {
            if (fs.existsSync(paths.HEARTBEAT_FILE)) {
                const hb  = JSON.parse(fs.readFileSync(paths.HEARTBEAT_FILE, 'utf-8'));
                const age = Math.round((Date.now() - new Date(hb.last_heartbeat_at).getTime()) / 1000);
                hbAge = `${age}s`;
            }
        } catch (_) {}
        const pong = [
            'pong',
            `Bot: @${BOT_USERNAME}`,
            `PID: ${process.pid}`,
            `Uptime: ${uptime}s`,
            `Polling: ${pollingActive ? 'active' : 'inactive'}`,
            `Heartbeat age: ${hbAge}`,
            `Last update: ${rState.last_update_at || 'none'}`,
            `Auto-send: BLOCKED`,
        ].join('\n');
        await sendTelegram(chatId, pong);
        // Update heartbeat with ping info
        writeHeartbeat({ last_ping_at: new Date().toISOString(), last_route: '/ping', last_update_type: 'text', polling: pollingActive });
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/ping', detected_route: '/ping', status: 'routed' });
        return true;
    }

    // ---- /probe — DIRECT ROUTE ----
    if (cmd === '/probe') {
        const uptime = uptimeSeconds();
        const rState = getState();
        const paths  = getPaths();
        let hbAge = 'unknown', lastVoiceAt = '—', lastVoiceStatus = '—', lastErrorAt = '—', lastUpdateAt = '—', lastUpdateIdStr = String(lastUpdateId);
        try {
            if (fs.existsSync(paths.HEARTBEAT_FILE)) {
                const hb  = JSON.parse(fs.readFileSync(paths.HEARTBEAT_FILE, 'utf-8'));
                const age = Math.round((Date.now() - new Date(hb.last_heartbeat_at).getTime()) / 1000);
                hbAge         = `${age}s`;
                lastVoiceAt   = hb.last_voice_at   || '—';
                lastVoiceStatus = hb.last_voice_status || '—';
            }
        } catch (_) {}
        lastErrorAt  = rState.last_error_at  || '—';
        lastUpdateAt = rState.last_update_at || '—';
        const probe = [
            '🔎 *Live Probe*',
            `bot_username: @${BOT_USERNAME}`,
            `chat_id: ${chatId}`,
            `user_id: ${userId || '—'}`,
            `PID: ${process.pid}`,
            `uptime: ${uptime}s`,
            `heartbeat_age: ${hbAge}`,
            `polling_status: ${pollingActive ? 'active' : 'inactive'}`,
            `last_update_at: ${lastUpdateAt}`,
            `last_error_at: ${lastErrorAt}`,
            `update_id: ${lastUpdateIdStr}`,
            `last_voice_at: ${lastVoiceAt}`,
            `last_voice_status: ${lastVoiceStatus}`,
            `auto_send: BLOCKED`,
        ].join('\n');
        await sendTelegram(chatId, probe);
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/probe', detected_route: '/probe', status: 'routed' });
        return true;
    }

    // ---- /voice_status — DIRECT ROUTE ----
    if (cmd === '/voice_status') {
        const paths = getPaths();
        let lastVoiceAt = '—', lastVoiceStatus = '—', lastVoiceErr = '—';
        try {
            if (fs.existsSync(paths.HEARTBEAT_FILE)) {
                const hb = JSON.parse(fs.readFileSync(paths.HEARTBEAT_FILE, 'utf-8'));
                lastVoiceAt     = hb.last_voice_at     || '—';
                lastVoiceStatus = hb.last_voice_status || '—';
                lastVoiceErr    = hb.last_voice_error  || '—';
            }
        } catch (_) {}
        // Check if transcriber is configured based on transcribe_voice.mjs existing and whisper available
        const transcriberExists = fs.existsSync(TRANSCRIBE);
        // Try a quick dry-run probe (no audio) — look for ENOENT vs configured
        let transcriberConfigured = false;
        let provider = 'none';
        if (transcriberExists) {
            const probe = spawnSync('node', [TRANSCRIBE, '--check'], { encoding: 'utf-8', timeout: 5000, windowsHide: true });
            if (probe.stdout && probe.stdout.includes('whisper')) { transcriberConfigured = true; provider = 'local_whisper'; }
            else if (probe.stdout && probe.stdout.includes('external')) { transcriberConfigured = true; provider = 'external'; }
            else { provider = 'none'; }
        }
        const lines = [
            '🎙 *Voice Status*',
            `voice_handler: enabled`,
            `transcriber_configured: ${transcriberConfigured ? 'yes' : 'no'}`,
            `provider: ${provider}`,
            `last_voice_at: ${lastVoiceAt}`,
            `last_voice_status: ${lastVoiceStatus}`,
            `last_voice_error: ${lastVoiceErr}`,
            `timeout_sec: 60`,
        ].join('\n');
        await sendTelegram(chatId, lines);
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/voice_status', detected_route: '/voice_status', status: 'routed' });
        return true;
    }

    // ---- FILE VAULT commands (/vault_status /vault_recent /vault_inbox /vault_help) ----
    // Read-only status/help text from the File Vault controller. NO send externally,
    // NO file deletion. Owner gate is enforced upstream by the chat_id allowlist.
    if (_cmd === 'vault_status' || tlClean === '/vault_status') {
        try { await sendTelegram(chatId, fileVault.vaultStatusText(new Date())); }
        catch (e) { await sendTelegram(chatId, `⚠️ Ошибка /vault_status: ${(e.message || '').substring(0, 120)}`); }
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/vault_status', detected_route: 'file_vault_status', status: 'routed' });
        return true;
    }
    if (_cmd === 'vault_recent' || tlClean === '/vault_recent') {
        try { await sendTelegram(chatId, fileVault.vaultRecentText(10)); }
        catch (e) { await sendTelegram(chatId, `⚠️ Ошибка /vault_recent: ${(e.message || '').substring(0, 120)}`); }
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/vault_recent', detected_route: 'file_vault_recent', status: 'routed' });
        return true;
    }
    if (_cmd === 'vault_inbox' || tlClean === '/vault_inbox') {
        try { await sendTelegram(chatId, fileVault.vaultInboxText()); }
        catch (e) { await sendTelegram(chatId, `⚠️ Ошибка /vault_inbox: ${(e.message || '').substring(0, 120)}`); }
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/vault_inbox', detected_route: 'file_vault_inbox', status: 'routed' });
        return true;
    }
    if (_cmd === 'vault_help' || tlClean === '/vault_help') {
        try { await sendTelegram(chatId, fileVault.vaultHelpText()); }
        catch (e) { await sendTelegram(chatId, `⚠️ Ошибка /vault_help: ${(e.message || '').substring(0, 120)}`); }
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/vault_help', detected_route: 'file_vault_help', status: 'routed' });
        return true;
    }

    // ---- /start ----
    if (cmd === '/start') {

        const help = [
            '✅ *Dmitry Master Controller активен.*',
            '',
            '*Команды:*',
            '🧪 /ping — проверка связи',
            '🩺 /health — диагностика',
            '🔎 /probe — live probe',
            '📊 /today — сводка',
            '📋 /newleads — новые лиды',
            '📥 /intake_status — intake',
            '🐞 /debug_last — последние команды',
            '🛑 /emergency_stop — стоп approval',
            '🎙 /voice_status — статус голосового хэндлера',
            '',
            '📬 Покажи входящие',
            '📝 Покажи их текст',
            '👤 Кто написал и от кого',
        ].join('\n');
        await sendTelegram(chatId, help);
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: '/start', detected_route: '/start', status: 'routed' });
        return true;
    }

    // ---- /status ----
    if (cmd === '/status') {
        const state    = readJSON(STATE_FILE, {});
        const report   = readJSON(DLF_REPORT, {});
        const s        = report.summary || {};
        const stopStatus = report.emergency_stop ? '🔴 АКТИВЕН' : '🟢 выключен';
        const rState   = getState();
        const paths    = getPaths();
        const uptime   = uptimeSeconds();

        // Lock PID
        let lockPid = '—';
        try {
            if (fs.existsSync(LOCK_FILE)) {
                const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
                lockPid = raw.startsWith('{') ? JSON.parse(raw).pid : raw;
            }
        } catch (_) {}

        const lines = [
            '📊 *Статус системы*',
            '',
            `Бот: \`${state.status || 'running'}\`  PID: \`${rState.pid}\``,
            `Версия: \`v0.7\``,
            `Запущен: ${rState.started_at}`,
            `Uptime: ${uptime}s`,
            `Lock PID: \`${lockPid}\``,
            '',
            '*Reliability:*',
            `last_heartbeat_at: ${rState.last_heartbeat_at || '—'}`,
            `last_update_at: ${rState.last_update_at || '—'}`,
            `last_command: ${rState.last_command ? '`' + String(rState.last_command).substring(0,80) + '`' : '—'}`,
            `last_route: ${rState.last_route || '—'}`,
            `last_error_at: ${rState.last_error_at || '—'}`,
            `polling: ${rState.polling_ok ? '🟢 ok' : '🔴 error'}`,
            `updates: ${rState.updates_count} | errors: ${rState.errors_count}`,
            '',
            '*Daily Lead Factory:*',
            `loaded: ${fs.existsSync(DLF_REPORT) ? '🟢 yes' : '🔴 no'}`,
            `Дата отчёта: ${report.report_date || '—'}`,
            `Emergency Stop: ${stopStatus}`,
            `Лидов всего: ${s.total_leads ?? '—'}`,
            `Ожидают approval: ${s.waiting_approval ?? '—'}`,
            `Одобрено: ${s.approved_to_contact ?? '—'}`,
            '',
            '*Safety:*',
            `auto_send_to_clients: 🔴 BLOCKED`,
        ];
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- /intake_status ----
    if (cmd === '/intake_status') {
        const intakeDir       = path.join(DLF_BASE, 'data', 'intake');
        const intakeQueueFile = path.join(intakeDir, 'intake_queue.json');
        const failedFile      = path.join(intakeDir, 'failed_intake.json');
        const intakeEventsFile= path.join(intakeDir, 'intake_events.json');

        // queue count (supports [], {items}, {queue}, {leads})
        let queueCount = 0;
        try {
            if (fs.existsSync(intakeQueueFile)) {
                const raw = fs.readFileSync(intakeQueueFile, 'utf-8').trim();
                if (raw) {
                    const data = JSON.parse(raw);
                    if (Array.isArray(data)) queueCount = data.length;
                    else if (Array.isArray(data?.items)) queueCount = data.items.length;
                    else if (Array.isArray(data?.queue)) queueCount = data.queue.length;
                    else if (Array.isArray(data?.leads)) queueCount = data.leads.length;
                }
            }
        } catch (_) {}

        // failed payloads count
        let failedCount = 0;
        try {
            if (fs.existsSync(failedFile)) {
                const raw = fs.readFileSync(failedFile, 'utf-8').trim();
                if (raw) {
                    const data = JSON.parse(raw);
                    if (Array.isArray(data)) failedCount = data.length;
                    else if (Array.isArray(data?.items)) failedCount = data.items.length;
                }
            }
        } catch (_) {}

        // last intake event + last processing
        let lastEvent = '—';
        let lastProcessing = '—';
        try {
            if (fs.existsSync(intakeEventsFile)) {
                const raw = fs.readFileSync(intakeEventsFile, 'utf-8').trim();
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr) && arr.length) {
                        const last = arr[arr.length - 1];
                        lastEvent = `${last.type || last.event || '?'} @ ${last.ts || last.timestamp || '?'}`;
                        for (let i = arr.length - 1; i >= 0; i--) {
                            const t = arr[i]?.type || arr[i]?.event || '';
                            if (t === 'intake_processing_completed' || t === 'intake_processing_skipped') {
                                lastProcessing = `${t} @ ${arr[i].ts || arr[i].timestamp || '?'}`;
                                break;
                            }
                        }
                    }
                }
            }
        } catch (_) {}

        const webhookPort = process.env.DLF_WEBHOOK_PORT || '8787';
        const webhookMode = 'manual (not auto-started by bot)';

        const lines = [
            '📥 *Intake status*',
            '',
            `Очередь intake: \`${queueCount}\``,
            `Ошибочные payload: \`${failedCount}\``,
            `Последнее событие: ${lastEvent}`,
            `Последняя обработка: ${lastProcessing}`,
            `Webhook mode: ${webhookMode}`,
            `Expected port: \`${webhookPort}\``,
            `Auto-send: 🔴 BLOCKED`,
        ];
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- /health ----
    if (cmd === '/health') {
        const paths = getPaths();
        const checks = [];
        const add = (label, ok, detail) => checks.push({ label, ok, detail });

        // 1. lock exists & PID matches
        let lockOk = false, lockPidVal = null;
        try {
            if (fs.existsSync(LOCK_FILE)) {
                const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
                lockPidVal = raw.startsWith('{') ? JSON.parse(raw).pid : parseInt(raw, 10);
                lockOk = lockPidVal === process.pid;
            }
        } catch (_) {}
        add('lock exists', fs.existsSync(LOCK_FILE), LOCK_FILE);
        add('lock PID matches process', lockOk, `lock=${lockPidVal} self=${process.pid}`);

        // 2. .env present, token hidden
        const gatewayEnv = path.join(__dirname, '.env');
        add('.env exists', fs.existsSync(gatewayEnv) || fs.existsSync(path.join(WORKSPACE, '.env')), '');
        add('token loaded (hidden)', !!BOT_TOKEN, BOT_TOKEN ? '••••' : 'missing');

        // 3. DLF files
        add('daily_report.json exists', fs.existsSync(DLF_REPORT), '');
        add('telegram_queue.json exists', fs.existsSync(DLF_QUEUE), '');
        add('events_log.json exists', fs.existsSync(DLF_EVENTS) || fs.existsSync(EVENTS_LOG), '');

        // 4. logs writable
        let logsWritable = false;
        try {
            fs.mkdirSync(paths.LOGS_DIR, { recursive: true });
            const probe = path.join(paths.LOGS_DIR, '.write_probe');
            fs.writeFileSync(probe, '1', 'utf-8');
            fs.unlinkSync(probe);
            logsWritable = true;
        } catch (_) {}
        add('logs writable', logsWritable, paths.LOGS_DIR);

        // 5. heartbeat fresh (<90s)
        let hbFresh = false, hbAge = '—';
        try {
            if (fs.existsSync(paths.HEARTBEAT_FILE)) {
                const hb = JSON.parse(fs.readFileSync(paths.HEARTBEAT_FILE, 'utf-8'));
                const age = (Date.now() - new Date(hb.last_heartbeat_at).getTime()) / 1000;
                hbAge = `${Math.round(age)}s`;
                hbFresh = age < 90;
            }
        } catch (_) {}
        add('heartbeat fresh (<90s)', hbFresh, hbAge);

        // 6. one polling process (best-effort: just confirm our lock is the only one)
        add('one polling process', lockOk, 'single instance enforced by lock');

        const allOk  = checks.every(c => c.ok);
        const anyRed = checks.filter(c => !c.ok && ['lock PID matches process','token loaded (hidden)','heartbeat fresh (<90s)'].includes(c.label)).length;
        const header = allOk ? '✅ OK — все проверки прошли' :
                       anyRed > 0 ? '🔴 RED — есть критические проблемы' :
                       '⚠️ WARNING — есть предупреждения';

        const lines = ['🩺 *Health check*', '', header, ''];
        for (const c of checks) {
            const icon = c.ok ? '✅' : '⚠️';
            lines.push(`${icon} ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
        }
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ── APPROVAL QUEUE B3 — status-only commands (Phase B, NO email send) ──
    // Order: AFTER critical /ping /health; BEFORE Phase 2 sales ops, Phase 1,
    // Russian router and NL fallback. handleApprovalCommand returns false fast
    // for non-approval text (safe to call early). Recognized: /prepare_send,
    // /pending_approvals, /approval_status, /approve, /reject.
    // SAFETY: status-only (approved_ready_to_send / rejected). NO email send.
    try {
        const approvalHandled = await handleApprovalCommand(text, {
            workspace: WORKSPACE,
            chatId,
            sendTelegram,
            botLog,
        });
        if (approvalHandled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'approval_queue_b3', status: 'routed' });
            return true; // handled — stop routing to avoid double reply
        }
    } catch (approvalErr) {
        logError({ route: 'approval_queue_b3', text, chat_id: chatId, error: approvalErr, scope: 'approval_queue_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка approval команды: ${(approvalErr.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ── APPROVED EMAIL SEND DRY-RUN (C2.3a) — /send_approved_dry_run /send_job_status /send_jobs ──
    // Order: AFTER approval commands; BEFORE Sales Phase 2, Phase 1, Russian router, NL fallback.
    // handleApprovedEmailSendCommand returns false fast for non-matching text (safe to call early).
    // SAFETY: DRY-RUN ONLY. NO email, NO SMTP, NO auto-send. Owner-facing reply only.
    // RU canonical commands (/send_approved_dry_run ...) reach this guard via the RU router
    // re-dispatch through handleDLFCommand below — no extra handling needed (PHASE 5).
    try {
        const sendDryRunHandled = await handleApprovedEmailSendCommand(text, {
            workspace: WORKSPACE,
            chatId,
            sendTelegram,
            botLog: (msg) => botLog('INFO', `approved_email_send_dry_run: ${msg}`),
        });
        if (sendDryRunHandled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'approved_email_send_dry_run', status: 'routed' });
            return true; // handled — stop routing to avoid double reply
        }
    } catch (sendErr) {
        logError({ route: 'approved_email_send_dry_run', text, chat_id: chatId, error: sendErr, scope: 'approved_email_send_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка dry-run отправки: ${(sendErr.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ── LEAD CONTACT COMMANDS (C2.6c) — /contact_show /contact_add_email /contact_verify_email
    //    /contact_add_phone /contact_hold_whatsapp /contact_registry ──
    // Order: AFTER approved email dry-run; BEFORE Sales Phase 2, Phase 1, Russian router, NL fallback.
    // handleLeadContactCommand returns false fast for non-matching text (safe to call early).
    // SAFETY: write-to-LOCAL-data-file only (13_sales/lead_contacts.json). NO email, NO SMTP,
    // NO auto-send, NO client messaging. Owner-facing Telegram reply only.
    // RU canonical commands (/contact_show ZB23 ...) reach this guard via the RU router
    // re-dispatch through handleDLFCommand below — no extra handling needed (PHASE 5).
    try {
        const contactHandled = await handleLeadContactCommand(text, {
            workspace: WORKSPACE,
            chatId,
            sendTelegram,
            botLog: (msg) => botLog('INFO', `lead_contact: ${msg}`),
        });
        if (contactHandled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_contact_c26c', status: 'routed' });
            return true; // handled — stop routing to avoid double reply
        }
    } catch (contactErr) {
        logError({ route: 'lead_contact_c26c', text, chat_id: chatId, error: contactErr, scope: 'lead_contact_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка contact команды: ${(contactErr.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ── LEAD CONTACT ENRICHMENT COMMANDS (C2.7e) — /contact_enrich_text /contact_channels
    //    /contact_best_channel /contact_enrichment_status ──
    // Order: AFTER lead contact commands; BEFORE Sales Phase 2, Phase 1, Russian router, NL fallback.
    // handleLeadContactEnrichmentCommand returns false fast for non-matching text (safe to call early).
    // SAFETY: OFFLINE only — write-to-LOCAL-data-file (13_sales/lead_contacts.json) via the pipeline.
    // NO network, NO site scanning, NO email, NO SMTP, NO auto-send, NO client messaging.
    // Owner-facing Telegram reply only.
    // RU canonical commands (/contact_enrich_text ZB23 ..., /contact_channels ZB23,
    // /contact_best_channel ZB23, /contact_enrichment_status ZB23) reach this guard via the RU
    // router re-dispatch through handleDLFCommand below — no extra handling needed (PHASE 5).
    try {
        const enrichmentHandled = await handleLeadContactEnrichmentCommand(text, {
            workspace: WORKSPACE,
            chatId,
            sendTelegram,
            botLog: (msg) => botLog('INFO', `lead_contact_enrichment: ${msg}`),
        });
        if (enrichmentHandled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_contact_enrichment_c27e', status: 'routed' });
            return true; // handled — stop routing to avoid double reply
        }
    } catch (enrichmentErr) {
        logError({ route: 'lead_contact_enrichment_c27e', text, chat_id: chatId, error: enrichmentErr, scope: 'lead_contact_enrichment_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка enrichment команды: ${(enrichmentErr.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ── D1 LEAD INTAKE ADAPTER (D1d bot wiring) — controlled, offline, owner-facing ──
    // Order: AFTER /ping & health, AFTER approval commands, AFTER approved-email dry-run,
    //        AFTER lead contact commands, AFTER contact enrichment commands;
    //        BEFORE Sales Phase 2, Phase 1, Russian router, NL fallback.
    // SAFETY (HARD GATES): D1_SAFE_LIVE mode. enableRussianAliases=false. allowRealWrite=false.
    //   confirmRealWrite=false. NO real write into 13_sales. commit_approved stays BLOCKED via
    //   the adapter. NO client messaging — should_send_to_client is NOT used to send anything.
    //   NO direct Telegram API, NO email/SMTP, NO contact enrichment. Owner reply only via the
    //   existing sendTelegram. The adapter returns { handled:false } for non-matching text, so
    //   routing continues normally for everything it does not own.
    try {
        // Owner check: owner is identified by EITHER message.from.id (userId) in
        // ALLOWED_TELEGRAM_USER_IDS OR chat.id equal to the admin CHAT_ID. This
        // fixes the bug where lead-import commands replied "Команда доступна
        // только владельцу" when only ALLOWED_TELEGRAM_USER_IDS (and not
        // TELEGRAM_CHAT_ID) was configured. Fail-closed: no allowlist → not owner.
        const _d1IsFromOwner = isOwnerSender(userId, chatId);

        // D1e API reconciliation (D1e2 minimal patch): the D1e0 adapter signature
        // is handleLeadIntakeBotMessage(text, options) → { handled, text, ... }
        // (string first arg, NOT a payload object; the reply field is `text`, not
        // `response_text`). The earlier D1d block passed a single payload object and
        // read `response_text`, so the adapter never routed. This block only aligns
        // the call shape and the return field. No new import; same routing position;
        // same hard gates (offline, no real write, no client contact, no auto-send).
        const d1Result = await leadIntakeBotAdapter.handleLeadIntakeBotMessage(text, {
            source: 'telegram_master_bot',
            mode: 'D1_SAFE_LIVE',
            enableRussianAliases: false,
            allowRealWrite: false,
            confirmRealWrite: false,
            from_user_id: userId,
            chat_id: chatId,
            is_from_owner: _d1IsFromOwner,
        });

        if (d1Result && d1Result.handled === true) {
            // Owner-facing reply ONLY — via the existing sendTelegram. No client send.
            // should_send_to_client is intentionally ignored here.
            await sendTelegram(chatId, d1Result.text || '');
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_intake_d1e', status: 'routed' });
            return true; // handled — stop routing to avoid double reply
        }
        // d1Result.handled === false → fall through to existing routing below.
    } catch (d1Err) {
        logError({ route: 'lead_intake_d1e', text, chat_id: chatId, error: d1Err, scope: 'lead_intake_d1e_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка D1 lead intake: ${(d1Err.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ---- D3C: PREPARE one PENDING approval card (write-gated, owner-only) ----
    // Dmitry approved D3C only (2026-06-06). Command:
    //   /lead_import_prepare <lead text>
    // ROUTE ORDER: BEFORE the D3B approve/reject guard and BEFORE D2E1 (so the
    // D2E1 mutation_blocked path never swallows /lead_import_prepare). It does
    // NOT match approve/reject/review (distinct command token).
    // SAFETY: writes ONLY the approval queue (backup → tmp → rename → verify) and
    // ONLY when text is present AND sender is owner. Bare command → usage, no
    // mutation. Parses via the OFFLINE dry-run pipeline (never writes leads_master
    // / lead_contacts / events). NO real import, NO client contact, NO auto-send.
    // Duplicate identical PENDING text is refused (no overwrite). D4 commit = HOLD.
    try {
        if (leadImportPrepareAdapter.shouldRouteToPrepare(text)) {
            // ==== D3C SAFETY FREEZE (temporary, 2026-06-06) ====================
            // Dmitry approval REVOKED until further notice. ALL prepare-import
            // commands (/lead_import_prepare, /leadimportprepare, and any Russian
            // prepare aliases recognized by shouldRouteToPrepare) are intercepted
            // HERE — BEFORE the owner gate and BEFORE the queue write-branch
            // (prepareLeadImportPendingCard). No queue write, no real import, no
            // client contact, no auto-send can occur while this block is active.
            // D3C code below is preserved intact; remove ONLY this block (down to
            // the matching marker) to re-enable after a separate written approval.
            await sendTelegram(chatId, '⛔ lead_import_prepare временно заблокирован: D3C safety freeze. Queue write запрещён до отдельного approval.');
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_prepare_d3c', status: 'd3c_safety_freeze_blocked' });
            return true; // handled — D3C frozen, do NOT fall through to write-branch
            // ==== END D3C SAFETY FREEZE ========================================

            const _d3cIsFromOwner = isOwnerSender(userId, chatId);

            if (!_d3cIsFromOwner) {
                await sendTelegram(chatId, '⛔ Команда доступна только владельцу.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_prepare_d3c', status: 'owner_gate_blocked' });
                return true;
            }

            const D3C_QUEUE_PATH = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');
            const d3cResult = await leadImportPrepareAdapter.prepareLeadImportPendingCard(text, {
                queuePath: D3C_QUEUE_PATH,
                isOwner: _d3cIsFromOwner === true,
            });

            await sendTelegram(chatId, leadImportPrepareAdapter.formatPrepareReply(d3cResult));
            const _d3cRoute = d3cResult && d3cResult.usage
                ? 'lead_import_prepare_d3c_usage'
                : (d3cResult && d3cResult.wrote ? 'lead_import_prepare_d3c_pending_created' : 'lead_import_prepare_d3c_refused');
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: _d3cRoute, status: (d3cResult && d3cResult.wrote) ? 'mutated' : 'routed' });
            return true; // handled — stop routing (do NOT fall into D3B/D2E1)
        }
    } catch (d3cErr) {
        logError({ route: 'lead_import_prepare_d3c', text, chat_id: chatId, error: d3cErr, scope: 'lead_import_prepare_d3c_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка D3C prepare: ${(d3cErr.message || '').substring(0, 120)}`);
        return true;
    }

    // ---- D3B: APPROVE/REJECT phased decision live-control guard (write-gated) ----
    // Dmitry approved D3B only (2026-06-06). Owner-gated. Commands:

    //   /lead_import_approve <IMPORT_ID> check|confirm
    //   /lead_import_reject  <IMPORT_ID> check|confirm
    // ROUTE ORDER: this guard MUST run BEFORE the D2E1 mutation_blocked guard
    // below (which would otherwise block approve/reject). It also runs AFTER the
    // read-only /ping /health /today and the D3-2 read-only guard, and it does
    // NOT touch /lead_import_review (that stays read-only via D2E1 below).
    // SAFETY: check NEVER mutates. confirm performs a gated atomic write
    // (backup → tmp → rename → verify) ONLY when phase === 'confirm' AND owner.
    // Bare command (no phase) → usage text, no mutation. NO real import, NO
    // client contact, NO auto-send. Short aliases /lead_approve & /lead_reject
    // are NOT routed here (stay inactive). /lead_import_commit (D4) stays HOLD.
    try {
        if (leadImportDecisionGlue.shouldRouteToDecisionLiveControl(text)) {
            const _d3bIsFromOwner = isOwnerSender(userId, chatId);
            if (!_d3bIsFromOwner) {
                await sendTelegram(chatId, '⛔ Команда доступна только владельцу.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_decision_d3b', status: 'owner_gate_blocked' });
                return true;
            }

            const D3B_QUEUE_PATH = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');
            const d3bResult = leadImportDecisionGlue.handleDecisionLiveControlBotMessage(text, {
                queuePath: D3B_QUEUE_PATH,
                isOwner: _d3bIsFromOwner === true,
            });

            if (d3bResult && d3bResult.handled === true) {
                await sendTelegram(chatId, d3bResult.text || '');
                const _d3bRoute = d3bResult.usage
                    ? 'lead_import_decision_d3b_usage'
                    : (d3bResult.phase === 'confirm' ? 'lead_import_decision_d3b_confirm' : 'lead_import_decision_d3b_check');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: _d3bRoute, status: d3bResult.wrote ? 'mutated' : 'routed' });
                return true; // handled — stop routing (do NOT fall into D2E1 block)
            }
        }
    } catch (d3bErr) {
        logError({ route: 'lead_import_decision_d3b', text, chat_id: chatId, error: d3bErr, scope: 'lead_import_decision_d3b_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка D3B approve/reject: ${(d3bErr.message || '').substring(0, 120)}`);
        return true;
    }

    // ---- D2E1: lead-import approval REVIEW guard (minimal live bot patch) ----
    // Mirrors the D1 lead-intake guard pattern. Scope is intentionally narrow:
    //   - import is already present at the top of file (leadImportApprovalGlue);
    //   - OWNER-GATED: only the owner may reach the approval-review module;
    //   - READ-ONLY at this D2E1 stage: a canonical queuePath is passed for
    //     review/list only, and mutating actions (approve/reject) are explicitly
    //     blocked here. Therefore: NO queue write, NO real import, NO client
    //     contact, NO auto-send. Owner-facing reply only via sendTelegram.
    try {
        if (leadImportApprovalGlue.shouldRouteToImportApprovalReview(text)) {
            const _d2IsFromOwner = isOwnerSender(userId, chatId);
            if (!_d2IsFromOwner) {
                await sendTelegram(chatId, '⛔ Команда доступна только владельцу.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_approval_d2e1', status: 'owner_gate_blocked' });
                return true;
            }

            // D2E1 minimal: block mutating actions — no queue write at this stage.
            const _d2Parsed = leadImportApprovalGlue.parseImportApprovalCommand(text);
            if (_d2Parsed && (_d2Parsed.action === 'approve' || _d2Parsed.action === 'reject')) {
                await sendTelegram(chatId, 'ℹ️ D2E1 (read-only этап): подтверждение/отклонение импорта пока отключено. Доступен только просмотр очереди.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_approval_d2e1', status: 'mutation_blocked_d2e1' });
                return true;
            }

            // Canonical read-only queue path (see lead_intake_approval_queue.mjs).
            const D2_APPROVAL_QUEUE_PATH = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');
            const d2Result = await leadImportApprovalGlue.handleImportApprovalReviewBotMessage(text, {
                queuePath: D2_APPROVAL_QUEUE_PATH,
            });

            if (d2Result && d2Result.handled === true) {
                // Owner-facing reply ONLY — via the existing sendTelegram. No client send.
                await sendTelegram(chatId, d2Result.text || '');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_approval_d2e1', status: 'routed' });
                return true; // handled — stop routing to avoid double reply
            }
            // d2Result.handled === false → fall through to existing routing below.
        }
    } catch (d2Err) {
        logError({ route: 'lead_import_approval_d2e1', text, chat_id: chatId, error: d2Err, scope: 'lead_import_approval_d2e1_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка D2 approval review: ${(d2Err.message || '').substring(0, 120)}`);
        return true;
    }

    // ---- D3-2: READ-ONLY lead-import live-control guard (minimal live bot patch) ----
    // Owner-gated, strictly READ-ONLY commands: /lead_queue /lead_status
    //   /lead_review /lead_health. The backing module performs NO mutation:
    //   no queue write, no real import, no commit, no client contact, no
    //   auto-send. Raw PII is never exposed (masked/omitted). Mutating verbs
    //   (approve/reject/commit) are NOT routed here. Owner-facing reply only.
    try {
        if (leadImportReadonlyGlue.shouldRouteToReadonlyLiveControl(text)) {
            const _d3IsFromOwner = isOwnerSender(userId, chatId);
            if (!_d3IsFromOwner) {
                await sendTelegram(chatId, '⛔ Команда доступна только владельцу.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_readonly_d3_2', status: 'owner_gate_blocked' });
                return true;
            }

            const D3_QUEUE_PATH = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');
            const D3_CONTACTS_PATH = path.join(WORKSPACE, '13_sales', 'lead_contacts.json');
            const d3Result = leadImportReadonlyGlue.handleReadonlyLiveControlBotMessage(text, {
                queuePath: D3_QUEUE_PATH,
                contactsPath: D3_CONTACTS_PATH,
            });

            if (d3Result && d3Result.handled === true) {
                await sendTelegram(chatId, d3Result.text || '');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_import_readonly_d3_2', status: 'routed' });
                return true; // handled — stop routing to avoid double reply
            }
            // d3Result.handled === false → fall through to existing routing below.
        }
    } catch (d3Err) {
        logError({ route: 'lead_import_readonly_d3_2', text, chat_id: chatId, error: d3Err, scope: 'lead_import_readonly_d3_2_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка D3-2 read-only live-control: ${(d3Err.message || '').substring(0, 120)}`);
        return true;
    }

    // ---- D3-3 / D4: APPROVE/REJECT/COMMIT lead-import live-control guard ----
    // D3/D4 live-control disabled by safety gate after cancelled Cline run.
    // Reason: write-capable queue mutation requires separate approval and audit.
    //
    // The previously-active D3-3 guard (commands /lead_approve and /lead_reject,
    // plus any decision live-control / commit live-control calls) is intentionally
    // removed from the live routing path. The backing modules
    // (lead_import_approval_decision_live_bot_glue.mjs and
    // lead_import_commit_live_bot_glue.mjs) are no longer imported above, so this
    // bot CANNOT mutate the approval queue, CANNOT commit an import, and CANNOT
    // contact a client. Re-enabling requires a separate, audited approval.
    //
    // NOTE: The D2E1 read-only approval REVIEW guard (/lead_import_review,
    // /lead_import_approve, /lead_import_reject → mutation_blocked_d2e1) and the
    // D3-2 read-only live-control guard above remain unchanged and stay read-only.

    // ---- /debug_last ----



    if (cmd === '/debug_last') {
        const last = getLastN(5);
        if (last.length === 0) {
            await sendTelegram(chatId, '🧾 Нет записанных команд в кольцевом буфере.');
            return true;
        }
        const lines = ['🧾 *Последние 5 обработанных команд:*', ''];
        last.slice().reverse().forEach((e, i) => {
            const safe = String(e.text || '').substring(0, 80).replace(/`/g, "'");
            lines.push(`*${i + 1}.* ${e.timestamp}`);
            lines.push(`   route: \`${e.detected_route}\` | status: \`${e.status}\``);
            lines.push(`   text: \`${safe}\``);
            if (e.error_message) lines.push(`   err: ${String(e.error_message).substring(0,120)}`);
            lines.push('');
        });
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- /keepalive ----
    if (cmd === '/keepalive') {
        writeHeartbeat({ status: 'running', keepalive_pinged: true });
        const rState = getState();
        await sendTelegram(chatId, `✅ Keepalive OK. Heartbeat обновляется. PID: \`${rState.pid}\``);
        return true;
    }


    // ---- /today (и русские алиасы) ----
    if (cmd === '/today') {
        let report;
        try {
            report = readJSON(DLF_REPORT, null);
            if (!report) throw new Error('файл не найден');
        } catch (e) {
            await sendTelegram(chatId, `❌ Ошибка чтения daily_report.json: ${e.message}`);
            return true;
        }
        const s          = report.summary || {};
        const stopStatus = report.emergency_stop ? '🔴 АКТИВЕН' : '🟢 выключен';
        // Считаем PDF-запросы из лога событий
        const dlfEventsData = readJSON(DLF_EVENTS, []);
        const pdfCount = dlfEventsData.filter(e => e.event_type === 'audit_requested').length;
        const lines = [
            '📊 *Сводка за сегодня*',
            '',
            `Лидов всего: *${s.total_leads ?? 0}*`,
            `Ожидают approval: *${s.waiting_approval ?? s.pending_approval ?? 0}*`,
            `Одобрено: *${s.approved_to_contact ?? 0}*`,
            `В архиве: *${s.archived ?? 0}*`,
            `PDF-аудитов запрошено: *${pdfCount}*`,
            `Emergency stop: ${stopStatus}`,
            '',
            `Следующее действие: нажми /newleads или напиши «Покажи новые лиды».`,
        ];
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- /newleads (и русские алиасы) ----
    if (cmd === '/newleads') {
        let leads = [];
        let source = 'queue';
        let queueBroken = false;

        // Sprint 2: try telegram_queue.json first — with hardened JSON + shape handling
        if (fs.existsSync(DLF_QUEUE)) {
            try {
                const raw = fs.readFileSync(DLF_QUEUE, 'utf-8').trim();
                if (raw) {
                    let parsed;
                    try {
                        parsed = JSON.parse(raw);
                    } catch (parseErr) {
                        queueBroken = true;
                        appendTelegramError('/newleads', parseErr);
                        await sendTelegram(chatId, '⚠️ Очередь лидов повреждена. Проверь telegram_queue.json или запусти импорт заново.');
                        return true;
                    }
                    leads = normalizeLeadQueue(parsed);
                    source = 'queue';
                }
            } catch (e) {
                appendTelegramError('/newleads', e);
                await sendTelegram(chatId, '⚠️ Очередь лидов повреждена. Проверь telegram_queue.json или запусти импорт заново.');
                return true;
            }
        }

        // Fallback: old leads_test.csv
        if (leads.length === 0 && !queueBroken) {
            if (!fs.existsSync(DLF_QUEUE) && !fs.existsSync(DLF_LEADS_CSV)) {
                await sendTelegram(chatId, '📭 Очередь лидов не найдена. Сначала выполни импорт лидов.');
                return true;
            }
            if (fs.existsSync(DLF_LEADS_CSV)) {
                source = 'csv_fallback';
                try {
                    const content = fs.readFileSync(DLF_LEADS_CSV, 'utf-8');
                    leads = parseCSV(content);
                } catch (e) {
                    appendTelegramError('/newleads', e);
                    await sendTelegram(chatId, `❌ Ошибка чтения лидов: ${e.message}`);
                    return true;
                }
            }
        }

        // Guarantee array
        if (!Array.isArray(leads)) leads = [];

        if (leads.length === 0) {
            await sendTelegram(chatId, '📭 Новых лидов в очереди нет. Запусти импорт или проверь /import_status.');
            return true;
        }

        const show = leads.slice(0, 10);
        const sourceLabel = source === 'queue' ? '📦 Sprint 2 Queue' : '📄 CSV (fallback)';
        await sendTelegram(chatId, `📋 *Лиды (${show.length} из ${leads.length}) — ${sourceLabel}:*`);
        for (const lead of show) {
            const cardText = buildLeadCardHTML(lead);
            const keyboard = buildLeadKeyboard(lead.lead_id);
            const result = await tgRequest('sendMessage', {
                chat_id: chatId,
                text: cardText,
                parse_mode: 'HTML',
                reply_markup: keyboard,
            });
            if (!result.ok) {
                // Fallback: plain text without HTML
                const plain = `${lead.company_name} (${lead.lead_id}) | Score: ${lead.score} | Risk: ${lead.risk_level}`;
                await tgRequest('sendMessage', { chat_id: chatId, text: plain, reply_markup: keyboard });
            }
            appendReplyLog(`TO: ${chatId} [lead card ${lead.lead_id}]`);
        }
        return true;
    }

    // ---- /import_status (и русские алиасы) ----
    if (cmd === '/import_status') {
        let rpt = null;
        if (fs.existsSync(DLF_IMPORT_RPT)) {
            try { rpt = readJSON(DLF_IMPORT_RPT, null); } catch (_) {}
        }
        if (!rpt) {
            await sendTelegram(chatId, '❌ import_report.json не найден.\n\nЗапустите импорт:\n`node scripts/import_leads_csv.mjs data/imports/incoming_leads_sample.csv`');
            return true;
        }
        const lines = [
            '📊 *Статус последнего импорта*',
            '',
            `Файл: \`${rpt.source_file || '—'}\``,
            `Дата: ${rpt.imported_at || rpt.created_at || '—'}`,
            '',
            `Всего в CSV: *${rpt.imported_total ?? '—'}*`,
            `Нормализовано: *${rpt.normalized ?? '—'}*`,
            `Добавлено: *${rpt.added ?? '—'}*`,
            `Дублей: *${rpt.duplicates ?? '—'}*`,
            `Отклонено: *${rpt.rejected ?? '—'}*`,
            '',
            `Tier A 🔥: *${rpt.scored_A ?? '—'}*`,
            `Tier B ⭐: *${rpt.scored_B ?? '—'}*`,
            `Tier C 📋: *${rpt.scored_C ?? '—'}*`,
            `Tier D ⬇️: *${rpt.scored_D ?? '—'}*`,
            '',
            `Ждут одобрения: *${rpt.waiting_approval ?? '—'}*`,
            `auto_send_to_clients: 🔴 BLOCKED`,
            '',
            `Очередь Telegram: \`data/processed/telegram_queue.json\``,
            `Отчёт импорта: \`data/processed/import_report.json\``,
        ];
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- /emergency_stop ----
    if (cmd === '/emergency_stop') {
        let report;
        try {
            report = readJSON(DLF_REPORT, {});
        } catch (_) {
            report = {};
        }
        const wasActive      = !!report.emergency_stop;
        report.emergency_stop = !wasActive;
        writeJSON(DLF_REPORT, report);
        appendDLFEvent({
            event_type:     wasActive ? 'emergency_stop_lifted' : 'emergency_stop_activated',
            activated_by:   userId || chatId,
            previous_state: wasActive,
        });
        const msg = report.emergency_stop
            ? '🔴 *Emergency Stop АКТИВЕН*\nВсе операции заморожены. Отправка лидам заблокирована.'
            : '🟢 *Emergency Stop снят*\nСистема возобновила штатную работу.';
        await sendTelegram(chatId, msg);
        return true;
    }

    // ---- Покажи входящие ----
    if (tl === 'покажи входящие') {
        const inbox = readJSON(INBOX_MESSAGES, []);
        if (inbox.length === 0) {
            await sendTelegram(chatId, '📭 Входящих нет.');
            last_context[chatId] = [];
            return true;
        }
        last_context[chatId] = inbox;           // save for follow-up commands
        const recent = inbox.slice(-10);
        const lines = [`📬 *Входящие (последние ${recent.length} из ${inbox.length}):*`, ''];
        recent.forEach((m, i) => {
            const from    = m.from || m.sender || m.source || '?';
            const preview = (m.text || m.body || m.message || '').substring(0, 60);
            lines.push(`${i + 1}. *${from}* — ${preview || '(пусто)'}`);
        });
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- Покажи их текст ----
    if (tl === 'покажи их текст') {
        const ctx = last_context[chatId];
        if (!ctx || ctx.length === 0) {
            await sendTelegram(chatId, 'Нет последнего списка входящих. Сначала напиши: Покажи входящие');
            return true;
        }
        const recent = ctx.slice(-10);
        const lines = ['📝 *Текст входящих:*', ''];
        recent.forEach((m, i) => {
            const msgText = m.text || m.body || m.message || '(пусто)';
            lines.push(`*${i + 1}.* ${msgText.substring(0, 200)}`);
        });
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ---- Кто написал / Кто написал и от кого ----
    if (tl === 'кто написал' || tl === 'кто написал и от кого') {
        const ctx = last_context[chatId];
        if (!ctx || ctx.length === 0) {
            await sendTelegram(chatId, 'Нет последнего списка входящих. Сначала напиши: Покажи входящие');
            return true;
        }
        const recent = ctx.slice(-10);
        const lines = ['👤 *Отправители:*', ''];
        recent.forEach((m, i) => {
            const from   = m.from || m.sender || '?';
            const source = m.source || m.channel || '—';
            const time   = m.received_at || m.timestamp || m.date || '—';
            lines.push(`*${i + 1}.* ${from} | канал: ${source} | ${time}`);
        });
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ── LEAD INTAKE COMMANDS (Direct routes — BEFORE fallback) ──

    // /lead_template
    if (_cmd === 'lead_template') {
        try {
            const tmpl = getLeadTemplate();
            await sendTelegram(chatId, tmpl);
        } catch (e) {
            await sendTelegram(chatId, `⚠️ Ошибка lead_template: ${e.message}`);
        }
        return true;
    }

    // /lead_add <text>
    if (_cmd === 'lead_add') {
        const leadText = text.replace(/^\/lead_add\s*/i, '').trim();
        if (!leadText) {
            await sendTelegram(chatId, '❌ Укажите данные лида. Отправьте /lead_template для получения шаблона.');
            return true;
        }
        try {
            const parsed = parseLeadText(leadText);
            const validation = validateLead(parsed);
            if (!validation.valid) {
                const report = createLeadIntakeResultReport({
                    added: false, reason: 'validation_failed', validation,
                });
                await sendTelegram(chatId, report);
                return true;
            }
            const result = appendLeadToRealCsv(parsed);
            const report = createLeadIntakeResultReport({ ...result, validation });
            await sendTelegram(chatId, report);
            appendEvent({ type: 'lead_intake_added', company: parsed.company_name, website: parsed.website_url, chat_id: chatId });
        } catch (e) {
            await sendTelegram(chatId, `⚠️ Ошибка /lead_add: ${e.message}`);
            logError({ route: 'lead_add', text, chat_id: chatId, error: e, scope: 'lead_intake' });
        }
        return true;
    }

    // /lead_status
    if (_cmd === 'lead_status') {
        try {
            const stats = getRealLeadStats();
            const lines = [
                '📊 *REAL Leads Status — Mini Audit 10K*',
                '',
                `REAL CSV: ${stats.csv_exists ? '✅ существует' : '❌ не создан'}`,
                `Всего лидов: *${stats.total}*`,
                `Валидных: *${stats.valid}*`,
                `Подозрительных дублей: *${stats.duplicates_suspected}*`,
                `Минимум для pipeline: *${stats.minimum_required}*`,
                `Готово к pipeline: ${stats.ready_for_pipeline ? '✅ ДА' : '❌ НЕТ'}`,
                '',
                stats.ready_for_pipeline
                    ? '🚀 Можно запрашивать: /lead_run_pipeline'
                    : `⏳ Добавьте ещё ${Math.max(0, stats.minimum_required - stats.valid)} лидов через /lead_add или /leadadd`,
                '',
                `Файл: 13_sales/daily_lead_factory/input/mini_audit_10k_leads_REAL.csv`,
            ];
            await sendTelegram(chatId, lines.join('\n'));
        } catch (e) {
            await sendTelegram(chatId, `⚠️ Ошибка /lead_status: ${e.message}`);
        }
        return true;
    }

    // /lead_list
    if (_cmd === 'lead_list') {
        try {
            const leads = listRealLeads(10);
            if (leads.length === 0) {
                await sendTelegram(chatId, '📭 Лиды не найдены. Добавьте первый через /lead_add или получите шаблон: /lead_template');
                return true;
            }
            const lines = [`📋 *Последние ${leads.length} лидов (REAL CSV):*`, ''];
            leads.forEach((l, i) => {
                lines.push(`*${i + 1}.* ${l.company_name}`);
                lines.push(`    🏙 ${l.city || '—'} | 🔧 ${l.niche || '—'}`);
                lines.push(`    🌐 ${l.website_url}`);
                lines.push(`    📌 источник: ${l.source || '—'}`);
                lines.push('');
            });
            await sendTelegram(chatId, lines.join('\n'));
        } catch (e) {
            await sendTelegram(chatId, `⚠️ Ошибка /lead_list: ${e.message}`);
        }
        return true;
    }

    // /lead_run_pipeline — требует approval A3
    if (_cmd === 'lead_run_pipeline') {
        try {
            const stats = getRealLeadStats();
            const APPROVAL_QUEUE_PATH = path.join(WORKSPACE, 'data', 'approval_queue.json');
            const queue = readJSON(APPROVAL_QUEUE_PATH, []);
            const existingPending = Array.isArray(queue)
                ? queue.find(q => q.type === 'lead_run_pipeline' && q.status === 'pending')
                : null;

            if (existingPending) {
                await sendTelegram(chatId, [
                    '⏳ *Запрос approval уже существует*',
                    '',
                    `ID: \`${existingPending.id || 'pending'}\``,
                    `Создан: ${existingPending.created_at || '—'}`,
                    `Статус: pending`,
                    '',
                    'Ожидайте одобрения или отмените предыдущий запрос.',
                ].join('\n'));
                return true;
            }

            const approvalItem = {
                id: `approval_lead_pipeline_${Date.now()}`,
                type: 'lead_run_pipeline',
                risk_level: 'A3',
                status: 'pending',
                created_at: new Date().toISOString(),
                requested_by: userId || chatId,
                description: 'Run REAL Mini Audit 10K pipeline on mini_audit_10k_leads_REAL.csv',
                pipeline_steps: ['import', 'normalize', 'dedupe', 'scoring', 'risk_gate', 'telegram_queue', 'daily_report'],
                csv_path: '13_sales/daily_lead_factory/input/mini_audit_10k_leads_REAL.csv',
                leads_count: stats.total,
                valid_leads: stats.valid,
                safety: {
                    auto_send: 'BLOCKED',
                    client_messages: 0,
                    email_send: 'BLOCKED',
                },
            };

            // Append to approval queue
            const updatedQueue = Array.isArray(queue) ? [...queue, approvalItem] : [approvalItem];
            writeJSON(APPROVAL_QUEUE_PATH, updatedQueue);

            appendEvent({ type: 'lead_pipeline_approval_requested', approval_id: approvalItem.id, leads: stats.total });

            await sendTelegram(chatId, [
                '🔴 *Approval required — Risk Level A3*',
                '',
                'Запрос на запуск pipeline создан.',
                '',
                `ID: \`${approvalItem.id}\``,
                `Лидов в REAL CSV: *${stats.total}*`,
                `Валидных: *${stats.valid}*`,
                `Pipeline: import → normalize → dedupe → scoring → risk_gate → telegram_queue → daily_report`,
                '',
                '⛔ Auto-send: BLOCKED',
                '⛔ Клиентам ничего не отправляется',
                '',
                `Статус: pending approval`,
                `Файл: \`data/approval_queue.json\``,
                '',
                stats.valid < 10
                    ? `⚠️ Предупреждение: только ${stats.valid} валидных лидов. Рекомендуется минимум 10.`
                    : '✅ Лидов достаточно для запуска.',
            ].join('\n'));
        } catch (e) {
            await sendTelegram(chatId, `⚠️ Ошибка /lead_run_pipeline: ${e.message}`);
            logError({ route: 'lead_run_pipeline', text, chat_id: chatId, error: e, scope: 'lead_intake' });
        }
        return true;
    }

    // ── END LEAD INTAKE COMMANDS ──

    // ── /approval list ──
    if (_cmd === 'approval') {
        const APPROVAL_QUEUE_PATH = path.join(WORKSPACE, 'data', 'approval_queue.json');
        const queue = readJSON(APPROVAL_QUEUE_PATH, []);
        const pending = Array.isArray(queue) ? queue.filter(q => q.status === 'pending') : [];
        if (pending.length === 0) {
            await sendTelegram(chatId, '🧾 *Очередь согласований пуста.* Нет элементов со статусом pending.\n\nAuto-send: BLOCKED');
            return true;
        }
        const lines = [`🧾 *Согласования (${pending.length} pending):*`, ''];
        pending.slice(0, 10).forEach((item, i) => {
            lines.push(`*${i+1}.* \`${item.id || '?'}\``);
            lines.push(`   Тип: ${item.type || '?'} | Риск: ${item.risk_level || '?'}`);
            lines.push(`   Создан: ${item.created_at || '?'}`);
            lines.push(`   ${item.description || ''}`);
            lines.push('');
        });
        lines.push('⛔ Auto-send: BLOCKED. Выполнение только после явного одобрения Дмитрия.');
        await sendTelegram(chatId, lines.join('\n'));
        return true;
    }

    // ── /help ──
    if (_cmd === 'help') {
        const help = [
            '📖 *Команды Master Controller*',
            '',
            '🧪 /ping — проверка связи',
            '🩺 /health — статус системы',
            '📊 /today — сводка за сегодня',
            '📌 /lead_template — шаблон добавления лида',
            '➕ /lead_add — добавить лид (или /leadadd)',
            '📊 /lead_status — статус лидов',
            '📋 /lead_list — список лидов',
            '▶️ /lead_run_pipeline — запуск pipeline через approval',
            '📮 /mail status — статус почты',
            '🧾 /approval list — согласования',
            '🔎 /probe — live probe',
            '🐞 /debug_last — последние команды',
            '',
            '*Текстом:*',
            '"задачи" — задачи сейчас',
            '"пора заработать" — режим Revenue Action',
            '"лиды" → /lead_status',
            '"что с системой?" → /health',
            '"сегодня" или "на сегодня" → /today',
            '',
            '⛔ Auto-send: BLOCKED',
        ].join('\n');
        await sendTelegram(chatId, help);
        return true;
    }

    // ── /__tasks (задачи, что делать, следующий шаг ...) ──
    if (_cmd === '__tasks') {
        let stats = { total: 0, valid: 0, minimum_required: 10, ready_for_pipeline: false };
        try { stats = getRealLeadStats(); } catch (_) {}
        const needed = Math.max(0, stats.minimum_required - stats.valid);
        const lines = [
            '📋 *Задачи сейчас — Mini Audit 10K*',
            '',
            `🎯 *Главная цель:* 10 реальных лидов для Mini Audit 10K`,
            '',
            `📊 Лидов в REAL CSV: *${stats.total}*`,
            `✅ Валидных: *${stats.valid}*`,
            `⏳ До pipeline: ещё *${needed}* лидов`,
            '',
            stats.ready_for_pipeline
                ? '🚀 Готово к pipeline! → /lead_run_pipeline'
                : `➡️ *Следующий шаг: добавить лид*\n\nОткрой 2ГИС, найди компанию, добавь через:\n\`/lead_add\` или \`/leadadd\``,
            '',
            '📌 Полезные команды:',
            '• /lead_template — шаблон лида',
            '• /lead_status — сколько лидов',
            '• /lead_list — последние лиды',
        ].join('\n');
        await sendTelegram(chatId, lines);
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: '/__tasks', status: 'routed' });
        return true;
    }

    // ── /__revenue (пора заработать ...) ──
    if (_cmd === '__revenue') {
        let stats = { total: 0, valid: 0, minimum_required: 10, ready_for_pipeline: false };
        try { stats = getRealLeadStats(); } catch (_) {}
        const needed = Math.max(0, stats.minimum_required - stats.valid);
        const lines = [
            '💰 *Revenue Action Mode*',
            '',
            '🎯 Цель: 10 реальных лидов → Mini Audit 10K',
            '',
            `📊 Прогресс: *${stats.valid}/${stats.minimum_required}* лидов`,
            '',
            '*Шаги:*',
            '1. Открой 2ГИС или другой источник',
            '2. Найди компанию (ресторан, кафе, магазин...)',
            '3. Добавь лид: /lead_add или /leadadd',
            '4. Повтори до 10 лидов',
            `5. После 10 лидов: /lead_run_pipeline`,
            '',
            needed > 0 ? `⏳ Осталось добавить: *${needed}* лидов` : '✅ Лидов достаточно!',
            '',
            '*Получить шаблон:* /lead_template',
            '*Проверить статус:* /lead_status',
        ].join('\n');
        await sendTelegram(chatId, lines);
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: '/__revenue', status: 'routed' });
        return true;
    }

    // ── Empty text fallback ──
    if (!t) {
        await sendTelegram(chatId, 'Команда пустая. Напиши /help или /lead_template.');
        return true;
    }

    // ── SALES PHASE 2 OWNER-ONLY GUARDS — before Phase 1 & NL router ──
    // /draft_followup /log_touch /set_next /channel_hold /lead_note
    // Phase 2 = write-to-local-only. Auto-send BLOCKED. Owner-only (chat-id guarded above).
    try {
        const sales2Handled = await handleSalesPhase2(chatId, text, sendTelegram, WORKSPACE);
        if (sales2Handled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'sales_phase2', status: 'routed' });
            return true;
        }
    } catch (sales2Err) {
        logError({ route: 'sales_phase2', text, chat_id: chatId, error: sales2Err, scope: 'sales_phase2_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка sales ops команды: ${(sales2Err.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ── SALES PHASE 1 DIRECT GUARDS — before NL router ──
    // /sales_today  /followups  /replies  /lead_status <domain>
    // Phase 1 = read-only. NL router does NOT intercept these.
    try {
        const salesHandled = await handleSalesPhase1(chatId, text, sendTelegram, WORKSPACE);

        if (salesHandled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'sales_phase1', status: 'routed' });
            return true;
        }
    } catch (salesErr) {
        logError({ route: 'sales_phase1', text, chat_id: chatId, error: salesErr, scope: 'sales_phase1_guard' });
        await sendTelegram(chatId, `⚠️ Ошибка sales команды: ${(salesErr.message || '').substring(0, 120)}\n\nПопробуйте снова или используйте /ping для диагностики.`);
        return true;
    }

    // ── RUSSIAN UNIVERSAL ROUTER — non-slash RU/natural phrases ──
    // After exact slash + Phase 2 + Phase 1; before NL fallback.
    // Translation-only: maps RU phrase → canonical slash, then re-dispatches
    // into THIS handler (single response, no duplicated business logic).
    if (!t.startsWith('/')) {
        try {
            const ru = parseRussianIntent(text, WORKSPACE);
            if (ru && ru.ok && ru.command) {
                // HELP → render Russian help text directly (command 'help_ru' is not a slash)
                if (ru.command === 'help_ru') {
                    const helpRu = [
                        '🤖 Русские команды:',
                        '',
                        '• что сегодня → задачи на сегодня (/sales_today)',
                        '• статус системы → проверка бота (/health)',
                        '• покажи ZB23 → статус лида (/lead_status)',
                        '• подготовь письмо ZB23 → черновик письма (/draft_followup)',
                        '• я отправил письмо ZB23 → залогировать отправку (/log_touch)',
                        '• ватсап ZB23 не найден → отметить канал (/channel_hold)',
                        '• поставь звонок ZB23 завтра 10:30 → следующий шаг (/set_next)',
                        '• добавь заметку ZB23 ... → заметка по лиду (/lead_note)',
                        '',
                        'Подставляйте свой lead_id вместо ZB23.',
                    ].join('\n');
                    await sendTelegram(chatId, helpRu);
                    logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'ru_router_help', status: 'routed' });
                    return true;
                }
                // Canonical slash → re-dispatch into the same safe handlers (no dup logic)
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'ru_router', status: 'translated' });
                const ruHandled = await handleDLFCommand(chatId, userId, ru.command);
                if (ruHandled) return true;
                // If a canonical command isn't handled here, fall through to NL fallback below.
            } else if (ru && ru.ok === false && ru.error) {
                // SAFER GATING (per handoff review note): only answer the RU error when the
                // text actually mentions a KNOWN lead_id. Otherwise fall through to the
                // existing NL fallback / contact-intent path (do NOT hijack unrelated text).
                let leadMentioned = false;
                try { leadMentioned = resolveLeadId(text, WORKSPACE).found === true; } catch (_) {}
                if (leadMentioned) {
                    await sendTelegram(chatId, ru.error);
                    logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'ru_router_unrecognized', status: 'clarify_sent' });
                    return true;
                }
                // else: no known lead id → preserve existing NL/contact behavior (return false below)
            }
        } catch (ruErr) {
            logError({ route: 'ru_router', text, chat_id: chatId, error: ruErr, scope: 'ru_router_guard' });
            // do not block — fall through to NL fallback
        }
    }

    return false;   // not a DLF/sales command — fall through to NL router
}


// ============================================================
// HANDLE CALLBACK QUERY (inline button presses)
// ============================================================
const DLF_ACTION_MAP = {
    approve:  { status: 'approved_to_contact', event_type: 'outreach_approved',      emoji: '✅', label: 'Лид одобрен для ручной отправки. Клиенту ничего автоматически не отправлено.' },
    edit:     { status: 'needs_edit',          event_type: 'message_edit_requested', emoji: '✏️', label: 'Лид отправлен на доработку текста.' },
    postpone: { status: 'postponed',           event_type: 'followup_scheduled',     emoji: '⏸', label: 'Лид отложен.' },
    archive:  { status: 'archived',            event_type: 'lead_archived',          emoji: '❌', label: 'Лид отправлен в архив.' },
    pdf:      { status: 'audit_requested',     event_type: 'audit_requested',        emoji: '📄', label: 'Запрошена подготовка PDF-аудита.' },
};

async function handleCallbackQuery(query) {
    const cbId   = query.id;
    const chatId = query.message?.chat?.id?.toString();
    const userId = query.from?.id?.toString();
    const data   = query.data || '';

    // ---- V1 Mini Audit draft buttons (audit_draft_confirm / audit_draft_edit) ----
    // Owner-gated. Confirm → safe approval path (offline => BLOCKED, no real send).
    // Edit → returns instruction. NO send, NO queue write, NO 13_sales write.
    if (data.startsWith('audit_draft_confirm:') || data.startsWith('audit_draft_edit:')) {
        const isConfirm = data.startsWith('audit_draft_confirm:');
        const draftId = data.substring(data.indexOf(':') + 1);
        const _isOwner = isOwnerSender(userId, chatId);

        if (!_isOwner) {
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId, text: '⛔ Доступно только владельцу.' }).catch(() => {});
            if (chatId) await sendTelegram(chatId, '⛔ Доступно только владельцу.');
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: 'v1_draft_callback_owner_blocked', status: 'owner_gate_blocked' });
            return;
        }

        try {
            let out;
            if (isConfirm) {
                const knownDraft = draftId ? _v1DraftMemory.get(draftId) : null;
                // ALWAYS route ✅ Подтвердить through the P1 client-send handler.
                // This is the ONLY confirm path and it owns the HONEST gates:
                //   - missing / fake / example / test / EMAIL_TEST_TO recipient
                //       → REAL_CLIENT_RECIPIENT_REQUIRED (NEVER masquerades as
                //         SEND_ADAPTER_NOT_CONFIGURED)
                //   - real recipient + armed (P1_CLIENT_SEND_APPROVED=true) + owner ✅
                //       → real Yandex SMTP send via the SAME adapter used by
                //         /audit_send_selftest and /audit_send_preview_to_me → SENT
                //   - real recipient but NOT armed → P1_REQUIRED (honest, no send)
                // Autosend / mass_send are ALWAYS forced false here and re-blocked
                // inside the adapter. There is NO separate SEND_ADAPTER_NOT_CONFIGURED
                // fallback path for client confirm anymore.
                // ONE-SHOT: armed ONLY for the locked TOP-1 (recipient+subject)
                // AND only until exactly one send is consumed this process.
                const _p1Armed = _p1ComputeArmed(knownDraft);
                out = await _p1HandleClientSendConfirm(draftId, {
                    isOwner: true,
                    owner_confirmed: _p1Armed,
                    p1_client_send_approved: _p1Armed,
                    draft: knownDraft,
                    env: process.env,
                    autosend: false,
                    mass_send: false,
                });
                // Consume the one-shot the moment a real send succeeds.
                _p1ConsumeIfSent(out);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: 'p1_client_send_confirm', status: (out && out.ok) ? 'routed' : 'send_blocked' });


            } else {
                out = _v1HandleDraftEdit(draftId, { isOwner: true });
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: 'v1_draft_callback_edit', status: 'routed' });
            }
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});
            if (chatId) await sendTelegram(chatId, (out && out.text) || '⛔ BLOCKED.');
        } catch (cbErr) {
            logError({ route: 'v1_draft_callback', text: data, chat_id: chatId, error: cbErr, scope: 'v1_draft_callback_guard' });
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});
            if (chatId) await sendTelegram(chatId, 'Статус: RED\nОбработка кнопки черновика завершилась ошибкой. Отправка НЕ выполнялась.');
        }
        return;
    }

    // ---- AUDIT-SEND inline approval buttons (audit_send:approve / audit_send:reject) ----
    // These are the inline buttons placed UNDER an Outbound Draft preview. Pressing
    // ✅ Отправить = same action as the text command /audit_send_approve <draft_id>;
    // ❌ Отклонить = same action as /audit_send_reject <draft_id>. Owner-gated.
    // Non-owner → refusal. Duplicate press on an already-processed draft → blocked.
    // After action the message keyboard is removed so it cannot be pressed twice.
    // Autosend stays BLOCKED: nothing is sent at preview time — only here, after
    // an explicit owner button press, via the EXISTING approve/reject controller.
    if (data.startsWith('audit_send:approve:') || data.startsWith('audit_send:reject:')) {
        const _asAction = data.startsWith('audit_send:approve:') ? 'approve' : 'reject';
        const _asRef = data.substring(data.lastIndexOf(':') + 1);
        const _asDraftId = _auditSendResolveDraftId(_asRef);
        const _asIsOwner = isOwnerSender(userId, chatId);

        if (!_asIsOwner) {
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId, text: '⛔ Доступно только владельцу.' }).catch(() => {});
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: 'audit_send_callback_owner_blocked', status: 'owner_gate_blocked' });
            return;
        }

        // Duplicate guard — already approved/rejected this draft.
        if (_auditSendProcessed.has(_asDraftId)) {
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId, text: 'Уже обработано / duplicate blocked.' }).catch(() => {});
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: 'audit_send_callback_duplicate', status: 'duplicate_blocked' });
            return;
        }

        try {
            // Dismiss the loading spinner first.
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});

            const _asKnownDraft = _asDraftId ? _v1DraftMemory.get(_asDraftId) : null;
            let _asOut;

            if (_asAction === 'approve') {
                // ✅ Отправить — route through the SAME P1 client-send handler used
                // by audit_draft_confirm. This is the ONLY approved client-send path
                // and it owns the HONEST gates:
                //   - missing / fake / example / test / EMAIL_TEST_TO recipient
                //       → REAL_CLIENT_RECIPIENT_REQUIRED (NEVER masquerades as
                //         SEND_ADAPTER_NOT_CONFIGURED)
                //   - real recipient + armed (P1_CLIENT_SEND_APPROVED=true) + owner ✅
                //       → real Yandex SMTP send via the SAME adapter used by
                //         /audit_send_selftest and /audit_send_preview_to_me → SENT
                //   - real recipient but NOT armed → P1_REQUIRED (honest, no send)
                // Autosend / mass_send are ALWAYS forced false here and re-blocked
                // inside the adapter.
                // ONE-SHOT: armed ONLY for the locked TOP-1 (recipient+subject)
                // AND only until exactly one send is consumed this process.
                const _p1Armed = _p1ComputeArmed(_asKnownDraft);
                _asOut = await _p1HandleClientSendConfirm(_asDraftId, {
                    isOwner: true,
                    owner_confirmed: _p1Armed,
                    p1_client_send_approved: _p1Armed,
                    draft: _asKnownDraft,
                    env: process.env,
                    autosend: false,
                    mass_send: false,
                });
                // Consume the one-shot the moment a real send succeeds.
                _p1ConsumeIfSent(_asOut);

            } else {
                // ❌ Отклонить — existing reject controller path. Never sends.
                _asOut = _v1HandleSend(
                    { action: _asAction, draft_id: _asDraftId },
                    { isOwner: true, draft: _asKnownDraft, autosend: false },
                );
            }

            // Mark processed so a second press is blocked.
            _auditSendProcessed.set(_asDraftId, _asAction);

            // Remove the inline keyboard so the buttons can't be pressed again.
            const _asMsgId = query.message?.message_id;
            if (chatId && _asMsgId != null) {
                await tgRequest('editMessageReplyMarkup', { chat_id: chatId, message_id: _asMsgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
            }

            // Owner-facing confirmation. HARD HONESTY: the P1 handler already
            // produces an honest text (SENT / REAL_CLIENT_RECIPIENT_REQUIRED /
            // P1_REQUIRED / SMTP_SEND_FAILED). For approve we surface that text
            // directly; for reject we keep the existing header formatter.
            let _asMessage;
            if (_asAction === 'approve') {
                const _asOkSend = !!(_asOut && _asOut.ok === true && _asOut.code === 'SEND_OK_CLIENT_P1');
                const _asHeaderA = _asOkSend
                    ? `✅ Отправлено клиенту: ${_asDraftId}`
                    : `✅ Approval получен: ${_asDraftId}`;
                const _asBodyA = (_asOut && _asOut.text) ? `\n\n${_asOut.text}` : '';
                _asMessage = `${_asHeaderA}${_asBodyA}\n\nAutosend: BLOCKED\nОтправка только после approval.`;
            } else {
                const _asHeader = formatAuditSendApproveHeader(_asAction, _asDraftId, _asOut);
                const _asBody = (_asOut && _asOut.text) ? `\n\n${_asOut.text}` : '';
                _asMessage = `${_asHeader}${_asBody}\n\nAutosend: BLOCKED\nОтправка только после approval.`;
            }
            if (chatId) await sendTelegram(chatId, _asMessage);


            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: `audit_send_callback_${_asAction}`, status: (_asOut && _asOut.ok) ? 'routed' : 'send_blocked' });
        } catch (asErr) {
            logError({ route: 'audit_send_callback', text: data, chat_id: chatId, error: asErr, scope: 'audit_send_callback_guard' });
            await tgRequest('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});
            if (chatId) await sendTelegram(chatId, 'Статус: RED\nОбработка кнопки approval завершилась ошибкой. Отправка НЕ выполнялась.\n\nAutosend: BLOCKED');
        }
        return;
    }

    // ---- FILE VAULT inline buttons (fvault:*) ----
    // ✅ put / 🟨 inbox / ❌ reject / ✏️ choose / fld:<key> / dup:* — owner-gated.
    // All file moves are LOCAL only; nothing is sent externally, nothing deleted.
    if (data.startsWith("fvault:")) {
        const _fvIsOwner = isOwnerSender(userId, chatId);
        if (!_fvIsOwner) {
            await tgRequest("answerCallbackQuery", { callback_query_id: cbId, text: "⛔ Доступно только владельцу." }).catch(() => {});
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: "file_vault_callback_owner_blocked", status: "owner_gate_blocked" });
            return;
        }
        try {
            await tgRequest("answerCallbackQuery", { callback_query_id: cbId }).catch(() => {});
            const out = await fileVault.handleCallback({ data, chatId, deps: buildFileVaultDeps() });
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text: data, detected_route: `file_vault_callback_${out && out.action || "unknown"}`, status: (out && out.ok) ? "routed" : "noop" });
        } catch (fvErr) {
            logError({ route: "file_vault_callback", text: data, chat_id: chatId, error: fvErr, scope: "file_vault_callback_guard" });
            if (chatId) await sendTelegram(chatId, "Статус: RED\nОбработка кнопки File Vault завершилась ошибкой. Файл не удалён, ничего не отправлено.");
        }
        return;
    }

    // Only handle DLF callbacks (prefix dlf:)
    if (!data.startsWith('dlf:')) {
        await tgRequest('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});
        return;
    }




    const parts  = data.split(':');
    const action = parts[1];
    const leadId = parts.slice(2).join(':');    // safe for lead IDs with colons

    const mapping = DLF_ACTION_MAP[action];
    if (!mapping) {
        await tgRequest('answerCallbackQuery', {
            callback_query_id: cbId,
            text: '⚠️ Неизвестное действие',
        }).catch(() => {});
        return;
    }

    // ⚠️ SAFETY: approve does NOT send any message to the client.
    //    It only records the status so the owner can manually send later.
    // Авто-отправка заблокирована — только ручная отправка после одобрения.

    // Write event to DLF events_log.json
    appendDLFEvent({
        event_type:  mapping.event_type,
        lead_id:     leadId,
        new_status:  mapping.status,
        action_by:   userId || chatId || 'unknown',
        safety_note: 'auto_send_blocked — approval only marks for manual outreach',
    });

    // Dismiss the loading spinner in Telegram
    await tgRequest('answerCallbackQuery', {
        callback_query_id: cbId,
        text: `${mapping.emoji} ${mapping.label}`,
    }).catch(() => {});

    // Send confirmation to chat
    if (chatId) {
        await sendTelegram(chatId, `${mapping.emoji} ${mapping.label}`);
    }

    appendEvent({
        type:    'dlf_callback',
        action,
        lead_id: leadId,
        status:  mapping.status,
        chat_id: chatId,
    });
}

// ============================================================
// ROUTE TEXT COMMAND (NL router)
// ============================================================
function routeCommand(text) {
    const r = spawnSync('node', [ROUTER_SCRIPT, text], {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true,
    });
    if (r.stdout) {
        try { return JSON.parse(r.stdout); } catch (_) {}
    }
    return null;
}

// ============================================================
// EXECUTE COMMAND
// ============================================================
function executeCommand(normalizedCommand) {
    const r = spawnSync('node', [RUN_CMD, normalizedCommand], {
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
    });
    if (r.stdout) {
        try { return JSON.parse(r.stdout); } catch (_) {}
    }
    return { success: false, message: r.stderr || 'run_command returned no output' };
}

// ============================================================
// BUILD DRAFT PREVIEW (Telegram message)
// recipient_name and recipient_email are SEPARATE fields.
// NEVER show company name as "Кому" when channel is email.
// ============================================================
function buildDraftPreview(result) {
    if (!result || !result.preview) return null;
    const p = result.preview;

    const channel = p.channel || 'email';
    const recipientName = p.recipient_name || p.recipient || '—';
    const recipientEmail = p.recipient_email || '';
    const recipientStatus = p.recipient_status || 'missing';
    const sendAllowed = p.send_allowed === true;
    const emailMissing = !recipientEmail;

    // "Кому" must be the real email, never the company name
    const komuLine = emailMissing
        ? `Кому: email не найден`
        : `Кому: ${recipientEmail}`;

    const lines = [
        `📨 *Подготовлен черновик*`,
        ``,
        `Проект: ${result.project || '—'}`,
        `Канал: ${channel}`,
        komuLine,
        `Получатель: ${recipientName}`,
        `Тема: ${p.subject || '—'}`,
        `Риск: ${result.risk_level || 'Yellow'}`,
        `Approval: required`,
        `Статус контакта: ${recipientStatus}`,
        ``,
        `*Текст:*`,
        `\`\`\``,
        p.body || '',
        `\`\`\``,
        ``,
    ];

    if (emailMissing) {
        lines.push(`*Действия:*`);
        lines.push(`- find contact — найти email получателя`);
        lines.push(`- rewrite — изменить текст`);
        lines.push(`- hold — отложить`);
        lines.push(``);
        lines.push(`⛔ *Отправка заблокирована: нет подтверждённого email.*`);
    } else {
        lines.push(`*Действия:*`);
        lines.push(`- отправить вручную после одобрения`);
        lines.push(`- rewrite — изменить текст`);
        lines.push(`- hold — отложить`);
        lines.push(`- approve send later`);
    }

    if (p.notes) lines.push(`\n_Заметки: ${p.notes}_`);
    return lines.join('\n');
}

// ============================================================
// COMMAND NORMALIZER — resolves aliases to canonical commands
// MUST be called before any routing. Handles Russian text,
// slash aliases, and typos. SAFE: returns original if no match.
// ============================================================
function normalizeCommandText(rawText) {
    if (!rawText || !rawText.trim()) return rawText;
    const t  = rawText.trim();
    const tl = t.toLowerCase();

    // -- exact alias map --
    const ALIAS_MAP = {
        // Ping
        'ping':              '/ping',
        'пинг':              '/ping',
        'проверка':          '/ping',
        'проверка связи':    '/ping',
        'бот живой':         '/ping',
        'ты живой':          '/ping',
        // Health / system
        'health':                '/health',
        'что с системой':        '/health',
        'что с системой?':       '/health',
        'диагностика':           '/health',
        'статус системы':        '/health',
        'как система':           '/health',
        'что работает':          '/health',
        'система':               '/health',
        // Today / daily
        'на сегодня':            '/today',
        'план на сегодня':       '/today',
        'сводка':                '/today',
        'сводка за сегодня':     '/today',
        '/daily':                '/today',
        // Tasks
        'задачи':           '/__tasks',
        'мои задачи':       '/__tasks',
        'что делать':       '/__tasks',
        'что дальше':       '/__tasks',
        'дай задачи':       '/__tasks',
        'следующий шаг':    '/__tasks',
        'план действий':    '/__tasks',
        // Revenue mode
        'пора заработать':  '/__revenue',
        'revenue action':   '/__revenue',
        'режим заработка':  '/__revenue',
        // Lead status
        'лиды':                 '/lead_status',
        'статус лидов':         '/lead_status',
        'что по лидам':         '/lead_status',
        'сколько лидов':        '/lead_status',
        'real leads':           '/lead_status',
        '/leadstatus':          '/lead_status',
        '/lead status':         '/lead_status',
        // Lead template
        '/leadtemplate':        '/lead_template',
        '/lead template':       '/lead_template',
        'шаблон лида':          '/lead_template',
        'как добавить лид':     '/lead_template',
        'дай шаблон лида':      '/lead_template',
        // Lead add aliases
        '/leadadd':             '/lead_add',
        '/add_lead':            '/lead_add',
        '/addlead':             '/lead_add',
        'добавить лид':         '/lead_add',
        // Lead list
        '/leadlist':            '/lead_list',
        '/lead list':           '/lead_list',
        'список лидов':         '/lead_list',
        'покажи лиды':          '/lead_list',
        'последние лиды':       '/lead_list',
        // Lead pipeline
        '/leadrunpipeline':     '/lead_run_pipeline',
        '/run_leads':           '/lead_run_pipeline',
        'запусти лиды':         '/lead_run_pipeline',
        'прогони лиды':         '/lead_run_pipeline',
        'запусти pipeline':     '/lead_run_pipeline',
        'прогнать pipeline':    '/lead_run_pipeline',
        // Approval
        '/approvallist':            '/approval list',
        'approvals':                '/approval list',
        'апрувы':                   '/approval list',
        'согласования':             '/approval list',
        'что ждёт подтверждения':   '/approval list',
        // Status
        'status':   '/status',
        'статус':   '/status',
        // Help
        'help':         '/help',
        'помощь':       '/help',
        'команды':      '/help',
        'что умеешь':   '/help',
    };

    if (ALIAS_MAP[tl] !== undefined) return ALIAS_MAP[tl];

    // /leadadd with payload → /lead_add with payload
    if (/^\/(?:leadadd|add_lead|addlead)\s+/i.test(t)) {
        return '/lead_add ' + t.replace(/^\/(?:leadadd|add_lead|addlead)\s+/i, '');
    }

    return t; // passthrough: no normalization
}

// ============================================================
// HANDLE ANY TEXT
// ============================================================
async function handleText(chatId, originalText, userId) {
    // CRITICAL: normalize aliases FIRST — before ANY routing or logging decides the route
    const text = normalizeCommandText(originalText);
    const route = detectRoute(text);
    // Log every incoming update (sanitized in reliability.mjs)
    logUpdate({
        update_id:      null,
        chat_id:        chatId,
        user_id:        userId,
        text,
        detected_route: route,
        status:         'received',
    });

    try {
        // ---- 0a. T2 Read-only Ops Executor — owner-only whitelisted checks ----
        // Recognizes ONLY: /ops, /ops_status, /ops_watchdog, /ops_regression,
        // /r4, the button "🧪 Проверка", and a small set of RU operator phrases
        // (status / watchdog / regression). classifyOpsCommand returns null for
        // EVERYTHING else — including /ping, /health, /today and
        // /lead_import_prepare — so those critical/frozen routes are NOT touched.
        // We classify on the RAW originalText (before alias normalization) so the
        // operator phrases match exactly and existing /ping etc. stay intact.
        // SAFETY: owner-gated; runs ONLY local read-only PowerShell checks via the
        // executor (status/watchdog/regression). NO send/import/queue write, NO
        // restart/start/stop, NO Telegram API inside the module, NO token read, NO
        // scheduled task, NO autorestart. Does NOT unfreeze D3C.
        const _t2Ops = _t2ClassifyOps(originalText);
        if (_t2Ops) {
            const _t2IsOwner = isOwnerSender(userId, chatId);
            if (!_t2IsOwner) {
                await sendTelegram(chatId, _T2_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 't2_ops_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            if (_t2Ops === 'menu') {
                await sendTelegram(chatId, _t2OpsMenuText());
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 't2_ops_menu', status: 'routed' });
                return;
            }
            try {
                const _t2Result = await _t2RunOpsAction(_t2Ops);
                await sendTelegram(chatId, _t2FormatOpsReply(_t2Result));
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `t2_ops_${_t2Ops}`, status: _t2Result.ok ? 'routed' : 'ops_error' });
            } catch (_t2Err) {
                logError({ route: `t2_ops_${_t2Ops}`, text, chat_id: chatId, error: _t2Err, scope: 't2_ops_guard' });
                await sendTelegram(chatId, 'Статус: RED\nКоманда read-only завершилась ошибкой. Никаких write/send/import действий не выполнялось.');
            }
            return; // handled — stop routing
        }

        // ---- 0. T1 Hotkey Menu — early SAFE guard (read-only, no side effects) ----

        // Recognizes ONLY: /menu, /help, "меню", "главное меню" and the 8 hotkey
        // labels (🏠 Меню, 🩺 Health, 🧪 Проверка, 💰 Mini Audit, 📋 Очередь,
        // 🧊 Freeze, 📊 Сегодня, ❓ Help). It returns null for everything else, so
        // /ping, /health, /today and all other routes are NOT intercepted.
        // SAFETY: pure text + keyboard. NO PowerShell, NO queue write, NO import,
        // NO Telegram-side actions beyond the owner-facing reply. Does NOT change
        // dangerous-route logic and does NOT unfreeze the D3C freeze.
        const menuResult = handleHotkeyMenu(text);
        if (menuResult && menuResult.handled) {
            if (menuResult.reply_markup) {
                // Minimal reply_markup support — used ONLY for the menu keyboard.
                // The shared sendTelegram() wrapper has no reply_markup arg, so we
                // call tgRequest directly here (Markdown first, plain-text retry).
                let _r = await tgRequest('sendMessage', { chat_id: chatId, text: menuResult.text, parse_mode: 'Markdown', reply_markup: menuResult.reply_markup });
                if (!_r || !_r.ok) {
                    _r = await tgRequest('sendMessage', { chat_id: chatId, text: menuResult.text, reply_markup: menuResult.reply_markup });
                }
                appendReplyLog(`TO: ${chatId} [t1_menu_keyboard]`);
            } else {
                await sendTelegram(chatId, menuResult.text);
            }
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 't1_hotkey_menu', status: 'routed' });
            return;
        }

        // ---- 0b. T1B Text/Voice Intent Router — SAFE understanding-only guard ----
        // Recognizes free-form text (and already-transcribed voice handled as text)
        // and maps it to one of: menu | health | today | regression_info |
        // mini_audit | queue | freeze | help | lead_100_info. Returns null for
        // everything else, so /ping, /health, /today, /lead_import_prepare and all
        // other routes are NOT intercepted (classifier ignores any text starting
        // with '/'). Runs AFTER critical slash routing position (this whole block
        // is inside handleText, but classifyIntent rejects slash commands) and
        // AFTER the T1 hotkey menu, so the menu keyboard still wins for its labels.
        // SAFETY: pure text replies via the existing sendTelegram. NO PowerShell,
        // NO queue write, NO import, NO Telegram API beyond owner reply, NO token
        // read. Does NOT run health/today/regression. Does NOT start lead parsing.
        // Does NOT change dangerous-route logic and does NOT unfreeze D3C.
        const intentResult = handleTextVoiceIntent(text);
        if (intentResult && intentResult.handled) {
            if (intentResult.delegateToMenu) {
                // Reuse the T1 hotkey menu response (keyboard) without duplicating it.
                const m = handleHotkeyMenu('/menu');
                if (m && m.handled && m.reply_markup) {
                    let _r = await tgRequest('sendMessage', { chat_id: chatId, text: m.text, parse_mode: 'Markdown', reply_markup: m.reply_markup });
                    if (!_r || !_r.ok) {
                        _r = await tgRequest('sendMessage', { chat_id: chatId, text: m.text, reply_markup: m.reply_markup });
                    }
                    appendReplyLog(`TO: ${chatId} [t1b_intent_menu_keyboard]`);
                } else {
                    await sendTelegram(chatId, intentResult.text);
                }
            } else {
                await sendTelegram(chatId, intentResult.text);
            }
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `t1b_intent_${intentResult.intent}`, status: 'routed' });
            return;
        }

        // ---- 0c. V1 Telegram-Controlled Mini Audit System ----
        // Routes placed AFTER T1/T1B/T2 safe routes and BEFORE the generic
        // DLF/NL fallback. Four owner-only sub-routes: Mini Audit cockpit
        // (read-only TOP leads), Outbound Draft Center (preview only, NO send),
        // Approved Send Controller (approval gate; offline => no real send),
        // Daily 100 Lead Scout L1 (report-only). SAFETY: every classifier returns
        // null for /ping, /health, /today, /lead_import_prepare and all other text
        // (non-V1 slash commands ignored), so critical/frozen routes are NOT
        // intercepted. NO queue write, NO approval_queue write, NO real import, NO
        // autosend, NO Telegram API beyond owner reply, NO token/.env read. Does
        // NOT unfreeze the D3C freeze. Owner-gated via isOwnerSender (fail-closed).

        // ---- 0c-E1C1. Approved Email Transport bridge (owner-only, NO send) ----
        // /email_preflight  -> safe transport capability report (names + booleans
        //   only, never secret values; NEVER sends).
        // /email_test_self  -> in build/offline NEVER performs a real send; only a
        //   wired mockTransport yields SEND_OK_MOCK, otherwise a safe BLOCK code.
        // Recognized aliases: "проверить почту", "email preflight", "тест почты",
        //   "отправь тест себе". Owner-gated (fail-closed). These routes do NOT
        //   intercept /ping /health /today /menu /r4, do NOT touch draft buttons,
        //   and do NOT unfreeze /lead_import_prepare. context.live_send_allowed is
        //   forced false here so no real network/send can occur in build.
        const _e1c1Lower = (typeof originalText === 'string' ? originalText : '').trim().toLowerCase();
        const _e1c1IsPreflight = (
            _e1c1Lower === '/email_preflight' ||
            _e1c1Lower === 'email preflight' ||
            _e1c1Lower === 'проверить почту' ||
            _e1c1Lower === 'проверь почту'
        );
        const _e1c1IsSelfTest = (
            _e1c1Lower === '/email_test_self' ||
            _e1c1Lower === '/audit_send_selftest' ||
            _e1c1Lower === 'тест почты' ||
            _e1c1Lower === 'отправь тест себе'
        );

        if (_e1c1IsPreflight) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'e1c1_email_preflight_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                // env: names + present booleans only are surfaced; values never printed.
                const _e1c1Out = _e1c1HandleEmailPreflight({ isOwner: true, env: process.env, live_send_allowed: false });
                await sendTelegram(chatId, (_e1c1Out && _e1c1Out.text) || 'Email preflight: нет данных.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `e1c1_email_preflight_${(_e1c1Out && _e1c1Out.code) || 'unknown'}`, status: 'routed' });
            } catch (_e1c1Err) {
                logError({ route: 'e1c1_email_preflight', text, chat_id: chatId, error: _e1c1Err, scope: 'e1c1_email_guard' });
                await sendTelegram(chatId, 'Статус: RED\nEmail preflight завершился ошибкой. Никаких send/import действий не выполнялось.');
            }
            return;
        }

        if (_e1c1IsSelfTest) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'e1c1_email_test_self_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                // MAIL-FINAL-2: owner-only self-test. The controller is async and
                // enforces all gates (owner, EMAIL_REAL_SEND_ENABLED, EMAIL_TEST_ONLY,
                // recipient===EMAIL_TEST_TO, single message, no autosend/mass_send).
                // Must be awaited; otherwise the Promise has no .text and the old
                // offline safe-block fallback string was always shown.
                const _e1c1Out = await _e1c1HandleEmailTestSelf({ isOwner: true, env: process.env, live_send_allowed: false });
                await sendTelegram(chatId, (_e1c1Out && _e1c1Out.text) || 'Email self-test: safe block (offline).');

                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `e1c1_email_test_self_${(_e1c1Out && _e1c1Out.code) || 'unknown'}`, status: (_e1c1Out && _e1c1Out.ok) ? 'routed' : 'send_blocked' });
            } catch (_e1c1Err) {
                logError({ route: 'e1c1_email_test_self', text, chat_id: chatId, error: _e1c1Err, scope: 'e1c1_email_guard' });
                await sendTelegram(chatId, 'Статус: RED\nEmail self-test завершился ошибкой. Никаких реальных send действий не выполнялось.');
            }
            return;
        }

        // ---- 0c-PREVIEW. /audit_send_preview_to_me top1 (owner-only) ----
        // Builds the REAL TOP-1 audit_send draft (same production subject/body
        // generator as a real client send) and sends EXACTLY ONE preview email to
        // Dmitry (EMAIL_TEST_TO) ONLY. HARD SAFETY: recipient forced to EMAIL_TEST_TO;
        // the real client recipient is discarded and NEVER used. NO client send, NO
        // lead status change to "contacted", NO client SENT log, NO autosend, NO mass
        // send. A visible "PREVIEW ONLY — NOT SENT TO CLIENT" header is injected into
        // the body. Owner-gated (fail-closed).
        const _previewLower = (typeof originalText === 'string' ? originalText : '').trim().toLowerCase();
        const _previewMatch = _previewLower.match(/^\/audit_send_preview_to_me(?:\s+(\S+))?$/);
        if (_previewMatch) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'audit_send_preview_to_me_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                const _previewTarget = _previewMatch[1] || 'top1';
                const _previewOut = await _previewHandleAuditSendPreviewToMe(_previewTarget, { isOwner: true, env: process.env });
                await sendTelegram(chatId, (_previewOut && _previewOut.text) || 'Preview: нет результата.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `audit_send_preview_to_me_${(_previewOut && _previewOut.code) || 'unknown'}`, status: (_previewOut && _previewOut.ok) ? 'routed' : 'send_blocked' });
            } catch (_previewErr) {
                logError({ route: 'audit_send_preview_to_me', text, chat_id: chatId, error: _previewErr, scope: 'audit_send_preview_to_me_guard' });
                await sendTelegram(chatId, 'Статус: RED\nPreview завершился ошибкой. Клиенту НЕ отправлено, статус НЕ изменён.');
            }
            return;
        }

        // ---- 0c-SALES. Block H sales commands (owner-only, read-only) ----
        // /sales_status        → pipeline ready/blocked + sent-today snapshot
        // /sales_history       → last 10 ledger sends (incl. backfilled kvs@zb23.ru)
        // /lead_run_pipeline   → ready/blocked counts (NO send, NO mark contacted)
        // These run BEFORE the old approval-queue /lead_run_pipeline in
        // handleDLFCommand, so the new ready/blocked pipeline path wins.
        // SAFETY: read-only. NO send, NO SMTP, NO mark contacted, NO queue write.
        const _salesLower = (typeof originalText === 'string' ? originalText : '').trim().toLowerCase();
        const _salesIsStatus  = (_salesLower === '/sales_status' || _salesLower === '/salesstatus');
        const _salesIsHistory = (_salesLower === '/sales_history' || _salesLower === '/saleshistory');
        const _salesIsPipeline = (_salesLower === '/lead_run_pipeline' || _salesLower === '/leadrunpipeline');
        if (_salesIsStatus || _salesIsHistory || _salesIsPipeline) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'sales_block_h_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                if (_salesIsHistory) {
                    await sendTelegram(chatId, _salesFormatHistory(10));
                    logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'sales_history', status: 'routed' });
                    return;
                }
                if (_salesIsPipeline) {
                    const _lp = _salesHandleLeadRunPipeline({});
                    await sendTelegram(chatId, (_lp && _lp.text) || 'Pipeline: нет результата.');
                    logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'lead_run_pipeline_v1', status: 'routed' });
                    return;
                }
                // _salesIsStatus — combine pipeline snapshot + recent sends
                const _pr = _salesRunLeadPipeline({});
                const _ready = (_pr && _pr.ready != null) ? _pr.ready : (Array.isArray(_pr && _pr.ready_leads) ? _pr.ready_leads.length : 0);
                const _blocked = (_pr && _pr.blocked != null) ? _pr.blocked : (Array.isArray(_pr && _pr.blocked_leads) ? _pr.blocked_leads.length : 0);
                const _statusLines = [
                    '📊 Sales status',
                    '',
                    `Ready leads: ${_ready}`,
                    `Blocked leads: ${_blocked}`,
                    '',
                    'Daily flow:',
                    '1. /sales_status',
                    '2. /lead_run_pipeline',
                    '3. /sales_next',
                    '4. ✅ approval',
                    '5. /sales_history',
                    '',
                    'Autosend: BLOCKED',
                ].join('\n');
                await sendTelegram(chatId, _statusLines);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'sales_status', status: 'routed' });
                return;
            } catch (_salesErr) {
                logError({ route: 'sales_block_h', text, chat_id: chatId, error: _salesErr, scope: 'sales_block_h_guard' });
                await sendTelegram(chatId, 'Статус: RED\nSales команда завершилась ошибкой. Ничего не отправлено, статус не изменён.');
                return;
            }
        }

        // 1) Mini Audit cockpit (read-only)
        const _v1Audit = _v1ClassifyAudit(originalText);



        if (_v1Audit) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_audit_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                const _v1Text = _v1HandleAudit(_v1Audit);
                await sendTelegram(chatId, _v1Text || 'Mini Audit: нет данных.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `v1_audit_${_v1Audit}`, status: 'routed' });
            } catch (_v1Err) {
                logError({ route: `v1_audit_${_v1Audit}`, text, chat_id: chatId, error: _v1Err, scope: 'v1_audit_guard' });
                await sendTelegram(chatId, 'Статус: RED\nMini Audit cockpit завершился ошибкой. Никаких write/send/import действий не выполнялось.');
            }
            return;
        }

        // 1c) Contact Resolver (/contact_resolve top1) — READ-ONLY, NEVER sends,
        // NEVER marks the client contacted. Resolves a REAL sendable client email
        // from lead_contacts / local website-contact files, or returns
        // REAL_CLIENT_RECIPIENT_REQUIRED. Fake/example/test emails are hard-blocked.
        const _v1ContactResolve = _v1ClassifyContactResolve(originalText);
        if (_v1ContactResolve) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_contact_resolve_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                // Resolve the TOP-1 lead (read-only) so the resolver can match it
                // against the production lead_contacts registry. NO send, NO write.
                let _crLead = {};
                try { _crLead = _v1FindTop1() || {}; } catch (_) { _crLead = {}; }
                const _crOut = _v1HandleContactResolve(_v1ContactResolve, { lead: _crLead });
                await sendTelegram(chatId, (_crOut && _crOut.text) || 'Contact resolve: нет результата.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_contact_resolve', status: (_crOut && _crOut.result && _crOut.result.sendable) ? 'routed' : 'recipient_required' });
            } catch (_crErr) {
                logError({ route: 'v1_contact_resolve', text, chat_id: chatId, error: _crErr, scope: 'v1_contact_resolve_guard' });
                await sendTelegram(chatId, 'Статус: RED\nContact resolver завершился ошибкой. Клиент НЕ contacted, ничего не отправлено.');
            }
            return;
        }

        // 1d) Audit Engine v2 (/audit_run <site> | top1) — READ-ONLY analysis.
        // Fetches the site (network only here), runs the PURE engine, returns 3
        // issues + risk + recommended offer. NEVER sends, NEVER marks contacted.
        const _v1AuditRun = _v1ClassifyAuditRun(originalText);
        if (_v1AuditRun) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_audit_run_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                // For top1, resolve the site from the TOP-1 lead (read-only).
                let _arSite = _v1AuditRun.site || null;
                if (!_arSite && _v1AuditRun.target === 'top1') {
                    let _arLead = {};
                    try { _arLead = _v1FindTop1() || {}; } catch (_) { _arLead = {}; }
                    _arSite = _arLead.website || _arLead.website_url || _arLead.site || null;
                }
                const _arOut = await _v1HandleAuditRun(originalText, { site: _arSite });
                await sendTelegram(chatId, (_arOut && _arOut.text) || 'Audit: нет результата.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_audit_run', status: (_arOut && _arOut.ok) ? 'routed' : 'audit_no_site' });
            } catch (_arErr) {
                logError({ route: 'v1_audit_run', text, chat_id: chatId, error: _arErr, scope: 'v1_audit_run_guard' });
                await sendTelegram(chatId, 'Статус: RED\nAudit engine завершился ошибкой. Ничего не отправлено, статус не изменён.');
            }
            return;
        }

        // 2) Outbound Draft Center (preview only — NO send)
        const _v1Draft = _v1ClassifyDraft(originalText);


        if (_v1Draft) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_draft_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                // Recipient intentionally NOT resolved here (offline build): no
                // lead_contacts read. Missing recipient => SEND_BLOCKED in preview.
                const _v1DraftOut = _v1HandleDraft(_v1Draft);
                let _v1DraftId = null;
                if (_v1DraftOut && _v1DraftOut.draft && _v1DraftOut.draft.ok && _v1DraftOut.draft.draft_id) {
                    // Remember the preview so the send controller can enforce the
                    // preview gate. Volatile RAM only — NO disk/queue write.
                    _v1DraftId = _v1DraftOut.draft.draft_id;
                    _v1DraftMemory.set(_v1DraftId, _v1DraftOut.draft);
                }
                const _v1DraftText = (_v1DraftOut && _v1DraftOut.text) || 'Draft: ошибка генерации.';
                // AUTOSEND: BLOCKED — pressing ✅ Отправить only triggers the existing
                // owner-gated approval path later; preview NEVER sends anything itself.
                const _v1Kb = _v1DraftId ? buildAuditSendKeyboard(_v1DraftId) : null;
                if (_v1Kb) {
                    // sendTelegram() has no reply_markup arg — call tgRequest directly
                    // (Markdown first, plain-text retry) so the inline buttons attach.
                    let _r = await tgRequest('sendMessage', { chat_id: chatId, text: _v1DraftText, parse_mode: 'Markdown', reply_markup: _v1Kb });
                    if (!_r || !_r.ok) {
                        _r = await tgRequest('sendMessage', { chat_id: chatId, text: _v1DraftText, reply_markup: _v1Kb });
                    }
                    appendReplyLog(`TO: ${chatId} [audit_send_inline_keyboard draft]`);
                } else {
                    await sendTelegram(chatId, _v1DraftText);
                }
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `v1_draft_${_v1Draft.action}`, status: 'routed' });

            } catch (_v1Err) {
                logError({ route: 'v1_draft', text, chat_id: chatId, error: _v1Err, scope: 'v1_draft_guard' });
                await sendTelegram(chatId, 'Статус: RED\nDraft center завершился ошибкой. Отправка не выполнялась.');
            }
            return;
        }

        // 3) Approved Send Controller (approval gate; offline => no real send)
        const _v1Send = _v1ClassifySend(originalText);
        if (_v1Send) {
            const _v1SendIsOwner = isOwnerSender(userId, chatId);
            if (!_v1SendIsOwner) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_send_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                const _v1KnownDraft = _v1Send.draft_id ? _v1DraftMemory.get(_v1Send.draft_id) : null;
                // HARD SAFETY: allowRealSend is NEVER set and sendAdapter is NEVER
                // wired here => offline-safe => SEND_ADAPTER_NOT_CONFIGURED.
                const _v1SendOut = _v1HandleSend(_v1Send, {
                    isOwner: _v1SendIsOwner === true,
                    draft: _v1KnownDraft,
                    autosend: false,
                });
                await sendTelegram(chatId, (_v1SendOut && _v1SendOut.text) || 'Send: заблокировано.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `v1_send_${_v1Send.action}`, status: (_v1SendOut && _v1SendOut.result && _v1SendOut.result.ok) ? 'routed' : 'send_blocked' });
            } catch (_v1Err) {
                logError({ route: 'v1_send', text, chat_id: chatId, error: _v1Err, scope: 'v1_send_guard' });
                await sendTelegram(chatId, 'Статус: RED\nSend controller завершился ошибкой. Отправка НЕ выполнялась.');
            }
            return;
        }

        // 4) Daily 100 Lead Scout L1 (report-only)
        const _v1Scout = _v1ClassifyScout(originalText);
        if (_v1Scout) {
            if (!isOwnerSender(userId, chatId)) {
                await sendTelegram(chatId, _V1_AUDIT_OWNER_REFUSAL);
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: 'v1_scout_owner_blocked', status: 'owner_gate_blocked' });
                return;
            }
            try {
                // No provider, no rows => L1_REPORT_ONLY_PROVIDER_NOT_CONFIGURED.
                // NO import, NO canonical write, NO send, NO network scraping.
                const _v1ScoutOut = _v1HandleScout(_v1Scout);
                await sendTelegram(chatId, (_v1ScoutOut && _v1ScoutOut.text) || 'Lead Scout: нет результата.');
                logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: `v1_scout_${_v1Scout}`, status: 'routed' });
            } catch (_v1Err) {
                logError({ route: 'v1_scout', text, chat_id: chatId, error: _v1Err, scope: 'v1_scout_guard' });
                await sendTelegram(chatId, 'Статус: RED\nLead Scout L1 завершился ошибкой. Импорт/отправка не выполнялись.');
            }
            return;
        }

        // ---- 1. DLF Direct Commands — priority check ----

        const dlfHandled = await handleDLFCommand(chatId, userId || chatId, text);

        if (dlfHandled) {
            logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: route, status: 'routed' });
            return;
        }

        // ── 2. DIRECT ROUTES: /mail status, /mail health, /mail inbox, /mail drafts ──
        // Registered BEFORE NL-router/fallback. DO NOT MOVE.
        const _cmdParts = text.trim().replace(/^\//, '').split(/\s+/);
        const _cmd = _cmdParts[0]?.toLowerCase() || '';
        const _args = _cmdParts.slice(1);

        if (_cmd === 'mail' || _cmd === 'mail_status') {
            const subCmd = _args.join(' ').toLowerCase().trim() || 'status';
            let mailInfo;
            try {
                mailInfo = (typeof getMailStatus === 'function') ? await getMailStatus() : { status: 'adapter_not_loaded' };
            } catch (_e) {
                mailInfo = { status: 'error', error: String(_e) };
            }
            const conn = mailInfo.status || 'unknown';
            const provider = mailInfo.provider || 'unknown';
            const inboundRead = mailInfo.inbound_read_enabled ? 'enabled' : 'disabled';
            const draftCreate = mailInfo.draft_create_enabled ? 'enabled' : 'disabled';
            const outboundTech = mailInfo.outbound_send_enabled ? 'TECHNICALLY_AVAILABLE' : 'NOT_AVAILABLE';
            const lastCheck = mailInfo.last_mail_event || 'unknown';
            const lastErr = mailInfo.last_mail_error || 'none';

            if (subCmd === 'inbox') {
                const inboxReply = mailInfo.inbox_preview
                    ? `📬 Inbox preview:\n${mailInfo.inbox_preview}`
                    : `📬 Inbox read подключён, но Telegram preview пока не включён\nApproval required: YES`;
                await sendTelegram(chatId, inboxReply);
                return;
            }
            if (subCmd === 'drafts') {
                const draftsReply = mailInfo.drafts_preview
                    ? `📝 Drafts:\n${mailInfo.drafts_preview}`
                    : `📝 Drafts: unavailable\nApproval required: YES`;
                await sendTelegram(chatId, draftsReply);
                return;
            }

            // Default: status / health
            const mailReply = [
                '📮 Mail module status',
                '',
                `Connection: ${conn}`,
                `Provider: ${provider}`,
                `Inbound read: ${inboundRead}`,
                `Draft create: ${draftCreate}`,
                `Outbound send: ${outboundTech}`,
                `Effective send permission: BLOCKED`,
                `Auto-send: BLOCKED`,
                `Last mail check: ${lastCheck}`,
                `Last mail error: ${lastErr}`,
                `Approval required: YES`,
                `Secrets: hidden`,
            ].join('\n');
            await sendTelegram(chatId, mailReply);
            return;
        }
        // ── /debug_last / /debuglast alias ──
        if (_cmd === 'debug_last' || _cmd === 'debuglast') {
            const _state = getState ? getState() : {};
            const _lastN = getLastN ? getLastN(5) : [];
            const _lines = [
                '🐞 Debug: last commands',
                `Last heartbeat: ${_state.last_heartbeat || 'unknown'}`,
                `Polling: ${_state.polling_active ? 'active' : 'unknown'}`,
                `Last error: ${_state.last_error || 'none'}`,
                '',
                'Recent updates:',
                ..._lastN.map((u, i) => `${i+1}. ${u.cmd || u.type || '?'} — ${u.ts || ''}`),
            ];
            await sendTelegram(chatId, _lines.join('\n'));
            return;
        }
        // ── END DIRECT ROUTES ──

        return await handleTextNL(chatId, text, userId, route);
    } catch (e) {
        logError({ route, text, chat_id: chatId, error: e, scope: 'handleText' });
        logUpdate({ update_id: null, chat_id: chatId, user_id: userId, text, detected_route: route, status: 'failed', error_message: e.message });
        try {
            await sendTelegram(chatId, `⚠️ Ошибка обработки команды. Route: ${route}. Событие записано в лог.\n_${(e.message || 'unknown').substring(0,160)}_`);
        } catch (_) {}
        return;
    }
}

// NL-router / fallback chain extracted so we can wrap it in error boundary
async function handleTextNL(chatId, text, userId, route) {
    // (kept here for readability)
    return await handleTextLegacy(chatId, text, userId);
}

async function handleTextLegacy(chatId, text, userId) {
    // ---- 1. DLF check already done by caller ----


    // ---- 1b. Contact intent (safe, no client send) ----
    try {
        const contactIntent = parseContactIntent(text);
        if (contactIntent) {
            const reply = handleContactIntent(contactIntent, { chat_id: chatId, user_id: userId });
            await sendTelegram(chatId, reply);
            appendEvent({
                type: 'contact_intent_handled',
                action: contactIntent.action,
                project_token: contactIntent.project_token,
                chat_id: chatId,
            });
            return;
        }
    } catch (e) {
        logError({ route: 'contact', text, chat_id: chatId, error: e, scope: 'contact_handler' });
        await sendTelegram(chatId, `⚠️ Ошибка обработки команды. Route: contact. Событие записано в лог.\n_${(e.message || 'unknown').substring(0,120)}_`);
        return;
    }

    // ---- 2. NL Router fallback ----
    const routed = routeCommand(text);


    // Save request log
    const requests = readJSON(TG_REQUESTS, []);
    const reqId    = `req_${Date.now()}`;
    const req = {
        request_id: reqId,
        text,
        routed,
        timestamp: new Date().toISOString(),
        status: routed?.recognized ? 'Recognized' : 'Needs Clarification',
    };
    requests.push(req);
    writeJSON(TG_REQUESTS, requests);

    if (!routed) {
        await sendTelegram(chatId, '⚠️ Маршрутизатор не ответил. Попробуйте ещё раз.');
        return;
    }

    // Update gateway state
    updateState({
        last_command:    text,
        last_normalized: routed.normalized_command,
        last_risk:       routed.risk_level,
        last_intent:     routed.intent,
        version:         'v0.7',
    });

    // BLOCKED
    if (routed.blocked) {
        const reply = `🚫 *BLOCKED*\n\nКоманда заблокирована системой безопасности.\nПричина: ${routed.reason}`;
        await sendTelegram(chatId, reply);
        appendEvent({ type: 'command_blocked', text, reason: routed.reason });
        return;
    }

    // NEEDS APPROVAL (Red)
    if (routed.normalized_command === 'NEEDS_APPROVAL') {
        const reply = `🔴 *Needs Approval*\n\nКоманда требует явного одобрения Дмитрия.\nПричина: ${routed.reason}\n\nНе выполнено автоматически.`;
        await sendTelegram(chatId, reply);
        appendEvent({ type: 'command_needs_approval', text, reason: routed.reason });
        return;
    }

    // NOT RECOGNIZED — guaranteed helpful fallback (no silent ignore)
    if (!routed.recognized) {
        const fallback = [
            'Команда не распознана, но получена.',
            '',
            '📌 *Лиды (Mini Audit 10K):*',
            '• /lead_template — шаблон добавления лида',
            '• /lead_add <текст> — добавить лид в REAL CSV',
            '• /lead_status — статус REAL CSV и лидов',
            '• /lead_list — последние 10 лидов',
            '• /lead_run_pipeline — запустить pipeline (approval A3)',
            '',
            '📮 *Почта:*',
            '• /mail status — статус почты',
            '',
            '🧾 *Approval:*',
            '• /approval list — список ожидающих одобрения',
            '',
            '📊 *Основные:*',
            '• /today — сводка',
            '• /newleads — новые лиды',
            '• /ping — проверка связи',
            '• /health — диагностика',
            '• /debug_last — последние команды',
            '• Покажи входящие',
            '',
            `_Причина: ${routed.reason || 'не определено'}_`,
        ].join('\n');
        await sendTelegram(chatId, fallback);
        // Log as unknown_command in updates ring
        try {
            logUpdate({
                update_id:      null,
                chat_id:        chatId,
                user_id:        userId,
                text,
                detected_route: 'unknown_command',
                status:         'fallback_sent',
            });
        } catch (_) {}
        return;
    }


    // RECOGNIZED — show routing acknowledgment
    const ackMsg = [
        `✅ *Понял:* ${routed.intent} / ${routed.project || 'no project'}`,
        `Команда: \`${routed.normalized_command}\``,
        `Риск: ${routed.risk_level}`,
    ].join('\n');
    await sendTelegram(chatId, ackMsg);

    // Execute command based on risk level
    let execResult = null;

    if (routed.risk_level === 'Green') {
        execResult = executeCommand(routed.normalized_command);
    } else if (routed.risk_level === 'Yellow') {
        execResult = executeCommand(routed.normalized_command);
    } else if (routed.risk_level === 'Orange') {
        await sendTelegram(chatId, `🟠 *Orange risk* — команда требует explicit confirmation Дмитрия.\nНе выполнено. Напишите: ПОДТВЕРДИТЬ [команду]`);
        appendEvent({ type: 'orange_requires_confirmation', command: routed.normalized_command });
        return;
    } else if (routed.risk_level === 'Red') {
        await sendTelegram(chatId, `🔴 *Red risk* — требуется approval. Команда добавлена в очередь одобрения.`);
        appendEvent({ type: 'red_needs_approval', command: routed.normalized_command });
        return;
    }

    if (!execResult) {
        await sendTelegram(chatId, `⚠️ Команда маршрутизирована, но выполнение не удалось.`);
        return;
    }

    // Save execution result
    const results = readJSON(TG_RESULTS, []);
    results.push({
        request_id: reqId,
        command:    routed.normalized_command,
        result:     execResult,
        timestamp:  new Date().toISOString(),
    });
    writeJSON(TG_RESULTS, results);

    // Send result to Telegram
    if (execResult.preview && routed.reply_preview_required) {
        const preview = buildDraftPreview(execResult);
        if (preview) await sendTelegram(chatId, preview);
    } else {
        const msg = execResult.message || JSON.stringify(execResult).substring(0, 800);
        await sendTelegram(chatId, msg);
    }

    appendEvent({
        type:       'command_executed',
        text,
        normalized: routed.normalized_command,
        risk:       routed.risk_level,
        success:    execResult.success,
    });
}

// ============================================================
// HANDLE VOICE
// ============================================================
const VOICE_TRANSCRIPTION_TIMEOUT_SEC = 60;

async function handleVoice(chatId, fileId, fileName) {
    const voiceTs = new Date().toISOString();

    // Step 1: immediate acknowledgement
    await sendTelegram(chatId, `🎙 Голос получен. Запускаю транскрибацию...`);

    // Step 2: record to voice_inbox
    const inbox = readJSON(VOICE_INBOX, []);
    const entry = {
        id:          `voice_${Date.now()}`,
        file_id:     fileId,
        file_name:   fileName || `voice_${Date.now()}.ogg`,
        received_at: voiceTs,
        status:      'received',
        transcript:  null,
    };
    inbox.push(entry);
    writeJSON(VOICE_INBOX, inbox);
    logUpdate({ update_id: null, chat_id: chatId, user_id: null, text: `[voice:${entry.id}]`, detected_route: 'voice_handler', status: 'update_received' });

    // Step 3: check if transcriber script exists
    if (!fs.existsSync(TRANSCRIBE)) {
        const msg = '⚠️ Транскрибация пока не настроена. Голосовое сообщение получено, но не обработано. Используй текстовую команду.';
        await sendTelegram(chatId, msg);
        entry.status = 'transcription_not_configured';
        writeJSON(VOICE_INBOX, inbox);
        appendTelegramError('voice_handler', new Error('transcribe_voice.mjs not found'));
        writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'transcription_not_configured', last_route: 'voice_handler', last_update_type: 'voice' });
        appendEvent({ type: 'voice_transcription_unavailable', voice_id: entry.id, reason: 'TRANSCRIBE script not found' });
        return;
    }

    // Step 4: run transcription with 60s timeout
    const audioPath = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'voice', entry.file_name);
    let r;
    try {
        r = spawnSync('node', [TRANSCRIBE, audioPath], {
            encoding:    'utf-8',
            timeout:     VOICE_TRANSCRIPTION_TIMEOUT_SEC * 1000,
            windowsHide: true,
        });
    } catch (spawnErr) {
        // spawnSync itself threw — treat as error
        const errMsg = spawnErr.message || 'spawnSync error';
        entry.status = 'failed';
        writeJSON(VOICE_INBOX, inbox);
        appendTelegramError('voice_handler', spawnErr);
        writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'error', last_voice_error: errMsg, last_route: 'voice_handler', last_update_type: 'voice' });
        await sendTelegram(chatId, `⚠️ Ошибка транскрибации. Событие записано в лог.`);
        return;
    }

    // Step 5: detect timeout (signal = SIGTERM or error = ETIMEDOUT/TIMEOUT)
    const isTimeout = (r.signal === 'SIGTERM') || (r.error && (r.error.code === 'ETIMEDOUT' || r.error.code === 'TIMEOUT'));
    if (isTimeout) {
        entry.status = 'timeout';
        writeJSON(VOICE_INBOX, inbox);
        appendTelegramError('voice_handler', new Error('voice_transcription_timeout'));
        writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'timeout', last_route: 'voice_handler', last_update_type: 'voice' });
        appendEvent({ type: 'voice_transcription_timeout', voice_id: entry.id, timeout_sec: VOICE_TRANSCRIPTION_TIMEOUT_SEC });
        await sendTelegram(chatId, `⏱ Транскрибация не завершилась за ${VOICE_TRANSCRIPTION_TIMEOUT_SEC} сек. Событие записано в лог.`);
        return;
    }

    // Step 6: parse transcription result
    let transcribeResult = null;
    if (r.stdout) {
        try { transcribeResult = JSON.parse(r.stdout); } catch (_) {}
    }

    // Step 7: not configured / ENOENT
    if (!transcribeResult || transcribeResult.status === 'transcription_not_configured' || (r.error && r.error.code === 'ENOENT')) {
        const msg = '⚠️ Транскрибация пока не настроена. Голосовое сообщение получено, но не обработано. Используй текстовую команду.';
        await sendTelegram(chatId, msg);
        entry.status = 'transcription_not_configured';
        writeJSON(VOICE_INBOX, inbox);
        writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'transcription_not_configured', last_route: 'voice_handler', last_update_type: 'voice' });
        appendEvent({ type: 'voice_transcription_unavailable', voice_id: entry.id, reason: 'not_configured' });
        return;
    }

    // Step 8: failed
    if (transcribeResult.status === 'failed') {
        const safeReason = (transcribeResult.notes || 'unknown error').replace(/D:\\|C:\\/g, '[path]');
        entry.status = 'failed';
        writeJSON(VOICE_INBOX, inbox);
        appendTelegramError('voice_handler', new Error(safeReason));
        writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'failed', last_voice_error: safeReason, last_route: 'voice_handler', last_update_type: 'voice' });
        await sendTelegram(chatId, [
            '🎙 Голос получил, но транскрибация сейчас недоступна.',
            'Напиши текстом или используй команды:',
            ' /lead_template',
            ' /lead_status',
            ' /today',
            ' /health',
        ].join('\n'));
        appendEvent({ type: 'voice_transcription_failed', voice_id: entry.id, reason: safeReason });
        return;
    }

    // Step 9: success
    if (transcribeResult.status === 'ok') {
        const transcript = transcribeResult.text || '';
        entry.status     = 'transcribed';
        entry.transcript = transcript;
        writeJSON(VOICE_INBOX, inbox);

        const transcripts = readJSON(VOICE_TRANSCRIPTS, []);
        transcripts.push({
            voice_id:        entry.id,
            text:            transcript,
            transcript_path: transcribeResult.transcript_path,
            timestamp:       new Date().toISOString(),
        });
        writeJSON(VOICE_TRANSCRIPTS, transcripts);

        writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'transcribed', last_route: 'voice_handler', last_update_type: 'voice' });
        appendEvent({ type: 'voice_transcribed', voice_id: entry.id, text_preview: transcript.substring(0, 100) });

        const routed  = routeCommand(transcript);
        let routeInfo = `\nКоманда: не распознана`;
        if (routed?.normalized_command) {
            routeInfo = `\nКоманда: \`${routed.normalized_command}\`\nРиск: ${routed.risk_level}`;
        }

        await sendTelegram(chatId, `🎙 *Голос распознан:*\n"${transcript}"${routeInfo}`);

        if (transcript) {
            await handleText(chatId, transcript);
        }
        return;
    }

    // Step 10: unknown result — must not hang silently
    entry.status = 'unknown_result';
    writeJSON(VOICE_INBOX, inbox);
    appendTelegramError('voice_handler', new Error(`unknown transcribeResult status: ${transcribeResult?.status}`));
    writeHeartbeat({ last_voice_at: voiceTs, last_voice_status: 'unknown_result', last_route: 'voice_handler', last_update_type: 'voice' });
    await sendTelegram(chatId, [
        '🎙 Голос получил, но транскрибация сейчас недоступна.',
        'Напиши текстом или используй команды:',
        ' /lead_template',
        ' /lead_status',
        ' /today',
        ' /health',
    ].join('\n'));
    appendEvent({ type: 'voice_transcription_unknown_result', voice_id: entry.id });
}

// ============================================================
// SELF-TEST
// ============================================================
async function runSelfTest() {
    console.log('=== telegram_master_bot SELF-TEST v0.7 ===\n');

    const tests = [
        { input: 'Завод АТОМ: подготовить follow-up',   expect_norm: '/followup ATOM draft' },
        { input: 'АТОМ подготовить фоллоуап',            expect_norm: '/followup ATOM draft' },
        { input: 'подготовь follow-up по заводу атом',   expect_norm: '/followup ATOM draft' },
        { input: 'ГСК подготовить первое сообщение',     expect_norm: '/lead GSK first_message draft' },
        { input: 'КЖБИ статус',                          expect_norm: '/status KGBI' },
        { input: 'EDERA что дальше',                     expect_norm: '/status EDERA' },
        { input: 'отчёт по деньгам',                     expect_norm: '/report money' },
        { input: 'обнови дашборд',                       expect_norm: '/execute dashboard' },
        { input: 'покажи входящие',                      expect_norm: '/inbox' },
        { input: 'черновики ответов',                    expect_norm: '/reply drafts' },
        { input: 'выполни следующее действие',           expect_norm: '/execute next' },
        { input: 'отправь письмо клиенту',               expect_norm: 'NEEDS_APPROVAL' },
        { input: 'удали файл',                           expect_norm: 'BLOCKED' },
        { input: 'Завод АТОМ подготовить follow-up',     expect_norm: '/followup ATOM draft' },
    ];

    let passed = 0, failed = 0;
    const reportLines = [
        `# Telegram Master Bot Self-Test Report`,
        ``,
        `Date: ${new Date().toISOString()}`,
        `Version: v0.7`,
        ``,
        `## NL Router Tests`,
        ``,
    ];

    for (const t of tests) {
        const routed = routeCommand(t.input);
        const norm   = routed?.normalized_command || '';
        const ok     = norm === t.expect_norm;
        if (ok) passed++; else failed++;
        const icon = ok ? '✅' : '❌';
        console.log(`  ${icon} "${t.input}" → "${norm}" (expected: "${t.expect_norm}")`);
        reportLines.push(`- ${icon} \`${t.input}\` → \`${norm}\``);
    }

    // Test: /followup ATOM draft creates draft
    console.log('\n  [Testing /followup ATOM draft...]');
    const cmdResult  = executeCommand('/followup ATOM draft');
    const draftCreated = cmdResult?.action === 'draft_created' && cmdResult?.draft_id;
    const draftExists  = (() => { const d = readJSON(OUTBOUND_DRAFTS, []); return d.some(x => x.project === 'ATOM'); })();
    const noClientSend = !cmdResult?.sent_to_client;
    console.log(`  ${draftCreated ? '✅' : '❌'} draft_created: ${!!draftCreated}`);
    console.log(`  ${draftExists  ? '✅' : '❌'} outbound_drafts.json has ATOM: ${draftExists}`);
    console.log(`  ${noClientSend ? '✅' : '❌'} no client send: ${noClientSend}`);

    // Test: DLF data files
    console.log('\n  [Testing Daily Lead Factory data files...]');
    const report       = readJSON(DLF_REPORT, null);
    const reportExists = report !== null;
    const reportValid  = report && 'summary' in report && 'emergency_stop' in report;
    const csvExists    = fs.existsSync(DLF_LEADS_CSV);
    let csvLeads = [];
    if (csvExists) {
        try { csvLeads = parseCSV(fs.readFileSync(DLF_LEADS_CSV, 'utf-8')); } catch (_) {}
    }
    const eventsExists = fs.existsSync(DLF_EVENTS);
    console.log(`  ${reportExists ? '✅' : '❌'} daily_report.json exists`);
    console.log(`  ${reportValid  ? '✅' : '❌'} daily_report.json has required fields`);
    console.log(`  ${csvExists    ? '✅' : '❌'} leads_test.csv exists`);
    console.log(`  ${csvLeads.length > 0 ? '✅' : '❌'} leads_test.csv has ${csvLeads.length} leads`);
    console.log(`  ${eventsExists ? '✅' : '❌'} events_log.json exists`);

    reportLines.push(``, `## Command Execution Tests`, ``);
    reportLines.push(`- ${draftCreated ? '✅' : '❌'} /followup ATOM draft → draft_created`);
    reportLines.push(`- ${draftExists  ? '✅' : '❌'} outbound_drafts.json has ATOM entry`);
    reportLines.push(`- ${noClientSend ? '✅' : '❌'} No client send happened`);

    reportLines.push(``, `## Daily Lead Factory Tests`, ``);
    reportLines.push(`- ${reportExists        ? '✅' : '❌'} daily_report.json exists`);
    reportLines.push(`- ${reportValid         ? '✅' : '❌'} daily_report.json has required fields`);
    reportLines.push(`- ${csvExists           ? '✅' : '❌'} leads_test.csv exists`);
    reportLines.push(`- ${csvLeads.length > 0 ? '✅' : '❌'} leads_test.csv has ${csvLeads.length} leads`);
    reportLines.push(`- ${eventsExists        ? '✅' : '❌'} events_log.json exists`);

    if (draftCreated)        passed++; else failed++;
    if (draftExists)         passed++; else failed++;
    if (noClientSend)        passed++; else failed++;
    if (reportExists)        passed++; else failed++;
    if (reportValid)         passed++; else failed++;
    if (csvExists)           passed++; else failed++;
    if (csvLeads.length > 0) passed++; else failed++;
    if (eventsExists)        passed++; else failed++;

    const total = tests.length + 8;
    console.log(`\nResult: ${passed}/${total} passed, ${failed} failed`);

    reportLines.push(``, `## Summary`, ``);
    reportLines.push(`Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);
    reportLines.push(`Status: ${failed === 0 ? '✅ ALL PASS' : '⚠️ SOME FAILED'}`);

    const reportPath = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'telegram_command_center_test_report.md');
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
    console.log(`\nReport: ${reportPath}`);

    process.exit(failed > 0 ? 1 : 0);
}

// ============================================================
// POLLING LOOP — ONE loop, ONE token, ONE process
// Sequential async loop — prevents overlapping getUpdates → no 409 from self
// ============================================================
let lastUpdateId = 0;
let pollingActive = true;   // set to false on fatal errors to stop the loop
let pollIntervalId = null;  // kept for legacy compat (clearInterval no-op in async mode)
let BOT_USERNAME   = '(unknown)'; // populated at startup via getMe

// ---- 409 Conflict hard-stop handler ----
function handle409Conflict() {
    if (!pollingActive) return; // already handled
    pollingActive = false;

    // Stop the polling interval immediately — NO more spam
    if (pollIntervalId) { clearInterval(pollIntervalId); pollIntervalId = null; }

    const errMsg = '409 Conflict: another polling process or webhook is active.';
    botLog('ERROR', errMsg);

    // Write to telegram_errors.log
    try {
        const errLogPath = path.join(__dirname, 'logs', 'telegram_errors.log');
        const ts = new Date().toISOString();
        fs.appendFileSync(errLogPath,
            `[${ts}] 409 Conflict: another polling process or webhook is active.\n`);
    } catch (_) {}

    // Update heartbeat — mark conflict
    try {
        updateState({
            status:         'conflict_409',
            polling:        false,
            last_error_at:  new Date().toISOString(),
            last_error:     '409 Conflict: another polling process or webhook is active.',
        });
    } catch (_) {}

    // Mark lock as conflict (don't delete — leave it as a signal, stop_master_bot handles it)
    try {
        const lockFile = path.join(__dirname, '.telegram_master_bot.lock');
        if (fs.existsSync(lockFile)) {
            fs.writeFileSync(lockFile,
                JSON.stringify({ conflict: true, pid: process.pid, at: new Date().toISOString() }));
        }
    } catch (_) {}

    // Single clear console message — print once and exit
    console.error('\x1b[31m');
    console.error('════════════════════════════════════════════════════════════');
    console.error(' 409 Conflict: another polling process or webhook is active.');
    console.error('');
    console.error(' Fix steps:');
    console.error('   1. powershell -ExecutionPolicy Bypass -File .\\stop_master_bot.ps1 -Deep');
    console.error('   2. node .\\telegram_api_diagnostics.mjs');
    console.error('   3. If webhook active: node .\\telegram_api_diagnostics.mjs --delete-webhook');
    console.error('   4. powershell -ExecutionPolicy Bypass -File .\\start_master_bot.ps1');
    console.error('════════════════════════════════════════════════════════════');
    console.error('\x1b[0m');

    removeLock();
    process.exit(1);
}

async function poll() {
    try {
        const res = await tgRequest('getUpdates', {
            offset:          lastUpdateId + 1,
            timeout:         30,
            allowed_updates: ['message', 'callback_query'],   // ← added callback_query
        });

        if (!res.ok) {
            const code = res.error_code || res.errorCode;
            const desc = res.description || res.raw || 'unknown';
            markPollingError(`getUpdates not ok: ${desc}`);
            logError({ route: 'polling', text: '', chat_id: null, error: { name: 'PollingError', message: desc }, scope: 'polling' });
            if (String(code) === '409' || /Conflict/i.test(desc)) {
                // HARD STOP — do not spam, exit cleanly
                handle409Conflict();
                return;
            }
            return;
        }
        markPollingOk();

        if (!Array.isArray(res.result)) return;


        for (const update of res.result) {
            lastUpdateId = update.update_id;

            // ---- Handle inline button presses ----
            if (update.callback_query) {
                const cq       = update.callback_query;
                const cqChatId = cq.message?.chat?.id?.toString();
                // patch 2026-05-27: normalize both sides to String to avoid Number vs String strict mismatch
                const _normalizedCqChatId      = cqChatId ? String(cqChatId).trim() : '';
                const _normalizedAllowedChatId = CHAT_ID ? String(CHAT_ID).trim() : '';
                if (_normalizedAllowedChatId && _normalizedCqChatId && _normalizedCqChatId !== _normalizedAllowedChatId) {
                    botLog('WARN', `blocked_callback_chat_id_mismatch chat_last4=${_normalizedCqChatId.slice(-4)} allowed_last4=${_normalizedAllowedChatId.slice(-4)}`);
                    continue;
                }
                await handleCallbackQuery(cq);
                continue;
            }

            // ---- Handle text / voice messages ----
            const msg = update.message;
            if (!msg) continue;

            const chatId = msg.chat?.id?.toString();
            if (!chatId) continue;

            // Security: only respond to admin chat
            // patch 2026-05-27: normalize both sides to String.trim() — prevents Number vs String strict !== mismatch
            const normalizedChatId      = String(chatId).trim();
            const normalizedAllowedChatId = CHAT_ID ? String(CHAT_ID).trim() : '';
            if (normalizedAllowedChatId && normalizedChatId !== normalizedAllowedChatId) {
                botLog('WARN', `blocked_chat_id_mismatch chat_last4=${normalizedChatId.slice(-4)} allowed_last4=${normalizedAllowedChatId.slice(-4)}`);
                continue;
            }

            const userId = msg.from?.id?.toString();

            if (msg.text) {
                writeHeartbeat({ last_update_type: 'text', last_route: detectRoute(msg.text), polling: true });
                await handleText(chatId, msg.text, userId);
            } else if (msg.voice || msg.audio) {
                writeHeartbeat({ last_update_type: 'voice', polling: true });
                const voiceData = msg.voice || msg.audio;
                await handleVoice(chatId, voiceData.file_id, `voice_${Date.now()}.ogg`);
            } else if (msg.document && msg.document.mime_type && msg.document.mime_type.includes('audio')) {
                // Audio document — treat as voice
                writeHeartbeat({ last_update_type: 'voice', polling: true });
                await handleVoice(chatId, msg.document.file_id, msg.document.file_name || `voice_${Date.now()}.ogg`);
            } else if (msg.document || msg.photo || msg.video || msg.video_note) {
                // ---- FILE VAULT intake (document / photo / video) ----
                // Owner-gated: download → safe _incoming → metadata → classify →
                // inline approval buttons. NO external send, NO deletion, NO overwrite.
                writeHeartbeat({ last_update_type: 'file', polling: true });
                if (!isOwnerSender(userId, chatId)) {
                    await sendTelegram(chatId, '⛔ File Vault доступен только владельцу.');
                    logUpdate({ update_id: lastUpdateId, chat_id: chatId, user_id: userId, text: '[file]', detected_route: 'file_vault_intake_owner_blocked', status: 'owner_gate_blocked' });
                } else {
                    try {
                        const fvOut = await fileVault.intakeAttachment({ msg, deps: buildFileVaultDeps() });
                        logUpdate({ update_id: lastUpdateId, chat_id: chatId, user_id: userId, text: '[file]', detected_route: `file_vault_intake_${fvOut && fvOut.status || 'unknown'}`, status: (fvOut && fvOut.ok) ? 'routed' : 'noop' });
                    } catch (fvErr) {
                        logError({ route: 'file_vault_intake', text: '[file]', chat_id: chatId, error: fvErr, scope: 'file_vault_intake_guard' });
                        await sendTelegram(chatId, 'Статус: RED\nНе удалось принять файл в File Vault. Ничего не удалено, ничего не отправлено.');
                    }
                }
            } else {

                // Empty or unknown message type — must not hang silently
                writeHeartbeat({ last_update_type: 'unknown', polling: true });
                logUpdate({ update_id: lastUpdateId, chat_id: chatId, user_id: userId, text: '[empty/unknown]', detected_route: 'empty_fallback', status: 'fallback_sent' });
                await sendTelegram(chatId, 'Пустая команда. Напиши /start или /ping.');
            }
        }
    } catch (err) {
        markPollingError(err.message);
        logError({ route: 'polling', text: '', chat_id: null, error: err, scope: 'polling_catch' });
        console.error('[poll error]', err.message);
    }
}


// ============================================================
// MAIN
// ============================================================
const selfTestMode = process.argv.includes('--self-test');
const sendTestMode = process.argv.includes('--send-test');

if (selfTestMode) {
    runSelfTest().catch(console.error);
} else if (sendTestMode) {
    // Quick connectivity test
    if (!BOT_TOKEN) {
        console.log('No BOT_TOKEN — skip send test');
        process.exit(0);
    }
    const res = await tgRequest('getMe', {});
    console.log('Bot info:', JSON.stringify(res.result || res));
    process.exit(0);
} else {
    // Normal polling mode
    botLog('INFO', `=== Telegram Master Controller v0.7 STARTUP ===`);
    botLog('INFO', `Script:     ${__filename}`);
    botLog('INFO', `Workspace:  ${WORKSPACE}`);
    botLog('INFO', `PID:        ${process.pid}`);
    botLog('INFO', `Node:       ${process.version}`);
    botLog('INFO', `.env found: ${fs.existsSync(path.join(__dirname, '.env'))}`);
    botLog('INFO', `DLF report: ${fs.existsSync(DLF_REPORT)}`);
    botLog('INFO', `DLF leads:  ${fs.existsSync(DLF_LEADS_CSV)}`);

    if (!BOT_TOKEN) {
        botLog('ERROR', 'Нет TELEGRAM_BOT_TOKEN. Создай .env рядом с telegram_master_bot.mjs');
        botLog('ERROR', `Путь до .env: ${path.join(__dirname, '.env')}`);
        botLog('ERROR', `Пример:       скопируй .env.example -> .env и вставь токен от BotFather`);
        console.error('\n⛔ Бот не может запуститься без токена.');
        console.error(`   Создай файл: ${path.join(__dirname, '.env')}`);
        console.error('   Содержимое: TELEGRAM_BOT_TOKEN=123456:ABC...');
        process.exit(1);
    }

    // Lock file — prevent duplicate instances
    checkAndCreateLock();

    // Cleanup lock on shutdown
    process.on('SIGINT',  () => { botLog('INFO', 'Shutdown: SIGINT');  removeLock(); process.exit(0); });
    process.on('SIGTERM', () => { botLog('INFO', 'Shutdown: SIGTERM'); removeLock(); process.exit(0); });
    process.on('exit', removeLock);

    // Global error catchers — do not silently die
    process.on('uncaughtException', (err) => {
        botLog('ERROR', `uncaughtException: ${err.message}`);
        try { logError({ route: 'process', text: '', chat_id: null, error: err, scope: 'uncaughtException' }); } catch (_) {}
    });
    process.on('unhandledRejection', (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        botLog('ERROR', `unhandledRejection: ${err.message}`);
        try { logError({ route: 'process', text: '', chat_id: null, error: err, scope: 'unhandledRejection' }); } catch (_) {}
    });

    // Heartbeat — every 30 sec
    startHeartbeatTimer(30000);
    botLog('INFO', 'Heartbeat timer started (30s interval).');


    botLog('INFO', 'Daily Lead Factory integration loaded.');
    // patch 2026-05-27: list includes Phase 1 sales commands explicitly
    botLog('INFO', 'Commands: /ping /start /status /health /today /newleads /emergency_stop');
    botLog('INFO', 'Phase1 commands: /sales_today /followups /replies /lead_status');
    botLog('INFO', 'Safety: auto_send_to_clients = BLOCKED');
    botLog('INFO', 'Polling started (sequential async loop — no overlap, no 409 from self)');
    console.log('[Telegram Command Center v0.7] Starting polling...');
    console.log('[DLF] Daily Lead Factory integration loaded.');
    console.log('[DLF] Commands: /ping /start /status /health /today /newleads /emergency_stop');
    console.log('[DLF] Phase1 commands: /sales_today /followups /replies /lead_status');
    console.log('[DLF] Safety: auto-send to clients = BLOCKED');
    updateState({ status: 'running', version: 'v0.7', started_at: new Date().toISOString() });

    // Populate BOT_USERNAME via getMe (non-fatal: only needed for /ping display)
    try {
        const meRes = await tgRequest('getMe', {});
        if (meRes.ok && meRes.result && meRes.result.username) {
            BOT_USERNAME = meRes.result.username;
            botLog('INFO', `Bot username: @${BOT_USERNAME}`);
        } else {
            botLog('WARN', `getMe failed or no username: ${JSON.stringify(meRes).substring(0, 200)}`);
        }
    } catch (e) {
        botLog('WARN', `getMe error (non-fatal): ${e.message}`);
    }

    // Sequential async polling loop.
    // CRITICAL: Do NOT use setInterval here — it causes concurrent getUpdates
    // which makes Telegram return 409 Conflict when timeout > interval.
    // Instead: await poll() then schedule next iteration only after previous completes.
    async function startPolling() {
        while (pollingActive) {
            await poll();
            if (!pollingActive) break;
            // Small pause between sequential polls (not needed for long-polling
            // but prevents tight spin if getUpdates returns immediately due to an error)
            await new Promise(r => setTimeout(r, 100));
        }
        botLog('INFO', 'Polling loop exited (pollingActive=false).');
    }
    startPolling().catch(err => {
        botLog('ERROR', `Polling loop crashed: ${err.message}`);
        try { logError({ route: 'polling', text: '', chat_id: null, error: err, scope: 'startPolling' }); } catch (_) {}
        process.exit(1);
    });
}
