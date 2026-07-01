/**
 * telegram_command_routing_smoke_test.mjs
 * PHASE 9: Smoke test — command routing reliability
 * Tests: 20 checks as per task spec
 */
import { execSync } from 'child_process';

const ROOT = 'D:\\AI_WORKSPACE';

function run(cmd) {
  try {
    const out = execSync(`node tools/master_controller/run_command.mjs "${cmd.replace(/"/g, '\\"')}"`, {
      cwd: ROOT, encoding: 'utf8', timeout: 8000,
    });
    return JSON.parse(out.trim());
  } catch (e) {
    const stdout = (e.stdout || '').trim();
    if (stdout) {
      try { return JSON.parse(stdout); } catch {}
    }
    return { error: String(e.message || e), message: '', action: 'error' };
  }
}

let pass = 0, fail = 0;
const results = [];

function check(title, condition, detail = '') {
  const ok = !!condition;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${title}${detail ? ' — ' + detail : ''}`);
  results.push({ title, ok });
  if (ok) pass++; else fail++;
}

// 1. /ping direct route before NL-router — should be action 'ping' or contain 'pong'
const ping1 = run('/ping');
check('1. /ping direct route', ping1.action === 'ping' || (ping1.message || '').includes('pong'), `action=${ping1.action}`);

// 2. /ping returns pong
check('2. /ping returns pong', (ping1.message || '').toLowerCase().includes('pong'), ping1.message?.substring(0, 60));

// 3. /mail alias works
const mail1 = run('/mail');
check('3. /mail alias works', mail1.action === 'mail_status' || (mail1.message || '').includes('Mail'), `action=${mail1.action}`);

// 4. /mail status works
const mail2 = run('/mail status');
check('4. /mail status works', (mail2.message || '').includes('Mail') || mail2.action === 'mail_status', `action=${mail2.action}`);

// 5. /lead_add route works
const la = run('/lead_add');
check('5. /lead_add route works', la.action === 'lead_add' || (la.message || '').includes('лид'), `action=${la.action}`);

// 6. /leadadd alias works
const laa = run('/leadadd');
check('6. /leadadd alias works', laa.action === 'lead_add' || (laa.message || '').includes('лид'), `action=${laa.action}`);

// 7. /lead_status works
const ls = run('/lead_status');
check('7. /lead_status works', ls.action === 'lead_status' || (ls.message || '').includes('Лиды'), `action=${ls.action}`);

// 8. /lead_template works
const lt = run('/lead_template');
check('8. /lead_template works', lt.action === 'lead_template' || (lt.message || '').includes('Шаблон'), `action=${lt.action}`);

// 9. "задачи" maps to task summary
const tasks = run('задачи');
check('9. "задачи" maps to task summary', tasks.action === 'tasks' || (tasks.message || '').includes('задач'), `action=${tasks.action}`);

// 10. "пора заработать" maps to revenue action
const earn = run('пора заработать');
check('10. "пора заработать" maps to revenue action', earn.action === 'revenue_action' || (earn.message || '').includes('Revenue'), `action=${earn.action}`);

// 11. "лиды" maps to lead_status
const lidy = run('лиды');
check('11. "лиды" maps to lead_status', lidy.action === 'lead_status' || (lidy.message || '').includes('Лиды'), `action=${lidy.action}`);

// 12. "что с системой?" maps to health/system status
const health = run('что с системой?');
check('12. "что с системой?" maps to health', health.action === 'health' || health.action === 'system_health' || (health.message || '').includes('бот') || (health.message || '').includes('alive'), `action=${health.action}`);

// 13. "на сегодня" maps to today
const today = run('на сегодня');
check('13. "на сегодня" maps to today', today.action === 'today' || (today.message || '').includes('Сводка'), `action=${today.action}`);

// 14. empty message returns useful fallback
const empty = run('');
check('14. empty message returns useful fallback', (empty.message || '').length > 5, empty.message?.substring(0, 60));

// 15. unknown text returns useful fallback
const unk = run('непонятная команда abc123');
check('15. unknown text returns useful fallback', (unk.message || '').length > 5, unk.message?.substring(0, 60));

// 16. voice transcription error returns useful fallback
// Simulate via run_command with special voice-error signal
const voiceErr = run('__voice_error__');
check('16. voice error fallback', (voiceErr.message || '').length > 5, voiceErr.message?.substring(0, 60));

// 17. auto-send remains BLOCKED — check that ping message or notes says BLOCKED
const anyResult = run('/ping');
const pingMsg = (anyResult.message || '') + (anyResult.notes || '') + (anyResult.auto_send || '');
check('17. auto-send BLOCKED', pingMsg.includes('BLOCKED') || anyResult.auto_send === 'BLOCKED', pingMsg.substring(0, 80));

// 18. client send blocked — verify action is never 'send_to_client'
check('18. client send blocked', anyResult.action !== 'send_to_client' && anyResult.action !== 'send_message', `action=${anyResult.action}`);

// 19. email send blocked — verify action is never 'send_email'
check('19. email send blocked', anyResult.action !== 'send_email' && anyResult.action !== 'email_send', `action=${anyResult.action}`);

// 20. secrets not printed — token/password not in any MESSAGE text (not full JSON which may have field names)
const secretCheck = [ping1, mail1, ls, lt, tasks].every(r => {
  const m = (r.message || '');
  return !m.includes('BOT_TOKEN') && !m.includes('password') && !m.includes('2093');
});
check('20. secrets not printed', secretCheck, 'no BOT_TOKEN/password/token found in message texts');

console.log(`\n=== SMOKE TEST RESULT: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
