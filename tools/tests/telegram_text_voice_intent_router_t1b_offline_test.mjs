// telegram_text_voice_intent_router_t1b_offline_test.mjs
// ============================================================
// T1B — Offline test for the Text/Voice Intent Router.
// Pure, offline, no network, no Telegram API, no child_process, no token read.
// Verifies: intent recognition, RU phrases, response contents, slash-command
// non-interception, and that NO dangerous primitives are present in the router.
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    INTENTS,
    classifyIntent,
    getIntentResponse,
    handleTextVoiceIntent,
    isTextVoiceIntent,
} from '../telegram_gateway/telegram_text_voice_intent_router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATEWAY = path.join(__dirname, '..', 'telegram_gateway');

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; failures.push(label); console.log(`  ❌ ${label}`); }
}

function eq(input, expected) {
    const got = classifyIntent(input);
    ok(got === expected, `classifyIntent("${input}") === ${expected} (got ${got})`);
}

console.log('=== T1B Text/Voice Intent Router — OFFLINE TEST ===\n');

console.log('[1] All intent categories recognized');
eq('меню', INTENTS.MENU);
eq('здоровье', INTENTS.HEALTH);
eq('сегодня', INTENTS.TODAY);
eq('регрессия', INTENTS.REGRESSION_INFO);
eq('мини аудит', INTENTS.MINI_AUDIT);
eq('очередь', INTENTS.QUEUE);
eq('freeze', INTENTS.FREEZE);
eq('помощь', INTENTS.HELP);
eq('100 лидов', INTENTS.LEAD_100_INFO);

console.log('\n[2] Russian free-form phrases');
eq('покажи меню', INTENTS.MENU);
eq('главное меню', INTENTS.MENU);
eq('что можно делать', INTENTS.MENU);
eq('что с ботом', INTENTS.HEALTH);
eq('бот живой', INTENTS.HEALTH);
eq('статус бота', INTENTS.HEALTH);
eq('что сегодня', INTENTS.TODAY);
eq('задачи на сегодня', INTENTS.TODAY);
eq('проверь систему', INTENTS.REGRESSION_INFO);
eq('прогони проверку', INTENTS.REGRESSION_INFO);
eq('всё зелёное', INTENTS.REGRESSION_INFO);
eq('что по лидам', INTENTS.MINI_AUDIT);
eq('топ лиды', INTENTS.MINI_AUDIT);
eq('деньги', INTENTS.MINI_AUDIT);
eq('что в очереди', INTENTS.QUEUE);
eq('апрув', INTENTS.QUEUE);
eq('что заморожено', INTENTS.FREEZE);
eq('можно ли импорт', INTENTS.FREEZE);
eq('можно ли отправлять', INTENTS.FREEZE);
eq('что ты умеешь', INTENTS.HELP);

console.log('\n[3] lead_100_info specific phrases (must win over mini_audit)');
eq('найти 100 лидов', INTENTS.LEAD_100_INFO);
eq('запусти поиск лидов', INTENTS.LEAD_100_INFO);
eq('ежедневный парсинг', INTENTS.LEAD_100_INFO);
eq('парсинг лидов', INTENTS.LEAD_100_INFO);
eq('когда парсим лиды', INTENTS.LEAD_100_INFO);

console.log('\n[4] lead_100_info response content');
const leadResp = getIntentResponse(INTENTS.LEAD_100_INFO);
ok(/report-only/i.test(leadResp), 'lead_100_info response contains "report-only"');
ok(/Telegram preview/i.test(leadResp), 'lead_100_info response contains "Telegram preview"');
ok(/approval/i.test(leadResp), 'lead_100_info response contains "approval"');
ok(/заблокированы/i.test(leadResp), 'lead_100_info response states import/send blocked');

console.log('\n[5] lead_100_info does NOT trigger parsing (pure data, no execution)');
const leadResult = handleTextVoiceIntent('найти 100 лидов');
ok(leadResult && leadResult.handled === true, 'lead_100_info handled=true');
ok(leadResult && leadResult.intent === INTENTS.LEAD_100_INFO, 'lead_100_info intent correct');
ok(leadResult && typeof leadResult.text === 'string' && !('exec' in leadResult) && !('spawn' in leadResult), 'lead_100_info result has no exec/spawn fields');

