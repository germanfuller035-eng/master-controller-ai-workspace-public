// file_vault_intake.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Telegram File Vault intake module for AI_WORKSPACE Master Controller bot.
//
// SAFETY CONTRACT (do not weaken):
//   - NEVER deletes files (reject => move to _quarantine, original kept).
//   - NEVER overwrites: duplicate filenames get __v2, __v3 suffixes.
//   - NEVER sends/forwards anything externally. Local disk only.
//   - NEVER touches .env / AI_SECRETS / tokens.
//   - Black/Red sensitive docs stay local, index-only, no AI upload.
//
// This module is import-pure for tests: all Telegram/network/dependencies are
// injected. Nothing here starts polling or calls the network on import.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace root = two levels up from tools/telegram_gateway.
// FILE_VAULT_WORKSPACE env override exists ONLY for isolated offline tests;
// in production it is unset and the real AI_WORKSPACE root is used.
export const WORKSPACE = process.env.FILE_VAULT_WORKSPACE
    ? path.resolve(process.env.FILE_VAULT_WORKSPACE)
    : path.resolve(__dirname, '..', '..');


// ── Canonical paths ──────────────────────────────────────────────────────────
export const PATHS = {
    INCOMING:   path.join(WORKSPACE, '00_INBOX', 'file_vault', '_incoming'),
    QUARANTINE: path.join(WORKSPACE, '00_INBOX', 'file_vault', '_quarantine'),
    PROCESSED:  path.join(WORKSPACE, '00_INBOX', 'file_vault', '_processed'),
    INDEX_DIR:  path.join(WORKSPACE, '00_INBOX', 'file_vault', '_index'),
    LOGS_DIR:   path.join(WORKSPACE, '09_dashboards', 'file_vault_logs'),
    DASHBOARD:  path.join(WORKSPACE, '09_dashboards', 'file_vault_dashboard.md'),
};
export const SHA_INDEX_FILE = path.join(PATHS.INDEX_DIR, 'sha256_index.json');
export const PENDING_FILE   = path.join(PATHS.INDEX_DIR, 'pending.json');

// ── Classification categories ────────────────────────────────────────────────
export const CATEGORIES = [
    'legal_docs', 'military_docs', 'medical_docs', 'finance_docs',
    'business_docs', 'client_docs', 'ai_workspace_docs', 'personal_docs',
    'media_photo', 'media_video', 'audio_voice', 'unknown',
];

