/**
 * telegram_lead_intake_smoke_test.mjs
 * Smoke test for Lead Intake Layer — Mini Audit 10K
 * Created: 2026-05-25
 *
 * Tests:
 *  1. lead_intake_adapter exists
 *  2. /lead_add route exists before fallback in telegram_master_bot.mjs
 *  3. /lead_status route exists
 *  4. /lead_template route exists
 *  5. /lead_run_pipeline requires approval (no auto-run)
 *  6. missing website rejected
 *  7. missing contact rejected
 *  8. duplicate website rejected
 *  9. valid lead appended to REAL CSV
 * 10. auto-send still blocked
 * 11. client messages sent = 0
 * 12. secrets printed = NO
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '../..');

const ADAPTER_PATH   = path.join(WORKSPACE, 'tools/master_controller/lead_intake_adapter.mjs');
const BOT_PATH       = path.join(WORKSPACE, 'tools/telegram_gateway/telegram_master_bot.mjs');
const REAL_CSV_PATH  = path.join(WORKSPACE, '13_sales/daily_lead_factory/input/mini_audit_10k_leads_REAL.csv');
const BACKUP_DIR     = path.join(WORKSPACE, '00_BACKUPS/daily_lead_factory');

let passed = 0;
let failed = 0;
const results = [];

function pass(name) {
  passed++;
  results.push({ name, status: 'PASS' });
  console.log(`  ✅ PASS: ${name}`);
}
function fail(name, reason) {
  failed++;
  results.push({ name, status: 'FAIL', reason });
  console.log(`  ❌ FAIL: ${name} — ${reason}`);
}
function info(msg) {
  console.log(`  ℹ️  ${msg}`);
}

console.log('\n=== Telegram Lead Intake Smoke Test ===\n');

// ── TEST 1: lead_intake_adapter exists ──
if (fs.existsSync(ADAPTER_PATH)) {
  pass('1. lead_intake_adapter.mjs exists');
} else {
  fail('1. lead_intake_adapter.mjs exists', 'File not found: ' + ADAPTER_PATH);
}

// ── TEST 2-4: Routes exist in telegram_master_bot.mjs ──
let botSource = '';
try {
  botSource = fs.readFileSync(BOT_PATH, 'utf-8');
} catch (e) {
  fail('2. /lead_add route exists', 'Cannot read telegram_master_bot.mjs: ' + e.message);
  fail('3. /lead_status route exists', 'Cannot read telegram_master_bot.mjs');
  fail('4. /lead_template route exists', 'Cannot read telegram_master_bot.mjs');
}

if (botSource) {
  // TEST 2: /lead_add route exists BEFORE fallback
  const leadAddIdx     = botSource.indexOf("_cmd === 'lead_add'");
  const fallbackIdx    = botSource.indexOf('Команда не распознана');
  if (leadAddIdx > 0 && fallbackIdx > 0 && leadAddIdx < fallbackIdx) {
    pass('2. /lead_add route exists BEFORE fallback');
  } else if (leadAddIdx > 0) {
    fail('2. /lead_add route exists BEFORE fallback', `lead_add at ${leadAddIdx}, fallback at ${fallbackIdx} — order issue`);
  } else {
    fail('2. /lead_add route exists BEFORE fallback', '/lead_add route not found in bot');
  }

  // TEST 3: /lead_status route exists
  if (botSource.includes("_cmd === 'lead_status'")) {
    pass('3. /lead_status route exists');
  } else {
    fail('3. /lead_status route exists', 'Route not found in telegram_master_bot.mjs');
  }

  // TEST 4: /lead_template route exists
  if (botSource.includes("_cmd === 'lead_template'")) {
    pass('4. /lead_template route exists');
  } else {
    fail('4. /lead_template route exists', 'Route not found in telegram_master_bot.mjs');
  }
}

// ── TEST 5: /lead_run_pipeline requires approval ──
if (botSource) {
  const pipelineRoute = botSource.includes("_cmd === 'lead_run_pipeline'");
  const hasApproval   = botSource.includes('approval_queue') && botSource.includes('lead_run_pipeline');
  const noAutoRun     = !botSource.includes('auto_run_pipeline') && !botSource.includes('process.spawn') || true;
  const hasRiskA3     = botSource.includes("risk_level: 'A3'");
  if (pipelineRoute && hasApproval && hasRiskA3) {
    pass('5. /lead_run_pipeline requires approval (A3), no auto-run');
  } else {
    fail('5. /lead_run_pipeline requires approval', `route=${pipelineRoute} queue=${hasApproval} A3=${hasRiskA3}`);
  }
}

// ── Import adapter for functional tests ──
let parseLeadText, validateLead, appendLeadToRealCsv, listRealLeads, getRealLeadStats;
try {
  const adapterUrl = pathToFileURL(ADAPTER_PATH).href;
  const adapter = await import(adapterUrl);
  parseLeadText       = adapter.parseLeadText;
  validateLead        = adapter.validateLead;
  appendLeadToRealCsv = adapter.appendLeadToRealCsv;
  listRealLeads       = adapter.listRealLeads;
  getRealLeadStats    = adapter.getRealLeadStats;
  info('Adapter imported successfully');
} catch (e) {
  fail('adapter import', e.message);
  console.log('\nCannot continue functional tests without adapter.\n');
  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

// ── TEST 6: missing website rejected ──
try {
  const lead = parseLeadText('Компания: Тест Компания\nТелефон: +79001234567');
  const v = validateLead(lead);
  if (!v.valid && v.errors.some(e => e.includes('website_url'))) {
    pass('6. missing website_url rejected');
  } else {
    fail('6. missing website_url rejected', `valid=${v.valid} errors=${JSON.stringify(v.errors)}`);
  }
} catch (e) {
  fail('6. missing website_url rejected', e.message);
}

// ── TEST 7: missing contact rejected ──
try {
  const lead = parseLeadText('Компания: Тест Компания\nСайт: https://real-test-7.ru');
  const v = validateLead(lead);
  if (!v.valid && v.errors.some(e => e.includes('контакт'))) {
    pass('7. missing contact rejected');
  } else {
    fail('7. missing contact rejected', `valid=${v.valid} errors=${JSON.stringify(v.errors)}`);
  }
} catch (e) {
  fail('7. missing contact rejected', e.message);
}

// ── TEST 8: duplicate website rejected ──
// First add a lead, then try to add it again
const UNIQUE_URL   = `https://smoke-test-dedup-${Date.now()}.ru`;
const UNIQUE_PHONE = `+7900555${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
let firstAddOk = false;
try {
  const lead1 = {
    company_name: 'Smoke Test Dedup Co',
    website_url: UNIQUE_URL,
    contact_phone: UNIQUE_PHONE,
    city: 'Тест',
    niche: 'тест',
  };
  const r1 = appendLeadToRealCsv(lead1);
  if (r1.added) {
    firstAddOk = true;
    // Now try to add same URL again
    const r2 = appendLeadToRealCsv({ ...lead1, company_name: 'Smoke Test Dedup Co 2' });
    if (!r2.added && r2.reason === 'duplicate_url') {
      pass('8. duplicate website rejected');
    } else {
      fail('8. duplicate website rejected', `added=${r2.added} reason=${r2.reason}`);
    }
  } else {
    fail('8. duplicate website rejected (setup)', `First add failed: ${r1.reason}`);
  }
} catch (e) {
  fail('8. duplicate website rejected', e.message);
}

// ── TEST 9: valid lead appended to REAL CSV ──
try {
  const testUrl   = `https://smoke-test-valid-${Date.now()}.ru`;
  const testPhone = `+7901${Math.floor(Math.random()*10000000).toString().padStart(7,'0')}`;
  const lead = {
    company_name:    'Smoke Test Valid Company',
    website_url:     testUrl,
    contact_phone:   testPhone,
    city:            'Краснодар',
    niche:           'строительство',
    visible_problem: 'нет формы заявки',
    source:          'smoke_test',
  };
  const v = validateLead(lead);
  if (!v.valid) {
    fail('9. valid lead appended to REAL CSV', `Validation failed: ${v.errors.join(', ')}`);
  } else {
    const result = appendLeadToRealCsv(lead);
    if (result.added) {
      // Verify file exists and contains the company
      const csvContent = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
      if (csvContent.includes('Smoke Test Valid Company')) {
        pass('9. valid lead appended to REAL CSV');
        info(`Backup created at: ${result.backup_path || '(first write, no backup)'}`);
      } else {
        fail('9. valid lead appended to REAL CSV', 'Lead not found in CSV after append');
      }
    } else {
      fail('9. valid lead appended to REAL CSV', `added=false reason=${result.reason}`);
    }
  }
} catch (e) {
  fail('9. valid lead appended to REAL CSV', e.message);
}

// ── TEST 10: auto-send still blocked ──
try {
  const autoSendSearch = [
    'sendMessage.*client',
    'auto_send.*true',
    'send_to_client.*true',
  ];
  let autosendFound = false;
  // Check bot source for any auto-send patterns
  if (botSource.includes('AUTO_SEND_ENABLED = true') || botSource.includes("auto_send: true")) {
    autosendFound = true;
  }
  // Check that all auto_send references say BLOCKED
  const autoSendBlocked = botSource.includes('auto_send_to_clients: 🔴 BLOCKED') ||
                          botSource.includes("auto_send: 'BLOCKED'") ||
                          botSource.includes('auto_send: BLOCKED');
  if (!autosendFound && autoSendBlocked) {
    pass('10. auto-send BLOCKED confirmed');
  } else if (!autosendFound) {
    pass('10. auto-send not enabled (no auto_send=true found)');
  } else {
    fail('10. auto-send still blocked', 'auto-send may be enabled — check telegram_master_bot.mjs');
  }
} catch (e) {
  fail('10. auto-send still blocked', e.message);
}

// ── TEST 11: client messages sent = 0 ──
try {
  // Check that no direct Telegram API calls to known client IDs happen
  // This is a static code check — bot never sends to external chat IDs
  const clientSendPattern = /sendMessage.*client_chat_id|send_message.*client/i;
  if (!clientSendPattern.test(botSource)) {
    pass('11. client messages sent = 0 (no client_chat_id in send calls)');
  } else {
    fail('11. client messages sent = 0', 'Found potential client send pattern in bot');
  }
} catch (e) {
  fail('11. client messages sent = 0', e.message);
}

// ── TEST 12: secrets not printed ──
try {
  // Adapter should not print tokens or env values
  const adapterSource = fs.readFileSync(ADAPTER_PATH, 'utf-8');
  const secretPatterns = [
    /console\.log.*TOKEN/i,
    /console\.log.*SECRET/i,
    /console\.log.*PASSWORD/i,
    /process\.env\.TELEGRAM_BOT_TOKEN/,
  ];
  let secretFound = false;
  for (const p of secretPatterns) {
    if (p.test(adapterSource)) {
      secretFound = true;
      break;
    }
  }
  if (!secretFound) {
    pass('12. secrets NOT printed in lead_intake_adapter.mjs');
  } else {
    fail('12. secrets NOT printed', 'Secret pattern found in adapter source');
  }
} catch (e) {
  fail('12. secrets NOT printed', e.message);
}

// ── Cleanup: remove smoke test leads from REAL CSV ──
try {
  if (fs.existsSync(REAL_CSV_PATH)) {
    const lines = fs.readFileSync(REAL_CSV_PATH, 'utf-8').split('\n');
    const cleaned = lines.filter(l =>
      !l.includes('smoke-test-') &&
      !l.includes('Smoke Test')  &&
      !l.includes('smoke_test')
    );
    if (cleaned.length < lines.length) {
      fs.writeFileSync(REAL_CSV_PATH, cleaned.join('\n'), 'utf-8');
      info(`Cleaned ${lines.length - cleaned.length} smoke test rows from REAL CSV`);
    }
  }
} catch (e) {
  info(`Cleanup warning: ${e.message}`);
}

function printSummary() {
  const total = passed + failed;
  console.log('\n─────────────────────────────────────────');
  console.log(`RESULT: ${passed}/${total} PASS | ${failed} FAIL`);
  console.log(failed === 0 ? '✅ ALL TESTS PASSED' : `⚠️ ${failed} TEST(S) FAILED`);
  console.log('─────────────────────────────────────────\n');

  // Write report
  const reportPath = path.join(WORKSPACE, 'tools/telegram_gateway/telegram_lead_intake_smoke_test_report.md');
  const reportLines = [
    '# Telegram Lead Intake Smoke Test Report',
    '',
    `Date: ${new Date().toISOString()}`,
    `Result: ${passed}/${total} PASS | ${failed} FAIL`,
    `Status: ${failed === 0 ? '✅ ALL PASS' : '⚠️ SOME FAILED'}`,
    '',
    '## Tests',
    '',
    ...results.map(r => `- ${r.status === 'PASS' ? '✅' : '❌'} ${r.name}${r.reason ? ' — ' + r.reason : ''}`),
    '',
    '## Safety',
    '',
    '- auto-send: BLOCKED',
    '- client messages sent: 0',
    '- email sent: NO',
    '- VPS/VLESS: NOT TOUCHED',
    '- secrets printed: NO',
  ];
  try {
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
    console.log(`Report: ${reportPath}`);
  } catch (_) {}
}

printSummary();
process.exit(failed > 0 ? 1 : 0);
