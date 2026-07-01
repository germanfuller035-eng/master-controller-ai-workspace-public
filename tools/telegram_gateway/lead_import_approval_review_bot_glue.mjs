/**
 * lead_import_approval_review_bot_glue.mjs
 *
 * Daily Lead Factory — D2D — Standalone Bot-Glue Adapter for the
 * Lead Import Approval Review module.
 *
 * Purpose:
 *   A STANDALONE "bot-glue" adapter that prepares the D2D read-only review
 *   module (lead_import_approval_review.mjs) for a FUTURE live Telegram bot
 *   integration. It sits BETWEEN a Telegram bot (telegram_master_bot.mjs) and
 *   the already-approved D2D review module.
 *
 *   This adapter does NOT call the Telegram API. It is a pure glue layer:
 *     - it decides whether an incoming text belongs to the import-approval
 *       review domain (shouldRouteToImportApprovalReview),
 *     - it parses the text into an action + import_id (parseImportApprovalCommand),
 *     - it routes the action via the D2D review module
 *       (handleImportApprovalReviewBotMessage),
 *     - it formats the review result into a short, human-readable reply string
 *       (formatImportApprovalReviewForTelegram).
 *
 *   The returned object is something telegram_master_bot.mjs could LATER send.
 *   This module itself never sends anything and is NOT wired into the live bot.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - The adapter NEVER writes data. It only delegates to the D2D review module.
 *   - The adapter NEVER writes / creates the approval queue file. queue_write=NO.
 *   - The adapter NEVER executes a real import. real_import is ALWAYS BLOCKED.
 *   - The adapter NEVER calls the Telegram API. No live bot. No bot token.
 *   - The adapter NEVER sends email / Telegram / WhatsApp / MAX / SMS.
 *   - The adapter NEVER reads .env / AI_SECRETS / tokens / credentials.
 *   - No network. No HTTP/fetch. No SMTP. No site scanning.
 *   - auto_send is ALWAYS BLOCKED. client_contact is ALWAYS BLOCKED.
 *   - confirm=true is NOT honoured — there is no confirm path at all.
 *   - This module is NOT patched into telegram_master_bot.mjs.
 *
 * Queue rules (inherited from the review module):
 *   - queuePath must be passed explicitly via options.queuePath.
 *   - Missing queuePath -> FAIL_QUEUE_PATH_REQUIRED.
 *   - Missing file -> EMPTY_NO_FILE (the file is NOT created).
 *
 * Exports:
 *   - getImportApprovalReviewBotGlueVersion
 *   - shouldRouteToImportApprovalReview
 *   - parseImportApprovalCommand
 *   - handleImportApprovalReviewBotMessage
 *   - formatImportApprovalReviewForTelegram
 *   - buildImportApprovalReviewBotSummary
 */

'use strict';

import {
  getLeadImportApprovalReviewVersion,
  handleLeadImportApprovalReviewCommand,
} from './lead_import_approval_review.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLUE_VERSION = 'lead-import-approval-review-bot-glue-d2d-v1';

// The single, frozen safety contract surfaced by every glue response.
// The adapter never writes data, never writes the queue, never sends, never
// executes a real import, never calls the Telegram API.
const SAFETY = Object.freeze({
  real_import: 'BLOCKED',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  external_send: 'NO',
  email_send: 'BLOCKED',
  telegram_send: 'BLOCKED',
  telegram_api_called: 'NO',
  whatsapp_send: 'BLOCKED',
  max_send: 'BLOCKED',
  network_used: 'NO',
  smtp_used: 'NO',
  writes_data: 'NO',
  queue_write: 'NO',
  env_secrets: 'NO',
  confirm_allowed: 'NO',
  bot_integration: 'NOT_CONNECTED',
});

// Direct slash commands that belong to the D2D review domain.
const TRIGGER_COMMANDS = Object.freeze([
  '/lead_import_review',
  '/lead_import_approve',
  '/lead_import_reject',
]);

