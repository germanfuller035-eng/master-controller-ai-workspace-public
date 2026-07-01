// tools/commercial_core/lib/identity_graph.mjs
// PURE contact identity graph + source arbitration / entity resolution. No I/O, no canonical write,
// no send. Stores hashes + masked display only (data minimization); never merges on name-only.
import crypto from 'node:crypto';

export const LINK_STATUS = ['VERIFIED', 'PROBABLE', 'UNVERIFIED', 'CONFLICTED', 'REVOKED'];
export const IDENTITY_TYPES = ['website_domain', 'email', 'phone', 'vk_community', 'max_chat', 'telegram_user', 'whatsapp_number', 'avito_account', 'inn'];

export function hashValue(v) { return crypto.createHash('sha256').update(String(v == null ? '' : v).toLowerCase().trim()).digest('hex'); }
export function maskDisplay(type, v) {
    const s = String(v || '');
    if (type === 'email') { const [u, d] = s.split('@'); return u ? `${u[0]}***@${d || ''}` : '***'; }
    if (type === 'phone') return s.length >= 4 ? `***${s.slice(-4)}` : '***';
    if (type === 'website_domain') return s;
    return s.length > 6 ? `${s.slice(0, 3)}***` : '***';
}

const norm = (v) => String(v || '').toLowerCase().trim();
const normName = (s) => norm(s).replace(/["«»'`]/g, '').replace(/(^|\s)(ооо|оао|зао|ип|пао|llc|ltd|inc)(\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();

// Build an identity link record (hash + masked display only).
export function makeLink({ companyId, type, value, source, evidence, status = 'UNVERIFIED', at = null }) {
    return {
        link_id: `lnk_${hashValue(`${companyId}:${type}:${value}`).slice(0, 16)}`,
        company_id: companyId, identity_type: type,
        identity_value_hash: hashValue(value), display_masked: maskDisplay(type, value),
        source, evidence: evidence || { source }, confidence: status === 'VERIFIED' ? 1 : status === 'PROBABLE' ? 0.6 : 0.3,
        verified_at: status === 'VERIFIED' ? at : null, status,
    };
}

// STRONG signals can auto-match a candidate to an existing company; WEAK signals cannot.
// Returns { decision: 'EXACT'|'STRONG'|'POSSIBLE'|'NEW', companyId, reasons }.
export function resolveEntity(candidate, existingCompanies) {
    const reasons = [];
    const candDomain = candidate.website_domain || null;
    const candPhones = new Set((candidate.phones || []).map(norm));
    const candEmails = new Set((candidate.emails || []).map(norm));
    const candInn = candidate.inn ? norm(candidate.inn) : null;
    const candExt = candidate.external_id ? norm(candidate.external_id) : null;
    const candName = normName(candidate.company_name);

    for (const co of existingCompanies) {
        const links = co.links || [];
        const has = (type, val) => val && links.some((l) => l.identity_type === type && l.identity_value_hash === hashValue(val) && l.status !== 'REVOKED');
        // STRONG: domain / verified phone / verified email / external business id / inn
        if (candDomain && has('website_domain', candDomain)) { reasons.push('same_domain'); return { decision: 'STRONG', companyId: co.company_id, reasons }; }
        if (candInn && has('inn', candInn)) { reasons.push('same_inn'); return { decision: 'STRONG', companyId: co.company_id, reasons }; }
        for (const p of candPhones) if (links.some((l) => l.identity_type === 'phone' && l.identity_value_hash === hashValue(p) && l.status === 'VERIFIED')) { reasons.push('same_verified_phone'); return { decision: 'STRONG', companyId: co.company_id, reasons }; }
        for (const e of candEmails) if (links.some((l) => l.identity_type === 'email' && l.identity_value_hash === hashValue(e) && l.status === 'VERIFIED')) { reasons.push('same_verified_email'); return { decision: 'STRONG', companyId: co.company_id, reasons }; }
        if (candExt && candidate.source_id && co.external_ids && co.external_ids[candidate.source_id] === candExt) { reasons.push('same_external_id'); return { decision: 'EXACT', companyId: co.company_id, reasons }; }
    }
    // POSSIBLE: name + city, or unverified phone/email overlap → owner review, never auto-merge.
    for (const co of existingCompanies) {
        const sameName = normName(co.company_name) === candName && candName.length > 2;
        const sameCity = candidate.city && norm(co.city) === norm(candidate.city);
        const links = co.links || [];
        const weakPhone = [...candPhones].some((p) => links.some((l) => l.identity_type === 'phone' && l.identity_value_hash === hashValue(p)));
        if ((sameName && sameCity) || weakPhone || (sameName && candDomain == null)) {
            reasons.push(sameName && sameCity ? 'name+city' : weakPhone ? 'unverified_phone_overlap' : 'name_only');
            return { decision: 'POSSIBLE', companyId: co.company_id, reasons };
        }
    }
    return { decision: 'NEW', companyId: null, reasons: ['no_match'] };
}

// Detect a conflict: same identity value linked to DIFFERENT companies (e.g. one phone, two companies).
export function detectConflicts(companies) {
    const byHash = new Map(); // `${type}:${hash}` -> Set(companyId)
    for (const co of companies) for (const l of (co.links || [])) {
        if (l.status === 'REVOKED') continue;
        const k = `${l.identity_type}:${l.identity_value_hash}`;
        if (!byHash.has(k)) byHash.set(k, new Set());
        byHash.get(k).add(co.company_id);
    }
    const conflicts = [];
    for (const [k, set] of byHash) if (set.size > 1) {
        const [type] = k.split(':');
        conflicts.push({ conflict_id: `cfl_${hashValue(k).slice(0, 12)}`, identity_type: type, companies: [...set], status: 'OWNER_REVIEW', auto_merge: false });
    }
    return conflicts;
}

// Arbitration summary over a candidate vs the existing graph.
export function arbitrate(candidate, companies) {
    const res = resolveEntity(candidate, companies);
    return {
        decision: res.decision, // EXACT/STRONG/POSSIBLE/NEW
        company_id: res.companyId,
        reasons: res.reasons,
        auto_merge_allowed: res.decision === 'EXACT' || res.decision === 'STRONG',
        owner_review_required: res.decision === 'POSSIBLE',
        creates_new_entity: res.decision === 'NEW',
    };
}
