// file_vault_controller.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Orchestrates the Telegram File Vault intake flow on top of file_vault_intake.
//
// All side-effecting dependencies (download, telegram send/edit) are injected so
// the whole flow can be exercised offline in tests with zero network.
//
// SAFETY: never deletes, never overwrites, never sends externally, autosend
// remains irrelevant here (this path does no outbound client/email sends).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import * as V from './file_vault_intake.mjs';

// Extract the Telegram file descriptor + a normalized "telegramType" from a msg.
// Returns null when the message carries no supported attachment.
export function extractAttachment(msg) {
    if (!msg || typeof msg !== 'object') return null;

    if (msg.document) {
        const d = msg.document;
        return {
            telegramType: 'document',
            fileId: d.file_id,
            originalName: d.file_name || `document_${Date.now()}`,
            mime: d.mime_type || '',
            size: d.file_size != null ? d.file_size : null,
        };
    }
    if (msg.photo && Array.isArray(msg.photo) && msg.photo.length) {
        // Highest resolution is the last element.
        const ph = msg.photo[msg.photo.length - 1];
        return {
            telegramType: 'photo',
            fileId: ph.file_id,
            originalName: `photo_${Date.now()}.jpg`,
            mime: 'image/jpeg',
            size: ph.file_size != null ? ph.file_size : null,
        };
    }
    if (msg.video) {
        const v = msg.video;
        return {
            telegramType: 'video',
            fileId: v.file_id,
            originalName: v.file_name || `video_${Date.now()}.mp4`,
            mime: v.mime_type || 'video/mp4',
            size: v.file_size != null ? v.file_size : null,
        };
    }
    if (msg.audio) {
        const a = msg.audio;
        return {
            telegramType: 'audio',
            fileId: a.file_id,
            originalName: a.file_name || `audio_${Date.now()}.mp3`,
            mime: a.mime_type || 'audio/mpeg',
            size: a.file_size != null ? a.file_size : null,
        };
    }
    if (msg.voice) {
        const vo = msg.voice;
        return {
            telegramType: 'voice',
            fileId: vo.file_id,
            originalName: `voice_${Date.now()}.ogg`,
            mime: vo.mime_type || 'audio/ogg',
            size: vo.file_size != null ? vo.file_size : null,
        };
    }
    return null;
}

// Build a short pending id from chat + message id (stable, < 64 byte callbacks).
export function buildPendingId(chatId, messageId) {
    const c = String(chatId || '0').slice(-6);
    const m = String(messageId || Date.now()).slice(-8);
    return `${c}_${m}`;
}

