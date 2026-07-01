// owner_center/backup_center.mjs
// ============================================================
// Backup & Recovery Center (0.8.0) — read-mostly, non-destructive.
// ------------------------------------------------------------
// Answers the owner's recovery questions:
//   - inventory: which data files are protected, and do they exist?
//   - backup status: are there snapshots, how fresh, how many?
//   - restore verification: can the latest snapshot actually be restored
//     (parses + structurally valid)? — proven by a NON-DESTRUCTIVE drill that
//     reads a backup into a temp file, validates, then deletes the temp. The
//     live store is NEVER touched.
//   - rollback: exact manual steps the owner would run (instructions only).
//
// HARD INVARIANTS:
//   - The drill is READ + temp-only. It NEVER overwrites a live store, NEVER
//     deletes canonical data, NEVER performs an actual restore. Rollback is
//     surfaced as INSTRUCTIONS for the owner — this module does not execute it.
//   - NEVER sends, NEVER opens a gate. Owner-facing text is Russian.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
    STORE_PATH, CAMPAIGNS_STORE_PATH, OWNER_CENTER_STORE_PATH, KNOWLEDGE_STORE_PATH,
    OWNER_SETTINGS_PATH, DOMAIN_RESERVOIR_PATH, AI_USAGE_LEDGER_PATH,
    EMAIL_LEDGER_PATH, SEND_LEDGER_PATH,
} from '../shared/config.mjs';

export const BACKUP_CENTER_VERSION = 'backup_center_v1';

// The protected-data inventory. `critical` items are the irreplaceable truth
// (canonical leads + ledgers); `kind` drives the validation strategy.
export function protectedInventory() {
    return [
        { key: 'canonical_leads', name_ru: 'Канонический реестр лидов', path: STORE_PATH, kind: 'json_revisioned', critical: true },
        { key: 'campaigns', name_ru: 'Кампании (Campaign Governor)', path: CAMPAIGNS_STORE_PATH, kind: 'json_revisioned', critical: false },
        { key: 'owner_center', name_ru: 'Центр управления владельца', path: OWNER_CENTER_STORE_PATH, kind: 'json_revisioned', critical: false },
        { key: 'knowledge_radar', name_ru: 'Радар знаний', path: KNOWLEDGE_STORE_PATH, kind: 'json', critical: false },
        { key: 'owner_settings', name_ru: 'Настройки автоматизации', path: OWNER_SETTINGS_PATH, kind: 'json', critical: false },
        { key: 'domain_reservoir', name_ru: 'Резервуар доменов', path: DOMAIN_RESERVOIR_PATH, kind: 'json', critical: false },
        { key: 'ai_usage_ledger', name_ru: 'Журнал расхода ИИ', path: AI_USAGE_LEDGER_PATH, kind: 'jsonl', critical: true },
        { key: 'email_ledger', name_ru: 'Журнал писем', path: EMAIL_LEDGER_PATH, kind: 'jsonl', critical: true },
        { key: 'send_ledger', name_ru: 'Журнал отправок', path: SEND_LEDGER_PATH, kind: 'jsonl', critical: true },
    ];
}

function statSafe(p) {
    try { const st = fs.statSync(p); return { exists: true, size: st.size, mtimeMs: st.mtimeMs, modified: new Date(st.mtimeMs).toISOString() }; }
    catch { return { exists: false, size: 0, mtimeMs: 0, modified: null }; }
}

// Find `.bak_<ts>` snapshots written next to a store by writeStoreAtomic/updateStoreWithRevision.
function snapshotsFor(storePath) {
    try {
        const dir = path.dirname(storePath);
        const base = path.basename(storePath);
        const all = fs.readdirSync(dir);
        const snaps = all
            .filter((f) => f.startsWith(`${base}.bak_`))
            .map((f) => { const full = path.join(dir, f); const s = statSafe(full); return { file: f, path: full, size: s.size, modified: s.modified, mtimeMs: s.mtimeMs }; })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        return snaps;
    } catch { return []; }
}

// Validate a file's content for its kind WITHOUT mutating anything.
// Returns { valid, detail_ru, revision? }.
export function validateContent(kind, raw) {
    try {
        if (kind === 'jsonl') {
            const lines = String(raw).split(/\n+/).filter(Boolean);
            let parsed = 0;
            for (const l of lines) { JSON.parse(l); parsed += 1; }
            return { valid: true, detail_ru: `Журнал корректен: строк ${parsed}`, lines: parsed };
        }
        const obj = JSON.parse(raw);
        if (kind === 'json_revisioned') {
            const rev = Number(obj.store_revision);
            if (!Number.isFinite(rev)) return { valid: false, detail_ru: 'Нет поля store_revision' };
            return { valid: true, detail_ru: `Структура корректна, ревизия ${rev}`, revision: rev };
        }
        return { valid: true, detail_ru: 'JSON корректен' };
    } catch (e) {
        return { valid: false, detail_ru: 'Файл не разбирается (повреждён)' };
    }
}

