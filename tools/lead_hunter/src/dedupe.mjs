// dedupe.mjs — weighted-evidence deduplication. PURE decision logic + repo-backed merge.
// HARD RULE: two records are NEVER merged on name similarity alone — a strong key
// (phone/domain/email/exact address/geo cell) must match. Merges keep reversible history.
import { normName, normDomain, normPhone, normEmail, normAddress, geoCell, nameSimilarity } from './normalize.mjs';

// Strong identity keys for a candidate (any one shared with another = strong match).
export function strongKeys(c) {
    const keys = new Set();
    for (const p of (c.phones || [])) { const n = normPhone(p); if (n.length >= 10) keys.add('tel:' + n); }
    const dom = normDomain(c.website || (c.websites || [])[0]); if (dom) keys.add('dom:' + dom);
    for (const e of (c.emails || [])) { const n = normEmail(e); if (n.includes('@')) keys.add('email:' + n); }
    const addr = normAddress(c.address); if (addr && addr.length >= 8) keys.add('addr:' + addr);
    const cell = geoCell(c.lat, c.lng); if (cell) keys.add('geo:' + cell);
    if (c.source && c.source_record_id) keys.add(`src:${c.source}:${c.source_record_id}`);
    return keys;
}

// Decide whether two candidates are the same business.
// Returns { merge, reason, score }. merge=true requires >=1 strong key OR
// (geo-cell + high name similarity). Name similarity alone NEVER merges.
export function matchDecision(a, b, { nameThreshold = 0.85 } = {}) {
    const ka = strongKeys(a), kb = strongKeys(b);
    const shared = [...ka].filter((k) => kb.has(k) && !k.startsWith('src:'));
    const sim = nameSimilarity(a.company || a.name, b.company || b.name);
    if (shared.length >= 1) return { merge: true, reason: 'STRONG_KEY:' + shared[0], score: 1, nameSim: sim };
    // geo cell + strong name similarity = supporting combo (two independent signals)
    const ac = geoCell(a.lat, a.lng), bc = geoCell(b.lat, b.lng);
    if (ac && ac === bc && sim >= nameThreshold) return { merge: true, reason: 'GEO+NAME', score: 0.9, nameSim: sim };
    if (sim >= nameThreshold) return { merge: false, reason: 'NAME_ONLY_INSUFFICIENT', score: sim, nameSim: sim };
    return { merge: false, reason: 'NO_MATCH', score: sim, nameSim: sim };
}

// Group an array of candidates into dedupe clusters. Returns [{ members:[idx...], reason }].
export function clusterCandidates(cands, opts) {
    const parent = cands.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };
    const reasons = {};
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
        const d = matchDecision(cands[i], cands[j], opts);
        if (d.merge) { union(i, j); reasons[`${i}-${j}`] = d.reason; }
    }
    const groups = {};
    for (let i = 0; i < cands.length; i++) { const r = find(i); (groups[r] ||= []).push(i); }
    return Object.values(groups).map((members) => ({ members, size: members.length }));
}

// Merge a cluster into a single canonical candidate, preserving all provenance + reversible history.
export function mergeCluster(cands, members) {
    const sorted = [...members].sort((a, b) => a - b);
    const primary = { ...cands[sorted[0]] };
    primary.merged_from = [];
    const phones = new Set(primary.phones || []); const emails = new Set(primary.emails || []);
    const websites = new Set([primary.website, ...(primary.websites || [])].filter(Boolean));
    const evidence = [...(primary.evidence || [])];
    const aliases = new Set([primary.company || primary.name].filter(Boolean));
    for (const idx of sorted.slice(1)) {
        const m = cands[idx];
        primary.merged_from.push({ source: m.source, source_record_id: m.source_record_id, name: m.company || m.name, merged_at: new Date().toISOString() });
        (m.phones || []).forEach((p) => phones.add(p));
        (m.emails || []).forEach((e) => emails.add(e));
        [m.website, ...(m.websites || [])].filter(Boolean).forEach((w) => websites.add(w));
        (m.evidence || []).forEach((e) => evidence.push(e));
        if (m.company || m.name) aliases.add(m.company || m.name);
        if (!primary.lat && m.lat) { primary.lat = m.lat; primary.lng = m.lng; }
        if (!primary.address && m.address) primary.address = m.address;
    }
    primary.phones = [...phones]; primary.emails = [...emails]; primary.websites = [...websites];
    primary.aliases = [...aliases]; primary.evidence = evidence;
    primary.dedupe_keys = [...strongKeys(primary)];
    return primary;
}
