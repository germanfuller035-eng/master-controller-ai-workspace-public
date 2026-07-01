// telegram_command_registry_test.mjs
// ============================================================
// Block A regression guard: registry must keep every required command
// and every required text/voice phrase resolvable. Offline, no network.
// ============================================================
import reg from '../telegram_gateway/telegram_command_registry.mjs';

let failures = 0;
function ok(cond, msg) {
    if (cond) {
        console.log('  PASS', msg);
    } else {
        failures++;
        console.log('  FAIL', msg);
    }
}

console.log('== Block A: Telegram Command Registry ==');

// 1) Every REQUIRED_WORKING command must resolve to a registry entry.
console.log('-- required-working commands resolve --');
for (const name of reg.REQUIRED_WORKING) {
    const cmd = reg.resolveCommand(name);
    ok(!!cmd, `resolveCommand('${name}') -> ${cmd ? cmd.name : 'null'}`);
}

// 2) Every REQUIRED_TEXT_PHRASE must resolve to a slash command.
console.log('-- required text/voice phrases resolve --');
for (const phrase of reg.REQUIRED_TEXT_PHRASES) {
    const cmd = reg.resolveCommand(phrase);
    ok(!!cmd, `resolveCommand('${phrase}') -> ${cmd ? cmd.name : 'null'}`);
}

// 3) Voice fallback commands must all exist in the registry.
console.log('-- voice fallback commands exist --');
for (const name of reg.VOICE_FALLBACK_COMMANDS) {
    ok(!!reg.getCommand(name), `getCommand('${name}')`);
}

// 4) No duplicate canonical names.
console.log('-- no duplicate canonical names --');
const names = reg.allCommandNames();
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
ok(dupes.length === 0, `duplicates: ${dupes.join(', ') || 'none'}`);

// 5) Sales aliases route correctly.
console.log('-- key aliases route correctly --');
ok(reg.resolveCommand('/leadadd')?.name === '/lead_add', "'/leadadd' -> /lead_add");
ok(reg.resolveCommand('пора заработать')?.name === '/sales_next', "'пора заработать' -> /sales_next");
ok(reg.resolveCommand('что с системой?')?.name === '/health', "'что с системой?' -> /health");
ok(reg.resolveCommand('бот жив?')?.name === '/health', "'бот жив?' -> /health (liveness)");
ok(reg.resolveCommand('пинг')?.name === '/ping', "'пинг' -> /ping");

// 6) planned commands are declared (will get handlers in their blocks).
console.log('-- planned v1 commands are declared --');
for (const name of ['/sales_status', '/sales_history', '/lead_run_pipeline']) {
    ok(!!reg.getCommand(name), `declared: ${name}`);
}

console.log('');
if (failures === 0) {
    console.log('ALL GREEN: registry contract intact.');
    process.exit(0);
} else {
    console.log(`RED: ${failures} failure(s).`);
    process.exit(1);
}
