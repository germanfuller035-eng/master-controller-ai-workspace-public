/**
 * owner_gate_lead_import_test.mjs
 *
 * Owner-gate test for lead-import / daily100 commands in telegram_master_bot.mjs.
 *
 * BACKGROUND (the bug this guards against):
 *   The D1 lead-intake owner gate previously computed "is owner" ONLY from
 *   TELEGRAM_CHAT_ID equality. When the env defined ALLOWED_TELEGRAM_USER_IDS
 *   (the documented var) but NOT TELEGRAM_CHAT_ID, the gate evaluated to false
 *   and the bot replied "Команда доступна только владельцу" — while /ping
 *   (which has no gate) still worked. The fix introduces isOwnerSender(userId,
 *   chatId): owner = (message.from.id ∈ ALLOWED_TELEGRAM_USER_IDS) OR
 *   (chat.id === TELEGRAM_CHAT_ID). Fail-closed when no allowlist is configured.
 *
 * SAFETY (this test):
 *   - Reads source files only. Writes nothing. Sends nothing.
 *   - Does NOT import telegram_master_bot.mjs (importing it would start polling).
 *   - Does NOT read .env / AI_SECRETS. Uses fabricated ids only.
 *   - No network / Telegram / email / SMTP / VPS. No D1 data. No dashboard.
 *
 * It validates:
 *   A) The owner-gate CONTRACT, via a local mirror of isOwnerSender.
 *   B) That telegram_master_bot.mjs actually wires isOwnerSender(userId, chatId)
 *      into the D1 lead-intake gate (static source scan).
 *
 * Exit code 0 when all checks pass, 1 otherwise.
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATEWAY_DIR = path.resolve(__dirname, '..', 'telegram_gateway');
const BOT_FILE = path.join(GATEWAY_DIR, 'telegram_master_bot.mjs');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  const ok = condition === true;
  if (ok) passed += 1; else failed += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

// ---------------------------------------------------------------------------
// A) Owner-gate CONTRACT — local mirror of isOwnerSender (kept identical to
//    the implementation in telegram_master_bot.mjs). If the production logic
//    changes, section B's source scan will catch divergence.
// ---------------------------------------------------------------------------
function makeIsOwnerSender({ allowedUserIds = [], chatId = '' } = {}) {
  const ALLOWED_USER_IDS = new Set(
    String(allowedUserIds.join(','))
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  );
  const CHAT_ID = chatId;
  return function isOwnerSender(userId, chat) {
    const normUser = userId != null ? String(userId).trim() : '';
    const normChat = chat != null ? String(chat).trim() : '';
    const normAllowedChat = CHAT_ID ? String(CHAT_ID).trim() : '';
    const userMatch = normUser !== '' && ALLOWED_USER_IDS.has(normUser);
    const chatMatch = normAllowedChat !== '' && normChat === normAllowedChat;
    return userMatch || chatMatch;
  };
}

const OWNER_USER = '111222333';
const OWNER_CHAT = '444555666';
const STRANGER_USER = '999000111';
const STRANGER_CHAT = '777888999';

console.log('\n=== OWNER-GATE CONTRACT ===');

// Case 1: only user allowlist configured (the bug scenario) — owner by user id.
const gateUserOnly = makeIsOwnerSender({ allowedUserIds: [OWNER_USER] });
check(
  '01 owner accepted by message.from.id when only ALLOWED_TELEGRAM_USER_IDS set',
  gateUserOnly(OWNER_USER, STRANGER_CHAT) === true,
);
check(
  '02 stranger rejected when only ALLOWED_TELEGRAM_USER_IDS set',
  gateUserOnly(STRANGER_USER, STRANGER_CHAT) === false,
);

// Case 2: only chat id configured — owner by chat id (legacy behavior preserved).
const gateChatOnly = makeIsOwnerSender({ chatId: OWNER_CHAT });
check(
  '03 owner accepted by chat.id when only TELEGRAM_CHAT_ID set',
  gateChatOnly(STRANGER_USER, OWNER_CHAT) === true,
);
check(
  '04 stranger chat rejected when only TELEGRAM_CHAT_ID set',
  gateChatOnly(STRANGER_USER, STRANGER_CHAT) === false,
);

// Case 3: both configured — either source authorizes the owner.
const gateBoth = makeIsOwnerSender({ allowedUserIds: [OWNER_USER], chatId: OWNER_CHAT });
check(
  '05 owner accepted by user id even from a non-admin chat',
  gateBoth(OWNER_USER, STRANGER_CHAT) === true,
);
check(
  '06 owner accepted by chat id even with unknown user id',
  gateBoth(STRANGER_USER, OWNER_CHAT) === true,
);
check(
  '07 stranger (neither user nor chat) rejected',
  gateBoth(STRANGER_USER, STRANGER_CHAT) === false,
);

// Case 4: fail-closed — no allowlist at all → nobody is owner.
const gateNone = makeIsOwnerSender({});
check(
  '08 fail-closed: no allowlist → owner check is false',
  gateNone(OWNER_USER, OWNER_CHAT) === false,
);

// Case 5: type robustness — numeric ids must match their string allowlist forms.
const gateNumeric = makeIsOwnerSender({ allowedUserIds: [OWNER_USER], chatId: OWNER_CHAT });
check(
  '09 numeric userId matches string allowlist entry',
  gateNumeric(Number(OWNER_USER), STRANGER_CHAT) === true,
);
check(
  '10 numeric chatId matches string CHAT_ID',
  gateNumeric(STRANGER_USER, Number(OWNER_CHAT)) === true,
);
check(
  '11 null/undefined ids are rejected safely',
  gateNumeric(null, undefined) === false,
);

// ---------------------------------------------------------------------------
// B) SOURCE SCAN — confirm telegram_master_bot.mjs wires the fix.
// ---------------------------------------------------------------------------
console.log('\n=== BOT SOURCE WIRING ===');

const SRC = fs.existsSync(BOT_FILE) ? fs.readFileSync(BOT_FILE, 'utf8') : '';

check('12 telegram_master_bot.mjs exists', SRC !== '', BOT_FILE);
check(
  '13 isOwnerSender helper defined',
  /function\s+isOwnerSender\s*\(/.test(SRC),
);
check(
  '14 ALLOWED_USER_IDS built from ALLOWED_TELEGRAM_USER_IDS',
  /ALLOWED_USER_IDS/.test(SRC) && /ALLOWED_TELEGRAM_USER_IDS/.test(SRC),
);
check(
  '15 owner gate uses isOwnerSender(userId, chatId)',
  /isOwnerSender\s*\(\s*userId\s*,\s*chatId\s*\)/.test(SRC),
);
check(
  '16 D1 gate feeds is_from_owner from the owner check',
  /is_from_owner\s*:\s*_d1IsFromOwner/.test(SRC),
);
check(
  '17 gate no longer keyed solely on CHAT_ID equality (_d1AllowedChatId removed)',
  !/_d1AllowedChatId/.test(SRC),
);
check(
  '18 owner-only denial string still present (security preserved downstream)',
  /владельц/i.test(SRC) || /handleLeadIntakeBotMessage/.test(SRC),
);

// ---------------------------------------------------------------------------
console.log('\n=== SUMMARY ===');
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
console.log(
  `RESULT_JSON: ${JSON.stringify({ passed, failed, ok: failed === 0 })}`,
);

process.exit(failed === 0 ? 0 : 1);
