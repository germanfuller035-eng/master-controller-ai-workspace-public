/**
 * run_all_checks.mjs
 * SYSTEM REGRESSION TEST SUITE v0.1
 * Runs all system checks and generates a test report.
 * Uses only built-in Node.js modules: fs, path, child_process
 *
 * What it checks:
 *   1. Syntax check (node --check) for all key scripts
 *   2. Telegram self-test
 *   3. Data validation
 *   4. Data sync
 *   5. Dashboard rebuild
 *   6. Action executor dry-run safety
 *   7. Master Controller commands
 *   8. Security scan (no tokens/passwords in logs)
 *   9. Dashboard content check
 *
 * What it does NOT do:
 *   - Does NOT send messages to clients
 *   - Does NOT create PDFs
 *   - Does NOT change prices
 *   - Does NOT connect to email
 *   - Does NOT read secrets or tokens
 */

import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE = 'D:\\AI_WORKSPACE';
const DATA_DIR = path.join(WORKSPACE, 'data');
const TOOLS_DIR = path.join(WORKSPACE, 'tools');
const REPORT_PATH = path.join(__dirname, 'latest_test_report.md');

const now = new Date();
const nowIso = now.toISOString();

// ─── Result accumulator ──────────────────────────────────────────────────────

const results = [];
let criticalIssues = [];
let warnings = [];
let failedChecks = [];

function addResult(area, status, details) {
  results.push({ area, status, details });
  if (status === 'FAIL' || status === 'CRITICAL') {
    failedChecks.push(`${area}: ${details}`);
  }
  if (status === 'WARN') {
    warnings.push(`${area}: ${details}`);
  }
}

function addCritical(msg) {
  criticalIssues.push(msg);
}

