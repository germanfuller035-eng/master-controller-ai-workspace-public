// campaign.mjs — campaign config with production-safe defaults. Pure builders + the repo writes.
import { newId } from './repository.mjs';

// Production-safe defaults per spec: shadow mode, scheduler off, promotion off, tight limits.
export const CAMPAIGN_DEFAULTS = Object.freeze({
    region: null, cities: [], niches: [],
    include_categories: [], exclude_categories: [],
    keyword_templates: [],
    source_priority: ['twogis', 'dataforseo', 'yandex', 'overpass', 'manual'],
    source_request_budget: { twogis: 50, dataforseo: 50, yandex: 50, overpass: 100, manual: 0 },
    max_raw_candidates: 20,
    max_verified_candidates: 5,
    min_score: 40,
    include_no_website: true,
    include_no_email: true,
    schedule: null,
    mode: 'shadow',          // shadow | live
    promotion_enabled: false,
    scheduler_enabled: false,
});

export function buildCampaign(input = {}) {
    const c = { ...CAMPAIGN_DEFAULTS, ...input };
    c.id = input.id || newId('camp');
    c.name = String(input.name || 'unnamed').slice(0, 120);
    c.created_at = input.created_at || new Date().toISOString();
    c.status = 'created';
    // hard-clamp limits so a typo can't unleash a huge run
    c.max_raw_candidates = Math.min(Math.max(1, Number(c.max_raw_candidates) || 20), 200);
    c.max_verified_candidates = Math.min(Math.max(1, Number(c.max_verified_candidates) || 5), 50);
    c.mode = c.mode === 'live' ? 'live' : 'shadow';
    return c;
}

export function createCampaign(repo, input) {
    const c = buildCampaign(input);
    repo.put('campaigns', c.id, c);
    return c;
}
export function listCampaigns(repo) { return repo.all('campaigns'); }
export function getCampaign(repo, id) { return repo.get('campaigns', id); }