// Backup status for the whole inventory (read-only).
export function backupStatus({ now = Date.now() } = {}) {
    const items = protectedInventory().map((it) => {
        const live = statSafe(it.path);
        const snaps = snapshotsFor(it.path);
        const latest = snaps[0] || null;
        const ageHours = latest ? Math.round((now - latest.mtimeMs) / 36000) / 100 : null;
        return {
            key: it.key, name_ru: it.name_ru, kind: it.kind, critical: it.critical,
            live_exists: live.exists, live_size: live.size, live_modified: live.modified,
            snapshot_count: snaps.length,
            latest_snapshot: latest ? { file: latest.file, modified: latest.modified, size: latest.size } : null,
            latest_age_hours: ageHours, // null = no snapshot (honest, not 0)
            has_backup: snaps.length > 0,
        };
    });
    const critical = items.filter((i) => i.critical);
    return {
        backup_center_version: BACKUP_CENTER_VERSION,
        items,
        total_protected: items.length,
        critical_total: critical.length,
        critical_with_backup: critical.filter((i) => i.has_backup).length,
        critical_missing_backup: critical.filter((i) => !i.has_backup).map((i) => i.key),
        any_live_missing: items.filter((i) => !i.live_exists).map((i) => i.key),
        sends: false, performs_restore: false,
    };
}

// NON-DESTRUCTIVE restore drill for one inventory item. Reads the latest snapshot
// (or the live file if no snapshot) into a TEMP copy, validates it, then deletes the
// temp. The live store is never touched. Proves "this backup is restorable".
export function restoreDrill(key, { tmpDir = os.tmpdir() } = {}) {
    const it = protectedInventory().find((x) => x.key === key);
    if (!it) return { ok: false, code: 'UNKNOWN_KEY', key };
    const snaps = snapshotsFor(it.path);
    const source = snaps[0] ? snaps[0].path : (statSafe(it.path).exists ? it.path : null);
    const sourceKind = snaps[0] ? 'snapshot' : 'live';
    if (!source) return { ok: true, key, restorable: false, source: 'none', detail_ru: 'Нет ни снимка, ни живого файла', drill: 'SKIPPED' };

    let tmp = null;
    try {
        const raw = fs.readFileSync(source, 'utf8');
        // copy to a temp file (simulated restore target) — proves we can materialize it
        tmp = path.join(tmpDir, `mc_restore_drill_${it.key}_${process.pid}_${crypto.randomBytes(4).toString('hex')}.tmp`);
        fs.writeFileSync(tmp, raw, 'utf8');
        const reread = fs.readFileSync(tmp, 'utf8');
        const byteMatch = reread.length === raw.length;
        const v = validateContent(it.kind, reread);
        return {
            ok: true, key, restorable: v.valid && byteMatch, source: sourceKind, source_file: path.basename(source),
            byte_match: byteMatch, validation: v, revision: v.revision ?? null,
            drill: 'NON_DESTRUCTIVE', live_touched: false,
            detail_ru: v.valid && byteMatch ? `Восстановление проверено (${sourceKind}): ${v.detail_ru}` : `Проверка не пройдена: ${v.detail_ru}`,
        };
    } catch (e) {
        return { ok: true, key, restorable: false, source: sourceKind, drill: 'NON_DESTRUCTIVE', live_touched: false, detail_ru: 'Ошибка чтения резервной копии' };
    } finally {
        if (tmp) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
    }
}

// Run the drill across all protected items.
export function restoreDrillAll({ tmpDir = os.tmpdir() } = {}) {
    const results = protectedInventory().map((it) => restoreDrill(it.key, { tmpDir }));
    const checked = results.filter((r) => r.drill === 'NON_DESTRUCTIVE');
    const restorable = checked.filter((r) => r.restorable).length;
    return {
        backup_center_version: BACKUP_CENTER_VERSION,
        results,
        total: results.length,
        checked: checked.length,
        restorable,
        not_restorable: checked.filter((r) => !r.restorable).map((r) => r.key),
        skipped: results.filter((r) => r.drill === 'SKIPPED').map((r) => r.key),
        all_critical_restorable: protectedInventory().filter((x) => x.critical)
            .every((x) => { const r = results.find((y) => y.key === x.key); return r && r.restorable; }),
        live_touched: false, sends: false,
    };
}

// Rollback instructions (deterministic; manual, owner-executed). This module does
// NOT execute these — they are surfaced read-only so the owner knows the exact steps.
export function rollbackInstructions(key) {
    const it = protectedInventory().find((x) => x.key === key);
    if (!it) return { ok: false, code: 'UNKNOWN_KEY', key };
    const snaps = snapshotsFor(it.path);
    const latest = snaps[0] || null;
    return {
        ok: true, key, name_ru: it.name_ru, critical: it.critical,
        live_path: it.path,
        latest_snapshot: latest ? latest.file : null,
        executed_by: 'OWNER_MANUAL', auto_executed: false,
        warning_ru: 'Откат перезаписывает живой файл. Выполняется владельцем вручную при остановленных API и воркере.',
        steps_ru: latest ? [
            'Остановить API и воркер (systemctl stop master-controller-api master-controller-worker).',
            `Сделать копию текущего файла: cp "${it.path}" "${it.path}.pre_rollback".`,
            `Восстановить из снимка: cp "${latest.path}" "${it.path}".`,
            'Проверить целостность (этот центр → проверка восстановления).',
            'Запустить API и воркер обратно и проверить health=200.',
        ] : [
            'Снимков нет — откат недоступен. Сначала создайте резервную копию.',
        ],
    };
}

export default { BACKUP_CENTER_VERSION, protectedInventory, validateContent, backupStatus, restoreDrill, restoreDrillAll, rollbackInstructions };
