/**
 * lead_import_approval_prepare_card_real_d2j_tempcopy_test.mjs
 * ---------------------------------------------------------------------------
 * D2J temp-copy test for the real prepare-card helper.
 *
 * Safety model (same discipline as D2G/D2I temp-copy tests):
 *   - NEVER touches the real production queue path.
 *   - Operates ONLY on a throwaway temp dir under the OS temp folder.
 *   - SYNTHETIC inputs only — no real lead PII anywhere.
 *   - No network, no Telegram API, no SMTP, no .env / AI_SECRETS.
 *   - prepare-card != approve != reject != real import (asserted via safety).
 *   - Cleans up its own temp dir on success.
 *
 * Run:  node tools/tests/lead_import_approval_prepare_card_real_d2j_tempcopy_test.mjs
 * ---------------------------------------------------------------------------
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

import {
  prepareRealApprovalCard,
  getPrepareCardRealVersion,
  PREPARE_CARD_REAL_VERSION,
} from '../telegram_gateway/lead_import_approval_prepare_card_real.mjs';
import { getApprovalQueueVersion } from '../telegram_gateway/lead_intake_approval_queue.mjs';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function makeTempQueue(initialCards = []) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'd2j-prepare-card-'));
  const queuePath = path.join(dir, 'approval_queue.json');
  const container = {
    version: getApprovalQueueVersion(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cards: initialCards,
  };
  await fs.writeFile(queuePath, `${JSON.stringify(container, null, 2)}\n`, 'utf8');
  return { dir, queuePath };
}

async function readQueue(queuePath) {
  return JSON.parse(await fs.readFile(queuePath, 'utf8'));
}

async function cleanup(dir) {
  // Best-effort recursive cleanup of OUR temp dir only (under os.tmpdir()).
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// Synthetic, PII-free card input (no email/phone/handle patterns).
function syntheticInput(seed = 'alpha') {
  return {
    text: `SYNTHETIC lead intake batch ${seed} (test only, no real data)`,
    source: 'd2j_tempcopy_test',
    parsed_count: 3,
    valid_count: 3,
    added_count: 2,
    merged_count: 1,
    qa_status: 'PASS',
  };
}

async function main() {
  console.log('D2J prepare-card-real temp-copy test');
  console.log(`version: ${getPrepareCardRealVersion()} (${PREPARE_CARD_REAL_VERSION})`);

  // -- T1: missing queuePath -> FAIL_QUEUE_PATH_REQUIRED, nothing written ----
  {
    const res = await prepareRealApprovalCard({ cardInput: syntheticInput() });
    ok('T1 missing queuePath fails', res.ok === false && res.status === 'FAIL_QUEUE_PATH_REQUIRED', res.status);
    ok('T1 nothing written', res.queue_written === false && res.real_data_changed === false);
  }

  // -- T2: missing cardInput -> FAIL_CARD_INPUT_REQUIRED ---------------------
  {
    const { dir, queuePath } = await makeTempQueue();
    const res = await prepareRealApprovalCard({ queuePath });
    ok('T2 missing cardInput fails', res.ok === false && res.status === 'FAIL_CARD_INPUT_REQUIRED', res.status);
    await cleanup(dir);
  }

  // -- T3: real-PII (email) is blocked --------------------------------------
  {
    const { dir, queuePath } = await makeTempQueue();
    const res = await prepareRealApprovalCard({
      queuePath,
      cardInput: { ...syntheticInput(), text: 'contact me at john.doe@example.com' },
    });
    ok('T3 email PII blocked', res.ok === false && res.status === 'FAIL_REAL_PII_BLOCKED', res.status);
    const after = await readQueue(queuePath);
    ok('T3 queue untouched', after.cards.length === 0);
    await cleanup(dir);
  }

  // -- T3b: real-PII (phone) is blocked -------------------------------------
  {
    const { dir, queuePath } = await makeTempQueue();
    const res = await prepareRealApprovalCard({
      queuePath,
      cardInput: { ...syntheticInput(), text: 'call +1 415 555 0132 now' },
    });
    ok('T3b phone PII blocked', res.ok === false && res.status === 'FAIL_REAL_PII_BLOCKED', res.status);
    await cleanup(dir);
  }

  // -- T4: queue not initialized -> FAIL_QUEUE_NOT_INITIALIZED ---------------
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'd2j-noqueue-'));
    const queuePath = path.join(dir, 'does_not_exist.json');
    const res = await prepareRealApprovalCard({ queuePath, cardInput: syntheticInput() });
    ok('T4 uninitialized queue fails', res.ok === false && res.status === 'FAIL_QUEUE_NOT_INITIALIZED', res.status);
    await cleanup(dir);
  }

  // -- T5: DRY-RUN (no confirm) plans card but writes nothing ----------------
  {
    const { dir, queuePath } = await makeTempQueue();
    const res = await prepareRealApprovalCard({ queuePath, cardInput: syntheticInput('dry') });
    ok('T5 dry-run ok', res.ok === true && res.status === 'DRY_RUN' && res.dry_run === true, res.status);
    ok('T5 planned card is PENDING', res.planned_card && res.planned_card.status === 'PENDING');
    ok('T5 nothing written', res.queue_written === false && res.card_prepared === false);
    const after = await readQueue(queuePath);
    ok('T5 queue still empty', after.cards.length === 0, String(after.cards.length));
    await cleanup(dir);
  }

  // -- T6: CONFIRMED prepare appends exactly one PENDING card + backup -------
  let committedCard = null;
  {
    const { dir, queuePath } = await makeTempQueue();
    const res = await prepareRealApprovalCard({
      queuePath,
      cardInput: syntheticInput('confirm'),
      confirmRealPrepareCard: true,
    });
    ok('T6 confirmed prepare ok', res.ok === true && res.status === 'OK_CARD_PREPARED', res.status);
    ok('T6 card_prepared + queue_written', res.card_prepared === true && res.queue_written === true);
    ok('T6 counts 0 -> 1', res.cards_before === 0 && res.cards_after === 1, `${res.cards_before}->${res.cards_after}`);
    ok('T6 prepared card PENDING', res.prepared_card && res.prepared_card.status === 'PENDING');

    const after = await readQueue(queuePath);
    ok('T6 queue has exactly 1 card', after.cards.length === 1, String(after.cards.length));
    ok('T6 written card PENDING', after.cards[0] && after.cards[0].status === 'PENDING');
    committedCard = after.cards[0];

    // backup file exists
    const backupExists = await fs
      .access(res.backup_file)
      .then(() => true)
      .catch(() => false);
    ok('T6 backup file written', backupExists, res.backup_file);

    // -- T7: duplicate guard (same queue + same input) -> FAIL_DUPLICATE_CARD
    // Re-use identical synthetic input; same text => same text_hash => dup.
    void committedCard;
    const dup = await prepareRealApprovalCard({
      queuePath,
      cardInput: syntheticInput('confirm'),
      confirmRealPrepareCard: true,
    });
    ok('T7 duplicate blocked', dup.ok === false && dup.status === 'FAIL_DUPLICATE_CARD', dup.status);
    const afterDup = await readQueue(queuePath);
    ok('T7 still exactly 1 card', afterDup.cards.length === 1, String(afterDup.cards.length));

    await cleanup(dir);
  }

  // -- T8: safety contract present + blocking on every response --------------
  {
    const { dir, queuePath } = await makeTempQueue();
    const res = await prepareRealApprovalCard({ queuePath, cardInput: syntheticInput('safety') });
    const s = res.safety || {};
    ok(
      'T8 safety blocks import/commit/contact',
      s.real_import === 'BLOCKED' &&
        s.committed === 'BLOCKED' &&
        s.client_contact === 'BLOCKED' &&
        s.auto_send === 'BLOCKED' &&
        s.leads_master_write === 'NO' &&
        s.bot_live_patch === 'NO'
    );
    await cleanup(dir);
  }

  console.log(`\nD2J prepare-card-real temp-copy test: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
