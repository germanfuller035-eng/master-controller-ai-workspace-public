// osm_overpass_connector.mjs
// OPENSTREETMAP OVERPASS CONNECTOR — a STANDALONE, genuinely KEYLESS lead source.
//
// WHY THIS EXISTS:
//   The 2GIS and DataForSEO connectors are both gated behind a paid/registered API
//   key (documented blockers: twogis_api_connector_live_blocker_missing_key, and the
//   keyless live-probe blocker against anti-bot directories). This module is the
//   honest answer to "a live source that needs NO key and NO .env secret": the
//   OpenStreetMap Overpass API (https://overpass-api.de). It is free, public, and
//   ToS-permitted for moderate query volumes — no account, no key, no token.
//
// SAFETY MODEL (mirrors the 2GIS connector's network boundary discipline):
//   - Default mode is dry-run. A dry-run NEVER calls fetch(): it returns the fully
//     built request descriptor (endpoint + Overpass QL body) so the operator can
//     review exactly what would go on the wire before anything leaves the box.
//   - The ONLY path that calls real fetch() requires BOTH `live:true` AND
//     `confirm:true`. Either flag missing => no network, period.
//   - There is NO API key anywhere. This source is keyless by design, so there is
//     no secret to read, log, or leak — which is precisely the point.
//   - normalizeElements() is a PURE function (overpass json -> lead records[]); it
//     never touches the network and is what the offline test exercises.
//   - This module does NOT write to lead_store or _raw/. It only RETURNS records.
//     Promotion/staging stays the operator's separate, explicit decision (via the
//     lead_source_staging_bridge "osm" mapper -> staging writer HARD GATE).

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_MS = 25000; // Overpass can be slow under load.
const DEFAULT_QUERY_TIMEOUT_S = 25; // Overpass QL [timeout:N] guard.
const DEFAULT_LIMIT = 25; // conservative demo-friendly cap.

// A small, curated map of friendly niche -> OSM tag filters. Keeping this explicit
// (rather than free-form tag injection) keeps queries well-formed and ToS-friendly.
const NICHE_TAG_FILTERS = {
    car_repair: ['shop=car_repair', 'craft=car_repair'],
    car_service: ['shop=car_repair', 'craft=car_repair'],
    автосервис: ['shop=car_repair', 'craft=car_repair'],
    dentist: ['amenity=dentist', 'healthcare=dentist'],
    стоматология: ['amenity=dentist', 'healthcare=dentist'],
    beauty: ['shop=beauty', 'shop=hairdresser'],
    салон_красоты: ['shop=beauty', 'shop=hairdresser'],
    restaurant: ['amenity=restaurant'],
    ресторан: ['amenity=restaurant'],
    cafe: ['amenity=cafe'],
    кафе: ['amenity=cafe'],
    fitness: ['leisure=fitness_centre', 'sport=fitness'],
    фитнес: ['leisure=fitness_centre', 'sport=fitness'],
    hotel: ['tourism=hotel'],
    отель: ['tourism=hotel'],
    construction: ['office=construction_company', 'craft=builder'],
    стройка: ['office=construction_company', 'craft=builder'],
};

// ---------------------------------------------------------------------------
// Request building (pure).
// ---------------------------------------------------------------------------

/**
 * Resolve a friendly niche string into a list of OSM tag filters.
 * Unknown niches fall back to treating the input as a literal `key=value` if it
 * looks like one, else throw (so we never send a malformed Overpass query).
 *
 * @param {string} niche
 * @returns {string[]} tag filter expressions (e.g. ['shop=car_repair'])
 */
export function resolveTagFilters(niche) {
    const key = String(niche ?? '').trim().toLowerCase();
    if (!key) throw new Error('resolveTagFilters: missing niche');
    if (NICHE_TAG_FILTERS[key]) return NICHE_TAG_FILTERS[key];
    // Allow an explicit OSM tag passthrough like "amenity=pharmacy".
    if (/^[a-z_]+=[a-z0-9_:-]+$/i.test(key)) return [key];
    throw new Error(
        `resolveTagFilters: unknown niche "${niche}". Known: ${Object.keys(NICHE_TAG_FILTERS).join(', ')} (or pass a literal "key=value").`
    );
}

