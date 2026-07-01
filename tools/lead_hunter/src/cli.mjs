#!/usr/bin/env node
// cli.mjs — Lead Hunter CLI. Live network commands require --live --confirm.
// Promotion requires an explicit approved lead id + --confirm. Default = shadow/dry-run.
import process from 'node:process';
import path from 'node:path';
import { openRepo } from './repository.mjs';
import { createCampaign, listCampaigns, getCampaign } from './campaign.mjs';
import { availableAdapters, allAdapters } from './adapters/index.mjs';
import { runDiscovery, runDedupe, verifyScoreClassify, campaignSummary } from './pipeline.mjs';

const args = process.argv.slice(2);
const cmd = args[0]; const sub = args[1];
const flag = (n) => args.includes('--' + n);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const DB = process.env.LEAD_HUNTER_DB || path.join(process.env.LEAD_HUNTER_DB_DIR || '.', 'lead_hunter_db.json');
const repo = openRepo({ dbPath: DB });
const out = (o) => console.log(JSON.stringify(o, null, 2));

(async () => {
    if (cmd === 'campaign' && sub === 'create') {
        out(createCampaign(repo, { name: opt('name', 'unnamed'), region: opt('region'), niches: (opt('niches') || '').split(',').filter(Boolean) }));
    } else if (cmd === 'campaign' && sub === 'list') {
        out(listCampaigns(repo).map((c) => ({ id: c.id, name: c.name, mode: c.mode, scheduler: c.scheduler_enabled })));
    } else if (cmd === 'discover') {
        const c = getCampaign(repo, opt('campaign')); if (!c) return out({ error: 'CAMPAIGN_NOT_FOUND' });
        const live = flag('live'); const confirm = flag('confirm');
        if (live && !confirm) return out({ error: 'LIVE_REQUIRES_CONFIRM', hint: 'add --confirm' });
        const adapters = live ? availableAdapters() : allAdapters({});
        const r = await runDiscovery(repo, c, adapters, { live, confirm });
        out({ runId: r.runId, raw: r.raw.length, sources: r.sourceStats, mode: live ? 'live' : 'dry_run' });
    } else if (cmd === 'status') {
        out({ db: DB, counts: repo.counts(), campaigns: listCampaigns(repo).length });
    } else if (cmd === 'review') {
        const c = getCampaign(repo, opt('campaign')); if (!c) return out({ error: 'CAMPAIGN_NOT_FOUND' });
        out(campaignSummary(repo, c.id));
    } else if (cmd === 'doctor') {
        const av = availableAdapters().map((a) => a.name);
        out({ ok: true, db: DB, available_sources: av, note: av.length <= 2 ? 'Only keyless sources (overpass/manual). Add 2GIS/DataForSEO/Yandex keys to enable website-bearing discovery.' : 'multi-source ready', autosend: 'BLOCKED', scheduler: 'disabled' });
    } else if (cmd === 'promote') {
        // promotion is intentionally gated: requires explicit lead id + confirm + live API wiring
        out({ error: 'PROMOTION_REQUIRES', need: ['--lead <id>', '--confirm', 'configured Master Controller API client'], note: 'use the promote.mjs adapter with an API client; dry-run by default' });
    } else {
        out({ usage: 'lead-hunter <campaign create|campaign list|discover|enrich|verify|score|review|export|promote|status|doctor>', flags: '--campaign <id> --live --confirm --lead <id>', safety: 'live requires --live --confirm; promotion requires --lead and API client; autosend BLOCKED' });
    }
})().catch((e) => { console.error('CLI_ERR', String(e.message || e)); process.exit(1); });
