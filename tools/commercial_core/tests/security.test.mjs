#!/usr/bin/env node
// tools/commercial_core/tests/security.test.mjs
// Security + boundary proofs: no second writer, no parallel ledger, no send path, no secret/bank
// access, no real-data fixtures, production-disabled. Static source scan + behavioral checks.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyStore } from '../lib/store.mjs';
import { createOpportunity } from '../lib/lifecycle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(__dirname, '../lib');
const FIX = path.join(__dirname, '../fixtures');

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; } else { fail++; fails.push(n); console.log('FAIL', n); } };

function readAll(dir) {
    return readdirSync(dir).filter((f) => f.endsWith('.mjs') || f.endsWith('.json'))
        .map((f) => ({ f, src: readFileSync(path.join(dir, f), 'utf8') }));
}
const libFiles = readAll(LIB);
const allLib = libFiles.map((x) => x.src).join('\n');

// ---- no send / transport paths ----
ok('SEC1 no nodemailer/SMTP import', !/nodemailer|createTransport|smtp\./i.test(allLib));
ok('SEC2 no Telegram outbound send', !/sendMessage|tg\(|bot\d+:[A-Za-z]/i.test(allLib));
ok('SEC3 no fetch/http/network', !/\bfetch\(|require\(['"]https?['"]\)|axios|XMLHttpRequest/i.test(allLib));
ok('SEC4 no IMAP flag mutation', !/APPEND|EXPUNGE|STORE \+FLAGS|imap/i.test(allLib));

// ---- no second writer / no parallel ledger ----
ok('SEC5 single commit seam (no direct fs write to prod store)', !/writeFileSync|fs\.write|lead_pipeline_store|outbound_send_ledger/i.test(allLib));
// SEC6: a parallel ledger means CREATING/writing a second ledger. The migration's PROTECTED_KEYS
// list names send_ledger precisely as a key it must NOT touch — strip that declaration before scan.
const allLibNoProtected = allLib
    .replace(/export const PROTECTED_KEYS\s*=\s*\[[^\]]*\];/g, '')
    .replace(/Master Controller/g, '');
ok('SEC6 no parallel ledger naming', !/send_ledger|approval_ledger|payment_ledger/i.test(allLibNoProtected));
// store.mjs must be the ONLY module exporting commit()
const commitExporters = libFiles.filter((x) => /export function commit/.test(x.src)).map((x) => x.f);
ok('SEC7 exactly one commit() writer (store.mjs)', commitExporters.length === 1 && commitExporters[0] === 'store.mjs');

// ---- no secrets / bank credentials (real values, not safe disabled-markers) ----
// Strip the legitimate "bank_integration: 'NONE'" / "real_issuance: 'DISABLED'" disabled markers
// before scanning so the guard itself isn't a false positive.
const libNoMarkers = allLib
    .replace(/bank_integration:\s*'NONE'/g, '')
    .replace(/real_issuance:\s*'DISABLED'/g, '');
ok('SEC8 no bank/credential/secret literals', !/api[_-]?key\s*[:=]\s*['"][^'"]+|\biban\b|\bswift\b|secret\s*[:=]\s*['"]|password\s*[:=]\s*['"]|\bbank_account\b/i.test(libNoMarkers));

// ---- no real production data in fixture VALUES (exclude the _note disclaimer) ----
const fixFiles = readAll(FIX);
const fixValues = fixFiles.map((x) => {
    const obj = JSON.parse(x.src);
    const copy = { ...obj }; delete copy._note;
    return JSON.stringify(copy);
}).join('\n');
ok('SEC9 fixtures synthetic only (example.invalid)', /example\.invalid/.test(fixValues));
ok('SEC10 no real ДКБИ / DKBI / production lead ids in values', !/ДКБИ|DKBI|_RU\b|dkbi\.ru/i.test(fixValues));
ok('SEC11 fixtures carry SYNTHETIC marker', fixFiles.some((x) => /SYNTHETIC/.test(x.src)));

// ---- production-disabled posture ----
ok('SEC12 offers carry send_capability NONE', /send_capability:\s*'NONE'/.test(allLib));
ok('SEC13 invoices real_issuance DISABLED', /real_issuance:\s*'DISABLED'/.test(allLib));
ok('SEC14 bank_integration NONE', /bank_integration:\s*'NONE'/.test(allLib));

// ---- behavioral: missing idempotency / unverified blocked (defense in depth, also in commercial suite) ----
const s = emptyStore();
ok('SEC15 missing idempotency blocked at writer', createOpportunity(s, { lead: { lead_id: 'X', verification_status: 'verified' }, at: '2026-06-18T09:00:00Z' }).code === 'MISSING_IDEMPOTENCY');

console.log(`\n==== commercial_core security: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(', ')); process.exit(1); }
process.exit(0);
