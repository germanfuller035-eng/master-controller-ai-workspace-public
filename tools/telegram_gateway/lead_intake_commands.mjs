/**
 * lead_intake_commands.mjs
 *
 * Daily Lead Factory — D1b — Standalone Lead Intake Commands
 *
 * Purpose:
 *   A standalone command layer that EXPOSES lead-intake operations as parseable
 *   chat-style commands, READY for a future Telegram bot integration, but in
 *   D1b it is intentionally NOT wired into any bot. It composes the already
 *   approved D1a pipeline (lead_intake_pipeline.mjs) and surfaces read-only
 *   status plus dry-run / sandbox flows.
 *
 *   Supported commands:
 *     /lead_import_status            -> read-only health snapshot
 *     /lead_import_preview <text>    -> dry-run only (no write, no snapshot)
 *     /lead_import_sandbox <text>    -> import INSIDE a tmp sandbox workspace
 *     /lead_import_commit_approved   -> BLOCKED_NOT_LIVE in standalone D1b
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. auto_send always BLOCKED.
 *   - No Telegram API. No bot integration. No git. No VPS/SSH.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - client_contact always BLOCKED.
 *   - NEVER calls runLeadIntakeImport on the REAL workspace.
 *   - /lead_import_commit_approved always returns BLOCKED_NOT_LIVE.
 *   - Sandbox writes are confined to tmp/lead_import_sandbox_workspace/.
 *
 * Exports:
 *   - getLeadIntakeCommandsVersion
 *   - getLeadIntakeCommandsHelp
 *   - parseLeadIntakeCommand
 *   - buildLeadImportStatus
 *   - handleLeadImportStatusCommand
 *   - handleLeadImportPreviewCommand
 *   - handleLeadImportSandboxCommand
 *   - handleLeadIntakeCommand
 *   - buildLeadIntakeCommandSummary
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  getLeadIntakePipelineVersion,
  runLeadIntakeDryRun,
  runLeadIntakeImport,
  buildLeadIntakePipelineSummary,
} from './lead_intake_pipeline.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMANDS_VERSION = 'lead-intake-commands-d1b-v1';

// The single, frozen safety contract surfaced by every command response.
const SAFETY = Object.freeze({
  network_used: 'NO',
  external_send: 'NO',
  smtp_used: 'NO',
  auto_send: 'BLOCKED',
  client_contact: 'BLOCKED',
  email_send: 'BLOCKED',
  telegram_send: 'BLOCKED',
  whatsapp_send: 'BLOCKED',
  max_send: 'BLOCKED',
  env_secrets: 'NO',
  bot_integration: 'NO',
});

// Real workspace root + protected real data locations (read-only here).
const REAL_WORKSPACE_ROOT = path.resolve('D:\\AI_WORKSPACE');

const LEADS_MASTER_REL =
  '13_sales/daily_lead_factory/data/processed/leads_master.json';
const LEAD_CONTACTS_REL = '13_sales/lead_contacts.json';
const DASHBOARD_STATE_REL = '09_dashboards/dashboard_state.json';

// Sandbox workspace — the ONLY place a confirm=true import may run.
const SANDBOX_REL = 'tmp/lead_import_sandbox_workspace';

// Known command names.
const CMD = Object.freeze({
  STATUS: '/lead_import_status',
  PREVIEW: '/lead_import_preview',
  SANDBOX: '/lead_import_sandbox',
  COMMIT_APPROVED: '/lead_import_commit_approved',
});

// Command outcome status codes.
const STATUS = Object.freeze({
  OK: 'OK',
  DRY_RUN: 'DRY_RUN',
  SANDBOX_OK: 'SANDBOX_OK',
  BLOCKED_NOT_LIVE: 'BLOCKED_NOT_LIVE',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  NEEDS_TEXT: 'NEEDS_TEXT',
  ERROR: 'ERROR',
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Read + parse a JSON file safely. Never throws; returns a structured result.
 * @param {string} absPath
 * @returns {Promise<{ exists: boolean, parsed: any, error: string|null }>}
 */