// Core intake: takes an already-downloaded buffer (deps.downloadBuffer) and
// performs save-to-incoming + metadata + classification + dedupe detection.
//
// deps:
//   downloadBuffer(fileId) -> Promise<Buffer>   (injected; real impl hits TG)
//   send(chatId, text, replyMarkup) -> Promise   (injected)
//   now: optional Date
//
// Returns { ok, status, pendingId, meta, duplicate }.
export async function intakeAttachment({ msg, deps }) {
    V.ensureFolders();
    const att = extractAttachment(msg);
    if (!att) return { ok: false, status: 'no_attachment' };

    const now = (deps && deps.now) || new Date();
    const chatId = msg.chat && msg.chat.id;
    const messageId = msg.message_id;
    const sender = msg.from
        ? (msg.from.username || `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || String(msg.from.id))
        : null;

    // 1) Download bytes (injected; never touches network in tests).
    const buf = await deps.downloadBuffer(att.fileId);
    if (!buf || !Buffer.isBuffer(buf)) return { ok: false, status: 'download_failed' };

    // 2) sha256.
    const sha = V.sha256Buffer(buf);

    // 3) classify.
    const cls = V.classify({ filename: att.originalName, mime: att.mime, telegramType: att.telegramType });

    // 4) safe name + proposed target.
    const safeName = V.buildSafeName({ category: cls.category, originalName: att.originalName, now });
    const proposedDir = V.proposedTargetDir(cls.category);
    const proposedPath = path.join(proposedDir, safeName);

    const pendingId = buildPendingId(chatId, messageId);

    // 5) duplicate detection BEFORE writing a second copy.
    const existing = V.lookupBySha(sha);

    // 6) Always store the original into _incoming (non-clobber).
    const incomingPath = V.resolveNonClobberPath(V.PATHS.INCOMING, safeName);
    fs.writeFileSync(incomingPath, buf);

    const meta = V.buildMetadata({
        now, chatId, messageId, sender,
        originalName: att.originalName, mime: att.mime, size: att.size != null ? att.size : buf.length,
        sha256: sha, category: cls.category, confidence: cls.confidence,
        proposedPath, status: 'waiting_approval', telegramType: att.telegramType,
    });

    const record = {
        pendingId, meta,
        incoming_path: incomingPath,
        proposed_dir: proposedDir,
        safe_name: safeName,
        category: cls.category,
        confidence: cls.confidence,
        sha256: sha,
        duplicate: Boolean(existing),
        existing_path: existing ? existing.stored_path : null,
    };
    V.savePending(pendingId, record);

    V.appendLog({
        now, fileName: safeName, category: cls.category, targetPath: incomingPath,
        status: 'received', sha256: sha, action: 'intake_to_incoming',
    });

    // 7) Reply: duplicate path vs normal path.
    if (existing) {
        if (deps && deps.send) {
            await deps.send(chatId, V.buildDuplicatePreviewText(meta, existing), V.buildDuplicateKeyboard(pendingId));
        }
        return { ok: true, status: 'duplicate', pendingId, meta, duplicate: true, record };
    }

    if (deps && deps.send) {
        await deps.send(chatId, V.buildPreviewText(meta), V.buildIntakeKeyboard(pendingId));
    }
    return { ok: true, status: 'waiting_approval', pendingId, meta, duplicate: false, record };
}

// Handle an fvault:* callback. Returns { ok, action, text, status }.
// deps.send(chatId, text, replyMarkup?) injected.
export async function handleCallback({ data, chatId, deps }) {
    if (typeof data !== 'string' || !data.startsWith('fvault:')) {
        return { ok: false, action: 'ignored', status: 'not_fvault' };
    }
    const parts = data.split(':'); // fvault:<action>:<...>
    const action = parts[1];
    const now = (deps && deps.now) || new Date();

    // Folder-pick: fvault:fld:<key>:<id>
    if (action === 'fld') {
        const key = parts[2];
        const id = parts.slice(3).join(':');
        const rec = V.getPending(id);
        if (!rec) return await replyMissing(deps, chatId, id);
        const choice = V.FOLDER_CHOICES.find((c) => c.key === key);
        const category = choice ? choice.category : 'unknown';
        const safeName = V.buildSafeName({ category, originalName: rec.meta.original_filename, now });
        const destDir = V.proposedTargetDir(category);
        return await commitPut({ deps, chatId, id, rec, category, destDir, safeName, now, via: 'folder_choice' });
    }

    const id = parts.slice(2).join(':');
    const rec = V.getPending(id);

    if (action === 'put') {
        if (!rec) return await replyMissing(deps, chatId, id);
        return await commitPut({
            deps, chatId, id, rec, category: rec.category,
            destDir: rec.proposed_dir, safeName: rec.safe_name, now, via: 'approved_here',
        });
    }

    if (action === 'choose') {
        if (!rec) return await replyMissing(deps, chatId, id);
        if (deps && deps.send) await deps.send(chatId, 'Выберите папку:', V.buildFolderKeyboard(id));
        return { ok: true, action: 'choose', status: 'awaiting_folder' };
    }

    if (action === 'inbox') {
        if (!rec) return await replyMissing(deps, chatId, id);
        rec.meta.status = 'in_inbox';
        V.savePending(id, rec);
        V.appendLog({
            now, fileName: rec.safe_name, category: rec.category, targetPath: rec.incoming_path,
            status: 'in_inbox', sha256: rec.sha256, action: 'kept_in_inbox',
        });
        const txt = '🟨 Оставлено в Inbox (_incoming). Файл не удалён, наружу не отправлен.';
        if (deps && deps.send) await deps.send(chatId, txt);
        return { ok: true, action: 'inbox', status: 'in_inbox', text: txt };
    }

    if (action === 'reject') {
        if (!rec) return await replyMissing(deps, chatId, id);
        // Move (not delete) to _quarantine, non-clobber.
        let qpath = rec.incoming_path;
        try {
            if (fs.existsSync(rec.incoming_path)) {
                qpath = V.moveInto(rec.incoming_path, V.PATHS.QUARANTINE, path.basename(rec.incoming_path));
            }
        } catch { /* keep original on any error; never delete */ }
        rec.meta.status = 'rejected';
        rec.quarantine_path = qpath;
        V.savePending(id, rec);
        V.appendLog({
            now, fileName: rec.safe_name, category: rec.category, targetPath: qpath,
            status: 'rejected', sha256: rec.sha256, action: 'moved_to_quarantine',
        });
        const txt = '❌ Отклонено. Файл перемещён в _quarantine (НЕ удалён).';
        if (deps && deps.send) await deps.send(chatId, txt);
        return { ok: true, action: 'reject', status: 'rejected', text: txt };
    }

    // Duplicate handling.
    if (action === 'dup_copy') {
        if (!rec) return await replyMissing(deps, chatId, id);
        return await commitPut({
            deps, chatId, id, rec, category: rec.category,
            destDir: rec.proposed_dir, safeName: rec.safe_name, now, via: 'duplicate_saved_copy', duplicate: true,
        });
    }
    if (action === 'dup_log') {
        if (!rec) return await replyMissing(deps, chatId, id);
        // Keep only a log record; move the just-saved incoming copy to quarantine
        // so we do not accumulate duplicate bytes, but never delete.
        let qpath = rec.incoming_path;
        try {
            if (fs.existsSync(rec.incoming_path)) {
                qpath = V.moveInto(rec.incoming_path, V.PATHS.QUARANTINE, path.basename(rec.incoming_path));
            }
        } catch { /* never delete */ }
        rec.meta.status = 'duplicate_log_only';
        rec.quarantine_path = qpath;
        V.savePending(id, rec);
        // bump duplicate_count on the original sha record.
        const existing = V.lookupBySha(rec.sha256) || {};
        existing.duplicate_count = (Number(existing.duplicate_count) || 0) + 1;
        V.recordSha(rec.sha256, existing);
        // recordSha won't clobber, so update explicitly:
        forceUpdateSha(rec.sha256, existing);
        V.appendLog({
            now, fileName: rec.safe_name, category: rec.category, targetPath: qpath,
            status: 'duplicate_log_only', sha256: rec.sha256, action: 'duplicate_logged',
        });
        const txt = '🟨 Записано в лог как дубликат. Лишняя копия в _quarantine, ничего не удалено.';
        if (deps && deps.send) await deps.send(chatId, txt);
        return { ok: true, action: 'dup_log', status: 'duplicate_log_only', text: txt };
    }

    return { ok: false, action, status: 'unknown_action' };
}

// Commit a file from _incoming into its target category folder.
async function commitPut({ deps, chatId, id, rec, category, destDir, safeName, now, via, duplicate = false }) {
    let finalPath = rec.incoming_path;
    try {
        if (fs.existsSync(rec.incoming_path)) {
            finalPath = V.moveInto(rec.incoming_path, destDir, safeName);
        }
    } catch (e) {
        // On any failure keep the original in _incoming; never delete.
        finalPath = rec.incoming_path;
    }
    rec.meta.status = 'stored';
    rec.meta.category = category;
    rec.stored_path = finalPath;
    V.savePending(id, rec);

    // Index by sha (first-writer wins; do not clobber an earlier original).
    const shaInfo = V.lookupBySha(rec.sha256);
    if (!shaInfo) {
        V.recordSha(rec.sha256, {
            sha256: rec.sha256, stored_path: finalPath, category,
            original_filename: rec.meta.original_filename, processed_at: rec.meta.timestamp,
            source: 'telegram', duplicate_count: 0,
        });
    } else if (duplicate) {
        shaInfo.duplicate_count = (Number(shaInfo.duplicate_count) || 0) + 1;
        forceUpdateSha(rec.sha256, shaInfo);
    }

    V.appendLog({
        now, fileName: safeName, category, targetPath: finalPath,
        status: 'stored', sha256: rec.sha256, action: duplicate ? 'stored_duplicate_copy' : `stored_${via}`,
    });

    const rel = path.relative(V.WORKSPACE, finalPath).replace(/\\/g, '/');
    const txt = `✅ Сохранено: ${rel}\nКатегория: ${category}\nStatus: stored. Ничего не удалено, наружу не отправлено.`;
    if (deps && deps.send) await deps.send(chatId, txt);
    return { ok: true, action: via, status: 'stored', text: txt, stored_path: finalPath };
}

async function replyMissing(deps, chatId, id) {
    const txt = `⚠️ Запись не найдена (id ${id}). Возможно, файл уже обработан.`;
    if (deps && deps.send) await deps.send(chatId, txt);
    return { ok: false, action: 'missing', status: 'pending_not_found', text: txt };
}

// recordSha uses first-writer-wins; this explicitly updates an existing entry.
function forceUpdateSha(sha, info) {
    const idxFile = V.SHA_INDEX_FILE;
    let idx = {};
    try {
        if (fs.existsSync(idxFile)) idx = JSON.parse(fs.readFileSync(idxFile, 'utf-8') || '{}');
    } catch { idx = {}; }
    idx[sha] = info;
    fs.mkdirSync(path.dirname(idxFile), { recursive: true });
    fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2), 'utf-8');
}

// ── Command text builders (for /vault_* commands) ────────────────────────────
export function vaultStatusText(now = new Date()) {
    const s = V.vaultStatus(now);
    const lines = [
        '📊 File Vault Status',
        '',
        `Incoming (ждут): ${s.incoming}`,
        `Processed today: ${s.processed_today}`,
        `Quarantine: ${s.quarantine}`,
        `Duplicates detected: ${s.duplicates}`,
        `Waiting approval: ${s.waiting_approval}`,
        '',
        'Last 5:',
        ...(s.last5.length ? s.last5.map((n, i) => `${i + 1}. ${n}`) : ['—']),
        '',
        'Autosend: BLOCKED.',
    ];
    return lines.join('\n');
}

export function vaultRecentText(limit = 10) {
    const recent = V.vaultRecent(limit);
    if (!recent.length) return '📂 File Vault: пока нет принятых файлов.';
    const lines = ['📂 Последние принятые файлы:', ''];
    recent.forEach((r, i) => {
        const rel = r.stored_path ? path.relative(V.WORKSPACE, r.stored_path).replace(/\\/g, '/') : '—';
        lines.push(`${i + 1}. ${r.original_filename || '—'} → ${r.category || '—'}`);
        lines.push(`   ${rel}`);
    });
    return lines.join('\n');
}

export function vaultInboxText() {
    const inbox = V.vaultInbox();
    if (!inbox.length) return '📥 Inbox пуст. Нет файлов, ждущих подтверждения.';
    const lines = ['📥 Файлы, ждущие подтверждения:', ''];
    inbox.forEach((r, i) => {
        lines.push(`${i + 1}. ${r.meta.original_filename || '—'} (${r.category}) — id ${r.pendingId}`);
    });
    return lines.join('\n');
}

export function vaultHelpText() {
    return V.vaultHelpText();
}