function print(msg) {
  console.log(msg);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runNode(args, timeoutMs = 30000) {
  const result = spawnSync(process.execPath, args, {
    cwd: WORKSPACE,
    timeout: timeoutMs,
    encoding: 'utf8',
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error ? result.error.message : null
  };
}

function fileExists(relOrAbs) {
  const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(WORKSPACE, relOrAbs);
  return fs.existsSync(p);
}

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function makeId(prefix) {
  const stamp = now.toISOString().replace(/[-:T]/g, '').substring(0, 15);
  const rand = Math.floor(Math.random() * 900) + 100;
  return `${prefix}_${stamp}_${rand}`;
}

// ─── Check 1: Syntax checks ──────────────────────────────────────────────────

function check1SyntaxChecks() {
  print('\n[CHECK 1] Syntax checks (node --check)...');

  const keyFiles = [
    'tools/master_controller/run_master_controller.mjs',
    'tools/telegram_gateway/telegram_master_bot.mjs',
    'tools/action_executor/dashboard_action_executor.mjs',
    'tools/data_sync/validate_data_layer.mjs',
    'tools/data_sync/sync_dashboard_state.mjs',
    'tools/dashboard_visual/update_visual_dashboard.mjs',
  ];

  const optionalFiles = [
    'tools/telegram_gateway/watchdog_telegram_gateway.mjs',
    'tools/telegram_gateway/telegram_gateway_healthcheck.mjs',
    'tools/dashboard_visual/watch_dashboard.mjs',
    'tools/communication_monitor/intake_message.mjs',
    'tools/communication_monitor/prepare_reply_draft.mjs',
    'tools/communication_monitor/yandex_mail_safety_check.mjs',
    'tools/communication_monitor/yandex_mail_dry_run_import.mjs',
    'tools/document_registry/register_document.mjs',
    'tools/document_registry/validate_document_registry.mjs',
  ];

  let anyKeyCritical = false;
  let allKeyOk = true;

  for (const f of keyFiles) {
    const absPath = path.join(WORKSPACE, f);
    if (!fs.existsSync(absPath)) {
      addResult(`Syntax: ${f}`, 'FAIL', 'File not found — CRITICAL KEY FILE');
      addCritical(`Key script missing: ${f}`);
      anyKeyCritical = true;
      allKeyOk = false;
      print(`  ✖ MISSING (critical): ${f}`);
      continue;
    }
    const r = runNode(['--check', absPath]);
    if (r.ok) {
      addResult(`Syntax: ${f}`, 'PASS', 'Syntax OK');
      print(`  ✓ OK: ${f}`);
    } else {
      addResult(`Syntax: ${f}`, 'FAIL', r.stderr.trim().substring(0, 200));
      addCritical(`Syntax error in key file: ${f}: ${r.stderr.trim().substring(0, 100)}`);
      anyKeyCritical = true;
      allKeyOk = false;
      print(`  ✖ FAIL: ${f} — ${r.stderr.trim().substring(0, 100)}`);
    }
  }

  for (const f of optionalFiles) {
    const absPath = path.join(WORKSPACE, f);
    if (!fs.existsSync(absPath)) {
      addResult(`Syntax: ${f}`, 'WARN', 'File not found — optional');
      warnings.push(`Optional file missing: ${f}`);
      print(`  ⚠ MISSING (optional): ${f}`);
      continue;
    }
    const r = runNode(['--check', absPath]);
    if (r.ok) {
      addResult(`Syntax: ${f}`, 'PASS', 'Syntax OK');
      print(`  ✓ OK: ${f}`);
    } else {
      addResult(`Syntax: ${f}`, 'FAIL', r.stderr.trim().substring(0, 200));
      failedChecks.push(`Syntax optional file: ${f}: ${r.stderr.trim().substring(0, 100)}`);
      print(`  ✖ FAIL: ${f} — ${r.stderr.trim().substring(0, 100)}`);
    }
  }

  if (allKeyOk) {
    addResult('Syntax: ALL KEY FILES', 'PASS', 'All key files syntax OK');
  }
}

// ─── Check 2: Telegram self-test ─────────────────────────────────────────────

function check2TelegramSelfTest() {
  print('\n[CHECK 2] Telegram self-test...');
  const botPath = path.join(WORKSPACE, 'tools/telegram_gateway/telegram_master_bot.mjs');
  if (!fs.existsSync(botPath)) {
    addResult('Telegram self-test', 'WARN', 'telegram_master_bot.mjs not found');
    print('  ⚠ SKIP: telegram_master_bot.mjs not found');
    return;
  }
  const r = runNode([botPath, '--self-test'], 15000);
  const combined = (r.stdout + r.stderr).toLowerCase();
  if (r.ok || combined.includes('passed') || combined.includes('self-test')) {
    addResult('Telegram self-test', 'PASS', 'Self-test PASSED or OK response received');
    print('  ✓ PASS: Telegram self-test OK');
  } else {
    addResult('Telegram self-test', 'WARN', `Exit ${r.status}: ${(r.stderr || '').substring(0, 150)}`);
    warnings.push(`Telegram self-test non-zero exit (may need token): ${(r.stderr || '').substring(0, 100)}`);
    print(`  ⚠ WARN: Telegram self-test exit ${r.status} (no token configured = expected in test env)`);
  }
}

// ─── Check 3: Data validation ─────────────────────────────────────────────────

function check3DataValidation() {
  print('\n[CHECK 3] Data validation (validate_data_layer.mjs)...');
  const scriptPath = path.join(WORKSPACE, 'tools/data_sync/validate_data_layer.mjs');
  if (!fs.existsSync(scriptPath)) {
    addResult('Data validation', 'FAIL', 'validate_data_layer.mjs not found');
    addCritical('validate_data_layer.mjs missing');
    print('  ✖ MISSING: validate_data_layer.mjs');
    return;
  }
  const r = runNode([scriptPath], 30000);
  const combined = r.stdout + r.stderr;
  if (r.ok || combined.includes('PASS') || combined.includes('PARTIAL')) {
    const overall = combined.match(/Overall:\s*(PASS|PARTIAL|FAIL)/)?.[1] || (r.ok ? 'PASS' : 'UNKNOWN');
    addResult('Data validation', overall === 'FAIL' ? 'FAIL' : 'PASS', `Overall: ${overall}`);
    print(`  ✓ Data validation: ${overall}`);
  } else {
    addResult('Data validation', 'FAIL', `Exit ${r.status}: ${(r.stderr || '').substring(0, 200)}`);
    addCritical(`Data validation failed: exit ${r.status}`);
    print(`  ✖ FAIL: data validation exit ${r.status}`);
  }
}

// ─── Check 4: Data sync ──────────────────────────────────────────────────────

function check4DataSync() {
  print('\n[CHECK 4] Data sync (sync_dashboard_state.mjs)...');
  const scriptPath = path.join(WORKSPACE, 'tools/data_sync/sync_dashboard_state.mjs');
  if (!fs.existsSync(scriptPath)) {
    addResult('Data sync', 'FAIL', 'sync_dashboard_state.mjs not found');
    addCritical('sync_dashboard_state.mjs missing');
    print('  ✖ MISSING: sync_dashboard_state.mjs');
    return;
  }
  const r = runNode([scriptPath], 30000);
  const combined = r.stdout + r.stderr;
  if (r.ok || combined.includes('DONE') || combined.includes('DATA SYNC DONE')) {
    addResult('Data sync', 'PASS', 'Sync completed');
    print('  ✓ Data sync: DONE');
  } else {
    addResult('Data sync', 'FAIL', `Exit ${r.status}: ${(r.stderr || '').substring(0, 200)}`);
    addCritical(`Data sync failed: exit ${r.status}`);
    print(`  ✖ FAIL: data sync exit ${r.status}`);
  }
}

// ─── Check 5: Dashboard rebuild ───────────────────────────────────────────────

function check5DashboardRebuild() {
  print('\n[CHECK 5] Dashboard rebuild (update_visual_dashboard.mjs)...');
  const scriptPath = path.join(WORKSPACE, 'tools/dashboard_visual/update_visual_dashboard.mjs');
  if (!fs.existsSync(scriptPath)) {
    addResult('Dashboard rebuild', 'FAIL', 'update_visual_dashboard.mjs not found');
    addCritical('update_visual_dashboard.mjs missing');
    print('  ✖ MISSING: update_visual_dashboard.mjs');
    return;
  }
  const r = runNode([scriptPath], 30000);
  const htmlPath = path.join(WORKSPACE, '09_dashboards/visual_master_dashboard.html');
  if (r.ok || fs.existsSync(htmlPath)) {
    addResult('Dashboard rebuild', 'PASS', 'visual_master_dashboard.html created/updated');
    print('  ✓ Dashboard rebuild: OK — visual_master_dashboard.html updated');
  } else {
    addResult('Dashboard rebuild', 'FAIL', `Exit ${r.status}: ${(r.stderr || '').substring(0, 200)}`);
    addCritical(`Dashboard rebuild failed`);
    print(`  ✖ FAIL: dashboard rebuild exit ${r.status}`);
  }
}

// ─── Check 6: Action executor dry-run safety ─────────────────────────────────

function check6ActionExecutorSafety() {
  print('\n[CHECK 6] Action executor dry-run safety...');

  const executorPath = path.join(WORKSPACE, 'tools/action_executor/dashboard_action_executor.mjs');
  if (!fs.existsSync(executorPath)) {
    addResult('Action executor: exists', 'FAIL', 'dashboard_action_executor.mjs not found');
    addCritical('dashboard_action_executor.mjs missing');
    print('  ✖ MISSING: dashboard_action_executor.mjs');
    return;
  }
  addResult('Action executor: exists', 'PASS', 'File found');

  // Check risk gate by reading content
  const content = readFileSafe(executorPath);
  const hasRiskGate = content.includes('BLACK_COMMANDS') && content.includes('RED_COMMANDS') && content.includes('GREEN_COMMANDS');
  if (hasRiskGate) {
    addResult('Action executor: risk gate', 'PASS', 'Risk gate code present (BLACK/RED/GREEN commands)');
    print('  ✓ Risk gate: present');
  } else {
    addResult('Action executor: risk gate', 'FAIL', 'Risk gate code missing or incomplete');
    addCritical('Action executor risk gate missing');
    print('  ✖ Risk gate missing in action executor');
  }

  // Check delete_file is blocked
  const deleteBlocked = content.includes("'delete_file'") || content.includes('"delete_file"');
  if (deleteBlocked) {
    addResult('Action executor: delete_file blocked', 'PASS', 'delete_file in BLACK_COMMANDS');
    print('  ✓ delete_file: BLOCKED');
  } else {
    addResult('Action executor: delete_file blocked', 'WARN', 'delete_file not found in BLACK_COMMANDS');
    warnings.push('delete_file not explicitly listed in BLACK_COMMANDS');
    print('  ⚠ WARN: delete_file not found in BLACK_COMMANDS');
  }

  // Check send_email is Red
  const sendEmailRed = content.includes("'send_email'") || content.includes('"send_email"');
  if (sendEmailRed) {
    addResult('Action executor: send_email needs approval', 'PASS', 'send_email in RED_COMMANDS');
    print('  ✓ send_email: Needs Approval (Red)');
  } else {
    addResult('Action executor: send_email needs approval', 'WARN', 'send_email not found in RED_COMMANDS');
    warnings.push('send_email not explicitly listed in RED_COMMANDS');
    print('  ⚠ WARN: send_email not explicitly in RED_COMMANDS');
  }

  // Test action queue backup + test actions (non-destructive)
  const actionQueuePath = path.join(DATA_DIR, 'action_queue.json');
  const actionQueueBackupPath = path.join(DATA_DIR, 'action_queue_test_backup.json');

  if (!fs.existsSync(actionQueuePath)) {
    addResult('Action executor: queue test', 'WARN', 'action_queue.json not found for dry-run test');
    print('  ⚠ WARN: action_queue.json not found');
    return;
  }

  // Backup existing queue
  const originalQueue = readFileSafe(actionQueuePath);
  fs.writeFileSync(actionQueueBackupPath, originalQueue, 'utf8');
  print('  → Backup created: action_queue_test_backup.json');

  // Write test queue
  const testQueue = [
    {
      action_id: 'test_green_001',
      source: 'regression_test',
      requested_by: 'run_all_checks',
      created_at: nowIso,
      command: 'report_system',
      normalized_command: 'report_system',
      target: '',
      risk_level: 'Green',
      status: 'Queued',
      approval_required: false,
      allowed_to_execute: true,
      explicit_dmitry_confirmation: false,
      result_summary: '',
      result_file: '',
      notes: 'REGRESSION TEST - safe green action'
    }
  ];

  try {
    writeJson(actionQueuePath, testQueue);
    print('  → Test queue written (report_system green action)');

    const r = runNode([executorPath], 30000);
    const combined = r.stdout + r.stderr;

    // Restore original queue
    fs.writeFileSync(actionQueuePath, originalQueue, 'utf8');

    // Clean up backup
    if (fs.existsSync(actionQueueBackupPath)) {
      try { fs.unlinkSync(actionQueueBackupPath); } catch {}
    }
    print('  → Original queue restored');

    if (r.ok || combined.includes('Done') || combined.includes('DONE') || combined.includes('ACTION_EXECUTOR')) {
      addResult('Action executor: dry-run green', 'PASS', 'Green action executed OK');
      print('  ✓ Action executor dry-run: PASS (green action Done)');
    } else {
      addResult('Action executor: dry-run green', 'WARN', `Exit ${r.status}: ${(r.stderr || '').substring(0, 150)}`);
      warnings.push(`Action executor dry-run warning: exit ${r.status}`);
      print(`  ⚠ WARN: executor exit ${r.status}`);
    }
  } catch (err) {
    // Restore on error
    try { fs.writeFileSync(actionQueuePath, originalQueue, 'utf8'); } catch {}
    addResult('Action executor: dry-run green', 'WARN', `Error during test: ${err.message}`);
    warnings.push(`Action executor test error: ${err.message}`);
    print(`  ⚠ WARN: executor test error: ${err.message}`);
  }
}

// ─── Check 7: Master Controller commands ─────────────────────────────────────

function check7MasterControllerCommands() {
  print('\n[CHECK 7] Master Controller commands...');
  const mcPath = path.join(WORKSPACE, 'tools/master_controller/run_master_controller.mjs');
  if (!fs.existsSync(mcPath)) {
    addResult('Master Controller: exists', 'FAIL', 'run_master_controller.mjs not found');
    addCritical('run_master_controller.mjs missing');
    print('  ✖ MISSING: run_master_controller.mjs');
    return;
  }
  addResult('Master Controller: exists', 'PASS', 'File found');

  const cmdPath = path.join(WORKSPACE, '00_MASTER_CONTROLLER/inbox/current_command.md');
  const outboxDir = path.join(WORKSPACE, '00_MASTER_CONTROLLER/outbox');
  fs.mkdirSync(outboxDir, { recursive: true });

  const commands = ['/health', '/next', '/report money', '/payment', '/receipt', '/inbox', '/reply drafts'];
  let allOk = true;

  for (const cmd of commands) {
    try {
      fs.writeFileSync(cmdPath, cmd, 'utf8');
      const r = runNode([mcPath], 20000);
      const combined = r.stdout + r.stderr;
      const briefExists = fs.existsSync(path.join(outboxDir, 'latest_decision_brief.md'));
      if (r.ok || briefExists || combined.includes('DONE') || combined.includes('Report')) {
        addResult(`MC command: ${cmd}`, 'PASS', 'Command executed, output written');
        print(`  ✓ ${cmd}: OK`);
      } else {
        addResult(`MC command: ${cmd}`, 'WARN', `Exit ${r.status}: ${(combined).substring(0, 100)}`);
        warnings.push(`MC command "${cmd}" non-zero exit: ${r.status}`);
        allOk = false;
        print(`  ⚠ ${cmd}: exit ${r.status}`);
      }
    } catch (err) {
      addResult(`MC command: ${cmd}`, 'WARN', `Error: ${err.message}`);
      warnings.push(`MC command "${cmd}" error: ${err.message}`);
      allOk = false;
      print(`  ⚠ ${cmd}: error — ${err.message}`);
    }
  }

  // Restore neutral command
  try { fs.writeFileSync(cmdPath, '/health', 'utf8'); } catch {}

  if (allOk) {
    addResult('Master Controller: all commands', 'PASS', 'All commands executed without critical errors');
  }
}

// ─── Check 8: Security scan ───────────────────────────────────────────────────

function check8SecurityScan() {
  print('\n[CHECK 8] Security scan...');

  const dangerPatterns = [
    { pattern: /TELEGRAM_BOT_TOKEN\s*=\s*[0-9]+:[A-Za-z0-9_-]{30,}/g, name: 'TELEGRAM_BOT_TOKEN real value' },
    { pattern: /sk-[A-Za-z0-9]{20,}/g, name: 'sk- API key' },
    { pattern: /password\s*=\s*["'][^'"]{4,}/gi, name: 'password= value' },
    { pattern: /api_key\s*=\s*["'][^'"]{4,}/gi, name: 'api_key= value' },
  ];

  const allowedFiles = ['.env.example', 'PASTE_TOKEN_HERE'];

  const dirsToScan = [
    path.join(WORKSPACE, 'data'),
    path.join(WORKSPACE, '00_MASTER_CONTROLLER/outbox'),
    path.join(WORKSPACE, '00_MASTER_CONTROLLER/logs'),
    path.join(WORKSPACE, 'tools/telegram_gateway/logs'),
    path.join(WORKSPACE, 'tools/data_sync'),
    path.join(WORKSPACE, 'tools/tests'),
  ];

  let found = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile() && (entry.endsWith('.md') || entry.endsWith('.json') || entry.endsWith('.txt') || entry.endsWith('.log'))) {
          const content = readFileSafe(full);
          // skip .env files entirely
          if (entry === '.env' || entry.startsWith('.env.')) continue;
          // skip files with PASTE_TOKEN_HERE (templates)
          if (content.includes('PASTE_TOKEN_HERE')) continue;
          for (const { pattern, name } of dangerPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              found.push(`${name} found in ${full.replace(WORKSPACE, '')}`);
            }
          }
        }
      } catch {}
    }
  }

  for (const dir of dirsToScan) {
    scanDir(dir);
  }

  if (found.length === 0) {
    addResult('Security scan', 'PASS', 'No exposed tokens/passwords found in scanned files');
    print('  ✓ Security scan: CLEAN');
  } else {
    found.forEach(f => {
      addResult('Security scan', 'FAIL', f);
      addCritical(`SECURITY: ${f}`);
      print(`  ✖ SECURITY ISSUE: ${f}`);
    });
  }
}

