/**
 * lead_intake_bot_adapter.mjs
 *
 * Daily Lead Factory — D1d — Standalone Lead Intake Bot-Glue Adapter
 *
 * Purpose:
 *   A standalone "bot-glue" adapter that prepares the D1c lead-intake router for
 *   a FUTURE live Telegram bot integration. It sits BETWEEN a Telegram bot
 *   (telegram_master_bot.mjs) and the already-approved D1c router
 *   (lead_intake_router.mjs).
 *
 *   This adapter does NOT call the Telegram API. It is a pure glue layer:
 *     - it decides whether an incoming text should be routed to lead intake
 *       (shouldRouteToLeadIntake),
 *     - it routes the text via the D1c router (handleLeadIntakeBotMessage),
 *     - it formats the router result into a short, human-readable reply string
 *       (formatLeadIntakeResponseForTelegram).
 *
 *   The returned object is something telegram_master_bot.mjs could LATER send.
 *   This module itself never sends anything.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - The adapter NEVER writes data. It only delegates to the D1c router.
 *   - The adapter NEVER calls the Telegram API. No live bot. No bot token.
 *   - The adapter NEVER sends email / Telegram / WhatsApp / MAX / SMS.
 *   - The adapter NEVER reads .env / AI_SECRETS / tokens / credentials.
 *   - No network. No HTTP/fetch. No SMTP. No site scanning.
 *   - auto_send is ALWAYS BLOCKED. client_contact is ALWAYS BLOCKED.
 *   - network_used = NO, smtp_used = NO, external_send = NO.
 *   - Real import is FORBIDDEN. COMMIT always resolves to BLOCKED_NOT_LIVE.
 *
 * Exports:
 *   - getLeadIntakeBotAdapterVersion
 *   - formatLeadIntakeResponseForTelegram
 *   - handleLeadIntakeBotMessage
 *   - shouldRouteToLeadIntake
 *   - buildLeadIntakeBotAdapterSummary
 */

'use strict';

import {
  getLeadIntakeRouterVersion,
  routeLeadIntakeMessage,
} from './lead_intake_router.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_VERSION = 'lead-intake-bot-adapter-d1d-v1';

// The single, frozen safety contract surfaced by every adapter response.
// The adapter never writes data, never calls the Telegram API, never sends.
const SAFETY = Object.freeze({
  auto_send: 'BLOCKED',
  client_contact: 'BLOCKED',
  network_used: 'NO',
  smtp_used: 'NO',
  external_send: 'NO',
  email_send: 'BLOCKED',
  telegram_send: 'BLOCKED',
  telegram_api_called: 'NO',
  whatsapp_send: 'BLOCKED',
  max_send: 'BLOCKED',
  env_secrets: 'NO',
  writes_data: 'NO',
  real_import: 'FORBIDDEN',
  bot_integration: 'NOT_CONNECTED',
});

// Router-level / adapter-level status codes (mirror of the D1c router).
const STATUS = Object.freeze({
  OK: 'OK',
  DRY_RUN: 'DRY_RUN',
  SANDBOX_OK: 'SANDBOX_OK',
  BLOCKED_NOT_LIVE: 'BLOCKED_NOT_LIVE',
  NEEDS_TEXT: 'NEEDS_TEXT',
  UNKNOWN_LEAD_INTAKE_INTENT: 'UNKNOWN_LEAD_INTAKE_INTENT',
  ERROR: 'ERROR',
});

// Direct slash commands that must always route to lead intake.
const TRIGGER_COMMANDS = Object.freeze([
  '/lead_import_status',
  '/lead_import_preview',
  '/lead_import_sandbox',
  '/lead_import_commit_approved',
]);

// Natural-language phrases (Russian) that must route to lead intake.
const TRIGGER_PHRASES = Object.freeze([
  'статус лидов',
  'статус импорта',
  'что с лидами',
  'проверь лид',
  'сухой прогон',
  'тестовый импорт',
  'импорт в песочнице',
  'подтвердить импорт',
]);

