/**
 * yandex_mail_safety_check.mjs
 * YANDEX MAIL SAFETY CHECK — v0.1
 * Checks readiness for Yandex Mail connection WITHOUT real connection.
 * Uses only built-in Node.js modules: fs, path
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = 'D:\\AI_WORKSPACE';
const DATA_DIR = path.join(WORKSPACE, 'data');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

const checks = [];
const warnings = [];
const next = [];

// ─── CHECK 1: communication_rules.json exists ────────────────────────────────
const commRulesPath = path.join(DATA_DIR, 'communication_rules.json');
const commRules = readJson(commRulesPath);
if (!commRules) {
  checks.push({ name: 'communication_rules.json exists', status: 'FAIL', detail: 'File not found' });
  warnings.push('communication_rules.json not found — cannot verify safety rules');
} else {
  checks.push({ name: 'communication_rules.json exists', status: 'PASS', detail: 'File found' });
}

// ─── CHECK 2: auto_send_enabled = false ──────────────────────────────────────
if (commRules) {
  const autoSend = commRules.global_rules?.auto_send_enabled;
  if (autoSend === false) {
    checks.push({ name: 'auto_send_enabled=false', status: 'PASS', detail: 'auto_send_enabled is false' });
  } else {
    checks.push({ name: 'auto_send_enabled=false', status: 'FAIL', detail: `auto_send_enabled=${autoSend}` });
    warnings.push('CRITICAL: auto_send_enabled is not false — sending could happen automatically');
  }
} else {
  checks.push({ name: 'auto_send_enabled=false', status: 'SKIP', detail: 'No communication_rules.json' });
}

// ─── CHECK 3: draft_only = true ──────────────────────────────────────────────
if (commRules) {
  const draftOnly = commRules.global_rules?.draft_only;
  if (draftOnly === true) {
    checks.push({ name: 'draft_only=true', status: 'PASS', detail: 'draft_only is true' });
  } else {
    checks.push({ name: 'draft_only=true', status: 'FAIL', detail: `draft_only=${draftOnly}` });
    warnings.push('draft_only is not true — replies might be sent');
  }
} else {
  checks.push({ name: 'draft_only=true', status: 'SKIP', detail: 'No communication_rules.json' });
}

// ─── CHECK 4: approval_required_for_all_client_replies = true ────────────────
if (commRules) {
  const approvalReq = commRules.global_rules?.approval_required_for_all_client_replies;
  if (approvalReq === true) {
    checks.push({ name: 'approval_required_for_all_client_replies=true', status: 'PASS', detail: 'Approval gate active' });
  } else {
    checks.push({ name: 'approval_required_for_all_client_replies=true', status: 'FAIL', detail: `approval_required=${approvalReq}` });
    warnings.push('approval_required_for_all_client_replies is not true');
  }
} else {
  checks.push({ name: 'approval_required_for_all_client_replies=true', status: 'SKIP', detail: 'No communication_rules.json' });
}

// ─── CHECK 5: message_sources.json contains yandex_mail or gmail_manual ──────
const sourcesPath = path.join(DATA_DIR, 'message_sources.json');
const sources = readJson(sourcesPath);
if (!sources) {
  checks.push({ name: 'message_sources contains yandex_mail/gmail_manual', status: 'FAIL', detail: 'message_sources.json not found' });
  warnings.push('message_sources.json not found');
} else {
  const hasYandex = sources.some(s => s.source_id === 'yandex_mail_manual' || s.source_id === 'yandex_mail');
  const hasGmail = sources.some(s => s.source_id === 'gmail_manual');
  if (hasYandex) {
    checks.push({ name: 'message_sources contains yandex_mail', status: 'PASS', detail: 'yandex_mail_manual source found' });
  } else if (hasGmail) {
    checks.push({ name: 'message_sources contains gmail_manual', status: 'PASS', detail: 'gmail_manual found (yandex not yet added)' });
    next.push('Add yandex_mail_manual to data/message_sources.json');
  } else {
    checks.push({ name: 'message_sources contains email source', status: 'FAIL', detail: 'No email source found in message_sources.json' });
    warnings.push('No email source registered in message_sources.json');
  }
}

// ─── CHECK 6: .env not read / no credentials in workspace root ───────────────
const envPath = path.join(WORKSPACE, '.env');
if (fs.existsSync(envPath)) {
  checks.push({ name: '.env not in workspace root', status: 'WARN', detail: '.env file exists — check it does not contain real credentials' });
  warnings.push('.env file found in workspace root — ensure it is in .gitignore and contains no real tokens');
} else {
  checks.push({ name: '.env not in workspace root', status: 'PASS', detail: 'No .env in workspace root' });
}

// ─── CHECK 7: no real tokens in data/*.json ───────────────────────────────────
const tokenPattern = /["'](token|api_key|password|secret|credential|app_password)['"]\s*:\s*["'][^"']{8,}['"]/gi;
let tokenFound = false;
let tokenFoundIn = [];
const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
for (const file of dataFiles) {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    if (tokenPattern.test(content)) {
      tokenFound = true;
      tokenFoundIn.push(file);
    }
    tokenPattern.lastIndex = 0;
  } catch { /* skip */ }
}
if (tokenFound) {
  checks.push({ name: 'no real tokens in data/*.json', status: 'FAIL', detail: `Token-like values found in: ${tokenFoundIn.join(', ')}` });
  warnings.push(`CRITICAL: Possible tokens found in data files: ${tokenFoundIn.join(', ')}`);
} else {
  checks.push({ name: 'no real tokens in data/*.json', status: 'PASS', detail: 'No token-like values found in data/*.json' });
}

