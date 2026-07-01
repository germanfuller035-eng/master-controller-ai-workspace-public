// telegram_entrypoint_stray_bytes_guard_test.mjs
// REGRESSION GUARD against stray leading corrupt bytes in Telegram gateway entrypoints.
//
// PURPOSE (root-cause protection — see SOP "after any bug" rule):
//   On 2026-06-08 telegram_master_bot.mjs gained two stray leading bytes
//   (D0 B7 = Cyrillic "з") BEFORE the opening /** comment. Node ESM then threw:
//       ReferenceError: з is not defined
//   and the whole Telegram gateway could not start. This guard locks the
//   invariant that the entrypoint(s) begin with valid JS, so this class of
//   corruption can NEVER silently ship again.
//
// SAFETY: PURE test. NO Telegram API, NO SMTP, NO network, NO .env read,
//         NO process spawn, NO real send. Reads files as raw bytes only.
//
// FAILS IF, for any guarded entrypoint:
//   1. file is empty
//   2. file starts with a UTF-8 BOM (EF BB BF)
//   3. the first meaningful byte is non-ASCII (>= 0x80) — i.e. stray UTF-8 text
//   4. the first meaningful content does not start with an expected JS opener
//      (one of: "/*", "//", "import", "export", "#!", "'use", '"use', "const",
//       "let", "var", "function", "/**")

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATEWAY = path.resolve(__dirname, '..', 'telegram_gateway');

// Canonical entrypoint(s) that Node executes directly.
const ENTRYPOINTS = [
    path.join(GATEWAY, 'telegram_master_bot.mjs'),
];

// Accepted leading tokens (after skipping a shebang line + leading ASCII whitespace).
const EXPECTED_OPENERS = [
    '/*', '//', '/**',
    'import', 'export',
    "'use", '"use',
    'const ', 'let ', 'var ', 'function ',
];

let passed = 0;
let failed = 0;
function check(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok  - ${name}`);
    } catch (e) {
        failed += 1;
        console.log(`  FAIL- ${name}: ${e && e.message ? e.message : e}`);
    }
}

console.log('telegram entrypoint stray-leading-bytes guard');

for (const file of ENTRYPOINTS) {
    const rel = path.relative(GATEWAY, file);

    check(`${rel}: not empty`, () => {
        const buf = readFileSync(file);
        if (buf.length === 0) throw new Error('file is empty');
    });

    check(`${rel}: no UTF-8 BOM`, () => {
        const buf = readFileSync(file);
        if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
            throw new Error('file starts with a UTF-8 BOM (EF BB BF)');
        }
    });

    check(`${rel}: first meaningful byte is ASCII (no stray UTF-8 text)`, () => {
        let buf = readFileSync(file);
        // Strip an optional BOM only for index calculation (BOM itself fails above).
        let i = 0;
        if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) i = 3;
        // Skip ASCII whitespace (space, tab, CR, LF).
        while (i < buf.length && (buf[i] === 0x20 || buf[i] === 0x09 || buf[i] === 0x0d || buf[i] === 0x0a)) i++;
        if (i >= buf.length) throw new Error('file has no non-whitespace content');
        const firstByte = buf[i];
        if (firstByte >= 0x80) {
            throw new Error(
                `first meaningful byte is 0x${firstByte.toString(16)} (>= 0x80) — ` +
                'stray non-ASCII bytes before code start (corruption)',
            );
        }
    });

    check(`${rel}: starts with a valid JS opener`, () => {
        const text = readFileSync(file, 'utf8');
        let s = text;
        // Skip an optional shebang line.
        if (s.startsWith('#!')) {
            const nl = s.indexOf('\n');
            s = nl >= 0 ? s.slice(nl + 1) : '';
        }
        const trimmed = s.replace(/^[\s\uFEFF]+/, '');
        const ok = EXPECTED_OPENERS.some((opener) => trimmed.startsWith(opener));
        if (!ok) {
            const preview = JSON.stringify(trimmed.slice(0, 24));
            throw new Error(`unexpected file start ${preview} — not a recognized JS opener`);
        }
    });
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
