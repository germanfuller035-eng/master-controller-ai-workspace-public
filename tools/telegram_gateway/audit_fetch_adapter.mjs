// audit_fetch_adapter.mjs
// ============================================================
// BLOCK D-v2 — Audit Fetch Adapter (NETWORK BOUNDARY)
// ------------------------------------------------------------
// Purpose:
//   The ONLY module in the audit subsystem that performs network I/O.
//   Fetches a site's HTML so audit_engine_v2.runSiteAudit() can stay PURE.
//
// SAFETY:
//   - No SMTP, no Telegram, no .env / token read.
//   - Read-only GET. Hard timeout. Size cap. Never throws — returns a result
//     object { ok, html, status, error } so callers can degrade gracefully.
//   - Normalizes URL (adds https:// when scheme missing).
// ============================================================

export const FETCH_TIMEOUT_MS = 8000;
export const MAX_HTML_BYTES = 1_500_000; // 1.5 MB cap

export function normalizeUrl(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === '') return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.toString();
    } catch {
        return null;
    }
}

// fetchSiteHtml({ site }) -> { ok, html, status, finalUrl, error }
// Never throws. On any failure ok=false with a short error string.
export async function fetchSiteHtml(input = {}) {
    const url = normalizeUrl(input.site ?? input.url);
    if (!url) {
        return { ok: false, html: '', status: 0, finalUrl: null, error: 'invalid_url' };
    }

    if (typeof fetch !== 'function') {
        return { ok: false, html: '', status: 0, finalUrl: url, error: 'fetch_unavailable' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SiteAuditBot/1.0; read-only)',
                Accept: 'text/html,application/xhtml+xml',
            },
        });
        const status = res.status;
        if (!res.ok) {
            return { ok: false, html: '', status, finalUrl: res.url || url, error: `http_${status}` };
        }
        // Cap the read size defensively.
        const buf = await res.arrayBuffer();
        const bytes = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
        const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        return { ok: true, html, status, finalUrl: res.url || url, error: null };
    } catch (e) {
        const error = e && e.name === 'AbortError' ? 'timeout' : 'network_error';
        return { ok: false, html: '', status: 0, finalUrl: url, error };
    } finally {
        clearTimeout(timer);
    }
}

export default { fetchSiteHtml, normalizeUrl, FETCH_TIMEOUT_MS, MAX_HTML_BYTES };
