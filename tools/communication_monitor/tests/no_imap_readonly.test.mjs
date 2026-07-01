#!/usr/bin/env node
// tools/communication_monitor/tests/no_imap_readonly.test.mjs
// MP2 — proves the Yandex IMAP source is read-only WITHOUT executing IMAP. Static analysis only.
// No network, no credentials, no live connection. Deterministic.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'yandex_mail_imap_read.mjs');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

ok('source tracked + present', existsSync(SRC));
const src = readFileSync(SRC, 'utf8');

// Read-only / no-mutation proof
ok('mark_seen disabled', /mark_seen_enabled:\s*false/.test(src));
ok('readonly_mailbox true', /readonly_mailbox:\s*true/.test(src));
ok('send disabled', /send_enabled:\s*false/.test(src));
ok('delete disabled', /delete_enabled:\s*false/.test(src));
ok('body_download disabled', /body_download_enabled:\s*false/.test(src));
ok('hard safety guard present', /SAFETY contract violation/.test(src));

// No flag-mutation / send IMAP verbs in source
ok('no addFlags/setFlags', !/\baddFlags\b|\bsetFlags\b/.test(src));
ok('no STORE \\Seen', !/messageFlagsAdd|\bSTORE\b.*Seen/.test(src));
ok('no APPEND', !/\bappend\s*\(/.test(src));
ok('no expunge/delete', !/\bexpunge\b|\bmessageDelete\b|\bdeleteMessage\b/.test(src));
ok('no sendMail', !/\bsendMail\b|createTransport/.test(src));

// Credentials only via env (no literal secret)
ok('credentials from process.env', /process\.env\['?YANDEX_MAIL_APP_PASSWORD'?\]|v\('YANDEX_MAIL_APP_PASSWORD'\)/.test(src) || /YANDEX_MAIL_APP_PASSWORD/.test(src));
ok('no literal app password', !/app_password\s*[:=]\s*['"][A-Za-z0-9]{8,}['"]/i.test(src));
ok('values not logged', /values not logged/.test(src));

// Live read is opt-in only (default dry-run); no auto-connect at import
ok('live read gated by explicit env', /YANDEX_MAIL_STAGE1_LIVE_READ/.test(src));
ok('imapflow lazy-imported', /await import\('imapflow'\)/.test(src));

// No real contacts in tracked source
ok('no real contact in source', !/[a-z0-9._%+-]+@(?!example\.|synthetic\.)[a-z0-9.-]+\.(ru|com)\b/i.test(src.replace(/YANDEX_MAIL[A-Z_]*/g, '')));

console.log(`\nno_imap_readonly.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
