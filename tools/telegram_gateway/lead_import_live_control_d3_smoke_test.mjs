/**
 * lead_import_live_control_d3_smoke_test.mjs
 *
 * D3-2 READ-ONLY live-control smoke test. Verifies the four L0 commands work
 * against a temp sandbox queue and that NOTHING is written. No Telegram API,
 * no network, no production paths.
 */

'use strict';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

import mod from './lead_import_live_control_d3.mjs';

let pass = 0;
let fail = 0;
const fails = [];

function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  ❌ ${name}`);
  }
}

function assertReadOnly(name, res) {
  const s = res && res.safety;
  check(`${name}: safety present`, !!s);
  if (s) {
    check(`${name}: read_only=YES`, s.read_only === 'YES');
    check(`${name}: production_write BLOCKED`, s.production_write === 'BLOCKED');
    check(`${name}: queue_write BLOCKED`, s.queue_write === 'BLOCKED');
    check(`${name}: real_import BLOCKED`, s.real_import === 'BLOCKED');
    check(`${name}: client_contact BLOCKED`, s.client_contact === 'BLOCKED');
    check(`${name}: auto_send BLOCKED`, s.auto_send === 'BLOCKED');
    check(`${name}: telegram_api_called NO`, s.telegram_api_called === 'NO');
  }
}

async function main() {
  console.log('=== D3-2 READ-ONLY Live-Control Smoke Test ===\n');

  // Sandbox dir + queue file.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd3-2-live-'));
  const queuePath = path.join(tmp, 'lead_import_approvals.json');
  const absentQueue = path.join(tmp, 'absent_queue.json');

  const sampleQueue = [
    {
      import_id: 'imp_001',
      lead_id: 'lead_aaa',
      status: 'PENDING',
      source: 'telegram',
      created_at: '2026-06-06T10:00:00Z',
      snapshot_id: 'snap_1',
      text_hash: 'hash_imp_001',
      parsed_count: 10,
      valid_count: 8,
      added_count: 0,
      needs_review_count: 2,
      qa_status: 'PASS',
      safety: { read_only: 'YES', real_import: 'BLOCKED' },
    },
    {
      import_id: 'imp_002',
      lead_id: 'lead_bbb',
      status: 'COMMITTED',
      source: 'telegram',
      created_at: '2026-06-05T09:00:00Z',
      snapshot_id: 'snap_2',
      text_hash: 'hash_imp_002',
      parsed_count: 5,
      valid_count: 5,
      added_count: 5,
      needs_review_count: 0,
      qa_status: 'PASS',
      safety: { read_only: 'YES', real_import: 'BLOCKED' },
    },
  ];
  await fs.writeFile(queuePath, JSON.stringify(sampleQueue, null, 2), 'utf8');

  console.log('Version:', mod.getLiveControlVersion(), '\n');

  // --- /lead_queue ---
  console.log('[1] /lead_queue');
  const q = await mod.handleLeadQueue({ queuePath });
  check('lead_queue ok', q.ok === true);
  check('lead_queue total=2', q.counts && q.counts.total === 2);
  check('lead_queue pending=1', q.counts && q.counts.pending === 1);
  check('lead_queue committed=1', q.counts && q.counts.committed === 1);
  check('lead_queue lists pending imp_001', Array.isArray(q.pending) && q.pending.some((c) => c.import_id === 'imp_001'));
  assertReadOnly('lead_queue', q);
  console.log(mod.formatLiveControlForTelegram(q), '\n');

  // --- /lead_queue on absent file (must NOT create it) ---
  console.log('[2] /lead_queue (absent file)');
  const qAbsent = await mod.handleLeadQueue({ queuePath: absentQueue });
  const absentExistsAfter = await fs.stat(absentQueue).then(() => true).catch(() => false);
  check('absent queue NOT created', absentExistsAfter === false);
  assertReadOnly('lead_queue_absent', qAbsent);
  console.log('');

  // --- /lead_status FOUND ---
  console.log('[3] /lead_status imp_001');
  const st = await mod.handleLeadStatus('imp_001', { queuePath });
  check('lead_status found', st.ok === true && st.status === 'FOUND');
  check('lead_status from queue', st.found_in === 'approval_queue');
  check('lead_status card_status PENDING', st.detail && st.detail.card_status === 'PENDING');
  assertReadOnly('lead_status', st);
  console.log(mod.formatLiveControlForTelegram(st), '\n');

  // --- /lead_status NOT_FOUND ---
  console.log('[4] /lead_status missing');
  const stMiss = await mod.handleLeadStatus('nope_999', { queuePath });
  check('lead_status not found', stMiss.ok === false && stMiss.status === 'NOT_FOUND');
  assertReadOnly('lead_status_miss', stMiss);
  console.log('');

  // --- /lead_status NEEDS_ID ---
  console.log('[5] /lead_status (no id)');
  const stNoId = await mod.handleLeadStatus('', { queuePath });
  check('lead_status needs id', stNoId.status === 'NEEDS_ID');
  console.log('');

  // --- /lead_review ---
  console.log('[6] /lead_review imp_001');
  const rv = await mod.handleLeadReview('imp_001', { queuePath });
  check('lead_review ok', rv.ok === true);
  check('lead_review status REVIEW', rv.status === 'REVIEW');
  check('lead_review has decision options', Array.isArray(rv.decision_options) && rv.decision_options.length > 0);
  check('lead_review note present', typeof rv.note === 'string');
  assertReadOnly('lead_review', rv);
  console.log(mod.formatLiveControlForTelegram(rv), '\n');

  // --- /lead_review TERMINAL (committed) ---
  console.log('[7] /lead_review imp_002 (committed)');
  const rvT = await mod.handleLeadReview('imp_002', { queuePath });
  check('lead_review terminal', rvT.status === 'TERMINAL');
  check('lead_review terminal no decision options', Array.isArray(rvT.decision_options) && rvT.decision_options.length === 0);
  console.log('');

  // --- /lead_health ---
  console.log('[8] /lead_health');
  const h = await mod.handleLeadHealth({ queuePath, workspaceRoot: tmp });
  check('lead_health ok', h.ok === true);
  check('lead_health queue present', h.checks && h.checks.queue_present === true);
  check('lead_health live_bot_patch NOT_DONE', h.live_bot_patch === 'NOT_DONE');
  assertReadOnly('lead_health', h);
  console.log(mod.formatLiveControlForTelegram(h), '\n');

  // --- Router + parser ---
  console.log('[9] router / parser');
  const routed = await mod.handleLiveControlCommand('/lead_status imp_001', { queuePath });
  check('router in domain', routed.inDomain === true && routed.ok === true);
  const ru = mod.parseLiveControlCommand('очередь лидов');
  check('ru alias -> /lead_queue', ru.inDomain === true && ru.command === '/lead_queue');
  const outDomain = await mod.handleLiveControlCommand('/some_other_command', { queuePath });
  check('out-of-domain rejected', outDomain.inDomain === false);
  const writeAttempt = await mod.handleLiveControlCommand('/lead_approve imp_001', { queuePath });
  check('L2 /lead_approve NOT handled (out of domain)', writeAttempt.inDomain === false);
  console.log('');

  // --- Verify queue file untouched ---
  console.log('[10] queue file integrity');
  const after = await fs.readFile(queuePath, 'utf8');
  check('queue file unchanged', after === JSON.stringify(sampleQueue, null, 2));
  const filesInTmp = await fs.readdir(tmp);
  check('only original queue file in tmp', filesInTmp.length === 1 && filesInTmp[0] === 'lead_import_approvals.json');
  console.log('');

  // Cleanup sandbox.
  await fs.rm(tmp, { recursive: true, force: true });

  console.log('=== RESULT ===');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  if (fail > 0) {
    console.log('FAILED CHECKS:', fails.join(', '));
    process.exitCode = 1;
  } else {
    console.log('ALL READ-ONLY L0 CHECKS PASSED ✅');
  }
}

main().catch((err) => {
  console.error('SMOKE TEST CRASHED:', err);
  process.exitCode = 1;
});
