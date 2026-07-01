/**
 * lead_intake_router.mjs
 *
 * Daily Lead Factory — D1c — Standalone Lead Intake Router
 *
 * Purpose:
 *   A standalone routing layer that accepts free-form user text (Russian or
 *   English natural language, OR a direct slash command) and ROUTES it to the
 *   already-approved D1b command handlers in lead_intake_commands.mjs.
 *
 *   D1c is intentionally NOT wired into any live Telegram bot. It only
 *   classifies an intent and delegates to the D1b standalone handlers. It never
 *   writes data, never opens a network connection, never sends a message.
 *
 *   Supported intents (each maps to a D1b command):
 *     STATUS   -> /lead_import_status            (read-only snapshot)
 *     PREVIEW  -> /lead_import_preview <text>     (dry-run only)
 *     SANDBOX  -> /lead_import_sandbox <text>     (tmp sandbox only)
 *     COMMIT   -> /lead_import_commit_approved    (BLOCKED_NOT_LIVE via D1b)
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. auto_send always BLOCKED.
 *   - No Telegram API. No live bot. No telegram_master_bot.mjs.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - client_contact always BLOCKED.
 *   - The router NEVER writes data itself; it only delegates to D1b.
 *   - COMMIT / real import always resolves to BLOCKED_NOT_LIVE through D1b.
 *
 * Exports:
 *   - getLeadIntakeRouterVersion
 *   - getLeadIntakeRouterHelp
 *   - normalizeLeadIntakeText
 *   - detectLeadIntakeIntent
 *   - routeLeadIntakeMessage
 *   - buildLeadIntakeRouterSummary
 */

'use strict';

import {
  getLeadIntakeCommandsVersion,
  getLeadIntakeCommandsHelp,
  handleLeadImportStatusCommand,
  handleLeadImportPreviewCommand,
  handleLeadImportSandboxCommand,
  handleLeadImportCommitApprovedCommand,
} from './lead_intake_commands.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROUTER_VERSION = 'lead-intake-router-d1c-v1';

// The single, frozen safety contract surfaced by every router response.
const SAFETY = Object.freeze({
  auto_send: 'BLOCKED',
  client_contact: 'BLOCKED',
  network_used: 'NO',
  smtp_used: 'NO',
  external_send: 'NO',
  email_send: 'BLOCKED',
  telegram_send: 'BLOCKED',
  whatsapp_send: 'BLOCKED',
  max_send: 'BLOCKED',
  env_secrets: 'NO',
  bot_integration: 'NO',
});

// Direct slash commands recognised by D1b.
const CMD = Object.freeze({
  STATUS: '/lead_import_status',
  PREVIEW: '/lead_import_preview',
  SANDBOX: '/lead_import_sandbox',
  COMMIT_APPROVED: '/lead_import_commit_approved',
});

// Router intents.
const INTENT = Object.freeze({
  STATUS: 'STATUS',
  PREVIEW: 'PREVIEW',
  SANDBOX: 'SANDBOX',
  COMMIT: 'COMMIT',
  UNKNOWN: 'UNKNOWN',
});

// Router-level status codes.
const STATUS = Object.freeze({
  OK: 'OK',
  DRY_RUN: 'DRY_RUN',
  SANDBOX_OK: 'SANDBOX_OK',
  BLOCKED_NOT_LIVE: 'BLOCKED_NOT_LIVE',
  NEEDS_TEXT: 'NEEDS_TEXT',
  UNKNOWN_LEAD_INTAKE_INTENT: 'UNKNOWN_LEAD_INTAKE_INTENT',
  ERROR: 'ERROR',
});

// ---------------------------------------------------------------------------
// Natural-language aliases (Russian + English)
//
// Each alias is matched against the normalized text. SANDBOX is checked before
// PREVIEW/STATUS so that the more specific "sandbox/тестовый импорт" phrases win
// over a bare "импорт". Order of evaluation is enforced in detectLeadIntakeIntent.
// ---------------------------------------------------------------------------

const STATUS_ALIASES = Object.freeze([
  'статус лидов',
  'статус импорта',
  'что с лидами',
  'lead status',
  'import status',
]);

const PREVIEW_ALIASES = Object.freeze([
  'проверь лид',
  'превью лида',
  'импорт превью',
  'сухой прогон',
  'dry run',
  'проверить импорт',
]);

