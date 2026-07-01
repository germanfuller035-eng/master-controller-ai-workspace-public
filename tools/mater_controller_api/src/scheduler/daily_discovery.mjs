#!/usr/bin/env node
// scheduler/daily_discovery.mjs — enqueues LEAD_DISCOVERY jobs via the API.
// RUNS_PER_DAY=2: idempotent per (calendar day, slot) so a missed-run catch-up or a
// double timer fire never creates duplicate jobs for the same slot. Two timer fires
// per day (am/pm) yield two distinct jobs. Honors a pause flag and backpressure.
// No canonical FS access, no send. Runs as the worker user via systemd timer.
import process from "node:process";

const API_BASE = process.env.MATER_API_BASE || "http://127.0.0.1:8787/api/v1";
const TOKEN = process.env.MATER_WORKER_TOKEN || "";
// Discovery search config — region bbox + niches, comma-separated niches rotated by day+slot.
const BBOX = (process.env.MC_DISCOVERY_BBOX || "44.95,38.85,45.15,39.10").split(",").map(Number);
const NICHES = (process.env.MC_DISCOVERY_NICHES || "construction,shop=doityourself,shop=hardware,craft=metal_construction,shop=trade").split(",").map((s) => s.trim()).filter(Boolean);
const DAILY_LIMIT = Number(process.env.DAILY_CANDIDATE_LIMIT || 20);
const PAUSE = process.env.MC_DISCOVERY_PAUSED === "true";

if (!TOKEN) { console.error("SCHED_FATAL: MATER_WORKER_TOKEN missing"); process.exit(1); }

async function api(path, method = "POST", body = null) {
    const res = await fetch(API_BASE + path, {
        method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null; try { data = await res.json(); } catch { /* noop */ }
    return { status: res.status, data };
}

function nowUtc() { return new Date(); }

(async () => {
    if (PAUSE) { console.log("SCHED_PAUSED reason=MC_DISCOVERY_PAUSED"); process.exit(0); }
    // backpressure: do not schedule if staging is already at/over capacity
    const counts = await api("/pipeline/counts", "GET");
    const staging = counts.data?.data?.STAGING || 0;
    const maxStaging = Number(process.env.MAX_PENDING_STAGING || 50);
    if (staging >= maxStaging) { console.log(`SCHED_SKIP reason=BACKPRESSURE_STAGING staging=${staging}>=${maxStaging}`); process.exit(0); }

    const d = nowUtc();
    const day = d.toISOString().slice(0, 10); // YYYY-MM-DD
    // slot derived from UTC hour: two timer fires/day (am/pm) -> two distinct idempotent jobs
    const slot = (process.env.MC_DISCOVERY_SLOT || (d.getUTCHours() < 12 ? "am" : "pm"));
    // rotate niche by (day-of-month, slot) so runs vary but are deterministic per slot
    const dom = Number(day.slice(8, 10));
    const slotOffset = slot === "pm" ? 1 : 0;
    const niche = NICHES[(dom + slotOffset) % NICHES.length];
    const r = await api("/jobs/enqueue", "POST", {
        jobType: "LEAD_DISCOVERY",
        idempotencyKey: `daily-discovery:${day}:${slot}`, // ONE per (day, slot)
        payload: { niche, bbox: BBOX, limit: DAILY_LIMIT, region: process.env.MC_DISCOVERY_REGION || null },
    });
    if (r.status !== 200) { console.log(`SCHED_ENQUEUE_FAIL status=${r.status}`); process.exit(1); }
    const idem = r.data?.data?.idempotent;
    console.log(`SCHED_OK day=${day} slot=${slot} niche=${niche} idempotent=${idem} job=${r.data?.data?.job?.job_id || "-"}`);

    // Reconciler: keep the owner approval queue topped up. Enqueue FIRST_TOUCH_DRAFT_GENERATE for every
    // currently pilot-eligible lead so even pre-existing eligible leads (that never re-ran through audit)
    // get a no-send package. The job + generateDraft are both idempotent, so this never duplicates a
    // draft and is a no-op once the queue is full. Best-effort: a failure here never breaks discovery.
    try {
        const cand = await api("/first-touch/candidates", "GET");
        const eligible = (cand.data?.data?.top_5 || []).map((x) => x.lead_id).filter(Boolean);
        let queued = 0;
        for (const leadId of eligible) {
            const e = await api("/jobs/enqueue", "POST", {
                jobType: "FIRST_TOUCH_DRAFT_GENERATE", entityType: "lead", entityId: leadId,
                payload: { leadId }, idempotencyKey: `ftdraft:${leadId}`,
            });
            if (e.status === 200) queued++;
        }
        console.log(`SCHED_QUEUE_RECONCILE eligible=${eligible.length} enqueued=${queued}`);
    } catch (e) { console.log(`SCHED_QUEUE_RECONCILE_SKIP reason=${String(e.message || e).slice(0, 80)}`); }

    process.exit(0);
})().catch((e) => { console.error("SCHED_ERR", String(e.message || e).slice(0, 160)); process.exit(1); });
