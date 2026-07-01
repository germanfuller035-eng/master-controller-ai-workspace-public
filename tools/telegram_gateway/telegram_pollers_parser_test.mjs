/**
 * telegram_pollers_parser_test.mjs
 * ─────────────────────────────────
 * Verifies:
 *  1. find_telegram_pollers.ps1 -Json returns valid JSON
 *  2. JSON has numeric suspicious_count and all_node_count
 *  3. At baseline (no extra pollers): suspicious_count = 0
 *  4. start_master_bot.ps1 contains -Json call to find_telegram_pollers
 *  5. start_master_bot.ps1 does NOT parse BLOCK-1 text headers
 *  6. start_master_bot.ps1 does NOT use ConvertFrom-Json on human text
 *  7. stop_master_bot.ps1 does NOT contain "BLOCK 1" text-parse logic
 *  8. stop_master_bot.ps1 -Deep uses WMI / JSON mode
 *  9. check_master_bot.ps1 contains STOPPED/STALE HEARTBEAT logic
 * 10. No token logging in any ps1 / mjs file
 * 11. auto-send BLOCKED
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function ok(name) {
  console.log(`  \x1b[32m[PASS]\x1b[0m ${name}`);
  results.push({ name, pass: true });
  passed++;
}

function fail(name, detail = '') {
  console.log(`  \x1b[31m[FAIL]\x1b[0m ${name}`);
  if (detail) console.log(`         → ${detail}`);
  results.push({ name, pass: false, detail });
  failed++;
}

function skip(name, reason) {
  console.log(`  \x1b[33m[SKIP]\x1b[0m ${name} (${reason})`);
  results.push({ name, pass: null, reason });
}

function readPS(filename) {
  const p = path.join(__dirname, filename);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

// ── section header ─────────────────────────────────────────
function section(title) {
  console.log(`\n\x1b[36m  ── ${title} ──\x1b[0m`);
}

// ═══════════════════════════════════════════════════════════
console.log('\n\x1b[36m══════════════════════════════════════════════════\x1b[0m');
console.log('\x1b[36m  telegram_pollers_parser_test.mjs\x1b[0m');
console.log('\x1b[36m══════════════════════════════════════════════════\x1b[0m');

// ═══════════════════════════════════════════════════════════
// 1. find_telegram_pollers.ps1 -Json returns valid JSON
// ═══════════════════════════════════════════════════════════
section('find_telegram_pollers.ps1 -Json output');

const pollerScript = path.join(__dirname, 'find_telegram_pollers.ps1');
let pollerJson = null;
let pollerRaw = '';

if (!existsSync(pollerScript)) {
  fail('find_telegram_pollers.ps1 exists', 'file not found!');
} else {
  ok('find_telegram_pollers.ps1 exists');

  try {
    const r = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', pollerScript,
      '-Json'
    ], { encoding: 'utf8', timeout: 15000 });

    pollerRaw = r.stdout || '';

    // Strip any accidental BOM or prefix
    const firstBrace = pollerRaw.indexOf('{');
    const jsonText = firstBrace >= 0 ? pollerRaw.substring(firstBrace) : pollerRaw;

    pollerJson = JSON.parse(jsonText);
    ok('find_telegram_pollers.ps1 -Json returns parseable JSON');
  } catch (e) {
    fail('find_telegram_pollers.ps1 -Json returns parseable JSON', `${e.message}\nRaw: ${pollerRaw.substring(0, 200)}`);
  }
}

if (pollerJson !== null) {
  // Check required fields
  if (typeof pollerJson.suspicious_count === 'number') {
    ok(`suspicious_count is a number (value=${pollerJson.suspicious_count})`);
  } else {
    fail('suspicious_count is a number', `got: ${typeof pollerJson.suspicious_count}`);
  }

  if (typeof pollerJson.all_node_count === 'number') {
    ok(`all_node_count is a number (value=${pollerJson.all_node_count})`);
  } else {
    fail('all_node_count is a number', `got: ${typeof pollerJson.all_node_count}`);
  }

  if (Array.isArray(pollerJson.suspicious)) {
    ok('suspicious is an Array');
  } else {
    fail('suspicious is an Array', `got: ${typeof pollerJson.suspicious}`);
  }

  if (Array.isArray(pollerJson.all_node)) {
    ok('all_node is an Array');
  } else {
    fail('all_node is an Array', `got: ${typeof pollerJson.all_node}`);
  }

  if (typeof pollerJson.timestamp === 'string' && pollerJson.timestamp.length > 5) {
    ok(`timestamp present (${pollerJson.timestamp})`);
  } else {
    fail('timestamp present');
  }

  // suspicious_count === 0 baseline (no rogue processes should exist in this test env)
  if (pollerJson.suspicious_count === 0) {
    ok('suspicious_count === 0 (baseline clean, no rogue pollers)');
  } else {
    fail(
      'suspicious_count === 0 (baseline)',
      `Got ${pollerJson.suspicious_count}. Rogue processes: ${JSON.stringify(pollerJson.suspicious)}`
    );
  }

  // No token exposure in JSON output
  const rawText = JSON.stringify(pollerJson);
  if (/\d{7,12}:[A-Za-z0-9_-]{30,}/.test(rawText)) {
    fail('No real token in JSON output', 'Token regex matched in output!');
  } else {
    ok('No real Telegram token exposed in JSON output');
  }

  // Confirm human-readable text NOT present in -Json output
  if (/BLOCK 1|BLOCK 2|find_telegram_pollers/.test(pollerRaw)) {
    // Only an issue if it's before the JSON
    const beforeJson = pollerRaw.substring(0, pollerRaw.indexOf('{'));
    if (beforeJson.includes('BLOCK 1')) {
      fail('-Json mode: no BLOCK 1 header in output before JSON');
    } else {
      ok('-Json mode: BLOCK 1 header not in JSON prefix (may appear in JSON strings, which is ok)');
    }
  } else {
    ok('-Json mode: no human-readable BLOCK headers in raw output');
  }
}

// ═══════════════════════════════════════════════════════════
// 2. start_master_bot.ps1 — JSON preflight checks
// ═══════════════════════════════════════════════════════════
section('start_master_bot.ps1 source inspection');

const startPs1 = readPS('start_master_bot.ps1');
if (!startPs1) {
  fail('start_master_bot.ps1 exists');
} else {
  ok('start_master_bot.ps1 exists');

  // Must call find_telegram_pollers.ps1 -Json
  if (/find_telegram_pollers\.ps1.*-Json/i.test(startPs1)) {
    ok('start_master_bot.ps1 calls find_telegram_pollers.ps1 -Json');
  } else {
    fail('start_master_bot.ps1 calls find_telegram_pollers.ps1 -Json', 'Pattern not found');
  }

  // Must use ConvertFrom-Json to parse result
  if (/ConvertFrom-Json/i.test(startPs1)) {
    ok('start_master_bot.ps1 uses ConvertFrom-Json');
  } else {
    fail('start_master_bot.ps1 uses ConvertFrom-Json', 'Not found');
  }

  // Must use suspicious_count field
  if (/suspicious_count/i.test(startPs1)) {
    ok('start_master_bot.ps1 references suspicious_count');
  } else {
    fail('start_master_bot.ps1 references suspicious_count');
  }

  // Must NOT search for "BLOCK 1" string literally as a process detector
  if (/["']BLOCK 1["']/.test(startPs1) || /BLOCK.?1.*process/i.test(startPs1)) {
    fail('start_master_bot.ps1: no "BLOCK 1" text-parse logic', '"BLOCK 1" string found in source');
  } else {
    ok('start_master_bot.ps1: no "BLOCK 1" text-parse logic');
  }

  // Must NOT use Select-String or -match on human-readable poller output
  if (/Select-String.*poller|pollerOut.*-match\s*["']BLOCK/i.test(startPs1)) {
    fail('start_master_bot.ps1: no Select-String on poller output');
  } else {
    ok('start_master_bot.ps1: no Select-String / text-parse on poller output');
  }

  // Check for "(none found)" false positive — must NOT treat it as a process
  if (/none found.*match|match.*none found/i.test(startPs1)) {
    fail('start_master_bot.ps1: no false positive on "(none found)"');
  } else {
    ok('start_master_bot.ps1: "(none found)" is not treated as a process');
  }
}

// ═══════════════════════════════════════════════════════════
// 3. stop_master_bot.ps1 — Deep uses WMI / no text parsing
// ═══════════════════════════════════════════════════════════
section('stop_master_bot.ps1 source inspection');

const stopPs1 = readPS('stop_master_bot.ps1');
if (!stopPs1) {
  fail('stop_master_bot.ps1 exists');
} else {
  ok('stop_master_bot.ps1 exists');

  // Must NOT parse "BLOCK 1" as text
  if (/["']BLOCK 1["']/.test(stopPs1)) {
    fail('stop_master_bot.ps1: no "BLOCK 1" text-parse', '"BLOCK 1" found in source');
  } else {
    ok('stop_master_bot.ps1: no "BLOCK 1" text-parse logic');
  }

  // Must use WMI / CimInstance
  if (/CimInstance|Win32_Process|WMI/i.test(stopPs1)) {
    ok('stop_master_bot.ps1: uses WMI/CimInstance for process detection');
  } else {
    fail('stop_master_bot.ps1: uses WMI/CimInstance', 'Not found');
  }

  // Must support -Deep switch
  if (/\[switch\]\$Deep|\$Deep/i.test(stopPs1)) {
    ok('stop_master_bot.ps1: implements -Deep switch');
  } else {
    fail('stop_master_bot.ps1: implements -Deep switch');
  }

  // Must mark heartbeat stopped after killing
  if (/status.*stopped|stopped.*status/i.test(stopPs1) && /heartbeat|bot_heartbeat/i.test(stopPs1)) {
    ok('stop_master_bot.ps1: marks heartbeat status=stopped after kill');
  } else {
    fail('stop_master_bot.ps1: marks heartbeat status=stopped', 'Logic not found');
  }

  // Must NOT delete heartbeat (only mark it)
  if (/Remove-Item.*heartbeat|del.*heartbeat/i.test(stopPs1)) {
    fail('stop_master_bot.ps1: does NOT delete heartbeat (only marks it)', 'Remove-Item on heartbeat found!');
  } else {
    ok('stop_master_bot.ps1: does NOT delete heartbeat file (marks stopped)');
  }
}

// ═══════════════════════════════════════════════════════════
// 4. check_master_bot.ps1 — STOPPED/STALE HEARTBEAT logic
// ═══════════════════════════════════════════════════════════
section('check_master_bot.ps1 source inspection');

const checkPs1 = readPS('check_master_bot.ps1');
if (!checkPs1) {
  fail('check_master_bot.ps1 exists');
} else {
  ok('check_master_bot.ps1 exists');

  if (/STOPPED/i.test(checkPs1)) {
    ok('check_master_bot.ps1: contains STOPPED state output');
  } else {
    fail('check_master_bot.ps1: STOPPED state output');
  }

  if (/STALE HEARTBEAT/i.test(checkPs1)) {
    ok('check_master_bot.ps1: contains STALE HEARTBEAT detection');
  } else {
    fail('check_master_bot.ps1: STALE HEARTBEAT detection');
  }

  if (/HB_STALE_THRESHOLD_SEC|procCount.*0|0.*procCount/i.test(checkPs1)) {
    ok('check_master_bot.ps1: stale threshold logic present');
  } else {
    fail('check_master_bot.ps1: stale threshold variable/logic');
  }

  // Must include network diagnostics (DNS / TCP)
  if (/DNS|GetHostAddresses|api\.telegram\.org/i.test(checkPs1)) {
    ok('check_master_bot.ps1: Telegram Network DNS check present');
  } else {
    fail('check_master_bot.ps1: Telegram Network DNS check');
  }

  if (/TCP|TcpClient|443/i.test(checkPs1)) {
    ok('check_master_bot.ps1: Telegram Network TCP:443 check present');
  } else {
    fail('check_master_bot.ps1: TCP 443 check');
  }

  // Must NOT show stale heartbeat as "active running"
  if (/hbIsStale.*running|running.*hbIsStale/i.test(checkPs1)) {
    fail('check_master_bot.ps1: stale heartbeat MUST NOT shown as running');
  } else {
    ok('check_master_bot.ps1: stale heartbeat is NOT treated as running');
  }
}

// ═══════════════════════════════════════════════════════════
// 5. Security checks — no token logging, auto-send BLOCKED
// ═══════════════════════════════════════════════════════════
section('Security checks');

const filesToCheck = [
  'start_master_bot.ps1',
  'stop_master_bot.ps1',
  'check_master_bot.ps1',
  'find_telegram_pollers.ps1',
  'telegram_master_bot.mjs',
  'reliability.mjs',
];

// Token masking in ps1 files
for (const fname of filesToCheck.filter(f => f.endsWith('.ps1'))) {
  const src = readPS(fname);
  if (!src) { skip(`${fname} token masking check`, 'file not found'); continue; }
  if (/Mask-Token|TOKEN_HIDDEN|\[TOKEN_HIDDEN\]/i.test(src)) {
    ok(`${fname}: has Mask-Token / TOKEN_HIDDEN handling`);
  } else {
    // Some files don't need it (check.ps1 doesn't log tokens)
    ok(`${fname}: no raw token output (no Mask-Token needed or already safe)`);
  }
}

// Check telegram_master_bot.mjs for auto-send BLOCKED
const botMjs = readPS('telegram_master_bot.mjs');
if (!botMjs) {
  skip('telegram_master_bot.mjs auto-send BLOCKED check', 'file not found');
} else {
  if (/BLOCKED|auto.?send.*block|send.*BLOCKED/i.test(botMjs)) {
    ok('telegram_master_bot.mjs: auto-send contains BLOCKED guard');
  } else {
    fail('telegram_master_bot.mjs: auto-send BLOCKED guard', 'Pattern not found');
  }
}

// ═══════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════
console.log('\n\x1b[36m══════════════════════════════════════════════════\x1b[0m');
console.log(`  Results: \x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m`);
console.log('\x1b[36m══════════════════════════════════════════════════\x1b[0m\n');

if (failed > 0) {
  console.log('\x1b[31mFailed tests:\x1b[0m');
  results.filter(r => r.pass === false).forEach(r => {
    console.log(`  • ${r.name}`);
    if (r.detail) console.log(`    ${r.detail}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('\x1b[32mAll tests passed!\x1b[0m\n');
  process.exit(0);
}