const SANDBOX_ALIASES = Object.freeze([
  'sandbox импорт',
  'тестовый импорт',
  'импорт в песочнице',
  'sandbox lead import',
]);

const COMMIT_ALIASES = Object.freeze([
  'подтвердить импорт',
  'запусти импорт',
  'выполнить импорт',
  'commit import',
]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Find the first alias contained in the normalized text and return the part of
 * the ORIGINAL trimmed text that follows that alias (the payload, if any).
 *
 * @param {string} normalized   lowercased/normalized text
 * @param {string} original     trimmed original text (used to slice payload)
 * @param {readonly string[]} aliases
 * @returns {{ matched: boolean, alias: string|null, payload: string }}
 */
function matchAlias(normalized, original, aliases) {
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) {
      // Payload is everything after the matched alias in the original text.
      const after = original.slice(idx + alias.length).trim();
      return { matched: true, alias, payload: after };
    }
  }
  return { matched: false, alias: null, payload: '' };
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the router module version identifier.
 */
export function getLeadIntakeRouterVersion() {
  return ROUTER_VERSION;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

/**
 * Build a help descriptor listing every supported intent, the aliases that map
 * to it, the underlying D1b command, and the standalone safety contract.
 *
 * @returns {{
 *   version: string,
 *   commands_version: string,
 *   standalone: boolean,
 *   bot_integration: string,
 *   intents: Array<{
 *     intent: string,
 *     command: string,
 *     needs_text: boolean,
 *     aliases: string[],
 *     description: string
 *   }>,
 *   commands_help: object,
 *   safety: object
 * }}
 */
export function getLeadIntakeRouterHelp() {
  return {
    version: ROUTER_VERSION,
    commands_version: getLeadIntakeCommandsVersion(),
    standalone: true,
    bot_integration: 'NOT_CONNECTED',
    intents: [
      {
        intent: INTENT.STATUS,
        command: CMD.STATUS,
        needs_text: false,
        aliases: [...STATUS_ALIASES],
        description:
          'Read-only health snapshot via D1b. No write, no network, no send.',
      },
      {
        intent: INTENT.PREVIEW,
        command: CMD.PREVIEW,
        needs_text: true,
        aliases: [...PREVIEW_ALIASES],
        description:
          'Dry-run preview of lead text via D1b. Never writes, never snapshots.',
      },
      {
        intent: INTENT.SANDBOX,
        command: CMD.SANDBOX,
        needs_text: true,
        aliases: [...SANDBOX_ALIASES],
        description:
          'Sandbox import confined to tmp via D1b. Never touches real 13_sales data.',
      },
      {
        intent: INTENT.COMMIT,
        command: CMD.COMMIT_APPROVED,
        needs_text: false,
        aliases: [...COMMIT_ALIASES],
        description:
          'Real commit is BLOCKED_NOT_LIVE in standalone D1c/D1b. No real write.',
      },
    ],
    commands_help: getLeadIntakeCommandsHelp(),
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize free-form user text for intent detection.
 *   - coerces non-strings to ''
 *   - trims outer whitespace
 *   - lowercases
 *   - collapses internal whitespace runs to single spaces
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeLeadIntakeText(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

/**
 * Classify free-form text into a lead-intake intent.
 *
 * Resolution order:
 *   1. Direct slash commands (/lead_import_*).
 *   2. SANDBOX aliases (most specific import phrasing).
 *   3. COMMIT aliases.
 *   4. PREVIEW aliases.
 *   5. STATUS aliases.
 *   6. Otherwise UNKNOWN.
 *
 * For PREVIEW/SANDBOX, the `text` field carries the payload that should be
 * forwarded to the D1b handler (may be '' if none was supplied).
 *
 * @param {string} input
 * @returns {{
 *   intent: string,
 *   command: string|null,
 *   needs_text: boolean,
 *   text: string,
 *   matched_alias: string|null,
 *   source: 'command'|'alias'|'none',
 *   raw: string
 * }}
 */
export function detectLeadIntakeIntent(input) {
  const raw = typeof input === 'string' ? input : '';
  const original = raw.trim();
  const normalized = normalizeLeadIntakeText(raw);

  if (normalized === '') {
    return {
      intent: INTENT.UNKNOWN,
      command: null,
      needs_text: false,
      text: '',
      matched_alias: null,
      source: 'none',
      raw,
    };
  }

  // --- 1. Direct slash commands ---
  if (normalized.startsWith('/')) {
    const firstSpace = original.search(/\s/);
    const commandToken =
      firstSpace === -1 ? original : original.slice(0, firstSpace);
    const payload = firstSpace === -1 ? '' : original.slice(firstSpace + 1).trim();
    const command = commandToken.toLowerCase().split('@')[0];

    switch (command) {
      case CMD.STATUS:
        return {
          intent: INTENT.STATUS,
          command: CMD.STATUS,
          needs_text: false,
          text: '',
          matched_alias: command,
          source: 'command',
          raw,
        };
      case CMD.PREVIEW:
        return {
          intent: INTENT.PREVIEW,
          command: CMD.PREVIEW,
          needs_text: true,
          text: payload,
          matched_alias: command,
          source: 'command',
          raw,
        };
      case CMD.SANDBOX:
        return {
          intent: INTENT.SANDBOX,
          command: CMD.SANDBOX,
          needs_text: true,
          text: payload,
          matched_alias: command,
          source: 'command',
          raw,
        };
      case CMD.COMMIT_APPROVED:
        return {
          intent: INTENT.COMMIT,
          command: CMD.COMMIT_APPROVED,
          needs_text: false,
          text: '',
          matched_alias: command,
          source: 'command',
          raw,
        };
      default:
        return {
          intent: INTENT.UNKNOWN,
          command: null,
          needs_text: false,
          text: '',
          matched_alias: null,
          source: 'none',
          raw,
        };
    }
  }

  // --- 2. SANDBOX aliases (most specific first) ---
  const sandbox = matchAlias(normalized, original, SANDBOX_ALIASES);
  if (sandbox.matched) {
    return {
      intent: INTENT.SANDBOX,
      command: CMD.SANDBOX,
      needs_text: true,
      text: sandbox.payload,
      matched_alias: sandbox.alias,
      source: 'alias',
      raw,
    };
  }

  // --- 3. COMMIT aliases ---
  const commit = matchAlias(normalized, original, COMMIT_ALIASES);
  if (commit.matched) {
    return {
      intent: INTENT.COMMIT,
      command: CMD.COMMIT_APPROVED,
      needs_text: false,
      text: '',
      matched_alias: commit.alias,
      source: 'alias',
      raw,
    };
  }

  // --- 4. PREVIEW aliases ---
  const preview = matchAlias(normalized, original, PREVIEW_ALIASES);
  if (preview.matched) {
    return {
      intent: INTENT.PREVIEW,
      command: CMD.PREVIEW,
      needs_text: true,
      text: preview.payload,
      matched_alias: preview.alias,
      source: 'alias',
      raw,
    };
  }

  // --- 5. STATUS aliases ---
  const status = matchAlias(normalized, original, STATUS_ALIASES);
  if (status.matched) {
    return {
      intent: INTENT.STATUS,
      command: CMD.STATUS,
      needs_text: false,
      text: '',
      matched_alias: status.alias,
      source: 'alias',
      raw,
    };
  }

  // --- 6. Unknown ---
  return {
    intent: INTENT.UNKNOWN,
    command: null,
    needs_text: false,
    text: '',
    matched_alias: null,
    source: 'none',
    raw,
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Detect the intent of free-form user text and delegate to the matching D1b
 * standalone handler. The router NEVER writes data and NEVER calls a bot.
 *
 *   STATUS  -> handleLeadImportStatusCommand        (read-only)
 *   PREVIEW -> handleLeadImportPreviewCommand        (dry-run; NEEDS_TEXT if empty)
 *   SANDBOX -> handleLeadImportSandboxCommand         (tmp; NEEDS_TEXT if empty)
 *   COMMIT  -> handleLeadImportCommitApprovedCommand  (BLOCKED_NOT_LIVE)
 *   UNKNOWN -> UNKNOWN_LEAD_INTAKE_INTENT + help
 *
 * @param {string} input
 * @param {object} [options]   forwarded to D1b handlers (e.g. workspaceRoot, source)
 * @returns {Promise<object>}
 */
export async function routeLeadIntakeMessage(input, options = {}) {
  const detection = detectLeadIntakeIntent(input);

  // --- UNKNOWN ---
  if (detection.intent === INTENT.UNKNOWN) {
    return {
      intent: INTENT.UNKNOWN,
      command: null,
      status: STATUS.UNKNOWN_LEAD_INTAKE_INTENT,
      ok: false,
      real_data_changed: false,
      message:
        'Could not map text to a lead-intake intent. See help for supported ' +
        'commands and Russian/English aliases.',
      detection,
      help: getLeadIntakeRouterHelp(),
      safety: { ...SAFETY },
    };
  }

  // --- PREVIEW / SANDBOX require payload text ---
  if (
    (detection.intent === INTENT.PREVIEW ||
      detection.intent === INTENT.SANDBOX) &&
    !isNonEmptyString(detection.text)
  ) {
    return {
      intent: detection.intent,
      command: detection.command,
      status: STATUS.NEEDS_TEXT,
      ok: false,
      real_data_changed: false,
      message: `${detection.command} requires lead text. Provide the lead text after the command/phrase.`,
      detection,
      safety: { ...SAFETY },
    };
  }

  // --- Delegate to D1b handlers. Router never writes data itself. ---
  let handlerResult;
  try {
    switch (detection.intent) {
      case INTENT.STATUS:
        handlerResult = await handleLeadImportStatusCommand(options);
        break;
      case INTENT.PREVIEW:
        handlerResult = await handleLeadImportPreviewCommand(
          detection.text,
          options,
        );
        break;
      case INTENT.SANDBOX:
        handlerResult = await handleLeadImportSandboxCommand(
          detection.text,
          options,
        );
        break;
      case INTENT.COMMIT:
        // Real commit is ALWAYS BLOCKED_NOT_LIVE via D1b. No real write.
        handlerResult = handleLeadImportCommitApprovedCommand();
        break;
      default:
        // Unreachable, but stay safe.
        return {
          intent: INTENT.UNKNOWN,
          command: null,
          status: STATUS.UNKNOWN_LEAD_INTAKE_INTENT,
          ok: false,
          real_data_changed: false,
          message: `Unhandled intent: ${detection.intent}`,
          detection,
          help: getLeadIntakeRouterHelp(),
          safety: { ...SAFETY },
        };
    }
  } catch (err) {
    return {
      intent: detection.intent,
      command: detection.command,
      status: STATUS.ERROR,
      ok: false,
      real_data_changed: false,
      message: err && err.message ? err.message : String(err),
      detection,
      safety: { ...SAFETY },
    };
  }

  const handler =
    handlerResult && typeof handlerResult === 'object' ? handlerResult : {};

  // Router-level status mirrors the D1b handler status, but is re-stamped so the
  // router contract (router safety, real_data_changed=false) is authoritative.
  return {
    intent: detection.intent,
    command: detection.command,
    status: handler.status || STATUS.ERROR,
    ok: handler.ok === true,
    real_data_changed: false,
    routed: true,
    detection,
    handler_result: handler,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Build a compact, human-readable one-object summary from any router result.
 *
 * @param {object} result  the object returned by routeLeadIntakeMessage
 * @returns {object}
 */
export function buildLeadIntakeRouterSummary(result) {
  const r = result && typeof result === 'object' ? result : {};
  const intent = r.intent || INTENT.UNKNOWN;
  const command = r.command || null;
  const status = r.status || STATUS.ERROR;

  let headline;
  switch (status) {
    case STATUS.OK:
      headline = 'Status snapshot ready (read-only) — routed via D1b.';
      break;
    case STATUS.DRY_RUN:
      headline = 'Preview routed — dry-run only, nothing written.';
      break;
    case STATUS.SANDBOX_OK:
      headline =
        'Sandbox import routed — confined to tmp sandbox, real data untouched.';
      break;
    case STATUS.BLOCKED_NOT_LIVE:
      headline = 'Commit BLOCKED_NOT_LIVE — standalone never commits real data.';
      break;
    case STATUS.NEEDS_TEXT:
      headline = 'Intent recognised but lead text is required.';
      break;
    case STATUS.UNKNOWN_LEAD_INTAKE_INTENT:
      headline = 'Unknown lead-intake intent — see help.';
      break;
    case STATUS.ERROR:
    default:
      headline = r.message ? `Error: ${r.message}` : 'Routing failed.';
      break;
  }

  return {
    version: ROUTER_VERSION,
    commands_version: getLeadIntakeCommandsVersion(),
    intent,
    command,
    status,
    ok: r.ok === true,
    real_data_changed: false,
    bot_integration: 'NOT_CONNECTED',
    headline,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getLeadIntakeRouterVersion,
  getLeadIntakeRouterHelp,
  normalizeLeadIntakeText,
  detectLeadIntakeIntent,
  routeLeadIntakeMessage,
  buildLeadIntakeRouterSummary,
};
