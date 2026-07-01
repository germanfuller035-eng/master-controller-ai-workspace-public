// telegram_hotkey_menu_t1_offline_test.mjs
// ============================================================
// T1 — Offline test for the Telegram Hotkey Menu module.
// Pure, offline, no network, no Telegram API, no PowerShell, no file writes.
// Run: node tools/tests/telegram_hotkey_menu_t1_offline_test.mjs
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
    handleHotkeyMenu,
    isMenuTrigger,
    buildMenuKeyboard,
    HOTKEY_LABELS,
    HOTKEY_LABEL_LIST,
} from '../telegram_gateway/telegram_hotkey_menu.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        failures.push(name);
        console.log(`  ❌ ${name}`);
    }
}

console.log('=== T1 Telegram Hotkey Menu — OFFLINE TEST ===\n');

// ---- 1. /menu is recognized ----
const menuRes = handleHotkeyMenu('/menu');
check('/menu is recognized', !!(menuRes && menuRes.handled));
check('/menu returns a reply keyboard', !!(menuRes && menuRes.reply_markup && Array.isArray(menuRes.reply_markup.keyboard)));

// ---- 2. /help is recognized ----
const helpRes = handleHotkeyMenu('/help');
check('/help is recognized', !!(helpRes && helpRes.handled));

// ---- 3. RU menu aliases ----
check('"меню" is recognized', isMenuTrigger('меню'));
check('"главное меню" is recognized', isMenuTrigger('главное меню'));

// ---- 4. All 8 hotkey labels are recognized ----
check('exactly 8 hotkey labels defined', HOTKEY_LABEL_LIST.length === 8);
for (const label of HOTKEY_LABEL_LIST) {
    const r = handleHotkeyMenu(label);
    check(`hotkey label recognized: ${label}`, !!(r && r.handled));
}

// ---- 5. Freeze response contains "D3C freeze ACTIVE" ----
const freezeRes = handleHotkeyMenu(HOTKEY_LABELS.FREEZE);
check('Freeze response contains "D3C freeze ACTIVE"', !!(freezeRes && freezeRes.text.includes('D3C freeze ACTIVE')));

// ---- 6. Mini Audit response content ----
const miniRes = handleHotkeyMenu(HOTKEY_LABELS.MINI_AUDIT);
check('Mini Audit response contains "autosend blocked"', !!(miniRes && miniRes.text.includes('autosend blocked')));
check('Mini Audit response contains "Telegram-controlled only"', !!(miniRes && miniRes.text.includes('Telegram-controlled only')));

// ---- 7. Проверка does NOT run PowerShell (hint only) ----
const checkRes = handleHotkeyMenu(HOTKEY_LABELS.CHECK);
check('Проверка returns a hint (handled)', !!(checkRes && checkRes.handled));
check('Проверка mentions regression command as hint only', !!(checkRes && checkRes.text.includes('regression_telegram_gateway.ps1')));
check('Проверка says enabled on T2 (not run now)', !!(checkRes && checkRes.text.includes('на T2')));

// ---- 8. /ping is NOT intercepted by the menu layer ----
check('/ping is NOT a menu trigger', handleHotkeyMenu('/ping') === null);
check('/health is NOT a menu trigger', handleHotkeyMenu('/health') === null);
check('/today is NOT a menu trigger', handleHotkeyMenu('/today') === null);
check('/lead_import_prepare is NOT a menu trigger', handleHotkeyMenu('/lead_import_prepare some text') === null);
check('arbitrary text is NOT a menu trigger', handleHotkeyMenu('привет, как дела') === null);

// ---- 9. Health / Today hotkeys are HINT-ONLY (do not break existing commands) ----
const healthHot = handleHotkeyMenu(HOTKEY_LABELS.HEALTH);
check('🩺 Health hotkey points to /health command (hint)', !!(healthHot && healthHot.text.includes('/health')));
const todayHot = handleHotkeyMenu(HOTKEY_LABELS.TODAY);
check('📊 Сегодня hotkey points to /today command (hint)', !!(todayHot && todayHot.text.includes('/today')));

// ---- 10. Keyboard layout shape (4 rows x 2 buttons, exact labels/order) ----
const kb = buildMenuKeyboard();
check('keyboard has 4 rows', kb.keyboard.length === 4);
check('row1 = [🏠 Меню, 🩺 Health]',
    kb.keyboard[0][0].text === HOTKEY_LABELS.MENU && kb.keyboard[0][1].text === HOTKEY_LABELS.HEALTH);
check('row2 = [🧪 Проверка, 💰 Mini Audit]',
    kb.keyboard[1][0].text === HOTKEY_LABELS.CHECK && kb.keyboard[1][1].text === HOTKEY_LABELS.MINI_AUDIT);
check('row3 = [📋 Очередь, 🧊 Freeze]',
    kb.keyboard[2][0].text === HOTKEY_LABELS.QUEUE && kb.keyboard[2][1].text === HOTKEY_LABELS.FREEZE);
check('row4 = [📊 Сегодня, ❓ Help]',
    kb.keyboard[3][0].text === HOTKEY_LABELS.TODAY && kb.keyboard[3][1].text === HOTKEY_LABELS.HELP);

// ---- 11. Queue response is read-only / write blocked ----
const queueRes = handleHotkeyMenu(HOTKEY_LABELS.QUEUE);
check('Очередь response says read-only in T1', !!(queueRes && queueRes.text.includes('read-only in T1')));
check('Очередь response says queue write blocked', !!(queueRes && queueRes.text.includes('queue write blocked')));

// ---- 12. SAFETY: module source contains NO dangerous primitives ----
const moduleSrc = readFileSync(path.join(__dirname, '..', 'telegram_gateway', 'telegram_hotkey_menu.mjs'), 'utf-8');
check('module does NOT import child_process (no PowerShell/shell)', !/child_process/.test(moduleSrc));
check('module does NOT call spawn/exec', !/\b(spawnSync|spawn|execSync|exec)\s*\(/.test(moduleSrc));
check('module does NOT read tokens (no BOT_TOKEN / process.env token)', !/BOT_TOKEN|TELEGRAM_BOT_TOKEN/.test(moduleSrc));
check('module does NOT call Telegram API (no api.telegram.org / sendMessage)', !/api\.telegram\.org|sendMessage|tgRequest|tgCall/.test(moduleSrc));
check('module does NOT write files (no writeFile/appendFile)', !/writeFileSync|writeFile|appendFileSync|appendFile/.test(moduleSrc));
check('module does NOT touch approval queue (no queue write path)', !/approval_queue|lead_import_approvals/.test(moduleSrc));

// ---- Summary ----
console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('FAILED CHECKS:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
}
console.log('✅ ALL T1 OFFLINE TESTS PASSED');
process.exit(0);
