// file_vault_intake_test.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Offline tests for the Telegram File Vault intake flow.
// NO real Telegram calls. NO network. All side effects sandboxed into a temp
// workspace via FILE_VAULT_WORKSPACE so the real AI_WORKSPACE is never touched.
//
// Run: node tools/tests/file_vault_intake_test.mjs
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

// 1) Sandbox workspace BEFORE importing the modules (paths are bound at load).
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'fvault_test_'));
process.env.FILE_VAULT_WORKSPACE = SANDBOX;

const V = await import('../telegram_gateway/file_vault_intake.mjs');
const C = await import('../telegram_gateway/file_vault_controller.mjs');

let passed = 0;
const results = [];
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; results.push(`  ✅ ${name}`); })
        .catch((e) => { results.push(`  ❌ ${name}\n     ${e && e.message}`); throw e; });
}

// Deterministic injected downloader: maps fileId -> buffer.
const FILES = new Map();
function registerFile(fileId, bytes) {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    FILES.set(fileId, buf);
    return buf;
}
const deps = {
    downloadBuffer: async (fileId) => FILES.get(fileId) || null,
    sent: [],
    send: async (chatId, text, replyMarkup) => { deps.sent.push({ chatId, text, replyMarkup }); },
    now: new Date('2026-06-08T06:00:00Z'),
};

function docMsg(fileId, fileName, mime, size, messageId) {
    return {
        message_id: messageId, chat: { id: 12345 }, from: { id: 7, username: 'dmitry' },
        document: { file_id: fileId, file_name: fileName, mime_type: mime, file_size: size },
    };
}
function photoMsg(fileId, messageId) {
    return {
        message_id: messageId, chat: { id: 12345 }, from: { id: 7, username: 'dmitry' },
        photo: [{ file_id: fileId + '_s', file_size: 100 }, { file_id: fileId, file_size: 9000 }],
    };
}

