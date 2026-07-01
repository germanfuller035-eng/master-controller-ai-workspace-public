/**
 * lead_id_repair_4_canonical.mjs
 *
 * One-off, controlled, snapshot-backed repair of EXISTING canonical lead records
 * whose `lead_id` is empty.
 *
 * Context:
 *   The lead_id minting code fix (2026-06-05) protects FUTURE imports, but does
 *   not rewrite the 4 existing canonical records that still carry an empty
 *   `lead_id`. This script performs that repair, explicitly authorized by
 *   Dmitry, with a mandatory pre-repair snapshot.
 *
 * HARD SAFETY CONTRACT:
 *   - No network. No SMTP. No email / Telegram / WhatsApp. Auto-send BLOCKED.
 *   - No secrets read (.env / AI_SECRETS).
 *   - Mandatory pre-repair snapshot BEFORE any write (createLeadDataSnapshot).
 *   - Atomic write only (writeJsonAtomic via saveLeadsMasterAtomic).
 *   - Default is DRY RUN. Real write only when invoked with --confirm.
 *   - Records that already carry a non-empty lead_id (e.g. legacy "L1") are
 *     kept untouched; only empty lead_id records are minted.
 *   - Deterministic canonical ids: DLF-YYYYMMDD-NNNN, date stamp derived from
 *     each record's created_at, sequence continued from existing corpus.
 *   - Post-repair integrity gate: FAIL (no write) on any empty-after-mint or
 *     duplicate lead_id.
 *
 * Usage:
 *   node tools/telegram_gateway/lead_id_repair_4_canonical.mjs            # dry run
 *   node tools/telegram_gateway/lead_id_repair_4_canonical.mjs --confirm  # real repair
 */

'use strict';

import path from 'node:path';

import {
  createLeadDataSnapshot,
  readJsonSafe,
} from './lead_data_backup_rollback.mjs';

import {
  loadLeadsMaster,
  saveLeadsMasterAtomic,
  getLeadIntakePipelinePaths,
} from './lead_intake_pipeline.mjs';

import { normalizeLeadId } from './lead_dedupe_engine.mjs';

const WORKSPACE_ROOT = 'D:\\AI_WORKSPACE';
const REPAIR_REASON = 'lead_id_repair_4_canonical_2026-06-05';

// Canonical lead_id shape: DLF-YYYYMMDD-NNNN (mirrors lead_intake_pipeline.mjs).
const LEAD_ID_PREFIX = 'DLF';
const LEAD_ID_CANONICAL_RE = /^DLF-(\d{8})-(\d{3,})$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** Derive an 8-digit YYYYMMDD stamp from a record's created_at (UTC). */
function dateStampFromCreatedAt(createdAt, fallback = new Date()) {
  const d = isNonEmptyString(createdAt) ? new Date(createdAt) : fallback;
  const valid = d instanceof Date && !Number.isNaN(d.getTime()) ? d : fallback;
  const pad = (n) => String(n).padStart(2, '0');
  return `${valid.getUTCFullYear()}${pad(valid.getUTCMonth() + 1)}${pad(
    valid.getUTCDate()
  )}`;
}

function formatLeadId(dateStamp, seq) {
  return `${LEAD_ID_PREFIX}-${dateStamp}-${String(seq).padStart(4, '0')}`;
}