// Common everyday bot commands that must NOT route to lead intake.
const NON_LEAD_COMMANDS = Object.freeze([
  '/ping',
  '/health',
  '/today',
  '/newleads',
]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function normalize(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the adapter module version identifier.
 */
export function getLeadIntakeBotAdapterVersion() {
  return ADAPTER_VERSION;
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

/**
 * Decide whether an incoming bot text should be routed to the lead-intake
 * router. This is a cheap, read-only classifier — it never routes or executes
 * anything. A future telegram_master_bot.mjs would call this first to decide
 * whether to hand the message off to handleLeadIntakeBotMessage.
 *
 * Returns true for:
 *   - the four /lead_import_* slash commands
 *   - the Russian natural-language lead-intake phrases
 * Returns false for:
 *   - empty / non-string text
 *   - generic bot commands like /ping, /health, /today, /newleads
 *   - anything else not recognised as lead intake
 *
 * @param {string} text
 * @returns {boolean}
 */
export function shouldRouteToLeadIntake(text) {
  const normalized = normalize(text);
  if (normalized === '') return false;

  // Leading slash command? Match on the command token only.
  if (normalized.startsWith('/')) {
    const token = normalized.split(/\s/)[0].split('@')[0];
    if (NON_LEAD_COMMANDS.includes(token)) return false;
    return TRIGGER_COMMANDS.includes(token);
  }

  // Natural-language phrases (substring match on normalized text).
  for (const phrase of TRIGGER_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

/**
 * Handle an incoming bot message by delegating to the D1c router and packaging
 * a bot-ready response object. This adapter NEVER calls the Telegram API; it
 * only returns an object that a bot could later send.
 *
 * @param {string} text
 * @param {object} [options]   forwarded to routeLeadIntakeMessage (e.g. source)
 * @returns {Promise<{
 *   handled: boolean,
 *   text: string,
 *   intent: string|null,
 *   status: string,
 *   safety: object,
 *   raw: object
 * }>}
 */
export async function handleLeadIntakeBotMessage(text, options = {}) {
  // Not a lead-intake message: do not route, report unhandled.
  if (!shouldRouteToLeadIntake(text)) {
    return {
      handled: false,
      text: '',
      intent: null,
      status: STATUS.UNKNOWN_LEAD_INTAKE_INTENT,
      safety: { ...SAFETY },
      raw: null,
    };
  }

  let routerResult;
  try {
    routerResult = await routeLeadIntakeMessage(text, options);
  } catch (err) {
    return {
      handled: true,
      text: `⚠️ Lead intake error: ${err && err.message ? err.message : String(err)}`,
      intent: null,
      status: STATUS.ERROR,
      safety: { ...SAFETY },
      raw: { error: err && err.message ? err.message : String(err) },
    };
  }

  const r = routerResult && typeof routerResult === 'object' ? routerResult : {};

  return {
    handled: true,
    text: formatLeadIntakeResponseForTelegram(r),
    intent: r.intent || null,
    status: r.status || STATUS.ERROR,
    safety: { ...SAFETY },
    raw: r,
  };
}

// ---------------------------------------------------------------------------
// Formatting (bot-ready text)
// ---------------------------------------------------------------------------

/**
 * Turn a D1c router result into a short, human-readable Telegram reply string.
 * This is plain text only — the adapter does not send it anywhere.
 *
 * @param {object} result  the object returned by routeLeadIntakeMessage
 * @returns {string}
 */
export function formatLeadIntakeResponseForTelegram(result) {
  const r = result && typeof result === 'object' ? result : {};
  const status = r.status || STATUS.ERROR;
  const handler =
    r.handler_result && typeof r.handler_result === 'object'
      ? r.handler_result
      : {};

  switch (status) {
    case STATUS.OK: {
      // /lead_import_status — read-only snapshot.
      const m = handler.metrics && typeof handler.metrics === 'object'
        ? handler.metrics
        : {};
      const leads = m.leads_total != null ? m.leads_total : '?';
      const contacts = m.contacts_total != null ? m.contacts_total : '?';
      const dashboard =
        m.dashboard_count != null ? m.dashboard_count : 'n/a';
      const autoSend = handler.auto_send || 'BLOCKED';
      return [
        '📊 Lead intake status (read-only):',
        `• leads: ${leads}`,
        `• contacts: ${contacts}`,
        `• dashboard: ${dashboard}`,
        `• auto_send: ${autoSend}`,
      ].join('\n');
    }

    case STATUS.DRY_RUN: {
      // /lead_import_preview — dry-run only.
      const parsed = handler.parsed != null ? handler.parsed : '?';
      const valid = handler.valid != null ? handler.valid : '?';
      const added = handler.added != null ? handler.added : '?';
      const needsReview =
        handler.needs_review != null ? handler.needs_review : '?';
      const qa = handler.qa_status || 'n/a';
      return [
        '🔍 Lead preview (dry-run, nothing written):',
        `• parsed: ${parsed}`,
        `• valid: ${valid}`,
        `• added: ${added}`,
        `• needs_review: ${needsReview}`,
        `• qa_status: ${qa}`,
        '• safety: dry-run only, no real data changed.',
      ].join('\n');
    }

    case STATUS.SANDBOX_OK: {
      // /lead_import_sandbox — tmp sandbox only.
      const imported =
        handler.imported_count != null ? handler.imported_count : '?';
      const snapshot = handler.snapshot != null ? handler.snapshot : 'none';
      return [
        '🧪 Sandbox import (tmp only, real data untouched):',
        `• imported: ${imported}`,
        `• snapshot: ${snapshot}`,
        '• safety: sandbox only, real 13_sales data NOT changed.',
      ].join('\n');
    }

    case STATUS.BLOCKED_NOT_LIVE: {
      // /lead_import_commit_approved — always blocked.
      return [
        '⛔ Commit BLOCKED_NOT_LIVE.',
        'Real import into 13_sales is forbidden in standalone mode.',
        'It requires separate Dmitry approval and live execution.',
      ].join('\n');
    }

    case STATUS.NEEDS_TEXT: {
      const cmd = r.command || 'this command';
      return [
        `✏️ ${cmd} needs lead text.`,
        'Provide the lead text after the command or phrase.',
      ].join('\n');
    }

    case STATUS.UNKNOWN_LEAD_INTAKE_INTENT:
    default: {
      return [
        '❓ Lead intake help:',
        'Supported commands:',
        '• /lead_import_status — read-only status',
        '• /lead_import_preview <text> — dry-run preview',
        '• /lead_import_sandbox <text> — sandbox import (tmp only)',
        '• /lead_import_commit_approved — BLOCKED in standalone mode',
        'Or phrases like: "статус лидов", "проверь лид", "тестовый импорт".',
      ].join('\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Build a compact, human-readable one-object summary from any adapter result.
 *
 * @param {object} result  the object returned by handleLeadIntakeBotMessage
 * @returns {object}
 */
export function buildLeadIntakeBotAdapterSummary(result) {
  const r = result && typeof result === 'object' ? result : {};
  const status = r.status || STATUS.ERROR;
  const intent = r.intent || null;

  let headline;
  switch (status) {
    case STATUS.OK:
      headline = 'Status snapshot ready (read-only) — adapter routed via D1c.';
      break;
    case STATUS.DRY_RUN:
      headline = 'Preview routed — dry-run only, nothing written.';
      break;
    case STATUS.SANDBOX_OK:
      headline = 'Sandbox import routed — tmp only, real data untouched.';
      break;
    case STATUS.BLOCKED_NOT_LIVE:
      headline = 'Commit BLOCKED_NOT_LIVE — adapter never commits real data.';
      break;
    case STATUS.NEEDS_TEXT:
      headline = 'Intent recognised but lead text is required.';
      break;
    case STATUS.UNKNOWN_LEAD_INTAKE_INTENT:
      headline = 'Not a lead-intake message — nothing routed.';
      break;
    case STATUS.ERROR:
    default:
      headline = 'Adapter routing failed.';
      break;
  }

  return {
    version: ADAPTER_VERSION,
    router_version: getLeadIntakeRouterVersion(),
    handled: r.handled === true,
    intent,
    status,
    real_data_changed: false,
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
  getLeadIntakeBotAdapterVersion,
  formatLeadIntakeResponseForTelegram,
  handleLeadIntakeBotMessage,
  shouldRouteToLeadIntake,
  buildLeadIntakeBotAdapterSummary,
};