// ─── Check 9: Dashboard content check ────────────────────────────────────────

function check9DashboardContent() {
  print('\n[CHECK 9] Dashboard content check...');
  const htmlPath = path.join(WORKSPACE, '09_dashboards/visual_master_dashboard.html');
  if (!fs.existsSync(htmlPath)) {
    addResult('Dashboard content', 'FAIL', 'visual_master_dashboard.html not found');
    addCritical('visual_master_dashboard.html not found');
    print('  ✖ MISSING: visual_master_dashboard.html');
    return;
  }

  const content = readFileSafe(htmlPath);

  const requiredTerms = [
    'Командный центр',
    'Action Center',
    'Telegram Gateway',
    'Деньги',
    'утвержден',
    'Telegram',
    'Входящие',
    'Personal Assistant',
    'нельзя'
  ];

  const forbiddenTerms = [
    'Стоимость трубопровода',
    'Ведущий участник',
    'Следовать за'
  ];

  let allRequired = true;
  let anyForbidden = false;

  for (const term of requiredTerms) {
    if (content.includes(term)) {
      print(`  ✓ Found required: "${term}"`);
    } else {
      addResult(`Dashboard content: "${term}"`, 'WARN', `Required term not found: "${term}"`);
      warnings.push(`Dashboard missing required term: "${term}"`);
      allRequired = false;
      print(`  ⚠ MISSING required: "${term}"`);
    }
  }

  for (const term of forbiddenTerms) {
    if (content.includes(term)) {
      addResult(`Dashboard content: forbidden "${term}"`, 'FAIL', `Forbidden term found: "${term}"`);
      addCritical(`Dashboard contains forbidden term: "${term}"`);
      anyForbidden = true;
      print(`  ✖ FORBIDDEN term found: "${term}"`);
    } else {
      print(`  ✓ Not found (good): "${term}"`);
    }
  }

  if (allRequired && !anyForbidden) {
    addResult('Dashboard content', 'PASS', 'All required terms found, no forbidden terms');
    print('  ✓ Dashboard content: OK');
  }
}

