// tools/executive_os/lib/reports.mjs
// Phase 30-31: Executive Report Factory + Owner Command Center. INTERNAL_OWNER_ONLY. No sending.

export const REPORT_TYPES = [
  'daily_owner_brief', 'weekly_operating_review', 'monthly_business_review', 'quarterly_planning_packet',
  'decision_packet', 'risk_summary', 'portfolio_summary', 'executive_kpi_summary', 'resource_allocation',
  'exception_summary', 'continuity_report',
];

export function buildReport(type, data, opts = {}) {
  if (!REPORT_TYPES.includes(type)) return { ok: false, error: `unknown report type ${type}` };
  const json = { schema: 'executive_os.report.v1', type, label: 'INTERNAL_OWNER_ONLY', send_allowed: false, generated_ts: opts.ts || 'UNSTAMPED', data };
  return { ok: true, json, markdown: renderMd(type, data), html: opts.html ? renderHtml(type, data) : null };
}

// Phase 31: Owner Command Center — references domain dashboards, never copies them.
export function ownerCommandCenter(ctx) {
  return {
    schema: 'executive_os.owner_command_center.v1',
    label: 'INTERNAL_OWNER_ONLY',
    note: 'Single command center. References domain dashboards (does NOT duplicate them).',
    sections: {
      system_health: ctx.system_health || 'soak in progress (FREEZE)',
      current_release_soak: ctx.release || 'v0.4.0-rc1 no-send soak',
      primary_owner_action: ctx.primary_action || 'wait for soak / confirm capacity',
      decision_queue: ctx.decision_summary || 'see decision queue (8 ready, 11 needs-data)',
      portfolio_ranking: ctx.portfolio_top || 'see prioritization (mini_audit FOCUS_NOW)',
      revenue: '-> [[09_dashboards/revenue_command_dashboard]]',
      delivery: '-> [[09_dashboards/delivery_dashboard]]',
      finance: '-> [[09_dashboards/finance_dashboard]]',
      capacity: ctx.capacity || 'UNKNOWN (owner input needed)',
      critical_risks: ctx.critical_risks || [],
      external_blockers: ctx.external_blockers || ['soak completion'],
      ai_work: ctx.ai_work || [],
      waiting_items: ctx.waiting || ['production changes (soak)', 'proposed docs apply (post-soak)'],
      proposed_next_milestone: ctx.next_milestone || 'soak close -> owner acceptance -> first commercial cycle (approval-gated)',
    },
    references: {
      operations: '[[09_dashboards/ai_operations_dashboard]]',
      portfolio: '[[09_dashboards/project_portfolio_dashboard]]',
      revenue: '[[09_dashboards/revenue_command_dashboard]]',
      delivery: '[[09_dashboards/delivery_owner_command_center]]',
      finance: '[[09_dashboards/finance_owner_command_center]]',
    },
  };
}

function renderMd(type, data) {
  const L = [`# ${type.replace(/_/g, ' ')}`, '', '> INTERNAL_OWNER_ONLY · send_allowed=false', ''];
  if (Array.isArray(data)) data.slice(0, 100).forEach((r) => L.push(`- ${typeof r === 'object' ? JSON.stringify(r) : r}`));
  else if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) L.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return L.join('\n');
}
function renderHtml(type, data) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${type}</title></head><body><div style="border:2px solid #36c;padding:4px">INTERNAL_OWNER_ONLY · no send</div><pre>${JSON.stringify(data, null, 2).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre></body></html>`;
}