async function readJsonSafe(absPath) {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    try {
      return { exists: true, parsed: JSON.parse(raw), error: null };
    } catch (parseErr) {
      return {
        exists: true,
        parsed: null,
        error: parseErr && parseErr.message ? parseErr.message : String(parseErr),
      };
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { exists: false, parsed: null, error: null };
    }
    return {
      exists: false,
      parsed: null,
      error: err && err.message ? err.message : String(err),
    };
  }
}

/**
 * Extract a leads array from either an array payload or `{ leads: [...] }`.
 * @param {any} parsed
 * @returns {object[]}
 */
function extractLeadsArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.leads)) return parsed.leads;
  return [];
}

// Canonical lead_id shape used by the pipeline: DLF-YYYYMMDD-NNNN.
const LEAD_ID_CANONICAL_RE = /^DLF-\d{8}-\d{3,}$/;

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the commands module version identifier.
 */
export function getLeadIntakeCommandsVersion() {
  return COMMANDS_VERSION;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

/**
 * Build a help descriptor listing every supported command and the standalone
 * safety contract.
 * @returns {{
 *   version: string,
 *   pipeline_version: string,
 *   standalone: boolean,
 *   bot_integration: string,
 *   commands: Array<{ command: string, args: string, description: string }>,
 *   safety: object
 * }}
 */
export function getLeadIntakeCommandsHelp() {
  return {
    version: COMMANDS_VERSION,
    pipeline_version: getLeadIntakePipelineVersion(),
    standalone: true,
    bot_integration: 'NOT_CONNECTED',
    commands: [
      {
        command: CMD.STATUS,
        args: '',
        description:
          'Read-only health snapshot: leads_total, empty/duplicate lead_id, ' +
          'contacts_total, canonical_contacts_count, dashboard_count, auto_send BLOCKED.',
      },
      {
        command: CMD.PREVIEW,
        args: '<text>',
        description:
          'Dry-run only. Parses + evaluates lead text via the pipeline. ' +
          'Never writes data, never creates a snapshot.',
      },
      {
        command: CMD.SANDBOX,
        args: '<text>',
        description:
          'Runs a confirmed import INSIDE tmp/lead_import_sandbox_workspace/ only. ' +
          'Never writes real 13_sales data.',
      },
      {
        command: CMD.COMMIT_APPROVED,
        args: '',
        description:
          'BLOCKED_NOT_LIVE in standalone D1b. Real commit requires separate ' +
          'Dmitry approval and non-standalone execution.',
      },
    ],
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw chat-style command line into a structured intent.
 *
 * Recognizes the four known commands. Unknown commands resolve to
 * UNKNOWN_COMMAND (with help attached). preview/sandbox without trailing text
 * resolve to NEEDS_TEXT.
 *
 * @param {string} input
 * @returns {{
 *   ok: boolean,
 *   status: string,
 *   command: string|null,
 *   text: string,
 *   raw: string,
 *   help?: object,
 *   message?: string
 * }}
 */
export function parseLeadIntakeCommand(input) {
  const raw = typeof input === 'string' ? input : '';
  const trimmed = raw.trim();

  if (trimmed === '') {
    return {
      ok: false,
      status: STATUS.UNKNOWN_COMMAND,
      command: null,
      text: '',
      raw,
      help: getLeadIntakeCommandsHelp(),
      message: 'Empty input. No command provided.',
    };
  }

  // Split into the leading token (command) and the rest (text payload).
  const firstSpace = trimmed.search(/\s/);
  const commandToken =
    firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const text = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim();

  // Normalize command token (lowercase, strip any @botname suffix for future
  // bot compatibility — purely cosmetic, no bot connection here).
  const command = commandToken.toLowerCase().split('@')[0];

  switch (command) {
    case CMD.STATUS:
    case CMD.COMMIT_APPROVED:
      return {
        ok: true,
        status: STATUS.OK,
        command,
        text: '',
        raw,
      };

    case CMD.PREVIEW:
    case CMD.SANDBOX:
      if (!isNonEmptyString(text)) {
        return {
          ok: false,
          status: STATUS.NEEDS_TEXT,
          command,
          text: '',
          raw,
          message: `${command} requires lead text. Usage: ${command} <text>`,
        };
      }
      return {
        ok: true,
        status: STATUS.OK,
        command,
        text,
        raw,
      };

    default:
      return {
        ok: false,
        status: STATUS.UNKNOWN_COMMAND,
        command: null,
        text: '',
        raw,
        help: getLeadIntakeCommandsHelp(),
        message: `Unknown command: ${commandToken}`,
      };
  }
}

// ---------------------------------------------------------------------------
// Status (read-only)
// ---------------------------------------------------------------------------

/**
 * Build a read-only health snapshot of the real lead data sources.
 *
 * Reads (read-only, never writes):
 *   - 13_sales/daily_lead_factory/data/processed/leads_master.json
 *   - 13_sales/lead_contacts.json
 *   - 09_dashboards/dashboard_state.json (best-effort; null if unreadable)
 *
 * @param {{ workspaceRoot?: string }} [options]
 * @returns {Promise<object>}
 */
export async function buildLeadImportStatus(options = {}) {
  const root = isNonEmptyString(options.workspaceRoot)
    ? path.resolve(options.workspaceRoot)
    : REAL_WORKSPACE_ROOT;

  const leadsMasterAbs = path.resolve(root, LEADS_MASTER_REL);
  const leadContactsAbs = path.resolve(root, LEAD_CONTACTS_REL);
  const dashboardStateAbs = path.resolve(root, DASHBOARD_STATE_REL);

  // --- leads_master.json (read-only) ---
  const masterRes = await readJsonSafe(leadsMasterAbs);
  const leads = extractLeadsArray(masterRes.parsed);

  let emptyLeadId = 0;
  const seenIds = new Set();
  const dupIds = new Set();
  for (const lead of leads) {
    const id =
      lead && typeof lead.lead_id === 'string' ? lead.lead_id.trim() : '';
    if (id === '') {
      emptyLeadId += 1;
      continue;
    }
    if (seenIds.has(id)) {
      dupIds.add(id);
    } else {
      seenIds.add(id);
    }
  }

  // --- lead_contacts.json (read-only) ---
  const contactsRes = await readJsonSafe(leadContactsAbs);
  const contactsObj =
    contactsRes.parsed && typeof contactsRes.parsed === 'object' &&
    !Array.isArray(contactsRes.parsed)
      ? contactsRes.parsed
      : {};
  const contactKeys = Object.keys(contactsObj);
  let canonicalContactsCount = 0;
  for (const key of contactKeys) {
    const entry = contactsObj[key];
    const leadId =
      entry && typeof entry.lead_id === 'string' ? entry.lead_id.trim() : key;
    if (LEAD_ID_CANONICAL_RE.test(leadId)) {
      canonicalContactsCount += 1;
    }
  }

  // --- dashboard_state.json (best-effort, read-only) ---
  let dashboardCount = null;
  let dashboardReadable = false;
  const dashRes = await readJsonSafe(dashboardStateAbs);
  if (dashRes.exists && dashRes.parsed && !dashRes.error) {
    dashboardReadable = true;
    const d = dashRes.parsed;
    if (Array.isArray(d.active_work_queue)) {
      dashboardCount = d.active_work_queue.length;
    } else if (Array.isArray(d.leads)) {
      dashboardCount = d.leads.length;
    } else if (typeof d.count === 'number') {
      dashboardCount = d.count;
    } else {
      dashboardCount = null;
    }
  }

  return {
    command: CMD.STATUS,
    status: STATUS.OK,
    read_only: true,
    sources: {
      leads_master_path: leadsMasterAbs,
      lead_contacts_path: leadContactsAbs,
      dashboard_state_path: dashboardStateAbs,
      leads_master_exists: masterRes.exists === true,
      lead_contacts_exists: contactsRes.exists === true,
      dashboard_state_exists: dashRes.exists === true,
      leads_master_error: masterRes.error,
      lead_contacts_error: contactsRes.error,
      dashboard_state_error: dashRes.error,
    },
    metrics: {
      leads_total: leads.length,
      empty_lead_id: emptyLeadId,
      duplicate_lead_id: dupIds.size,
      duplicate_lead_id_values: Array.from(dupIds),
      contacts_total: contactKeys.length,
      canonical_contacts_count: canonicalContactsCount,
      dashboard_count: dashboardReadable ? dashboardCount : null,
      dashboard_readable: dashboardReadable,
    },
    auto_send: 'BLOCKED',
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * Handle /lead_import_status. Pure read-only.
 * @param {{ workspaceRoot?: string }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportStatusCommand(options = {}) {
  return buildLeadImportStatus(options);
}

/**
 * Handle /lead_import_preview <text>. Dry-run only — never writes, never
 * creates a snapshot. Delegates to the pipeline's runLeadIntakeDryRun.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportPreviewCommand(text, options = {}) {
  if (!isNonEmptyString(text)) {
    return {
      command: CMD.PREVIEW,
      status: STATUS.NEEDS_TEXT,
      ok: false,
      message: `${CMD.PREVIEW} requires lead text. Usage: ${CMD.PREVIEW} <text>`,
      safety: { ...SAFETY },
    };
  }

  let result;
  try {
    // Force dry-run: never pass confirm. The pipeline never writes here.
    result = await runLeadIntakeDryRun(text, {
      source: options && options.source ? options.source : 'lead_import_preview',
      status: options && options.status ? options.status : undefined,
    });
  } catch (err) {
    return {
      command: CMD.PREVIEW,
      status: STATUS.ERROR,
      ok: false,
      message: err && err.message ? err.message : String(err),
      safety: { ...SAFETY },
    };
  }

  const summary = buildLeadIntakePipelineSummary(result);
  return {
    command: CMD.PREVIEW,
    status: STATUS.DRY_RUN,
    ok: true,
    dry_run: true,
    wrote_data: false,
    created_snapshot: false,
    parsed: summary.counts.total_rows,
    valid: summary.counts.valid_count,
    added: summary.counts.added_count,
    merged: summary.counts.merged_count,
    needs_review: summary.counts.needs_review_count,
    qa_status: summary.qa_status,
    pipeline_status: summary.status,
    headline: summary.headline,
    safety: { ...SAFETY },
  };
}

/**
 * Handle /lead_import_sandbox <text>. Runs a CONFIRMED import, but only ever
 * inside tmp/lead_import_sandbox_workspace/. Never touches real 13_sales data.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportSandboxCommand(text, options = {}) {
  if (!isNonEmptyString(text)) {
    return {
      command: CMD.SANDBOX,
      status: STATUS.NEEDS_TEXT,
      ok: false,
      message: `${CMD.SANDBOX} requires lead text. Usage: ${CMD.SANDBOX} <text>`,
      safety: { ...SAFETY },
    };
  }

  // The sandbox workspace is ALWAYS forced under tmp/, never the real root.
  const sandboxWorkspace = path.resolve(REAL_WORKSPACE_ROOT, SANDBOX_REL);

  let result;
  try {
    // confirm=true is allowed ONLY because the workspace is the sandbox dir.
    result = await runLeadIntakeImport(text, {
      workspace: sandboxWorkspace,
      confirm: true,
      source: options && options.source ? options.source : 'lead_import_sandbox',
      status: options && options.status ? options.status : undefined,
    });
  } catch (err) {
    return {
      command: CMD.SANDBOX,
      status: STATUS.ERROR,
      ok: false,
      workspace: sandboxWorkspace,
      message: err && err.message ? err.message : String(err),
      safety: { ...SAFETY },
    };
  }

  // Defense-in-depth: refuse to report success if the pipeline somehow
  // targeted the real leads_master.
  if (result && result.is_real_target === true) {
    return {
      command: CMD.SANDBOX,
      status: STATUS.ERROR,
      ok: false,
      workspace: sandboxWorkspace,
      message:
        'Sandbox guard tripped: pipeline reported a real target. No data trusted.',
      safety: { ...SAFETY },
    };
  }

  const summary = buildLeadIntakePipelineSummary(result);
  return {
    command: CMD.SANDBOX,
    status: STATUS.SANDBOX_OK,
    ok: true,
    sandbox_only: true,
    real_data_changed: false,
    workspace: summary.workspace_root || sandboxWorkspace,
    is_real_target: summary.is_real_target === true,
    imported_count: summary.written ? summary.counts.final_unique_count : 0,
    written: summary.written,
    snapshot: summary.snapshot_id,
    qa_status: summary.qa_status,
    pipeline_status: summary.status,
    headline: summary.headline,
    safety: { ...SAFETY },
  };
}

/**
 * Handle /lead_import_commit_approved. In standalone D1b this is ALWAYS
 * BLOCKED_NOT_LIVE. It NEVER calls runLeadIntakeImport on the real workspace.
 *
 * @returns {object}
 */
export function handleLeadImportCommitApprovedCommand() {
  return {
    command: CMD.COMMIT_APPROVED,
    status: STATUS.BLOCKED_NOT_LIVE,
    ok: false,
    real_data_changed: false,
    message:
      'Real commit is BLOCKED in standalone D1b. A real import into 13_sales ' +
      'requires separate Dmitry approval and non-standalone (live, bot-integrated) ' +
      'execution. This module never runs a confirmed import on the real workspace.',
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Parse + dispatch a raw command line to the appropriate handler.
 *
 * This is the single entry point a future bot would call. In D1b it is NOT
 * wired to any bot — it simply returns a structured result object.
 *
 * @param {string} input  e.g. '/lead_import_preview Acme | acme.ru'
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadIntakeCommand(input, options = {}) {
  const parsed = parseLeadIntakeCommand(input);

  if (!parsed.ok) {
    // UNKNOWN_COMMAND or NEEDS_TEXT — surface as-is, attach safety contract.
    return {
      command: parsed.command,
      status: parsed.status,
      ok: false,
      message: parsed.message,
      help: parsed.help,
      safety: { ...SAFETY },
    };
  }

  switch (parsed.command) {
    case CMD.STATUS:
      return handleLeadImportStatusCommand(options);

    case CMD.PREVIEW:
      return handleLeadImportPreviewCommand(parsed.text, options);

    case CMD.SANDBOX:
      return handleLeadImportSandboxCommand(parsed.text, options);

    case CMD.COMMIT_APPROVED:
      return handleLeadImportCommitApprovedCommand();

    default:
      // Should be unreachable given parseLeadIntakeCommand, but stay safe.
      return {
        command: parsed.command,
        status: STATUS.UNKNOWN_COMMAND,
        ok: false,
        message: `Unhandled command: ${parsed.command}`,
        help: getLeadIntakeCommandsHelp(),
        safety: { ...SAFETY },
      };
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Build a compact, human-readable one-object summary from any command result.
 *
 * @param {object} result  the object returned by a handler / dispatcher
 * @returns {object}
 */
export function buildLeadIntakeCommandSummary(result) {
  const r = result && typeof result === 'object' ? result : {};
  const command = r.command || null;
  const status = r.status || STATUS.ERROR;

  let headline;
  switch (status) {
    case STATUS.OK:
      headline =
        command === CMD.STATUS
          ? 'Status snapshot ready (read-only).'
          : 'Command OK.';
      break;
    case STATUS.DRY_RUN:
      headline = 'Preview complete — dry-run only, nothing written.';
      break;
    case STATUS.SANDBOX_OK:
      headline = 'Sandbox import complete — confined to tmp sandbox, real data untouched.';
      break;
    case STATUS.BLOCKED_NOT_LIVE:
      headline = 'Commit BLOCKED — standalone D1b never commits to real data.';
      break;
    case STATUS.NEEDS_TEXT:
      headline = 'Command needs lead text.';
      break;
    case STATUS.UNKNOWN_COMMAND:
      headline = 'Unknown command — see help.';
      break;
    case STATUS.ERROR:
    default:
      headline = r.message ? `Error: ${r.message}` : 'Command failed.';
      break;
  }

  return {
    version: COMMANDS_VERSION,
    pipeline_version: getLeadIntakePipelineVersion(),
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
  getLeadIntakeCommandsVersion,
  getLeadIntakeCommandsHelp,
  parseLeadIntakeCommand,
  buildLeadImportStatus,
  handleLeadImportStatusCommand,
  handleLeadImportPreviewCommand,
  handleLeadImportSandboxCommand,
  handleLeadImportCommitApprovedCommand,
  handleLeadIntakeCommand,
  buildLeadIntakeCommandSummary,
};
