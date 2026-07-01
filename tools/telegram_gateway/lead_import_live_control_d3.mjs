/**
 * lead_import_live_control_d3.mjs
 *
 * Daily Lead Factory — D3-2 — Telegram READ-ONLY Live-Control (L0 commands).
 *
 * Scope (authorised 2026-06-06):
 *   Implements ONLY the four L0 read-only commands from the D3-1 command
 *   contract (03_sop/telegram_lead_import_live_control_d3_command_contract.md):
 *     - /lead_queue   — approval-queue summary + top pending cards
 *     - /lead_status  — full status of one card / lead (read-only lookup)
 *     - /lead_review  — read-only deep review of one card (no decision written)
 *     - /lead_health  — system health probe (queue, counts, backups)
 *
 *   Every command delegates to already-approved D2 READ modules and NEVER
 *   writes anything. There is no APPROVE / REJECT / PREPARE / COMMIT path in
 *   this module — those L2/L3 commands are deliberately NOT implemented here.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No production write of any kind (L0 only).
 *   - No queue write / create. If the queue file is absent -> empty summary,
 *     file NOT created.
 *   - No real import. No commit. No queue status transition.
 *   - No client contact. No auto-send. No outbound message of any kind.
 *   - No Telegram API call from this module (pure logic + formatting).
 *   - No network / HTTP / fetch / SMTP.
 *   - No .env / AI_SECRETS / token / credential reads.
 *   - confirm=true is NOT honoured — there is no confirm path at all.
 *
 * Exports:
 *   - getLiveControlVersion
 *   - resolveQueuePath
 *   - handleLeadQueue
 *   - handleLeadStatus
 *   - handleLeadReview
 *   - handleLeadHealth
 *   - parseLiveControlCommand
 *   - handleLiveControlCommand
 *   - formatLiveControlForTelegram
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  loadLeadImportApprovalQueue,
  listPendingLeadImportApprovals,
  validateLeadImportApprovalCard,
} from './lead_import_approval_review.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIVE_CONTROL_VERSION = 'lead-import-live-control-d3-2-readonly-v1';

// The single, frozen safety contract surfaced by every response.
const SAFETY = Object.freeze({
  level: 'L0',
  read_only: 'YES',
  production_write: 'BLOCKED',
  queue_write: 'BLOCKED',
  real_import: 'BLOCKED',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  external_send: 'NO',
  telegram_api_called: 'NO',
  network_used: 'NO',
  smtp_used: 'NO',
  env_secrets: 'NO',
  confirm_allowed: 'NO',
});

// Contract-fixed production data paths (relative to workspace root).
const QUEUE_REL_PATH = path.join('13_sales', 'approval_queue', 'lead_import_approvals.json');
const LEAD_CONTACTS_REL_PATH = path.join('13_sales', 'lead_contacts.json');

// L0 read-only commands implemented by this module.
const L0_COMMANDS = Object.freeze(['/lead_queue', '/lead_status', '/lead_review', '/lead_health']);

// Russian aliases (from D3-1 §7) -> canonical command.
const RU_ALIASES = Object.freeze({
  'очередь лидов': '/lead_queue',
  'очередь импорта': '/lead_queue',
  'статус лида': '/lead_status',
  'статус импорта': '/lead_status',
  'ревью лида': '/lead_review',
  'проверь карточку': '/lead_review',
  'здоровье очереди': '/lead_health',
  'health лидов': '/lead_health',
});

const DEFAULT_QUEUE_LIMIT = 5;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function resolveWorkspaceRoot(workspaceRoot) {
  if (isNonEmptyString(workspaceRoot)) return path.resolve(workspaceRoot);
  return process.cwd();
}

/**
 * Read + parse a JSON file safely. Never throws; never creates the file.
 * @param {string} absPath
 * @returns {Promise<{ exists: boolean, parsed: any, error: string|null }>}
 */
async function readJsonSafe(absPath) {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    try {
      return { exists: true, parsed: JSON.parse(raw), error: null };
    } catch (parseErr) {
      return { exists: true, parsed: null, error: parseErr?.message || String(parseErr) };
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { exists: false, parsed: null, error: null };
    return { exists: false, parsed: null, error: err?.message || String(err) };
  }
}