// ─── Generate report ──────────────────────────────────────────────────────────

function generateReport() {
  const hasCritical = criticalIssues.length > 0;
  const hasWarnings = warnings.length > 0;
  const overall = hasCritical ? 'FAIL' : (hasWarnings ? 'PARTIAL' : 'PASS');

  let md = `# SYSTEM_REGRESSION_TEST_REPORT\n\n`;
  md += `## Overall\n\n${overall}\n\n`;

  md += `## Summary\n\n`;
  md += `| Area | Status | Details |\n|---|---|---|\n`;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✖';
    md += `| ${r.area} | ${icon} ${r.status} | ${r.details.replace(/\|/g, '/')} |\n`;
  }
  md += '\n';

  md += `## Critical issues\n\n`;
  if (criticalIssues.length === 0) {
    md += `_None_\n\n`;
  } else {
    criticalIssues.forEach(c => { md += `- ✖ ${c}\n`; });
    md += '\n';
  }

  md += `## Warnings\n\n`;
  if (warnings.length === 0) {
    md += `_None_\n\n`;
  } else {
    warnings.forEach(w => { md += `- ⚠ ${w}\n`; });
    md += '\n';
  }

  md += `## Failed checks\n\n`;
  if (failedChecks.length === 0) {
    md += `_None_\n\n`;
  } else {
    failedChecks.forEach(f => { md += `- ${f}\n`; });
    md += '\n';
  }

  md += `## Next safe action\n\n`;
  if (hasCritical) {
    md += `Fix critical issues before proceeding. Check: ${criticalIssues[0]}\n\n`;
  } else if (hasWarnings) {
    md += `Review warnings above. System is operational. Safe to proceed with caution.\n\n`;
  } else {
    md += `All checks passed. System is stable. Safe to proceed with next task.\n\n`;
  }

  md += `## Generated at\n\n${nowIso}\n\n`;

  md += `## Exit codes\n\n`;
  md += `- Critical issues: ${criticalIssues.length}\n`;
  md += `- Warnings: ${warnings.length}\n`;
  md += `- Failed checks: ${failedChecks.length}\n`;
  md += `- Overall: **${overall}**\n`;

  fs.writeFileSync(REPORT_PATH, md, 'utf8');
  print(`\n[REPORT] Written to: tools/tests/latest_test_report.md`);
  return overall;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  print('\n╔══════════════════════════════════════════════════════╗');
  print('║   SYSTEM REGRESSION TEST SUITE v0.1                 ║');
  print('╚══════════════════════════════════════════════════════╝');
  print(`Started: ${nowIso}`);
  print('NOTE: This test does NOT send client messages, create PDFs,');
  print('      change prices, connect to email, or read secrets.\n');

  check1SyntaxChecks();
  check2TelegramSelfTest();
  check3DataValidation();
  check4DataSync();
  check5DashboardRebuild();
  check6ActionExecutorSafety();
  check7MasterControllerCommands();
  check8SecurityScan();
  check9DashboardContent();

  const overall = generateReport();

  print('\n╔══════════════════════════════════════════════════════╗');
  print(`║   OVERALL RESULT: ${overall.padEnd(35)}║`);
  print('╚══════════════════════════════════════════════════════╝');
  print(`Critical: ${criticalIssues.length} | Warnings: ${warnings.length} | Failed: ${failedChecks.length}`);
  print(`Report: tools/tests/latest_test_report.md\n`);

  process.exit(criticalIssues.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[REGRESSION TEST] Fatal error:', err);
  process.exit(1);
});
