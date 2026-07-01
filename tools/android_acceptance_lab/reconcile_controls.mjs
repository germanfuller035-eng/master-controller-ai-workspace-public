// reconcile_controls.mjs — merge static source inventory + runtime semantic inventory into the
// reconciled control registry. Static is authoritative for "what exists in code"; runtime confirms
// "what was observed live". Emits RECONCILED_CONTROL_INVENTORY.json + .md.
import fs from 'node:fs';
import path from 'node:path';

const DIR = '_generated/android_acceptance_lab/exhaustive';
const stat = JSON.parse(fs.readFileSync(path.join(DIR, 'STATIC_CONTROL_INVENTORY.json'), 'utf8'));
let runtime = { controls: [], total_runtime_controls: 0, screens_walked: [] };
try { runtime = JSON.parse(fs.readFileSync(path.join(DIR, 'RUNTIME_CONTROL_INVENTORY.json'), 'utf8')); } catch { /* runtime optional */ }

// Risk classification heuristic from text/type.
function riskOf(c) {
    const t = (c.visible_text || c.line_excerpt || '').toLowerCase();
    if (/отправ|send|оплат|payment|счёт|invoice|удал|delete|suppress|цен|price|отвязать|unpair/.test(t)) return 'DANGEROUS';
    if (c.control_type === 'OutlinedTextField' || c.control_type === 'TextField') return 'INPUT';
    if (c.control_type === 'Switch' || c.control_type === 'Checkbox' || c.control_type === 'RadioButton') return 'TOGGLE';
    if (c.control_type === 'FilterChip' || c.control_type === 'Tab') return 'SELECT';
    if (c.control_type === 'AssistChip') return 'DECORATIVE_OR_STATUS';
    if (c.control_type === 'NavigationBarItem' || c.control_type === 'SectionCard') return 'NAVIGATION';
    if (/обновить|refresh|повтор|retry/.test(t)) return 'REFRESH';
    return 'ACTION';
}

// A control is selectable for automation if it has a static testTag OR a stable visible_text/desc.
function selector(c) {
    if (c.test_tag) return { kind: 'testTag', value: c.test_tag };
    if (c.visible_text) return { kind: 'text', value: c.visible_text };
    return { kind: 'NONE', value: null };
}

const reconciled = stat.controls.map((c) => {
    const sel = selector(c);
    return {
        control_id: c.control_id,
        control_type: c.control_type,
        source_file: c.source_file,
        source_line: c.source_line,
        screen_route: c.screen_route,
        test_tag: c.test_tag,
        visible_text: c.visible_text,
        selector_kind: sel.kind,
        selector_value: sel.value,
        risk_class: riskOf(c),
        selectable_for_automation: sel.kind !== 'NONE',
        observed_runtime: false, // set below by best-effort text match
        test_case_id: 'TC-' + c.control_id.split('-')[1],
    };
});

// best-effort runtime correlation by visible text
const runtimeTexts = new Set((runtime.controls || []).map((r) => (r.text || '').trim()).filter(Boolean));
for (const r of reconciled) { if (r.visible_text && runtimeTexts.has(r.visible_text.trim())) r.observed_runtime = true; }

const needTag = reconciled.filter((r) => r.selector_kind === 'NONE');
const byRisk = {};
for (const r of reconciled) byRisk[r.risk_class] = (byRisk[r.risk_class] || 0) + 1;

const result = {
    reconciled_version: 'reconciled_v2',
    static_controls: stat.total_controls,
    runtime_controls_observed: runtime.total_runtime_controls || 0,
    runtime_screens_walked: runtime.screens_walked || [],
    reconciled_total: reconciled.length,
    selectable_for_automation: reconciled.filter((r) => r.selectable_for_automation).length,
    need_selector: needTag.length,
    by_risk: byRisk,
    controls: reconciled,
};
fs.writeFileSync(path.join(DIR, 'RECONCILED_CONTROL_INVENTORY.json'), JSON.stringify(result, null, 2));

// markdown summary
let md = `# Reconciled Control Inventory (v2)\n\n`;
md += `- Static source controls: **${result.static_controls}**\n`;
md += `- Runtime controls observed (10 screens): **${result.runtime_controls_observed}**\n`;
md += `- Reconciled total: **${result.reconciled_total}**\n`;
md += `- Selectable for automation (tag or stable text): **${result.selectable_for_automation}**\n`;
md += `- Need a dedicated selector added: **${result.need_selector}**\n\n`;
md += `## By risk class\n\n| risk | count |\n|------|-------|\n`;
for (const [k, v] of Object.entries(byRisk)) md += `| ${k} | ${v} |\n`;
md += `\n## Controls needing a selector (testTag to add)\n\n`;
md += `| control_id | type | file:line | screen |\n|---|---|---|---|\n`;
for (const r of needTag) md += `| ${r.control_id} | ${r.control_type} | ${r.source_file}:${r.source_line} | ${r.screen_route} |\n`;
fs.writeFileSync(path.join(DIR, 'RECONCILED_CONTROL_INVENTORY.md'), md);

console.log(`reconciled total: ${result.reconciled_total}`);
console.log(`selectable: ${result.selectable_for_automation} | need selector: ${result.need_selector}`);
console.log('by_risk:', JSON.stringify(byRisk));
