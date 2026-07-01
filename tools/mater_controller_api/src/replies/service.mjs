// replies/service.mjs
// Read-only Replies service for the Master Controller API. REUSES the canonical
// reply state/classifier (tools/telegram_gateway/reply_monitor.mjs). It does NOT
// send, does NOT auto-reply, and does NOT mutate lead state. Reply ingestion
// (IMAP → logReply) happens in the worker/CLI path, not here.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORKSPACE } from '../shared/config.mjs';

const GW = path.join(WORKSPACE, 'tools', 'telegram_gateway');
const fileUrl = (name) => pathToFileURL(path.join(GW, name)).href;

const rm = await import(fileUrl('reply_monitor.mjs'));
const { openReplies, reduceState, getReply, CAT_INTERESTED, CAT_NOT_INTERESTED, CAT_BOUNCE } = rm;

// Map an internal reply record to a safe API DTO (no raw secrets; bounded text).
function replyDto(r) {
    return {
        replyId: r.reply_id,
        leadId: r.lead_id,
        company: r.company || r.lead_id,
        from: r.from || null,
        subject: r.subject || null,
        category: r.category,
        suggested: r.suggested,
        optout: !!r.optout,
        signals: r.signals || [],
        status: r.status,
        receivedAt: r.received_at || null,
        // text is bounded; replies are owner-only data but we cap to avoid huge payloads
        text: (r.text || '').slice(0, 4000),
        matchMethod: r.match_method || null,
        matchConfidence: r.match_confidence || null,
    };
}

// All replies (newest first), optionally filtered by category/status.
export function listReplies({ category = null, status = null } = {}) {
    const { replies } = reduceState();
    let rows = [...replies.values()];
    if (status) rows = rows.filter((r) => r.status === status);
    if (category) rows = rows.filter((r) => r.category === category);
    rows.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
    return { items: rows.map(replyDto), total: rows.length };
}

// Open (un-handled) replies — the owner review queue.
export function listOpenReplies() {
    return { items: openReplies().map(replyDto), total: openReplies().length };
}

export function getReplyDetail(replyId) {
    const r = getReply(replyId);
    return r ? replyDto(r) : null;
}

// Counts for the Android "Replies" tab badges.
export function replyCounts() {
    const { replies } = reduceState();
    const rows = [...replies.values()];
    const c = { total: rows.length, new: 0, interested: 0, not_interested: 0, bounce: 0, unmatched: 0 };
    for (const r of rows) {
        if (r.status === 'new') c.new++;
        if (r.category === CAT_INTERESTED) c.interested++;
        if (r.category === CAT_NOT_INTERESTED) c.not_interested++;
        if (r.category === CAT_BOUNCE) c.bounce++;
        if (!r.lead_id) c.unmatched++;
    }
    return c;
}

export default { listReplies, listOpenReplies, getReplyDetail, replyCounts };
