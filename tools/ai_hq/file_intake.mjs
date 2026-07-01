#!/usr/bin/env node
// tools/ai_hq/file_intake.mjs
// DRY-RUN file intake pipeline. Hashes, dedups, classifies type + sensitivity,
// proposes project routing + safe destination + Obsidian index entry.
// NEVER moves, renames, deletes, OCRs, or sends. Read-only by default.
//
// Usage:
//   node tools/ai_hq/file_intake.mjs --incoming DIR [--apply] [--out DIR] [--ts STAMP]
// --apply is intentionally REFUSED unless AI_HQ_ALLOW_APPLY=1 AND not during freeze.
// Exit: 0 ok, 3 bad invocation.

import fs from 'node:fs';
import path from 'node:path';
import {
  GENERATED_ROOT, ensureDir, walk, sha256File, isSensitivePath, looksLikeSecretFile, stamp,
} from './lib/common.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const INCOMING = arg('--incoming', '');
const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'file_intake')));
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const APPLY = process.argv.includes('--apply');

const TYPE_MAP = {
  '.pdf': 'document', '.doc': 'document', '.docx': 'document', '.txt': 'document', '.md': 'document',
  '.jpg': 'photo', '.jpeg': 'photo', '.png': 'photo', '.heic': 'photo',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio',
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video',
  '.zip': 'archive', '.7z': 'archive', '.rar': 'archive',
};

function detectType(ext) { return TYPE_MAP[ext.toLowerCase()] || 'unknown'; }

function classifySensitivity(rel) {
  if (looksLikeSecretFile(rel)) return 'credentials';
  if (isSensitivePath(rel)) return 'sensitive';
  return 'normal';
}

function suggestProject(rel) {
  const r = rel.toLowerCase();
  if (/kgbi|кжби/.test(r)) return 'kgbi_b2b_audit';
  if (/audit|аудит/.test(r)) return 'mini_audit_10k';
  if (/lead|лид/.test(r)) return 'lead_hunter';
  if (/invoice|счет|оплат|revenue/.test(r)) return 'revenue_os';
  return 'review_queue';
}

function suggestDestination(type, sensitivity) {
  if (sensitivity === 'credentials') return 'D:\\AI_SECRETS (manual, never auto)';
  if (sensitivity === 'sensitive') return 'D:\\AI_FILE_VAULT\\00_INBOX_RED_APPROVAL_REQUIRED';
  const map = { document: '01_documents', audio: '02_audio', video: '03_video', photo: '04_photos', archive: '05_archives' };
  return `D:\\AI_FILE_VAULT\\${map[type] || '00_INBOX_YELLOW_REVIEW'}`;
}

function main() {
  if (APPLY) {
    // Hard refusal: apply is never allowed in this build (production freeze + safety).
    console.error('[file_intake] --apply REFUSED: dry-run only. No moves/deletes permitted (freeze).');
    process.exit(3);
  }
  if (!INCOMING || !fs.existsSync(INCOMING)) {
    console.error(`[file_intake] --incoming dir required and must exist: ${INCOMING}`);
    process.exit(3);
  }
  ensureDir(OUT);

  const files = walk(INCOMING);
  const byHash = new Map();
  const records = [];

  for (const rel of files) {
    const abs = path.join(INCOMING, rel);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    const ext = path.extname(rel);
    const hash = sha256File(abs);
    const dup = byHash.has(hash);
    if (!dup) byHash.set(hash, rel);
    const type = detectType(ext);
    const sensitivity = classifySensitivity(rel);
    const project = sensitivity === 'normal' ? suggestProject(rel) : 'sensitive_review';

    records.push({
      path: rel,
      size: stat.size,
      sha256: hash,
      duplicate_of: dup ? byHash.get(hash) : null,
      type,
      sensitivity,
      suggested_project: project,
      // For sensitive/credentials: index/metadata only, no content summary.
      proposed_destination: suggestDestination(type, sensitivity),
      obsidian_index_entry: sensitivity === 'normal'
        ? `20_file_vault_index/cards/${path.basename(rel)}.md`
        : `20_file_vault_index/cards/RED_${path.basename(rel)}.md (index-only, approval_required)`,
      action: 'DRY_RUN_PROPOSE_ONLY',
    });
  }

  const report = {
    schema: 'ai_hq.file_intake.v1',
    generated_ts: TS,
    incoming: INCOMING,
    mode: 'DRY_RUN',
    totals: {
      files: records.length,
      duplicates: records.filter((r) => r.duplicate_of).length,
      sensitive: records.filter((r) => r.sensitivity !== 'normal').length,
      to_review_queue: records.filter((r) => r.suggested_project === 'review_queue').length,
    },
    records,
    safety: {
      files_moved: 0, files_deleted: 0, files_renamed: 0, ocr_performed: 0, files_sent: 0,
      content_read_for_sensitive: 0,
    },
  };

  fs.writeFileSync(path.join(OUT, `intake_${TS}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'intake_latest.json'), JSON.stringify(report, null, 2));
  console.log(`[file_intake] DRY_RUN files=${report.totals.files} dups=${report.totals.duplicates} sensitive=${report.totals.sensitive} (0 moved, 0 deleted)`);
  process.exit(0);
}

main();