/**
 * Build the Overpass QL request descriptor for a niche within a bounding box.
 *
 * Overpass uses a bbox of (south, west, north, east). For a city-level search the
 * operator supplies the bbox; we keep this explicit rather than geocoding a city
 * name here (geocoding would be a second network dependency / second source).
 *
 * @param {object} q
 * @param {string} q.niche                 friendly niche, e.g. "автосервис"
 * @param {[number,number,number,number]} q.bbox  [south, west, north, east]
 * @param {number} [q.limit=DEFAULT_LIMIT]
 * @param {number} [q.timeoutS=DEFAULT_QUERY_TIMEOUT_S]
 * @returns {{ endpoint:string, body:string, niche:string, bbox:number[] }}
 */
export function buildRequest(q = {}) {
    const niche = String(q.niche ?? '').trim();
    if (!niche) throw new Error('buildRequest: missing niche');

    const bbox = Array.isArray(q.bbox) ? q.bbox : null;
    if (!bbox || bbox.length !== 4 || !bbox.every((n) => Number.isFinite(n))) {
        throw new Error('buildRequest: missing or invalid bbox [south, west, north, east]');
    }

    const limit =
        Number.isFinite(q.limit) && q.limit > 0 ? Math.min(Math.floor(q.limit), 200) : DEFAULT_LIMIT;
    const timeoutS =
        Number.isFinite(q.timeoutS) && q.timeoutS > 0
            ? Math.min(Math.floor(q.timeoutS), 60)
            : DEFAULT_QUERY_TIMEOUT_S;

    const filters = resolveTagFilters(niche);
    const bboxStr = bbox.join(',');

    // Build a union of node/way/relation queries for each tag filter, constrained
    // to the bbox. `out center` gives us a coordinate for ways/relations too.
    const clauses = [];
    for (const f of filters) {
        const [k, v] = f.split('=');
        const tag = `["${k}"="${v}"]`;
        clauses.push(`  node${tag}(${bboxStr});`);
        clauses.push(`  way${tag}(${bboxStr});`);
        clauses.push(`  relation${tag}(${bboxStr});`);
    }

    const body =
        `[out:json][timeout:${timeoutS}];\n` +
        `(\n${clauses.join('\n')}\n);\n` +
        `out center ${limit};`;

    return { endpoint: OVERPASS_ENDPOINT, body, niche, bbox };
}

// ---------------------------------------------------------------------------
// Response normalisation (pure) — overpass json -> lead records[].
// ---------------------------------------------------------------------------

/**
 * Normalise an Overpass API response body into lead records.
 *
 * Tolerant by design: missing fields degrade to empty strings rather than throw.
 * Records carry _source='osm_overpass' and _staging=true so a downstream promoter
 * can see they are unverified, un-promoted candidates (same contract spirit as _raw/).
 * Elements with no name are dropped (a nameless lead is useless).
 *
 * @param {object} body   parsed JSON from Overpass (or a fixture)
 * @param {object} [ctx]  { niche } echoed onto each record for traceability
 * @returns {object[]} lead records
 */
export function normalizeElements(body, ctx = {}) {
    const elements = Array.isArray(body?.elements) ? body.elements : [];
    const niche = String(ctx.niche ?? '');

    const out = [];
    for (const el of elements) {
        const tags = el?.tags || {};
        const name = String(tags.name ?? tags['name:ru'] ?? tags['name:en'] ?? '').trim();
        if (!name) continue;

        const phone = firstTag(tags, ['phone', 'contact:phone', 'mobile', 'contact:mobile']);
        const email = firstTag(tags, ['email', 'contact:email']);
        const website = firstTag(tags, ['website', 'contact:website', 'url', 'contact:url']);

        out.push({
            _source: 'osm_overpass',
            _staging: true,
            _promoted: false,
            osm_type: String(el?.type ?? ''),
            osm_id: el?.id ?? null,
            company_name: name,
            address: buildAddress(tags),
            rubrics: buildRubrics(tags),
            phone_public: phone,
            email_public: email,
            site_url: website,
            query_niche: niche,
            query_city: String(tags['addr:city'] ?? ''),
        });
    }
    return out;
}

function firstTag(tags, keys) {
    for (const k of keys) {
        const v = String(tags?.[k] ?? '').trim();
        if (v) return v;
    }
    return '';
}

function buildAddress(tags) {
    const parts = [
        tags['addr:city'],
        tags['addr:street'],
        tags['addr:housenumber'],
    ]
        .map((p) => String(p ?? '').trim())
        .filter(Boolean);
    return parts.join(', ');
}

function buildRubrics(tags) {
    const keys = ['shop', 'craft', 'amenity', 'office', 'healthcare', 'leisure', 'tourism', 'sport'];
    const vals = [];
    for (const k of keys) {
        const v = String(tags?.[k] ?? '').trim();
        if (v && !vals.includes(v)) vals.push(v);
    }
    return vals.join(', ');
}

