// mc_service.mjs — typed service wrappers over the Telegram API client. Transport stays in the
// client; these map API DTOs to Telegram view-model inputs. NO business truth here, NO fs.
export class McService {
    constructor(client) { this.c = client; }
    // ---- system / automation (read) ----
    health() { return this.c.get('/health'); }
    automationStatus() { return this.c.get('/automation/status'); }
    pipelineCounts() { return this.c.get('/pipeline/counts'); }
    jobsCounts() { return this.c.get('/jobs/counts'); }
    // ---- leads / intelligence (read) ----
    today() { return this.c.get('/mini-audit/status'); }
    nextAction() { return this.c.get('/mini-audit/next-action'); }
    leadsByStatus(status) { return this.c.get(`/pipeline/by-status/${encodeURIComponent(status)}`); }
    lead(id) { return this.c.get(`/mini-audit/leads/${encodeURIComponent(id)}`); }
    audit(id) { return this.c.get(`/mini-audit/leads/${encodeURIComponent(id)}/audit`); }
    emailPreview(id) { return this.c.get(`/mini-audit/leads/${encodeURIComponent(id)}/email-preview`); }
    replies(q = '') { return this.c.get('/replies' + (q ? `?${q}` : '')); }
    reply(id) { return this.c.get(`/replies/${encodeURIComponent(id)}`); }
    followups() { return this.c.get('/mini-audit/followups'); }
    sendUncertain() { return this.c.get('/mini-audit/send-uncertain'); }
    // ---- mutations (require op/idem) ----
    rejectDraft(approvalId, opts) { return this.c.mutate(`/mini-audit/approvals/${encodeURIComponent(approvalId)}/reject`, { reason: opts?.reason || '' }, opts); }
    deferDraft(approvalId, opts) { return this.c.mutate(`/mini-audit/approvals/${encodeURIComponent(approvalId)}/postpone`, {}, opts); }
    // approve goes through backend approval+no-send gate; sendAllowed stays OFF.
    approveDraft(approvalId, opts) { return this.c.mutate(`/mini-audit/approvals/${encodeURIComponent(approvalId)}/approve`, {}, opts); }
    setLeadStatus(id, status, opts) { return this.c.mutate(`/mini-audit/leads/${encodeURIComponent(id)}/status`, { status }, opts); }
    rejectLeadDraft(id, opts) { return this.c.mutate(`/mini-audit/leads/${encodeURIComponent(id)}/draft/reject`, { reason: opts?.reason || '' }, opts); }
}
