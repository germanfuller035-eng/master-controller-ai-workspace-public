#!/usr/bin/env node
// tools/ai_hq/chatgpt_import.mjs
// Offline, idempotent ChatGPT export -> Obsidian routing pipeline.
// Original export is never modified. Dedup by conversation id. No secrets. No giant single dump.
//
// Usage:
//   node tools/ai_hq/chatgpt_import.mjs --export PATH(conversations.json) [--out DIR] [--ts STAMP] [--state PATH]
// Exit: 0 ok, 3 bad invocation, 4 integrity failure.

import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, ensureDir, stamp, sha256Str } from './lib/common.mjs';
import { redactString, scanForSecrets } from './lib/redact.mjs';
import { isSensitivePath } from './lib/common.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const EXPORT = arg('--export', '');
const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'chatgpt_import')));
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const STATE = path.resolve(arg('--state', path.join(OUT, 'import_state.json')));

const SENSITIVE_TITLE = /(паспорт|passport|медиц|medical|legal|юридич|военк|vvk|диагноз|личн|personal|банк|bank|credential|пароль|password)/i;

function classifyProject(title, text) {
  const s = `${title} ${text}`.toLowerCase();
  if (/kgbi|кжби/.test(s)) return 'kgbi_b2b_audit';
  if (/lead hunter|overpass|2gis|dataforseo/.test(s)) return 'lead_hunter';
  if (/mini audit|мини аудит|аудит сайта/.test(s)) return 'mini_audit_10k';
  if (/telegram|бот/.test(s)) return 'telegram_master_controller';
  if (/android|kotlin|compose/.test(s)) return 'android_master_controller';
  if (/revenue|выручк|оплат|invoice/.test(s)) return 'revenue_os';
  if (/obsidian|vault|registry/.test(s)) return 'obsidian_hq';
  return 'review_queue';
}

function extractText(mapping) {
  // ChatGPT export: conversation.mapping = { id: { message: { content: { parts: [...] }}}}
  const parts = [];
  if (!mapping) return '';
  for (const node of Object.values(mapping)) {
    const m = node && node.message;
    if (m && m.content && Array.isArray(m.content.parts)) {
      for (const p of m.content.parts) if (typeof p === 'string') parts.push(p);
    }
  }
  return parts.join('\n');
}

function summarize(text, max = 600) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.slice(0, max);
}

function extractDecisions(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (/\b(решили|decision|договорились|правило|never|always|forbidden|запрещ)\b/i.test(line) && line.length < 200) {
      out.push(line.trim());
    }
  }
  return out.slice(0, 10);
}

function extractTasks(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (/\b(todo|task|нужно|сделать|next step|action item)\b/i.test(line) && line.length < 200) {
      out.push(line.trim());
    }
  }
  return out.slice(0, 10);
}

function main() {
  if (!EXPORT || !fs.existsSync(EXPORT)) {
    console.error(`[chatgpt_import] --export file required and must exist: ${EXPORT}`);
    process.exit(3);
  }
  ensureDir(OUT);

  let data;
  try { data = JSON.parse(fs.readFileSync(EXPORT, 'utf8')); }
  catch (e) { console.error(`[chatgpt_import] integrity: cannot parse export JSON: ${e.message}`); process.exit(4); }

  const conversations = Array.isArray(data) ? data : (data.conversations || []);
  if (!Array.isArray(conversations)) { console.error('[chatgpt_import] integrity: no conversations array'); process.exit(4); }

  // Idempotency state: which conversation ids already imported (by id + content hash).
  let state = { imported: {} };
  if (fs.existsSync(STATE)) {
    try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* reset */ }
  }

  const result = { schema: 'ai_hq.chatgpt_import.v1', generated_ts: TS, export: EXPORT,
    totals: { total: conversations.length, imported: 0, skipped_dup: 0, sensitive_restricted: 0, review_queue: 0, secrets_blocked: 0 },
    notes: [] };

  for (const conv of conversations) {
    const id = conv.id || conv.conversation_id || sha256Str(JSON.stringify(conv).slice(0, 200));
    const title = conv.title || 'Untitled';
    const text = extractText(conv.mapping) || conv.text || '';
    const contentHash = sha256Str(text);

    // Idempotent dedup: same id + same content => skip.
    if (state.imported[id] && state.imported[id] === contentHash) {
      result.totals.skipped_dup++;
      continue;
    }

    // Sensitive conversations: restricted index entry, no summary content.
    if (SENSITIVE_TITLE.test(title) || isSensitivePath(title)) {
      result.notes.push({ id, title: '(sensitive — title withheld)', project: 'sensitive_review', restricted: true });
      result.totals.sensitive_restricted++;
      state.imported[id] = contentHash;
      continue;
    }

    // Secret scan: if conversation body contains secret-like content, do not write summary content.
    const secretFindings = scanForSecrets(text);
    if (secretFindings.some((f) => f.severity === 'critical')) {
      result.notes.push({ id, title, project: 'review_queue', secrets_blocked: true });
      result.totals.secrets_blocked++;
      state.imported[id] = contentHash;
      continue;
    }

    const project = classifyProject(title, text);
    const { text: safeSummary } = redactString(summarize(text));
    const note = {
      id, title, project,
      source: 'chatgpt_export', source_date: conv.create_time || conv.update_time || null,
      summary: safeSummary,
      decisions: extractDecisions(text).map((d) => redactString(d).text),
      tasks: extractTasks(text).map((t) => redactString(t).text),
      route: project === 'review_queue' ? '00_IMPORTS/review_queue/' : `02_context_packs/imported/${project}/`,
    };
    // Write per-conversation note (NOT one giant dump).
    ensureDir(path.join(OUT, 'notes', project));
    fs.writeFileSync(path.join(OUT, 'notes', project, `${id}.json`), JSON.stringify(note, null, 2));
    result.totals.imported++;
    if (project === 'review_queue') result.totals.review_queue++;
    state.imported[id] = contentHash;
  }

  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(OUT, `import_report_${TS}.json`), JSON.stringify(result, null, 2));
  console.log(`[chatgpt_import] total=${result.totals.total} imported=${result.totals.imported} dup_skipped=${result.totals.skipped_dup} sensitive=${result.totals.sensitive_restricted} secrets_blocked=${result.totals.secrets_blocked}`);
  process.exit(0);
}

main();
