// normalize.mjs — deterministic normalization + evidence helpers. PURE, no IO.
import crypto from 'node:crypto';

export function normName(s) {
    const FORMS = new Set(['ооо', 'оао', 'зао', 'ип', 'пао', 'ао', 'llc', 'ltd', 'inc']);
    return String(s || '').toLowerCase().replace(/[«»"'“”]/g, ' ')
        .replace(/[^a-zа-я0-9]+/gi, ' ').trim().split(/\s+/).filter((t) => t && !FORMS.has(t)).join(' ');
}
export function normDomain(url) {
    return String(url || '').toLowerCase().trim()
        .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split('#')[0];
}
export function normPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') return '7' + d.slice(1);
    if (d.length === 11 && d[0] === '7') return d;
    if (d.length === 10) return '7' + d;
    return d;
}
export function normEmail(e) { return String(e || '').toLowerCase().trim(); }
export function normAddress(a) {
    const STOP = new Set(['г', 'город', 'ул', 'улица', 'д', 'дом', 'пр', 'проспект', 'стр', 'строение', 'пер', 'переулок', 'обл', 'область']);
    return String(a || '').toLowerCase().replace(/[«»"']/g, ' ')
        .replace(/[^a-zа-я0-9]+/gi, ' ').trim().split(/\s+/)
        .filter((t) => t && !STOP.has(t)).join(' ');
}
// simple geo round to ~110m grid for coordinate dedupe
export function geoCell(lat, lng, prec = 3) {
    if (lat == null || lng == null) return null;
    return `${Number(lat).toFixed(prec)},${Number(lng).toFixed(prec)}`;
}

// Levenshtein ratio for fuzzy name (0..1). Used only as a SUPPORTING signal, never alone.
export function nameSimilarity(a, b) {
    a = normName(a); b = normName(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return 1 - dp[m][n] / Math.max(m, n);
}

// Build an evidence record with full provenance (spec-required fields).
export function evidence({ source, sourceRecordId, ref, rawValue, normalizedValue, confidence }) {
    return {
        source: String(source || ''), source_record_id: sourceRecordId != null ? String(sourceRecordId) : null,
        ref: ref || null, fetched_at: new Date().toISOString(),
        raw_value: rawValue ?? null, normalized_value: normalizedValue ?? null,
        confidence: confidence == null ? null : Number(confidence),
        evidence_hash: crypto.createHash('sha256').update(`${source}|${sourceRecordId}|${rawValue}`).digest('hex').slice(0, 16),
    };
}
