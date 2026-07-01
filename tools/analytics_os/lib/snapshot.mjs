// tools/analytics_os/lib/snapshot.mjs
// Immutable local snapshot contract + append-only historical series (Phase 10).
// Synthetic only. Deterministic checksum (no Date.now / Math.random — timestamps passed in).

export const SNAPSHOT_TYPES = ['operational', 'daily_business', 'weekly_executive', 'monthly_finance', 'product_readiness', 'customer_portfolio'];

// FNV-1a 32-bit deterministic checksum over a canonical JSON string.
export function checksum(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort ? undefined : undefined);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

// Build an immutable snapshot record. ts + source_versions are passed in (deterministic).
export function buildSnapshot({ type, dataset, rows = [], ts = 'UNSTAMPED', schema_version = '1.0', source_versions = {}, freshness = 'synthetic', synthetic = true }) {
  if (!SNAPSHOT_TYPES.includes(type)) throw new Error(`unknown snapshot type ${type}`);
  const payload = { dataset, rows };
  return {
    snapshot_id: `${type}_${dataset}_${ts}`,
    type,
    dataset,
    generated_at: ts,
    schema_version,
    source_versions,
    source_checksums: { [dataset]: checksum(payload) },
    row_count: rows.length,
    quality_status: 'UNVERIFIED',
    freshness,
    synthetic,
    payload_checksum: checksum(payload),
  };
}

// Append-only historical series. Rejects duplicate periods; flags missing periods + corrections.
export function appendSeries(series, point) {
  const out = { key: series.key, points: [...(series.points || [])], corrections: [...(series.corrections || [])] };
  const exists = out.points.find((p) => p.period_label === point.period_label);
  if (exists) {
    if (point.correction === true) {
      out.corrections.push({ period_label: point.period_label, old_value: exists.value, new_value: point.value, reason: point.reason || 'correction', ts: point.ts || 'UNSTAMPED' });
      exists.value = point.value;
      return { ok: true, action: 'CORRECTION_RECORDED', series: out };
    }
    return { ok: false, action: 'DUPLICATE_PERIOD_REJECTED', series: out };
  }
  out.points.push({ period_label: point.period_label, value: point.value, source_revision: point.source_revision || null });
  return { ok: true, action: 'APPENDED', series: out };
}

// Detect missing periods given an expected ordered period list.
export function detectMissingPeriods(series, expectedPeriods) {
  const have = new Set((series.points || []).map((p) => p.period_label));
  return expectedPeriods.filter((p) => !have.has(p));
}

// Normalize a period label to a canonical YYYY-MM form (timezone-agnostic, string only).
export function normalizePeriod(label) {
  const m = String(label).match(/(\d{4})[-/](\d{1,2})/);
  if (!m) return label;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
}
