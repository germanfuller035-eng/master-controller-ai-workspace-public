// classify.mjs — website classification + lead routing. PURE (input = probe/parse descriptors).
// No network here; the crawler (Phase 4) produces the descriptors, this turns them into states.

// Website tiers per spec. Input `w`:
//   { noUrl, dnsResolved, reachable, httpStatus, tlsOk, redirectChain, hasViewport,
//     hasContact, hasForm, hasCta, hasMessenger, copyrightYear, hasStructuredData,
//     hasAnalytics, perfMs }
export function classifyWebsite(w, now = new Date()) {
    if (!w || w.noUrl) return { tier: 'NO_SITE', evidence: 'no website candidate' };
    if (w.dnsResolved === false) return { tier: 'DOMAIN_UNRESOLVED', evidence: 'DNS did not resolve' };
    if (w.reachable === false || w.timeout) return { tier: 'SITE_UNREACHABLE', evidence: 'host did not respond' };
    const code = Number(w.httpStatus || 0);
    if (code >= 500 || code === 0) return { tier: 'BROKEN_SITE', evidence: `HTTP ${code || 'no-response'}` };
    if (code === 403 || code === 401) return { tier: 'SITE_UNREACHABLE', evidence: `HTTP ${code} (blocked probe)` };

    // reachable 2xx/3xx — grade quality on positive signals
    let signals = 0;
    if (w.hasViewport) signals++;
    if (w.hasContact) signals++;
    if (w.hasForm) signals++;
    if (w.hasCta) signals++;
    if (w.hasStructuredData) signals++;
    if (w.hasAnalytics) signals++;
    if (w.tlsOk) signals++;

    const stale = w.copyrightYear && (now.getUTCFullYear() - Number(w.copyrightYear)) >= 3;
    // stale or missing core conversion markers caps the site at WEAK regardless of other signals
    const weakMarkers = !w.hasViewport || !w.hasForm || !w.hasCta || stale;

    if (signals <= 2) return { tier: 'WEAK_SITE', evidence: `signals=${signals} stale=${!!stale}` };
    if (weakMarkers) return { tier: 'WEAK_SITE', evidence: `signals=${signals} stale=${!!stale} weakMarkers=true` };
    if (signals >= 6) return { tier: 'STRONG_SITE', evidence: `signals=${signals}` };
    return { tier: 'ADEQUATE_SITE', evidence: `signals=${signals}` };
}

// Email confidence per spec. OSM/directory email is NOT official by itself.
export function classifyEmail(e) {
    if (!e) return 'NO_EMAIL';
    if (e.optOut) return 'OPT_OUT';
    if (e.bounced) return 'BOUNCED';
    if (e.invalidSyntax) return 'INVALID';
    if (e.guessed) return 'GUESSED';
    if (e.onOfficialContactPage) return e.isRole ? 'ROLE_ADDRESS_CONFIRMED' : 'OFFICIAL_PAGE';
    if (e.inOfficialDocument) return 'OFFICIAL_DOCUMENT';
    if (e.inPublicDirectory) return 'PUBLIC_DIRECTORY_CONFIRMED';
    if (e.contactFormOnly) return 'CONTACT_FORM_ONLY';
    return 'UNCONFIRMED';
}
const APPROVED_EMAIL = new Set(['OFFICIAL_PAGE', 'OFFICIAL_DOCUMENT', 'PUBLIC_DIRECTORY_CONFIRMED', 'ROLE_ADDRESS_CONFIRMED']);
export function emailIsContactable(status) { return APPROVED_EMAIL.has(status); }

// Identity confidence: requires >=2 independent signals for VERIFIED.
export function classifyIdentity(sig) {
    const pos = [];
    if (sig.nameAddressMatch) pos.push('NAME+ADDRESS');
    if (sig.phoneAddressMatch) pos.push('PHONE+ADDRESS');
    if (sig.coordCategoryMatch) pos.push('COORD+CATEGORY');
    if (sig.officialSitePlusListing) pos.push('SITE+LISTING');
    if (sig.nameOnOfficialSite) pos.push('NAME_ON_SITE');
    if (sig.conflict) return { status: 'IDENTITY_CONFLICT', confidence: 0.2, signals: pos };
    if (pos.length >= 2) return { status: 'IDENTITY_VERIFIED', confidence: Math.min(1, 0.6 + 0.2 * pos.length), signals: pos };
    if (pos.length === 1) return { status: 'IDENTITY_PARTIAL', confidence: 0.5, signals: pos };
    return { status: 'IDENTITY_UNKNOWN', confidence: 0.2, signals: pos };
}

// Lead route per spec: NO_SITE offer / BROKEN recovery / WEAK mini-audit / NO_EMAIL manual / LOW_CONFIDENCE research.
export function leadRoute({ websiteTier, emailStatus, identityStatus }) {
    if (identityStatus === 'IDENTITY_CONFLICT' || identityStatus === 'IDENTITY_UNKNOWN') return 'LOW_CONFIDENCE_RESEARCH';
    if (websiteTier === 'NO_SITE' || websiteTier === 'DOMAIN_UNRESOLVED') return 'NO_SITE_OFFER';
    if (websiteTier === 'BROKEN_SITE' || websiteTier === 'SITE_UNREACHABLE') return 'BROKEN_SITE_RECOVERY';
    if (websiteTier === 'WEAK_SITE') return emailIsContactable(emailStatus) ? 'WEAK_SITE_MINI_AUDIT' : 'NO_EMAIL_MANUAL_CONTACT';
    // adequate/strong site: still a candidate if no email → manual; else mini-audit-eligible
    if (!emailIsContactable(emailStatus)) return 'NO_EMAIL_MANUAL_CONTACT';
    return 'WEAK_SITE_MINI_AUDIT';
}