// Natural-language phrases (Russian) that must route to D2D review.
// Order matters for parsing: more specific APPROVE/REJECT phrases checked first.
const REVIEW_PHRASES = Object.freeze([
  'очередь импорта',
  'что на одобрение',
  'показать заявки на импорт',
  'заявки на импорт',
]);

const APPROVE_PHRASE = 'одобрить импорт';
const REJECT_PHRASE = 'отклонить импорт';

const SUPPORTED_ACTIONS = Object.freeze(['review', 'list', 'approve', 'reject']);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function normalize(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the bot-glue module version identifier.
 */
export function getImportApprovalReviewBotGlueVersion() {
  return GLUE_VERSION;
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

/**
 * Decide whether an incoming bot text belongs to the D2D import-approval review
 * domain. Cheap, read-only classifier — never routes or executes anything.
 *
 * Returns true for:
 *   - the three /lead_import_review|approve|reject slash commands
 *   - the Russian review / approve / reject phrases
 * Returns false for:
 *   - empty / non-string text
 *   - any other slash command (incl. D1 lead-intake / generic bot commands)
 *   - anything else not recognised as D2D review
 *
 * @param {string} text
 * @returns {boolean}
 */
export function shouldRouteToImportApprovalReview(text) {
  const normalized = normalize(text);
  if (normalized === '') return false;

  // Leading slash command? Match on the command token only.
  if (normalized.startsWith('/')) {
    const token = normalized.split(/\s/)[0].split('@')[0];
    return TRIGGER_COMMANDS.includes(token);
  }

  // Natural-language phrases (substring match on normalized text).
  if (normalized.includes(APPROVE_PHRASE)) return true;
  if (normalized.includes(REJECT_PHRASE)) return true;
  for (const phrase of REVIEW_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Command parsing (pure)
// ---------------------------------------------------------------------------

/**
 * Parse an incoming bot text into a { action, importId } pair for the D2D
 * review module. PURE — no IO. Deterministic alias resolution:
 *   - APPROVE / REJECT phrases (and their slash commands) take precedence over
 *     plain REVIEW phrases, so "одобрить импорт <id>" never becomes a review.
 *
 * @param {string} text
 * @returns {{ inDomain: boolean, action: string|null, importId: string|null }}
 */
export function parseImportApprovalCommand(text) {
  if (!shouldRouteToImportApprovalReview(text)) {
    return { inDomain: false, action: null, importId: null };
  }

  const raw = typeof text === 'string' ? text.trim() : '';
  const normalized = normalize(raw);

  // --- Slash commands ----------------------------------------------------
  if (normalized.startsWith('/')) {
    const token = normalized.split(/\s/)[0].split('@')[0];
    // The argument (import_id) is taken from the ORIGINAL text to preserve case.
    const argMatch = raw.replace(/^\/\S+\s*/, '').trim();
    const importId = isNonEmptyString(argMatch) ? argMatch.split(/\s+/)[0] : null;

    if (token === '/lead_import_review') {
      return { inDomain: true, action: 'review', importId: null };
    }
    if (token === '/lead_import_approve') {
      return { inDomain: true, action: 'approve', importId };
    }
    if (token === '/lead_import_reject') {
      return { inDomain: true, action: 'reject', importId };
    }
    // Defensive: shouldRoute returned true but token unknown -> treat as review.
    return { inDomain: true, action: 'review', importId: null };
  }

  // --- Russian natural-language phrases ----------------------------------
  // APPROVE / REJECT first (more specific).
  if (normalized.includes(APPROVE_PHRASE)) {
    return {
      inDomain: true,
      action: 'approve',
      importId: extractIdAfterPhrase(raw, APPROVE_PHRASE),
    };
  }
  if (normalized.includes(REJECT_PHRASE)) {
    return {
      inDomain: true,
      action: 'reject',
      importId: extractIdAfterPhrase(raw, REJECT_PHRASE),
    };
  }
  // Otherwise it's a plain review request.
  return { inDomain: true, action: 'review', importId: null };
}

/**
 * Extract the first token following a Russian phrase as the import_id,
 * case-preserved from the original text.
 * @param {string} rawText
 * @param {string} phrase  lowercase phrase
 * @returns {string|null}
 */
function extractIdAfterPhrase(rawText, phrase) {
  const lower = rawText.toLowerCase();
  const idx = lower.indexOf(phrase);
  if (idx === -1) return null;
  const after = rawText.slice(idx + phrase.length).trim();
  if (!isNonEmptyString(after)) return null;
  return after.split(/\s+/)[0];
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

/**
 * Handle an incoming bot message by parsing it and delegating to the D2D review
 * module. This adapter NEVER calls the Telegram API; it only returns an object
 * a bot could later send.
 *
 *   - Not in the review domain -> handled:false (guard returns false in bot).
 *   - review/list -> requires options.queuePath (FAIL_QUEUE_PATH_REQUIRED if absent).
 *   - approve/reject -> requires import_id (FAIL_IMPORT_ID_REQUIRED if absent).
 *
 * @param {string} text
 * @param {{ queuePath?: string, reason?: string }} [options]
 * @returns {Promise<{
 *   handled: boolean,
 *   text: string,
 *   action: string|null,
 *   status: string|null,
 *   safety: object,
 *   raw: object|null
 * }>}
 */
export async function handleImportApprovalReviewBotMessage(text, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const parsed = parseImportApprovalCommand(text);

  // Not a D2D review message: do not route, report unhandled.
  if (!parsed.inDomain) {
    return {
      handled: false,
      text: '',
      action: null,
      status: 'NOT_IN_DOMAIN',
      safety: { ...SAFETY },
      raw: null,
    };
  }

  let result;
  try {
    result = await handleLeadImportApprovalReviewCommand(parsed.action, {
      queuePath: opts.queuePath,
      importId: parsed.importId,
      reason: opts.reason,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return {
      handled: true,
      text: `⚠️ Approval-review error: ${msg}`,
      action: parsed.action,
      status: 'ERROR',
      safety: { ...SAFETY },
      raw: { error: msg },
    };
  }

  const r = isPlainObject(result) ? result : {};

  return {
    handled: true,
    text: formatImportApprovalReviewForTelegram(r),
    action: parsed.action,
    status: r.status || null,
    safety: { ...SAFETY },
    raw: r,
  };
}

// ---------------------------------------------------------------------------
// Formatting (bot-ready text)
// ---------------------------------------------------------------------------

/**
 * Turn a D2D review-module result into a short, human-readable Telegram reply
 * string. Plain text only — the adapter does not send it anywhere.
 *
 * @param {object} result  object returned by handleLeadImportApprovalReviewCommand
 * @returns {string}
 */
export function formatImportApprovalReviewForTelegram(result) {
  const r = isPlainObject(result) ? result : {};
  const status = r.status || 'ERROR';

  switch (status) {
    // --- review / list summaries -----------------------------------------
    case 'LOADED':
    case 'EMPTY_NO_FILE': {
      const pending = Array.isArray(r.pending) ? r.pending : [];
      const lines = [
        '📋 Очередь импорта (read-only review):',
        `• PENDING заявок: ${r.pending_count != null ? r.pending_count : pending.length}`,
        `• пропущено (invalid): ${r.skipped_count != null ? r.skipped_count : 0}`,
      ];
      if (status === 'EMPTY_NO_FILE') {
        lines.push('• файл очереди отсутствует — 0 pending (файл НЕ создан).');
      }
      for (const card of pending.slice(0, 5)) {
        lines.push(
          `   – ${card.import_id || '?'} | ${card.source || '?'} | ` +
            `valid:${card.valid_count != null ? card.valid_count : '?'} ` +
            `needs_review:${card.needs_review_count != null ? card.needs_review_count : '?'}`,
        );
      }
      if (pending.length > 5) {
        lines.push(`   … ещё ${pending.length - 5} заявок.`);
      }
      lines.push('• safety: read-only, real import BLOCKED, queue_write=NO.');
      return lines.join('\n');
    }

    // --- decision objects -------------------------------------------------
    case 'DECISION_BUILT': {
      const decision = r.decision || '?';
      const emoji = decision === 'APPROVE' ? '✅' : '🚫';
      return [
        `${emoji} Decision: ${decision} (import_id: ${r.import_id || '?'})`,
        `• причина: ${r.reason || 'n/a'}`,
        '• ВНИМАНИЕ: это ТОЛЬКО decision object.',
        '• real import НЕ выполнен (can_execute_real_import=false).',
        '• очередь НЕ изменена (queue_write=NO), 13_sales НЕ тронут.',
      ].join('\n');
    }

    // --- failure cases ----------------------------------------------------
    case 'FAIL_QUEUE_PATH_REQUIRED':
      return [
        '✏️ Нужен путь к очереди.',
        '/lead_import_review требует явный queuePath.',
        'Бот никогда не предполагает default-путь к очереди.',
      ].join('\n');

    case 'FAIL_IMPORT_ID_REQUIRED':
      return [
        '✏️ Нужен import_id.',
        'Использование: /lead_import_approve <import_id>',
        '          или: /lead_import_reject <import_id>',
      ].join('\n');

    case 'FAIL_QUEUE_UNREADABLE':
      return [
        '⚠️ Очередь нечитаема (битый JSON или ошибка чтения).',
        'Файл НЕ был изменён и НЕ создан (read-only).',
      ].join('\n');

    case 'FAIL_UNKNOWN_DECISION':
      return [
        '❓ Неизвестное решение.',
        'Ожидается APPROVE или REJECT.',
      ].join('\n');

    // --- help -------------------------------------------------------------
    case 'HELP':
    default:
      return [
        '❓ Lead import approval review (read-only):',
        '• /lead_import_review — показать PENDING заявки (нужен queuePath)',
        '• /lead_import_approve <id> — построить APPROVE decision (без import)',
        '• /lead_import_reject <id> — построить REJECT decision (без import)',
        'Фразы: «очередь импорта», «что на одобрение»,',
        '        «одобрить импорт <id>», «отклонить импорт <id>».',
        'safety: real import BLOCKED, queue_write=NO, no client contact.',
      ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Build a compact, human-readable one-object summary from any glue result.
 *
 * @param {object} result  object returned by handleImportApprovalReviewBotMessage
 * @returns {object}
 */
export function buildImportApprovalReviewBotSummary(result) {
  const r = isPlainObject(result) ? result : {};
  const status = r.status || 'ERROR';

  let headline;
  switch (status) {
    case 'LOADED':
    case 'EMPTY_NO_FILE':
      headline = 'Review summary ready (read-only) — glue routed via D2D module.';
      break;
    case 'DECISION_BUILT':
      headline = 'Decision object built — no import, no queue write, no data change.';
      break;
    case 'FAIL_QUEUE_PATH_REQUIRED':
      headline = 'Review requires an explicit queuePath.';
      break;
    case 'FAIL_IMPORT_ID_REQUIRED':
      headline = 'Decision requires an import_id.';
      break;
    case 'FAIL_QUEUE_UNREADABLE':
      headline = 'Queue unreadable — nothing written, nothing created.';
      break;
    case 'HELP':
      headline = 'Help shown — supported actions + safety.';
      break;
    case 'NOT_IN_DOMAIN':
      headline = 'Not a D2D review message — nothing routed.';
      break;
    case 'ERROR':
    default:
      headline = 'Glue routing failed.';
      break;
  }

  return {
    version: GLUE_VERSION,
    review_module_version: getLeadImportApprovalReviewVersion(),
    handled: r.handled === true,
    action: r.action || null,
    status,
    supported_actions: SUPPORTED_ACTIONS.slice(),
    real_data_changed: false,
    can_execute_real_import: false,
    queue_write: false,
    telegram_api_called: false,
    bot_integration: 'NOT_CONNECTED',
    headline,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getImportApprovalReviewBotGlueVersion,
  shouldRouteToImportApprovalReview,
  parseImportApprovalCommand,
  handleImportApprovalReviewBotMessage,
  formatImportApprovalReviewForTelegram,
  buildImportApprovalReviewBotSummary,
};