// Folder-pick labels (✏️ Выбрать папку) -> category
export const FOLDER_CHOICES = [
    { key: 'legal',    label: 'Legal',        category: 'legal_docs' },
    { key: 'military', label: 'Military',     category: 'military_docs' },
    { key: 'medical',  label: 'Medical',      category: 'medical_docs' },
    { key: 'finance',  label: 'Finance',      category: 'finance_docs' },
    { key: 'business', label: 'Business',     category: 'business_docs' },
    { key: 'clients',  label: 'Clients',      category: 'client_docs' },
    { key: 'aiws',     label: 'AI_WORKSPACE', category: 'ai_workspace_docs' },
    { key: 'media',    label: 'Media',        category: 'media_photo' },
    { key: 'personal', label: 'Personal',     category: 'personal_docs' },
    { key: 'inbox',    label: 'Unknown/Inbox', category: 'unknown' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function ensureFolders() {
    for (const p of [PATHS.INCOMING, PATHS.QUARANTINE, PATHS.PROCESSED, PATHS.INDEX_DIR, PATHS.LOGS_DIR]) {
        fs.mkdirSync(p, { recursive: true });
    }
}

export function sanitizeFilename(name) {
    let base = String(name || 'file').trim();
    // Strip any directory components (defeat path traversal).
    base = base.replace(/[\\/]+/g, '_');
    // Remove control chars and characters illegal on Windows.
    base = base.replace(/[<>:"|?*\u0000-\u001F]/g, '_');
    // Collapse whitespace runs to single underscore.
    base = base.replace(/\s+/g, '_');
    // Collapse repeated dots/underscores.
    base = base.replace(/_{2,}/g, '_').replace(/\.{2,}/g, '.');
    base = base.replace(/^[._]+/, '').replace(/[._]+$/, (m) => (m.includes('.') ? '' : ''));
    if (!base) base = 'file';
    // Hard length cap (keep extension).
    if (base.length > 120) {
        const ext = path.extname(base);
        base = base.slice(0, 120 - ext.length) + ext;
    }
    return base;
}

export function sha256Buffer(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sha256File(filePath) {
    const buf = fs.readFileSync(filePath);
    return sha256Buffer(buf);
}

export function shortSha(sha) {
    return String(sha || '').slice(0, 12);
}

function timestampParts(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return { date, time, iso: d.toISOString() };
}

// Safe filename format: YYYY-MM-DD_HHMMSS__category__original-name.ext
export function buildSafeName({ category, originalName, now = new Date() }) {
    const { date, time } = timestampParts(now);
    const safeOriginal = sanitizeFilename(originalName);
    const cat = CATEGORIES.includes(category) ? category : 'unknown';
    return `${date}_${time}__${cat}__${safeOriginal}`;
}

// Never overwrite: if target exists, append __v2, __v3, ...
export function resolveNonClobberPath(dir, fileName, existsFn = fs.existsSync) {
    const ext = path.extname(fileName);
    const stem = fileName.slice(0, fileName.length - ext.length);
    let candidate = path.join(dir, fileName);
    let v = 2;
    while (existsFn(candidate)) {
        candidate = path.join(dir, `${stem}__v${v}${ext}`);
        v++;
    }
    return candidate;
}

// ── Classification ───────────────────────────────────────────────────────────
// Returns { category, confidence: 'high'|'low', proposedSubfolder }
export function classify({ filename = '', mime = '', telegramType = '' } = {}) {
    const lowerName = String(filename).toLowerCase();
    const lowerMime = String(mime).toLowerCase();
    const ext = path.extname(lowerName);

    // 1) Telegram media type / mime gives high-confidence media routing.
    if (telegramType === 'photo' || lowerMime.startsWith('image/')) {
        return { category: 'media_photo', confidence: 'high', proposedSubfolder: 'media_photo' };
    }
    if (telegramType === 'video' || lowerMime.startsWith('video/')) {
        return { category: 'media_video', confidence: 'high', proposedSubfolder: 'media_video' };
    }
    if (telegramType === 'voice' || telegramType === 'audio' || lowerMime.startsWith('audio/')) {
        return { category: 'audio_voice', confidence: 'high', proposedSubfolder: 'audio_voice' };
    }

    // 2) Keyword routing for documents (filename only, no content read).
    const kw = [
        { category: 'legal_docs',    re: /(legal|договор|контракт|суд|иск|notar|нотари|устав|доверенн)/ },
        { category: 'military_docs', re: /(military|воен|army|призыв|мобилиз|повестк|военкомат)/ },
        { category: 'medical_docs',  re: /(medical|медиц|health|здоров|анализ|диагноз|рецепт|справк)/ },
        { category: 'finance_docs',  re: /(invoice|счет|счёт|bank|банк|finance|финанс|налог|tax|оплат|payment|чек|receipt)/ },
        { category: 'client_docs',   re: /(client|клиент|заказчик|brief|бриф|тз|deliver)/ },
        { category: 'ai_workspace_docs', re: /(workspace|cline|prompt|sop|protocol|dashboard|agent)/ },
        { category: 'personal_docs', re: /(passport|паспорт|personal|личн|резюме|cv|семь|family)/ },
    ];
    for (const k of kw) {
        if (k.re.test(lowerName)) {
            return { category: k.category, confidence: 'high', proposedSubfolder: k.category };
        }
    }

    // 3) Generic documents -> business_docs but LOW confidence (ask to confirm).
    if (/(\.pdf|\.docx?|\.txt|\.rtf|\.odt|\.xlsx?|\.csv|\.pptx?)$/.test(ext)
        || lowerMime.includes('pdf') || lowerMime.includes('word')
        || lowerMime.includes('document') || lowerMime.includes('text')) {
        return { category: 'business_docs', confidence: 'low', proposedSubfolder: 'business_docs' };
    }

    // 4) Unknown.
    return { category: 'unknown', confidence: 'low', proposedSubfolder: 'unknown' };
}

// Proposed target path for an approved file of a given category.
export function proposedTargetDir(category) {
    const cat = CATEGORIES.includes(category) ? category : 'unknown';
    return path.join(PATHS.PROCESSED, cat);
}

// ── JSON index helpers ───────────────────────────────────────────────────────
function readJSONSafe(p, fallback) {
    try {
        if (!fs.existsSync(p)) return fallback;
        const raw = fs.readFileSync(p, 'utf-8');
        if (!raw.trim()) return fallback;
        return JSON.parse(raw);
    } catch { return fallback; }
}
function writeJSONSafe(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

export function lookupBySha(sha, indexFile = SHA_INDEX_FILE) {
    const idx = readJSONSafe(indexFile, {});
    return idx[sha] || null;
}

export function recordSha(sha, info, indexFile = SHA_INDEX_FILE) {
    const idx = readJSONSafe(indexFile, {});
    if (!idx[sha]) idx[sha] = info; // first-writer wins; do not clobber original record
    writeJSONSafe(indexFile, idx);
    return idx[sha];
}

export function readPending(pendingFile = PENDING_FILE) {
    return readJSONSafe(pendingFile, {});
}
export function writePending(map, pendingFile = PENDING_FILE) {
    writeJSONSafe(pendingFile, map);
}
export function savePending(id, record, pendingFile = PENDING_FILE) {
    const map = readPending(pendingFile);
    map[id] = record;
    writePending(map, pendingFile);
    return record;
}
export function getPending(id, pendingFile = PENDING_FILE) {
    return readPending(pendingFile)[id] || null;
}
export function deletePending(id, pendingFile = PENDING_FILE) {
    const map = readPending(pendingFile);
    delete map[id];
    writePending(map, pendingFile);
}

// ── Metadata record ──────────────────────────────────────────────────────────
export function buildMetadata({
    now = new Date(), chatId, messageId, sender, originalName,
    mime, size, sha256, category, confidence, proposedPath, status, telegramType,
}) {
    const { iso } = timestampParts(now);
    return {
        timestamp: iso,
        source: 'telegram',
        chat_id: chatId != null ? String(chatId) : null,
        message_id: messageId != null ? String(messageId) : null,
        sender: sender || null,
        telegram_type: telegramType || null,
        original_filename: originalName || null,
        mime_type: mime || null,
        size: size != null ? Number(size) : null,
        sha256: sha256 || null,
        sha256_short: shortSha(sha256),
        category: category || 'unknown',
        confidence: confidence || 'low',
        proposed_target_path: proposedPath || null,
        status: status || 'waiting_approval',
    };
}

// ── Logging ──────────────────────────────────────────────────────────────────
function monthlyLogPath(now = new Date()) {
    const { date } = timestampParts(now);
    const ym = date.slice(0, 7); // YYYY-MM
    return path.join(PATHS.LOGS_DIR, `file_vault_intake_log_${ym}.md`);
}

export function appendLog({ now = new Date(), fileName, category, targetPath, status, sha256, action }) {
    ensureFolders();
    const { iso } = timestampParts(now);
    const rel = (p) => (p ? path.relative(WORKSPACE, p).replace(/\\/g, '/') : '—');
    const line = `| ${iso} | ${fileName || '—'} | ${category || '—'} | ${rel(targetPath)} | ${status || '—'} | ${shortSha(sha256)} | telegram | ${action || '—'} |`;

    // 1) Monthly log file (create header if new).
    const monthFile = monthlyLogPath(now);
    if (!fs.existsSync(monthFile)) {
        const header = [
            `# File Vault Intake Log — ${iso.slice(0, 7)}`,
            '',
            'Source: Telegram Master Controller bot. No external sends. No deletions.',
            '',
            '| date/time | file name | category | target path | status | sha256 | source | action |',
            '|---|---|---|---|---|---|---|---|',
            '',
        ].join('\n');
        fs.writeFileSync(monthFile, header, 'utf-8');
    }
    fs.appendFileSync(monthFile, line + '\n', 'utf-8');

    // 2) Canonical dashboard append-only intake log section.
    appendDashboard(line, iso);
    return { monthFile, line };
}

function appendDashboard(line, iso) {
    const marker = '<!-- FILE_VAULT_TELEGRAM_INTAKE_LOG -->';
    let content = '';
    try { content = fs.existsSync(PATHS.DASHBOARD) ? fs.readFileSync(PATHS.DASHBOARD, 'utf-8') : ''; } catch { content = ''; }

    if (!content.includes(marker)) {
        const block = [
            '',
            '## 📥 Telegram File Vault Intake Log',
            marker,
            '',
            '_Append-only. Files arrive via Telegram bot, stored locally, no external sends, no deletions._',
            '',
            '| date/time | file name | category | target path | status | sha256 | source | action |',
            '|---|---|---|---|---|---|---|---|',
            line,
            '',
        ].join('\n');
        fs.appendFileSync(PATHS.DASHBOARD, block, 'utf-8');
        return;
    }
    // Insert the new row right after the table header that follows the marker.
    const lines = content.split('\n');
    const markerIdx = lines.findIndex((l) => l.includes(marker));
    // Find the header-separator row (|---...) after the marker, insert after it.
    let insertAt = -1;
    for (let i = markerIdx; i < lines.length; i++) {
        if (/^\|[-\s|]+\|$/.test(lines[i].trim())) { insertAt = i + 1; break; }
    }
    if (insertAt === -1) insertAt = lines.length;
    lines.splice(insertAt, 0, line);
    fs.writeFileSync(PATHS.DASHBOARD, lines.join('\n'), 'utf-8');
}

// ── Telegram inline keyboards ────────────────────────────────────────────────
// callback_data must stay < 64 bytes; id is short (message_id based).
export function buildIntakeKeyboard(id) {
    return {
        inline_keyboard: [
            [
                { text: '✅ Положить сюда', callback_data: `fvault:put:${id}` },
                { text: '✏️ Выбрать папку', callback_data: `fvault:choose:${id}` },
            ],
            [
                { text: '🟨 В Inbox', callback_data: `fvault:inbox:${id}` },
                { text: '❌ Отклонить', callback_data: `fvault:reject:${id}` },
            ],
        ],
    };
}

export function buildFolderKeyboard(id) {
    const rows = [];
    let row = [];
    for (const c of FOLDER_CHOICES) {
        row.push({ text: c.label, callback_data: `fvault:fld:${c.key}:${id}` });
        if (row.length === 2) { rows.push(row); row = []; }
    }
    if (row.length) rows.push(row);
    return { inline_keyboard: rows };
}

export function buildDuplicateKeyboard(id) {
    return {
        inline_keyboard: [
            [{ text: '✅ Всё равно сохранить копию', callback_data: `fvault:dup_copy:${id}` }],
            [{ text: '🟨 Оставить только запись в логе', callback_data: `fvault:dup_log:${id}` }],
            [{ text: '❌ Отклонить', callback_data: `fvault:reject:${id}` }],
        ],
    };
}

// ── Preview text ─────────────────────────────────────────────────────────────
export function buildPreviewText(meta) {
    const sizeKb = meta.size != null ? `${(meta.size / 1024).toFixed(1)} KB` : '—';
    const rel = meta.proposed_target_path
        ? path.relative(WORKSPACE, meta.proposed_target_path).replace(/\\/g, '/')
        : '—';
    return [
        '📥 Файл принят в File Vault',
        '',
        `Имя: ${meta.original_filename || '—'}`,
        `Размер: ${sizeKb}`,
        `Тип: ${meta.category} (${meta.confidence})`,
        `Папка (предложено): ${rel}`,
        `Статус: ⏳ waiting approval`,
        '',
        'Autosend: BLOCKED. Ничего не удаляется, ничего не отправляется наружу.',
    ].join('\n');
}

export function buildDuplicatePreviewText(meta, existing) {
    const existingPath = existing && existing.stored_path
        ? path.relative(WORKSPACE, existing.stored_path).replace(/\\/g, '/')
        : '—';
    return [
        '♻️ Похоже, такой файл уже есть',
        '',
        `Имя: ${meta.original_filename || '—'}`,
        `sha256: ${meta.sha256_short}`,
        `Существующий путь: ${existingPath}`,
        '',
        'Выберите действие:',
    ].join('\n');
}

// ── Move / copy helpers (never overwrite, never delete original wrongly) ──────

// Move a file from src into destDir with non-clobber naming. Returns final path.
export function moveInto(src, destDir, fileName) {
    fs.mkdirSync(destDir, { recursive: true });
    const finalPath = resolveNonClobberPath(destDir, fileName);
    fs.renameSync(src, finalPath);
    return finalPath;
}

export function copyInto(src, destDir, fileName) {
    fs.mkdirSync(destDir, { recursive: true });
    const finalPath = resolveNonClobberPath(destDir, fileName);
    fs.copyFileSync(src, finalPath);
    return finalPath;
}

// ── Status / recent / inbox summaries ────────────────────────────────────────
function countFiles(dir) {
    try {
        if (!fs.existsSync(dir)) return 0;
        let n = 0;
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (e.isDirectory()) walk(path.join(d, e.name));
                else n++;
            }
        };
        walk(dir);
        return n;
    } catch { return 0; }
}

export function vaultStatus(now = new Date()) {
    const pending = readPending();
    const pendingList = Object.values(pending);
    const idx = readJSONSafe(SHA_INDEX_FILE, {});
    const { date } = timestampParts(now);
    let processedToday = 0;
    let duplicates = 0;
    for (const v of Object.values(idx)) {
        if (v && v.duplicate_count) duplicates += Number(v.duplicate_count) || 0;
        if (v && v.processed_at && String(v.processed_at).slice(0, 10) === date) processedToday++;
    }
    const last5 = pendingList
        .slice(-5)
        .map((r) => r.meta && r.meta.original_filename)
        .filter(Boolean);
    return {
        incoming: countFiles(PATHS.INCOMING),
        processed_today: processedToday,
        quarantine: countFiles(PATHS.QUARANTINE),
        duplicates,
        waiting_approval: pendingList.filter((r) => r.meta && r.meta.status === 'waiting_approval').length,
        last5,
    };
}

export function vaultRecent(limit = 10) {
    const idx = readJSONSafe(SHA_INDEX_FILE, {});
    return Object.values(idx)
        .filter((v) => v && v.processed_at)
        .sort((a, b) => String(b.processed_at).localeCompare(String(a.processed_at)))
        .slice(0, limit);
}

export function vaultInbox() {
    const pending = readPending();
    return Object.values(pending).filter((r) => r.meta && r.meta.status === 'waiting_approval');
}

export function vaultHelpText() {
    return [
        '📥 File Vault — как пользоваться',
        '',
        '1. Пришлите боту документ / фото / видео файлом.',
        '2. Бот сохранит его локально в безопасную папку intake и покажет кнопки.',
        '3. Выберите:',
        '   ✅ Положить сюда — в предложенную папку',
        '   ✏️ Выбрать папку — выбрать категорию вручную',
        '   🟨 В Inbox — оставить во входящих',
        '   ❌ Отклонить — переместить в карантин (НЕ удаляется)',
        '',
        'Команды:',
        '/vault_status — счётчики и последние файлы',
        '/vault_recent — последние принятые файлы',
        '/vault_inbox — файлы, ждущие подтверждения',
        '/vault_help — эта справка',
        '',
        'Безопасность: ничего не удаляется, ничего не отправляется наружу,',
        'дубликаты не перезаписываются, чувствительные документы хранятся только локально.',
    ].join('\n');
}
