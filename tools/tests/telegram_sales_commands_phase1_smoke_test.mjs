/**
 * telegram_sales_commands_phase1_smoke_test.mjs
 * Phase 1 smoke tests — updated 2026-05-27 (No Response Patch)
 *
 * New checks added:
 *  T06 — chatId Number vs CHAT_ID String → must be match (String coercion)
 *  T07 — chatId mismatch → botLog WARN, no full chat_id printed
 *  T08 — handleDLFCommand true → NL-router/fallback must NOT execute
 *  T09 — /ping not routed twice
 *  T10 — /sales_today not in unknown_slash
 *  T11 — sendTelegram final failure logged via botLog + appendTelegramError
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(path.join(__dirname, '..', '..'));

// ─── helpers ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function pass(name) {
    passed++;
    results.push(`  ✅ PASS  ${name}`);
}
function fail(name, reason) {
    failed++;
    results.push(`  ❌ FAIL  ${name}  →  ${reason}`);
}

// ─── T01: sales_commands_phase1.mjs exists ──────────────────────────────────
const PHASE1_PATH = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'sales_commands_phase1.mjs');
if (fs.existsSync(PHASE1_PATH)) {
    pass('T01: sales_commands_phase1.mjs exists');
} else {
    fail('T01: sales_commands_phase1.mjs exists', 'file not found');
}

// ─── T02: exported functions present ────────────────────────────────────────
const phase1Src = fs.existsSync(PHASE1_PATH) ? fs.readFileSync(PHASE1_PATH, 'utf-8') : '';
const hasHandleSalesPhase1   = phase1Src.includes('handleSalesPhase1');
const hasSalesPhase1Unknown  = phase1Src.includes('salesPhase1UnknownFallback');
const hasSalesPhase1Voice    = phase1Src.includes('salesPhase1VoiceFallback');

if (hasHandleSalesPhase1 && hasSalesPhase1Unknown && hasSalesPhase1Voice) {
    pass('T02: handleSalesPhase1 + fallbacks exported');
} else {
    fail('T02: handleSalesPhase1 + fallbacks exported',
        `handleSalesPhase1=${hasHandleSalesPhase1} unknownFallback=${hasSalesPhase1Unknown} voiceFallback=${hasSalesPhase1Voice}`);
}

// ─── T03: /sales_today handled in phase1 ────────────────────────────────────
const salesTodayInPhase1 = phase1Src.includes('sales_today') || phase1Src.includes('/sales_today');
if (salesTodayInPhase1) {
    pass('T03: /sales_today present in sales_commands_phase1.mjs');
} else {
    fail('T03: /sales_today present in sales_commands_phase1.mjs', 'not found in source');
}

// ─── T04: /followups, /replies, /lead_status in phase1 ──────────────────────
const hasFollowups  = phase1Src.includes('followups');
const hasReplies    = phase1Src.includes('replies');
const hasLeadStatus = phase1Src.includes('lead_status');
if (hasFollowups && hasReplies && hasLeadStatus) {
    pass('T04: /followups /replies /lead_status present in phase1');
} else {
    fail('T04: /followups /replies /lead_status present in phase1',
        `followups=${hasFollowups} replies=${hasReplies} lead_status=${hasLeadStatus}`);
}

// ─── T05: master bot imports handleSalesPhase1 ──────────────────────────────
const BOT_PATH = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'telegram_master_bot.mjs');
const botSrc   = fs.existsSync(BOT_PATH) ? fs.readFileSync(BOT_PATH, 'utf-8') : '';
const botImportsPhase1 = botSrc.includes('handleSalesPhase1');
if (botImportsPhase1) {
    pass('T05: telegram_master_bot.mjs imports handleSalesPhase1');
} else {
    fail('T05: telegram_master_bot.mjs imports handleSalesPhase1', 'import not found');
}

// ─── T06: chat guard uses String() coercion (Number vs String safe) ──────────
// Must use String(chatId) before comparison, not raw chatId !== CHAT_ID
const hasStringCoercion = botSrc.includes('String(chatId)') || botSrc.includes('normalizedChatId');
const hasRawStrict      = /chatId\s*!==\s*CHAT_ID/.test(botSrc); // old buggy pattern
if (hasStringCoercion && !hasRawStrict) {
    pass('T06: chat guard uses String coercion — Number/String match safe');
} else if (hasRawStrict) {
    fail('T06: chat guard uses String coercion', 'CRITICAL: raw chatId !== CHAT_ID still present (type mismatch bug)');
} else {
    fail('T06: chat guard uses String coercion', 'String(chatId) pattern not found');
}

// ─── T07: mismatch logs via botLog WARN, no full chat_id in log message ──────
// Pattern: botLog('WARN', ...) with chat_last4 (not full id)
const hasMismatchWarn = botSrc.includes("botLog('WARN'") || botSrc.includes('botLog("WARN"');
const hasMismatchLog  = botSrc.includes('blocked_chat_id_mismatch') || botSrc.includes('chat_id_mismatch');
// Ensure full chatId is NOT being logged (no String(chatId) bare in log message)
const noFullChatIdInLog = !botSrc.includes('chat_id: normalizedChatId') && !botSrc.includes('full_chat_id:');
if (hasMismatchWarn && hasMismatchLog && noFullChatIdInLog) {
    pass('T07: mismatch logs WARN via botLog, no full chat_id printed');
} else {
    fail('T07: mismatch logs WARN via botLog, no full chat_id printed',
        `hasMismatchWarn=${hasMismatchWarn} hasMismatchLog=${hasMismatchLog} noFullChatIdInLog=${noFullChatIdInLog}`);
}

// ─── T08: handleDLFCommand return value is respected (no double routing) ─────
// Pattern: const dlfHandled = await handleDLFCommand / if (dlfHandled) { continue/return }
const hasDlfHandledCapture = botSrc.includes('dlfHandled') || botSrc.includes('const handled');
const hasDlfHandledGuard   = (botSrc.includes('if (dlfHandled)') || botSrc.includes('if(dlfHandled)'));
if (hasDlfHandledCapture && hasDlfHandledGuard) {
    pass('T08: handleDLFCommand return respected — NL-router/fallback skipped when handled');
} else {
    fail('T08: handleDLFCommand return respected',
        `hasDlfHandledCapture=${hasDlfHandledCapture} hasDlfHandledGuard=${hasDlfHandledGuard}`);
}

// ─── T09: /ping not routed twice ─────────────────────────────────────────────
// Verify /ping is handled in handleDLFCommand (DLF guard) AND that after dlfHandled
// the NL routing block is NOT reached. We check handleDLFCommand contains /ping
// and that if(dlfHandled) guard prevents fallthrough.
const dlfHasPing = botSrc.includes("'/ping'") || botSrc.includes('"/ping"') || botSrc.includes("t === '/ping'") || botSrc.includes("t.startsWith('/ping')");
if (dlfHasPing && hasDlfHandledGuard) {
    pass('T09: /ping handled in DLF guard, dlfHandled prevents double routing');
} else {
    fail('T09: /ping not routed twice',
        `dlfHasPing=${dlfHasPing} dlfHandledGuard=${hasDlfHandledGuard}`);
}

// ─── T10: /sales_today not in unknown_slash path ─────────────────────────────
// /sales_today must be matched by handleSalesPhase1. The salesHandled guard
// must exist and prevent falling to unknown_slash logging.
const hasSalesHandledGuard = botSrc.includes('salesHandled') && (botSrc.includes('if (salesHandled)') || botSrc.includes('if(salesHandled)'));
if (hasSalesHandledGuard) {
    pass('T10: /sales_today guarded by salesHandled — not in unknown_slash');
} else {
    fail('T10: /sales_today guarded by salesHandled', 'salesHandled guard not found in master bot');
}

// ─── T11: sendTelegram final failure logs via botLog + appendTelegramError ───
const hasSendTelegramErrorLog = botSrc.includes('sendTelegram_failed') ||
    (botSrc.includes("botLog('ERROR'") && botSrc.includes('sendTelegram'));
const hasSendTelegramAppendErr = botSrc.includes("appendTelegramError('sendTelegram'") ||
    botSrc.includes('appendTelegramError("sendTelegram"');
if (hasSendTelegramErrorLog && hasSendTelegramAppendErr) {
    pass('T11: sendTelegram final failure logged via botLog + appendTelegramError');
} else {
    fail('T11: sendTelegram final failure logged',
        `errorLog=${hasSendTelegramErrorLog} appendTelegramError=${hasSendTelegramAppendErr}`);
}

// ─── T12: startup command list includes Phase 1 commands ─────────────────────
const startupHasSalesToday = botSrc.includes('/sales_today') && (botSrc.includes("botLog('INFO'") || botSrc.includes('botLog("INFO"'));
const startupHasFollowups  = botSrc.includes('/followups');
const startupHasReplies    = botSrc.includes('/replies');
const startupHasLeadStatus = botSrc.includes('/lead_status');
if (startupHasSalesToday && startupHasFollowups && startupHasReplies && startupHasLeadStatus) {
    pass('T12: startup command list includes /sales_today /followups /replies /lead_status');
} else {
    fail('T12: startup command list incomplete',
        `sales_today=${startupHasSalesToday} followups=${startupHasFollowups} replies=${startupHasReplies} lead_status=${startupHasLeadStatus}`);
}

// ─── T13: .bak files exist ───────────────────────────────────────────────────
const bakBot    = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'telegram_master_bot.mjs.bak_sendpath_2026-05-27');
const bakSales  = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'sales_commands_phase1.mjs.bak_sendpath_2026-05-27');
if (fs.existsSync(bakBot) && fs.existsSync(bakSales)) {
    pass('T13: .bak files exist for both changed files');
} else {
    fail('T13: .bak files exist',
        `bot.bak=${fs.existsSync(bakBot)} sales.bak=${fs.existsSync(bakSales)}`);
}

// ─── T14: no secrets leaked in botLog (no token, no full chat_id in format) ──
// Verify that the WARN log for mismatch uses slice(-4) not full id
const leakCheck = /chat_id:\s*['"]\d{8,}/g.test(botSrc); // any raw long numeric chat_id literal in log call
if (!leakCheck) {
    pass('T14: no raw full chat_id literals in botLog calls');
} else {
    fail('T14: no raw full chat_id literals in botLog calls', 'possible chat_id leak detected');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  TELEGRAM SALES COMMANDS PHASE 1 SMOKE TEST — 2026-05-27   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
results.forEach(r => console.log(r));
console.log('');
console.log(`  Total: ${passed + failed}  |  PASSED: ${passed}  |  FAILED: ${failed}`);
console.log('');

if (failed === 0) {
    console.log('  🟢 ALL TESTS PASSED — No Response Patch verified.\n');
    process.exit(0);
} else {
    console.log(`  🔴 ${failed} TEST(S) FAILED — Review above.\n`);
    process.exit(1);
}