// ─── CHECK 8: forbidden actions in communication_rules ───────────────────────
if (commRules && Array.isArray(commRules.forbidden)) {
  const requiredForbidden = ['send email automatically', 'send telegram message automatically', 'delete messages'];
  const missing = requiredForbidden.filter(f => !commRules.forbidden.some(cf => cf.includes(f.split(' ')[0])));
  if (missing.length === 0) {
    checks.push({ name: 'key forbidden actions defined', status: 'PASS', detail: 'Core forbidden actions are set' });
  } else {
    checks.push({ name: 'key forbidden actions defined', status: 'WARN', detail: `Missing: ${missing.join(', ')}` });
    warnings.push(`Some forbidden actions not explicitly listed: ${missing.join(', ')}`);
  }
} else {
  checks.push({ name: 'key forbidden actions defined', status: 'SKIP', detail: 'No communication_rules.json' });
}

// ─── Determine overall status ────────────────────────────────────────────────
const fails = checks.filter(c => c.status === 'FAIL').length;
const warns = checks.filter(c => c.status === 'WARN').length;
let overall = 'PASS';
if (fails > 0) overall = 'FAIL';
else if (warns > 0) overall = 'PARTIAL';

// ─── Next steps ──────────────────────────────────────────────────────────────
if (!sources?.some(s => s.source_id === 'yandex_mail_manual')) {
  next.push('Add yandex_mail_manual entry to data/message_sources.json');
}
next.push('Real Yandex Mail connection requires separate Dmitry approval + local .env');
next.push('Stage 1 (Read-Only): setup whitelist, get app password, test locally');
next.push('Run: node tools/communication_monitor/yandex_mail_safety_check.mjs after each config change');

// ─── Output ──────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(55));
console.log('  YANDEX MAIL SAFETY CHECK v0.1');
console.log('='.repeat(55));
console.log(`\nOverall: ${overall}`);
console.log(`Checks: ${checks.length} | PASS: ${checks.filter(c=>c.status==='PASS').length} | FAIL: ${fails} | WARN: ${warns}`);
console.log('\n--- Auto-send ---');
const autoSendCheck = checks.find(c => c.name.includes('auto_send'));
console.log(`  ${autoSendCheck?.status || 'SKIP'}: ${autoSendCheck?.detail || 'N/A'}`);

console.log('\n--- Draft-only ---');
const draftCheck = checks.find(c => c.name.includes('draft_only'));
console.log(`  ${draftCheck?.status || 'SKIP'}: ${draftCheck?.detail || 'N/A'}`);

console.log('\n--- Approval gate ---');
const approvalCheck = checks.find(c => c.name.includes('approval_required'));
console.log(`  ${approvalCheck?.status || 'SKIP'}: ${approvalCheck?.detail || 'N/A'}`);

console.log('\n--- All checks ---');
checks.forEach(c => {
  const icon = c.status === 'PASS' ? '✓' : c.status === 'FAIL' ? '✗' : c.status === 'WARN' ? '⚠' : '-';
  console.log(`  [${c.status}] ${icon} ${c.name}`);
  if (c.detail && c.status !== 'PASS') console.log(`       → ${c.detail}`);
});

if (warnings.length > 0) {
  console.log('\n--- Warnings ---');
  warnings.forEach(w => console.log(`  ⚠ ${w}`));
}

console.log('\n--- Next steps ---');
next.forEach(n => console.log(`  → ${n}`));

console.log('\n' + '='.repeat(55));
console.log(`  Status: ${overall} | Yandex Mail NOT connected (safe)`);
console.log('='.repeat(55) + '\n');