// ---------------------------------------------------------------------------
// Search orchestration: dry-run by default, live only behind a double gate.
// ---------------------------------------------------------------------------

/**
 * Run an Overpass search.
 *
 * DRY-RUN (default): no network. Returns { live:false, request, records:[] } where
 * `request.body` shows exactly the Overpass QL that WOULD be sent.
 *
 * LIVE (requires live:true AND confirm:true): performs a single POST and returns
 * { live:true, ok, request, records, raw }. NO API KEY is involved — this source
 * is keyless, which is the whole reason it exists.
 *
 * @param {object} opts
 * @param {string} opts.niche
 * @param {[number,number,number,number]} opts.bbox
 * @param {number} [opts.limit]
 * @param {boolean} [opts.live=false]
 * @param {boolean} [opts.confirm=false]
 * @param {Function} [opts.fetchImpl]  injectable fetch (tests); defaults to global fetch
 * @returns {Promise<object>}
 */
export async function searchOverpass(opts = {}) {
    const request = buildRequest({
        niche: opts.niche,
        bbox: opts.bbox,
        limit: opts.limit,
        timeoutS: opts.timeoutS,
    });
    const ctx = { niche: String(opts.niche ?? '') };

    const live = opts.live === true;
    const confirm = opts.confirm === true;

    // DOUBLE GATE: both flags required, or we never touch the network.
    if (!live || !confirm) {
        return {
            live: false,
            reason: !live ? 'dry_run_default' : 'confirm_flag_missing',
            request,
            records: [],
            note: 'No network performed. This source is KEYLESS; pass { live:true, confirm:true } to execute a single real request.',
        };
    }

    const fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        return { live: false, reason: 'no_fetch_impl', request, records: [] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
        const res = await fetchImpl(request.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
                // A descriptive UA is requested by Overpass etiquette.
                'User-Agent': 'AI_WORKSPACE-lead-research/1.0 (keyless OSM Overpass)',
            },
            body: new URLSearchParams({ data: request.body }).toString(),
            signal: controller.signal,
        });
        if (!res || !res.ok) {
            return {
                live: true,
                ok: false,
                reason: `http_${res ? res.status : 'no_response'}`,
                request,
                records: [],
            };
        }
        const body = await res.json();
        const records = normalizeElements(body, ctx);
        return { live: true, ok: true, request, records, raw: body };
    } catch (err) {
        return {
            live: true,
            ok: false,
            reason: `fetch_error:${err?.name || 'unknown'}`,
            request,
            records: [],
        };
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// CLI: dry-run by default. Live requires explicit --live --confirm flags.
//   node osm_overpass_connector.mjs --niche автосервис --bbox 45.0,38.9,45.1,39.1
//   node osm_overpass_connector.mjs --niche автосервис --bbox 45.0,38.9,45.1,39.1 --live --confirm
// ---------------------------------------------------------------------------

function parseArgv(argv) {
    const out = { live: false, confirm: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--live') out.live = true;
        else if (a === '--confirm') out.confirm = true;
        else if (a === '--niche') out.niche = argv[++i];
        else if (a === '--bbox') {
            out.bbox = String(argv[++i] ?? '')
                .split(',')
                .map((n) => Number(n.trim()));
        } else if (a === '--limit') out.limit = Number(argv[++i]);
    }
    return out;
}

const isMain = (() => {
    try {
        return process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
    } catch {
        return false;
    }
})();

if (isMain) {
    const opts = parseArgv(process.argv.slice(2));
    if (!opts.niche || !opts.bbox) {
        console.error('Usage: node osm_overpass_connector.mjs --niche "<niche>" --bbox "<south,west,north,east>" [--live --confirm]');
        process.exit(2);
    }
    searchOverpass(opts)
        .then((r) => {
            if (!r.live) {
                console.log('DRY-RUN (no network performed). KEYLESS source.');
                console.log('Would POST to:', r.request.endpoint);
                console.log('Overpass QL:\n' + r.request.body);
                if (r.reason) console.log('Reason:', r.reason);
                if (r.note) console.log(r.note);
            } else if (r.ok) {
                console.log(`LIVE OK: ${r.records.length} record(s) normalised.`);
                console.log(JSON.stringify(r.records, null, 2));
            } else {
                console.log('LIVE FAILED:', r.reason);
            }
        })
        .catch((e) => {
            console.error('Connector error:', e?.message || e);
            process.exit(1);
        });
}
