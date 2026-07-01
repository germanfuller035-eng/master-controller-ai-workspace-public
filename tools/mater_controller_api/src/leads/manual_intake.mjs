// tools/mater_controller_api/src/leads/manual_intake.mjs
// Pure helpers for owner manual lead entry (POST /leads/manual). No express, no fs, no network —
// just URL normalization + candidate shaping, so the logic is unit-testable offline.

// Normalize a user-typed website into a canonical https URL, or null if not a usable host.
export function normalizeManualWebsite(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
        const u = new URL(s);
        if (!/\./.test(u.hostname)) return null; // must look like a domain
        return u.href;
    } catch { return null; }
}

// Validate + shape one manual item into a canonical staging candidate.
// Returns { ok:true, candidate } or { ok:false, code, message }.
export function buildManualCandidate(item, { now } = {}) {
    const it = item || {};
    const company = String(it.company || it.company_name || '').trim();
    const website = normalizeManualWebsite(it.website || it.website_candidate);
    if (!company) return { ok: false, code: 'NO_COMPANY', message: 'Название компании обязательно' };
    if (!website) return { ok: false, code: 'INVALID_WEBSITE', message: 'Нужен корректный адрес сайта' };
    const at = now || new Date().toISOString();
    return {
        ok: true,
        candidate: {
            source: 'owner_manual', source_url: website, adapter_version: 'owner_manual_v1',
            company_name: company, website_candidate: website,
            region: it.region || null, industry: it.industry || it.niche || null,
            email_candidates: [], phone_candidates: [],
            evidence_refs: [{ type: 'owner_manual', ref: website, at }],
        },
    };
}