let failed = false;
try {
    // ── Test 1: document intake metadata ─────────────────────────────────────
    await test('document intake records full metadata', async () => {
        registerFile('doc1', 'hello legal contract content');
        const r = await C.intakeAttachment({ msg: docMsg('doc1', 'договор_клиент.pdf', 'application/pdf', 28, 101), deps });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.status, 'waiting_approval');
        const m = r.meta;
        assert.ok(m.timestamp, 'has timestamp');
        assert.strictEqual(m.chat_id, '12345');
        assert.strictEqual(m.message_id, '101');
        assert.strictEqual(m.sender, 'dmitry');
        assert.strictEqual(m.original_filename, 'договор_клиент.pdf');
        assert.strictEqual(m.mime_type, 'application/pdf');
        assert.ok(m.sha256 && m.sha256.length === 64, 'sha256 present');
        assert.strictEqual(m.category, 'legal_docs'); // keyword "договор"
        assert.strictEqual(m.status, 'waiting_approval');
        assert.ok(fs.existsSync(r.record.incoming_path), 'stored into _incoming');
        // Inline buttons were sent.
        const last = deps.sent[deps.sent.length - 1];
        assert.ok(last.replyMarkup && last.replyMarkup.inline_keyboard, 'intake keyboard sent');
    });

    // ── Test 2: image intake metadata + high-confidence media routing ────────
    await test('image intake classifies as media_photo (high confidence)', async () => {
        registerFile('img1', Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]));
        const r = await C.intakeAttachment({ msg: photoMsg('img1', 202), deps });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.meta.category, 'media_photo');
        assert.strictEqual(r.meta.confidence, 'high');
        assert.strictEqual(r.meta.telegram_type, 'photo');
    });

    // ── Test 3: filename sanitization ────────────────────────────────────────
    await test('filename sanitization strips unsafe + traversal chars', async () => {
        const dirty = '../../e\\vil:na*me?<>|.pdf';
        const clean = V.sanitizeFilename(dirty);
        assert.ok(!clean.includes('..'), 'no parent traversal');
        assert.ok(!/[\\/<>:"|?*]/.test(clean), 'no illegal chars');
        const safe = V.buildSafeName({ category: 'legal_docs', originalName: dirty, now: deps.now });
        assert.ok(/^\d{4}-\d{2}-\d{2}_\d{6}__legal_docs__/.test(safe), 'safe name format');
    });

    // ── Test 4: no overwrite (non-clobber __v2) ──────────────────────────────
    await test('resolveNonClobberPath never overwrites (adds __v2)', async () => {
        const dir = path.join(SANDBOX, 'clobber_test');
        fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, 'a.txt');
        fs.writeFileSync(f, 'one');
        const p2 = V.resolveNonClobberPath(dir, 'a.txt');
        assert.strictEqual(path.basename(p2), 'a__v2.txt');
        fs.writeFileSync(p2, 'two');
        const p3 = V.resolveNonClobberPath(dir, 'a.txt');
        assert.strictEqual(path.basename(p3), 'a__v3.txt');
        // Original untouched.
        assert.strictEqual(fs.readFileSync(f, 'utf-8'), 'one');
    });

    // ── Test 5: approval callback (put) moves _incoming -> processed/category ─
    await test('approval ✅ put moves file into category folder', async () => {
        registerFile('doc2', 'invoice payment 2026 tax');
        const r = await C.intakeAttachment({ msg: docMsg('doc2', 'invoice_2026.pdf', 'application/pdf', 24, 303), deps });
        const id = r.pendingId;
        const incoming = r.record.incoming_path;
        assert.ok(fs.existsSync(incoming));
        const res = await C.handleCallback({ data: `fvault:put:${id}`, chatId: 12345, deps });
        assert.strictEqual(res.status, 'stored');
        assert.ok(fs.existsSync(res.stored_path), 'file present at stored path');
        assert.ok(res.stored_path.includes(path.join('_processed', 'finance_docs')), 'routed to finance_docs');
        assert.ok(!fs.existsSync(incoming), 'moved out of _incoming (not copied, not deleted-original-data)');
    });

    // ── Test 6: reject -> quarantine (never deleted) ─────────────────────────
    await test('reject ❌ moves file to _quarantine, never deletes', async () => {
        registerFile('doc3', 'random unknown blob data');
        const r = await C.intakeAttachment({ msg: docMsg('doc3', 'mystery.bin', 'application/octet-stream', 24, 404), deps });
        const id = r.pendingId;
        const res = await C.handleCallback({ data: `fvault:reject:${id}`, chatId: 12345, deps });
        assert.strictEqual(res.status, 'rejected');
        const rec = V.getPending(id);
        assert.ok(rec.quarantine_path && fs.existsSync(rec.quarantine_path), 'file exists in quarantine');
        assert.ok(rec.quarantine_path.includes('_quarantine'));
    });

    // ── Test 7: duplicate sha256 detection ───────────────────────────────────
    await test('duplicate sha256 is detected and offers dup keyboard', async () => {
        const bytes = 'identical-duplicate-bytes-xyz';
        registerFile('dupA', bytes);
        const r1 = await C.intakeAttachment({ msg: docMsg('dupA', 'first.pdf', 'application/pdf', bytes.length, 505), deps });
        // Commit first so it is in the sha index.
        await C.handleCallback({ data: `fvault:put:${r1.pendingId}`, chatId: 12345, deps });
        // Send same bytes again.
        registerFile('dupB', bytes);
        const r2 = await C.intakeAttachment({ msg: docMsg('dupB', 'second.pdf', 'application/pdf', bytes.length, 606), deps });
        assert.strictEqual(r2.status, 'duplicate');
        assert.strictEqual(r2.duplicate, true);
        const last = deps.sent[deps.sent.length - 1];
        const cbs = last.replyMarkup.inline_keyboard.flat().map((b) => b.callback_data).join(',');
        assert.ok(cbs.includes('fvault:dup_copy:'), 'has save-copy button');
        assert.ok(cbs.includes('fvault:dup_log:'), 'has log-only button');
    });

    // ── Test 8: duplicate "log only" keeps copy out of processed, no delete ──
    await test('duplicate dup_log records log + quarantines extra copy', async () => {
        const bytes = 'identical-duplicate-bytes-xyz';
        registerFile('dupC', bytes);
        const r = await C.intakeAttachment({ msg: docMsg('dupC', 'third.pdf', 'application/pdf', bytes.length, 707), deps });
        assert.strictEqual(r.status, 'duplicate');
        const res = await C.handleCallback({ data: `fvault:dup_log:${r.pendingId}`, chatId: 12345, deps });
        assert.strictEqual(res.status, 'duplicate_log_only');
        const rec = V.getPending(r.pendingId);
        assert.ok(fs.existsSync(rec.quarantine_path), 'extra copy preserved in quarantine');
    });

    // ── Test 9: folder-choice callback routes manually ───────────────────────
    await test('folder choice ✏️ routes file to chosen category', async () => {
        registerFile('doc4', 'generic notes content here');
        const r = await C.intakeAttachment({ msg: docMsg('doc4', 'notes.txt', 'text/plain', 26, 808), deps });
        // low confidence business_docs expected
        assert.strictEqual(r.meta.confidence, 'low');
        const res = await C.handleCallback({ data: `fvault:fld:medical:${r.pendingId}`, chatId: 12345, deps });
        assert.strictEqual(res.status, 'stored');
        assert.ok(res.stored_path.includes(path.join('_processed', 'medical_docs')), 'routed to medical_docs');
    });

    // ── Test 10: /vault_status response shape ────────────────────────────────
    await test('/vault_status text reports counters + autosend BLOCKED', async () => {
        const txt = C.vaultStatusText(deps.now);
        assert.ok(txt.includes('File Vault Status'));
        assert.ok(txt.includes('Incoming'));
        assert.ok(txt.includes('Quarantine'));
        assert.ok(txt.includes('Autosend: BLOCKED'));
    });

    // ── Test 11: /vault_help mentions how to send + commands ─────────────────
    await test('/vault_help explains how to send files', async () => {
        const txt = C.vaultHelpText();
        assert.ok(txt.includes('/vault_status'));
        assert.ok(txt.includes('/vault_recent'));
        assert.ok(txt.includes('Отклонить'));
    });

    // ── Test 12: unknown callback is ignored safely ──────────────────────────
    await test('non-fvault callback is ignored (no throw)', async () => {
        const res = await C.handleCallback({ data: 'audit:send:1', chatId: 12345, deps });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.status, 'not_fvault');
    });

    // ── Test 13: logs were written to month file + dashboard ─────────────────
    await test('intake log written to monthly log + dashboard', async () => {
        const logDir = path.join(SANDBOX, '09_dashboards', 'file_vault_logs');
        const files = fs.readdirSync(logDir).filter((f) => f.startsWith('file_vault_intake_log_'));
        assert.ok(files.length >= 1, 'monthly log exists');
        const dash = path.join(SANDBOX, '09_dashboards', 'file_vault_dashboard.md');
        assert.ok(fs.existsSync(dash), 'dashboard created');
        assert.ok(fs.readFileSync(dash, 'utf-8').includes('FILE_VAULT_TELEGRAM_INTAKE_LOG'), 'dashboard marker present');
    });

} catch (e) {
    failed = true;
}

console.log('\nFile Vault intake tests:');
console.log(results.join('\n'));
console.log(`\n${passed} passed${failed ? ' — SOME TESTS FAILED' : ''}`);

// Cleanup sandbox (temp dir only; never touches real workspace).
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* best effort */ }

process.exit(failed ? 1 : 0);