/** Max existing canonical sequence for a given date stamp across the corpus. */
function maxLeadIdSeqForDate(leads, dateStamp) {
  let max = 0;
  for (const lead of leads) {
    const id = normalizeLeadId(lead && lead.lead_id);
    if (!id) continue;
    const m = LEAD_ID_CANONICAL_RE.exec(id);
    if (!m || m[1] !== dateStamp) continue;
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  const paths = getLeadIntakePipelinePaths({ workspace: WORKSPACE_ROOT });
  console.log('--- lead_id repair (4 canonical records) ---');
  console.log('mode            :', confirm ? 'CONFIRMED_REPAIR' : 'DRY_RUN');
  console.log('leads_master    :', paths.leadsMasterAbs);
  console.log('is_real_target  :', paths.isRealTarget);

  // 1. Load existing leads (real corpus).
  const loaded = await loadLeadsMaster({ workspace: WORKSPACE_ROOT });
  if (loaded.error) {
    console.error('FAIL: could not read leads_master:', loaded.error);
    process.exitCode = 1;
    return;
  }
  const leads = Array.isArray(loaded.leads) ? loaded.leads : [];
  console.log('records loaded  :', leads.length);

  // 2. Mandatory snapshot BEFORE any write (also taken in dry run for audit).
  const snapshot = await createLeadDataSnapshot({
    workspaceRoot: WORKSPACE_ROOT,
    reason: confirm ? REPAIR_REASON : `${REPAIR_REASON}__dry_run_preview`,
  });
  console.log('snapshot_id     :', snapshot.snapshot_id);

  // 3. Mint canonical ids for empty-lead_id records only (deterministic).
  //    Seed "seen" with all existing normalized ids to guarantee uniqueness.
  const seen = new Set();
  for (const lead of leads) {
    const id = normalizeLeadId(lead && lead.lead_id);
    if (id) seen.add(id);
  }

  const seqByDate = new Map();
  const repairs = [];

  for (const lead of leads) {
    const current = normalizeLeadId(lead && lead.lead_id);
    if (current) {
      lead.lead_id = current; // normalize-in-place; keep legacy ids (e.g. L1).
      continue;
    }

    const dateStamp = dateStampFromCreatedAt(lead && lead.created_at);
    if (!seqByDate.has(dateStamp)) {
      seqByDate.set(dateStamp, maxLeadIdSeqForDate(leads, dateStamp));
    }

    let seq = seqByDate.get(dateStamp);
    let newId;
    do {
      seq += 1;
      newId = formatLeadId(dateStamp, seq);
    } while (seen.has(newId));
    seqByDate.set(dateStamp, seq);
    seen.add(newId);

    lead.lead_id = newId;
    lead.updated_at = new Date().toISOString();
    repairs.push({ name: lead.name, website: lead.website, minted_lead_id: newId });
  }

  console.log('records repaired:', repairs.length);
  for (const r of repairs) {
    console.log(`  - ${r.minted_lead_id}  <-  ${r.name} (${r.website})`);
  }

  // 4. Integrity gate (rules 10-11): no empty, no duplicates -> else FAIL.
  const blockers = [];
  const idCounts = new Map();
  for (const lead of leads) {
    const id = normalizeLeadId(lead && lead.lead_id);
    if (!id) blockers.push(`empty lead_id remains for "${lead && lead.name}"`);
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  for (const [id, n] of idCounts) {
    if (id && n > 1) blockers.push(`duplicate lead_id: ${id} (x${n})`);
  }

  if (blockers.length > 0) {
    console.error('FAIL: integrity gate blocked the repair:');
    for (const b of blockers) console.error('  -', b);
    console.error('Nothing was written.');
    process.exitCode = 1;
    return;
  }
  console.log('integrity gate  : PASS (no empty, no duplicate lead_id)');

  // 5. Write — DRY RUN by default; real atomic write only with --confirm.
  if (!confirm) {
    console.log('\nDRY RUN complete — no write performed.');
    console.log('Re-run with --confirm to apply the repair.');
    return;
  }

  const writeRes = await saveLeadsMasterAtomic(leads, {
    workspace: WORKSPACE_ROOT,
    confirm: true,
    now: new Date().toISOString(),
  });
  console.log('\nCONFIRMED write : OK');
  console.log('written path    :', writeRes.path);
  console.log('records written :', writeRes.count);
  console.log('bytes           :', writeRes.bytes);

  // 6. Re-read & verify on disk.
  const verify = await readJsonSafe(paths.leadsMasterAbs);
  const verifyLeads =
    verify.parsed && Array.isArray(verify.parsed.leads) ? verify.parsed.leads : [];
  const stillEmpty = verifyLeads.filter((l) => !normalizeLeadId(l && l.lead_id)).length;
  console.log('verify on disk  :', verifyLeads.length, 'records,', stillEmpty, 'empty lead_id');
  console.log('snapshot for rollback:', snapshot.snapshot_id);
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