function countByStatus(cards) {
  const counts = { total: 0, pending: 0, approved: 0, committed: 0, cancelled: 0, failed: 0, other: 0 };
  const list = Array.isArray(cards) ? cards : [];
  counts.total = list.length;
  for (const c of list) {
    const status = isPlainObject(c) && isNonEmptyString(c.status) ? c.status.toUpperCase() : '';
    if (status === 'PENDING') counts.pending += 1;
    else if (status === 'APPROVED_BY_DMITRY' || status === 'APPROVED') counts.approved += 1;
    else if (status === 'COMMITTED') counts.committed += 1;
    else if (status === 'CANCELLED') counts.cancelled += 1;
    else if (status === 'FAILED') counts.failed += 1;
    else counts.other += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Version + path resolution
// ---------------------------------------------------------------------------

export function getLiveControlVersion() {
  return LIVE_CONTROL_VERSION;
}

/**
 * Resolve the production approval-queue path. An explicit options.queuePath
 * overrides; otherwise the contract-fixed path under the workspace root is used.
 * This NEVER creates the file.
 * @param {{ queuePath?: string, workspaceRoot?: string }} [options]
 * @returns {string}
 */
export function resolveQueuePath(options = {}) {
  const opts = isPlainObject(options) ? options : {};
  if (isNonEmptyString(opts.queuePath)) return path.resolve(opts.queuePath);
  return path.join(resolveWorkspaceRoot(opts.workspaceRoot), QUEUE_REL_PATH);
}

function resolveLeadContactsPath(options = {}) {
  const opts = isPlainObject(options) ? options : {};
  if (isNonEmptyString(opts.leadContactsPath)) return path.resolve(opts.leadContactsPath);
  return path.join(resolveWorkspaceRoot(opts.workspaceRoot), LEAD_CONTACTS_REL_PATH);
}

// ---------------------------------------------------------------------------
// /lead_queue (L0)
// ---------------------------------------------------------------------------

/**
 * Show current approval-queue summary (counts by status) + top pending cards.
 * READ-ONLY. Missing queue file -> empty summary, file NOT created.
 *
 * @param {{ queuePath?: string, workspaceRoot?: string, limit?: number }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadQueue(options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const queuePath = resolveQueuePath(opts);
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_QUEUE_LIMIT;

  const loaded = await loadLeadImportApprovalQueue({ queuePath });
  if (!loaded.ok) {
    return {
      ok: false,
      command: '/lead_queue',
      status: loaded.status,
      message: loaded.message || 'queue unavailable (read-only)',
      queue_path: loaded.queue_path || queuePath,
      counts: countByStatus([]),
      pending: [],
      safety: { ...SAFETY },
    };
  }

  const counts = countByStatus(loaded.cards);
  const { pending } = listPendingLeadImportApprovals(loaded.cards);

  return {
    ok: true,
    command: '/lead_queue',
    status: loaded.status,
    queue_exists: loaded.exists === true,
    queue_path: loaded.queue_path,
    counts,
    pending: pending.slice(0, limit),
    pending_total: pending.length,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// /lead_status <import_id|lead_id> (L0)
// ---------------------------------------------------------------------------

/**
 * Show the full status of one card / lead. READ-ONLY. Looks the id up in the
 * approval queue (by import_id) and, if not found there, in lead_contacts
 * (by lead_id). Never writes.
 *
 * @param {string} idArg
 * @param {{ queuePath?: string, leadContactsPath?: string, workspaceRoot?: string }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadStatus(idArg, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const id = isNonEmptyString(idArg) ? idArg.trim() : '';

  if (id === '') {
    return {
      ok: false,
      command: '/lead_status',
      status: 'NEEDS_ID',
      message: 'Usage: /lead_status <import_id|lead_id>',
      safety: { ...SAFETY },
    };
  }

  const queuePath = resolveQueuePath(opts);
  const loaded = await loadLeadImportApprovalQueue({ queuePath });
  if (!loaded.ok) {
    return {
      ok: false,
      command: '/lead_status',
      status: loaded.status,
      message: loaded.message || 'queue unavailable (read-only)',
      safety: { ...SAFETY },
    };
  }

  const card = (Array.isArray(loaded.cards) ? loaded.cards : []).find(
    (c) => isPlainObject(c) && c.import_id === id,
  );

  if (card) {
    return {
      ok: true,
      command: '/lead_status',
      status: 'FOUND',
      found_in: 'approval_queue',
      detail: {
        import_id: card.import_id || null,
        lead_id: card.lead_id || null,
        card_status: card.status || null,
        source: card.source || null,
        created_at: card.created_at || null,
        snapshot_id: card.snapshot_id || null,
        committed: card.status === 'COMMITTED',
        needs_review_count: Number.isInteger(card.needs_review_count) ? card.needs_review_count : null,
        valid_count: Number.isInteger(card.valid_count) ? card.valid_count : null,
        qa_status: card.qa_status || null,
      },
      safety: { ...SAFETY },
    };
  }

  // Fallback: read-only lookup in lead_contacts by lead_id.
  const contactsPath = resolveLeadContactsPath(opts);
  const contactsRes = await readJsonSafe(contactsPath);
  if (contactsRes.exists && isPlainObject(contactsRes.parsed)) {
    const lead = contactsRes.parsed[id];
    if (isPlainObject(lead)) {
      return {
        ok: true,
        command: '/lead_status',
        status: 'FOUND',
        found_in: 'lead_contacts',
        detail: {
          lead_id: id,
          import_id: lead.import_id || null,
          source: lead.source || null,
          committed: true,
          needs_review: lead.needs_review === true,
        },
        safety: { ...SAFETY },
      };
    }
  }

  return {
    ok: false,
    command: '/lead_status',
    status: 'NOT_FOUND',
    message: `No card/lead found for id: ${id} (read-only, nothing written).`,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// /lead_review <import_id> (L0)
// ---------------------------------------------------------------------------

/**
 * Read-only deep review of one card. Echoes the stored QA verdict. Writes
 * NOTHING and produces no decision object that can execute.
 *
 * @param {string} importId
 * @param {{ queuePath?: string, workspaceRoot?: string }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadReview(importId, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const id = isNonEmptyString(importId) ? importId.trim() : '';

  if (id === '') {
    return {
      ok: false,
      command: '/lead_review',
      status: 'NEEDS_ID',
      message: 'Usage: /lead_review <import_id>',
      safety: { ...SAFETY },
    };
  }

  const queuePath = resolveQueuePath(opts);
  const loaded = await loadLeadImportApprovalQueue({ queuePath });
  if (!loaded.ok) {
    return {
      ok: false,
      command: '/lead_review',
      status: loaded.status,
      message: loaded.message || 'queue unavailable (read-only)',
      safety: { ...SAFETY },
    };
  }

  const card = (Array.isArray(loaded.cards) ? loaded.cards : []).find(
    (c) => isPlainObject(c) && c.import_id === id,
  );

  if (!card) {
    return {
      ok: false,
      command: '/lead_review',
      status: 'NOT_FOUND',
      message: `No card found for import_id: ${id} (read-only).`,
      safety: { ...SAFETY },
    };
  }

  const validity = validateLeadImportApprovalCard(card);
  const terminal = card.status === 'COMMITTED' || card.status === 'CANCELLED';

  return {
    ok: true,
    command: '/lead_review',
    status: terminal ? 'TERMINAL' : 'REVIEW',
    review: {
      import_id: card.import_id || null,
      card_status: card.status || null,
      source: card.source || null,
      created_at: card.created_at || null,
      parsed_count: Number.isInteger(card.parsed_count) ? card.parsed_count : null,
      valid_count: Number.isInteger(card.valid_count) ? card.valid_count : null,
      added_count: Number.isInteger(card.added_count) ? card.added_count : null,
      needs_review_count: Number.isInteger(card.needs_review_count) ? card.needs_review_count : null,
      qa_status: card.qa_status || null,
      card_valid: validity.valid,
      card_missing: validity.missing,
      card_invalid: validity.invalid,
    },
    decision_options: terminal
      ? []
      : ['/lead_approve (L2, gated)', '/lead_reject (L2, gated)', '/lead_commit (L3, gated)'],
    note: 'Review only — NO decision written, NO import, NO queue change.',
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// /lead_health (L0)
// ---------------------------------------------------------------------------

/**
 * System health probe: queue file present, counts consistent, backups dir
 * reachable. READ-ONLY — never auto-repairs, never writes.
 *
 * @param {{ queuePath?: string, leadContactsPath?: string, workspaceRoot?: string }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadHealth(options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const root = resolveWorkspaceRoot(opts.workspaceRoot);
  const queuePath = resolveQueuePath(opts);
  const contactsPath = resolveLeadContactsPath(opts);

  const checks = {};

  // Queue probe (read-only).
  const queueRes = await readJsonSafe(queuePath);
  const queueCards = Array.isArray(queueRes.parsed)
    ? queueRes.parsed
    : isPlainObject(queueRes.parsed) && Array.isArray(queueRes.parsed.cards)
      ? queueRes.parsed.cards
      : [];
  checks.queue_present = queueRes.exists === true && !queueRes.error;
  checks.queue_readable = !queueRes.error;
  checks.queue_counts = countByStatus(queueCards);

  // Lead contacts probe (read-only).
  const contactsRes = await readJsonSafe(contactsPath);
  checks.lead_contacts_present = contactsRes.exists === true && !contactsRes.error;
  checks.lead_contacts_count =
    contactsRes.exists && isPlainObject(contactsRes.parsed)
      ? Object.keys(contactsRes.parsed).length
      : 0;

  // Backups dir probe (read-only existence check).
  let backupsReachable = false;
  try {
    const backupsDir = path.join(root, '13_sales', 'backups');
    const st = await fs.stat(backupsDir).catch(() => null);
    backupsReachable = !!(st && st.isDirectory());
  } catch {
    backupsReachable = false;
  }
  checks.backups_reachable = backupsReachable;

  // Consistency: committed cards should not exceed lead_contacts count (soft check).
  checks.counts_consistent =
    checks.queue_counts.committed <= checks.lead_contacts_count || checks.lead_contacts_count === 0;

  const degraded = !checks.queue_readable;

  return {
    ok: true,
    command: '/lead_health',
    status: degraded ? 'DEGRADED' : 'HEALTHY',
    checks,
    live_bot_patch: 'NOT_DONE',
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Command parsing + routing
// ---------------------------------------------------------------------------

/**
 * Parse an incoming text into a canonical L0 command + argument.
 * Returns { inDomain:false } for anything outside the four L0 commands.
 *
 * @param {string} text
 * @returns {{ inDomain: boolean, command: string|null, arg: string|null }}
 */
export function parseLiveControlCommand(text) {
  if (!isNonEmptyString(text)) return { inDomain: false, command: null, arg: null };
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // Slash command.
  if (lower.startsWith('/')) {
    const token = lower.split(/\s/)[0].split('@')[0];
    if (!L0_COMMANDS.includes(token)) return { inDomain: false, command: null, arg: null };
    const arg = raw.replace(/^\/\S+\s*/, '').trim();
    return { inDomain: true, command: token, arg: isNonEmptyString(arg) ? arg.split(/\s+/)[0] : null };
  }

  // Russian aliases.
  for (const [phrase, command] of Object.entries(RU_ALIASES)) {
    if (lower.startsWith(phrase)) {
      const arg = raw.slice(phrase.length).trim();
      return { inDomain: true, command, arg: isNonEmptyString(arg) ? arg.split(/\s+/)[0] : null };
    }
  }

  return { inDomain: false, command: null, arg: null };
}

/**
 * Route an incoming text to the right L0 handler. READ-ONLY only.
 * Out-of-domain text -> { inDomain:false }. Unknown -> handled by parse.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function handleLiveControlCommand(text, options = {}) {
  const parsed = parseLiveControlCommand(text);
  if (!parsed.inDomain) {
    return { inDomain: false, ok: false, status: 'NOT_IN_DOMAIN', safety: { ...SAFETY } };
  }

  switch (parsed.command) {
    case '/lead_queue':
      return { inDomain: true, ...(await handleLeadQueue(options)) };
    case '/lead_status':
      return { inDomain: true, ...(await handleLeadStatus(parsed.arg, options)) };
    case '/lead_review':
      return { inDomain: true, ...(await handleLeadReview(parsed.arg, options)) };
    case '/lead_health':
      return { inDomain: true, ...(await handleLeadHealth(options)) };
    default:
      return { inDomain: false, ok: false, status: 'NOT_IN_DOMAIN', safety: { ...SAFETY } };
  }
}

// ---------------------------------------------------------------------------
// Telegram formatting (plain text; this module never sends)
// ---------------------------------------------------------------------------

/**
 * Format an L0 result object into a short, human-readable Telegram reply.
 * Plain text only — never sent by this module.
 *
 * @param {object} result
 * @returns {string}
 */
export function formatLiveControlForTelegram(result) {
  const r = isPlainObject(result) ? result : {};
  const tail = 'auto_send=BLOCKED | client_contact=BLOCKED';

  switch (r.command) {
    case '/lead_queue': {
      if (!r.ok) return `⚠️ Lead Queue unavailable (read-only): ${r.status}\n${tail}`;
      const c = r.counts || {};
      const lines = [
        '📋 Lead Queue',
        `total: ${c.total} | pending: ${c.pending} | approved: ${c.approved} | ` +
          `committed: ${c.committed} | cancelled: ${c.cancelled} | failed: ${c.failed}`,
      ];
      if (!r.queue_exists) lines.push('(queue file absent — file NOT created)');
      if (Array.isArray(r.pending) && r.pending.length) {
        lines.push('Top pending:');
        r.pending.forEach((card, i) => {
          lines.push(` ${i + 1}. ${card.import_id || '?'} — ${card.source || '?'} — ${card.created_at || '?'}`);
        });
      } else {
        lines.push('Top pending: none');
      }
      lines.push(tail);
      return lines.join('\n');
    }

    case '/lead_status': {
      if (!r.ok) return `ℹ️ /lead_status: ${r.status}\n${r.message || ''}\n${tail}`.trim();
      const d = r.detail || {};
      return [
        `🔎 Lead Status (${r.found_in})`,
        `import_id: ${d.import_id || '—'} | lead_id: ${d.lead_id || '—'}`,
        `status: ${d.card_status || '—'} | committed: ${d.committed}`,
        `source: ${d.source || '—'} | snapshot_id: ${d.snapshot_id || '—'}`,
        `needs_review: ${d.needs_review_count ?? d.needs_review ?? '—'} | qa: ${d.qa_status || '—'}`,
        tail,
      ].join('\n');
    }

    case '/lead_review': {
      if (!r.ok) return `ℹ️ /lead_review: ${r.status}\n${r.message || ''}\n${tail}`.trim();
      const v = r.review || {};
      const lines = [
        `🧐 Lead Review — ${v.import_id || '?'} (${v.card_status || '?'})`,
        `source: ${v.source || '—'} | created: ${v.created_at || '—'}`,
        `parsed: ${v.parsed_count ?? '—'} | valid: ${v.valid_count ?? '—'} | ` +
          `added: ${v.added_count ?? '—'} | needs_review: ${v.needs_review_count ?? '—'}`,
        `qa_status: ${v.qa_status || '—'} | card_valid: ${v.card_valid}`,
      ];
      if (Array.isArray(r.decision_options) && r.decision_options.length) {
        lines.push(`decision options: ${r.decision_options.join(', ')}`);
      }
      lines.push(r.note || 'Review only — nothing written.');
      lines.push(tail);
      return lines.join('\n');
    }

    case '/lead_health': {
      const ch = r.checks || {};
      const qc = ch.queue_counts || {};
      return [
        `🩺 Lead Health: ${r.status}`,
        `queue: ${ch.queue_present ? 'OK' : 'MISSING'} (readable: ${ch.queue_readable ? 'YES' : 'NO'})`,
        `counts: total ${qc.total ?? '?'} / pending ${qc.pending ?? '?'} / committed ${qc.committed ?? '?'}`,
        `lead_contacts: ${ch.lead_contacts_present ? 'OK' : 'MISSING'} (${ch.lead_contacts_count ?? 0})`,
        `counts_consistent: ${ch.counts_consistent ? 'YES' : 'NO'}`,
        `backups_reachable: ${ch.backups_reachable ? 'YES' : 'NO'}`,
        `live_bot_patch: ${r.live_bot_patch}`,
        tail,
      ].join('\n');
    }

    default:
      return [
        '❓ Lead live-control (read-only L0):',
        '/lead_queue — queue summary + top pending',
        '/lead_status <id> — one card / lead status',
        '/lead_review <import_id> — read-only card review',
        '/lead_health — system health probe',
        tail,
      ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getLiveControlVersion,
  resolveQueuePath,
  handleLeadQueue,
  handleLeadStatus,
  handleLeadReview,
  handleLeadHealth,
  parseLiveControlCommand,
  handleLiveControlCommand,
  formatLiveControlForTelegram,
};