console.log('\n[6] Other intent responses present and safe');
ok(/health/i.test(getIntentResponse(INTENTS.HEALTH)) && /T2/.test(getIntentResponse(INTENTS.HEALTH)), 'health response mentions /health + T2');
ok(/today/i.test(getIntentResponse(INTENTS.TODAY)) && /T2/.test(getIntentResponse(INTENTS.TODAY)), 'today response mentions /today + T2');
ok(/T2/.test(getIntentResponse(INTENTS.REGRESSION_INFO)) && /regression_telegram_gateway\.ps1 run/.test(getIntentResponse(INTENTS.REGRESSION_INFO)), 'regression_info response is informational (no execution)');
ok(/Autosend blocked/i.test(getIntentResponse(INTENTS.MINI_AUDIT)), 'mini_audit response states Autosend blocked');
ok(/Queue write blocked/i.test(getIntentResponse(INTENTS.QUEUE)), 'queue response read-only / write blocked');
ok(/D3C freeze ACTIVE/i.test(getIntentResponse(INTENTS.FREEZE)), 'freeze response states D3C freeze ACTIVE');

console.log('\n[7] Slash commands are NEVER intercepted (return unknown)');
eq('/ping', INTENTS.UNKNOWN);
eq('/health', INTENTS.UNKNOWN);
eq('/today', INTENTS.UNKNOWN);
eq('/lead_import_prepare', INTENTS.UNKNOWN);
eq('/lead_import_prepare Завод АТОМ', INTENTS.UNKNOWN);
ok(handleTextVoiceIntent('/ping') === null, '/ping → handleTextVoiceIntent returns null (fall-through)');
ok(handleTextVoiceIntent('/health') === null, '/health → null (fall-through)');
ok(handleTextVoiceIntent('/today') === null, '/today → null (fall-through)');
ok(handleTextVoiceIntent('/lead_import_prepare') === null, '/lead_import_prepare → null (not unfrozen, not intercepted)');

console.log('\n[8] Unknown text does NOT break fallback (returns null)');
ok(handleTextVoiceIntent('абракадабра неизвестная фраза') === null, 'unknown text → null (existing fallback preserved)');
ok(handleTextVoiceIntent('') === null, 'empty text → null');
ok(handleTextVoiceIntent(null) === null, 'null → null');
ok(handleTextVoiceIntent(undefined) === null, 'undefined → null');
ok(isTextVoiceIntent('меню') === true, 'isTextVoiceIntent("меню") true');
ok(isTextVoiceIntent('абракадабра') === false, 'isTextVoiceIntent("абракадабра") false');

console.log('\n[9] Router source has NO dangerous primitives');
const routerSrc = fs.readFileSync(path.join(GATEWAY, 'telegram_text_voice_intent_router.mjs'), 'utf-8');
ok(!/child_process/.test(routerSrc), 'no child_process import');
ok(!/\bspawn\b/.test(routerSrc), 'no spawn');
ok(!/\bexec\b/.test(routerSrc), 'no exec');
ok(!/spawnSync/.test(routerSrc), 'no spawnSync');
ok(!/PowerShell|powershell\.exe/.test(routerSrc), 'no PowerShell invocation');
ok(!/process\.env\.TELEGRAM_BOT_TOKEN|BOT_TOKEN|AIza|\.env\b/.test(routerSrc), 'no token / .env read');
ok(!/writeFileSync|appendFileSync|fs\.write/.test(routerSrc), 'no file write (no queue write)');
ok(!/api\.telegram\.org|sendMessage|tgRequest|tgCall|getUpdates/.test(routerSrc), 'no Telegram API calls');
ok(!/import_leads|lead_import_prepare\s*\(|runImport|realImport/.test(routerSrc), 'no lead import execution');

console.log('\n[10] Bot integration is present and safe (static check)');
const botSrc = fs.readFileSync(path.join(GATEWAY, 'telegram_master_bot.mjs'), 'utf-8');
ok(/import \{ handleTextVoiceIntent \} from '\.\/telegram_text_voice_intent_router\.mjs'/.test(botSrc), 'bot imports handleTextVoiceIntent');
ok(/const intentResult = handleTextVoiceIntent\(text\);/.test(botSrc), 'bot calls handleTextVoiceIntent(text)');
// Guard must be placed AFTER the T1 hotkey menu block.
const idxMenu = botSrc.indexOf("const menuResult = handleHotkeyMenu(text);");
const idxIntent = botSrc.indexOf("const intentResult = handleTextVoiceIntent(text);");
ok(idxMenu > -1 && idxIntent > idxMenu, 'T1B guard placed AFTER T1 hotkey menu');
// Guard must be BEFORE DLF direct commands (so it runs early, but slash cmds still safe via classifier).
const idxDlf = botSrc.indexOf("const dlfHandled = await handleDLFCommand");
ok(idxDlf > idxIntent, 'T1B guard placed BEFORE DLF direct-command dispatch');
// D3C freeze must remain present/active in the bot.
ok(/D3C SAFETY FREEZE/.test(botSrc), 'D3C safety freeze block still present in bot');
ok(/d3c_safety_freeze_blocked/.test(botSrc), 'D3C freeze status still wired (frozen)');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
}
console.log('ALL T1B OFFLINE TESTS PASSED ✅');
process.exit(0);
