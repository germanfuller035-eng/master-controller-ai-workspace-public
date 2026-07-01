/**
 * costs_v1_test.mjs — Cost & Capacity Center backend scenario lab.
 *
 * OFFLINE. No network. No SMTP. No send. Pure read-model over synthetic inputs
 * (usage summary / reconciliation / settings / registries). Verifies budget folding,
 * honest UNKNOWN (money never coerced to 0), provider/source breakdown, capacity,
 * and the no-spend invariant.
 */
import fs from 'node:fs';
import path from 'node:path';

const cost = await import('../mater_controller_api/src/owner_center/cost_center.mjs');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== Cost & Capacity Center — Scenario Lab ===\n');

// Synthetic usage summary (as ai_usage_ledger.usageSummary would return).
const usageSummary = {
    total_calculated_units: 240000,
    raw_input_tokens: 'UNKNOWN', raw_output_tokens: 'UNKNOWN',
    provider_calls: 12, no_llm_tasks: 5, cache_hits: 3, escalations: 2,
    by_provider: { tokenator: 240000 }, by_model: { 'gpt-x': 240000 }, by_agent: { MINI_AUDIT: 240000 }, by_task_type: { audit: 240000 },
    estimated_money_cost: null, estimated_money_class: 'UNKNOWN', entries: 17,
};
const reconciliation = { confirmed_pre_ledger_history: 196554, total_known_usage: 436554, evidence_reference: 'rc3 LIVE_SHADOW_REPORT' };
const settings = { daily_calculated_units_limit: 300000, paid_sources_enabled: false, source_strategy: 'FREE_ONLY' };
const providerRegistry = { items: [
    { provider_id: 'tokenator', cost_class: 'paid', enabled: true, state: 'ACTIVE', key_presence: 'PRESENT' },
    { provider_id: 'openai_direct', cost_class: 'paid', enabled: false, state: 'DISABLED', key_presence: 'ABSENT' },
] };
const sourceTelemetry = { items: [
    { source_id: 'free_dir', cost_class: 'FREE', health_state: 'HEALTHY', credential_state: 'NA' },
    { source_id: 'paid_x', cost_class: 'PAID', health_state: 'CREDENTIAL_REQUIRED', credential_state: 'ABSENT' },
] };

// 1. budget state thresholds
console.log('Scenario: budget state thresholds');
check('null limit → UNKNOWN', cost.budgetState(null).level === 'UNKNOWN');
check('30% → OK', cost.budgetState(30).level === 'OK');
check('85% → WARNING', cost.budgetState(85).level === 'WARNING');
check('120% → EXCEEDED', cost.budgetState(120).level === 'EXCEEDED');

// 2. overview budget math (240000 / 300000 = 80%)
console.log('Scenario: overview budget math');
const ovr = cost.costOverview({ usageSummary, reconciliation, settings, providerRegistry, sourceTelemetry });
check('total units surfaced', ovr.total_calculated_units === 240000);
check('daily limit from settings', ovr.budget.daily_calculated_units_limit === 300000);
check('percent used = 80', ovr.budget.percent_used === 80);
check('80% → WARNING', ovr.budget.state === 'WARNING');

// 3. honest UNKNOWN for money + tokens
console.log('Scenario: honest UNKNOWN');
check('money UNKNOWN (not 0)', ovr.estimated_money_cost === 'UNKNOWN');
check('money class UNKNOWN', ovr.estimated_money_class === 'UNKNOWN');
check('raw tokens UNKNOWN preserved', ovr.raw_input_tokens === 'UNKNOWN');

// 4. money surfaced ONLY when journaled
console.log('Scenario: money surfaced when journaled');
const ovrMoney = cost.costOverview({ usageSummary: { ...usageSummary, estimated_money_cost: 12.5, estimated_money_class: 'ESTIMATE' }, settings });
check('journaled money surfaced', ovrMoney.estimated_money_cost === 12.5);
check('class ESTIMATE', ovrMoney.estimated_money_class === 'ESTIMATE');

// 5. breakdown present
console.log('Scenario: provider/model/agent breakdown');
check('by_provider', ovr.by_provider.tokenator === 240000);
check('by_model', ovr.by_model['gpt-x'] === 240000);
check('by_agent', ovr.by_agent.MINI_AUDIT === 240000);

// 6. capacity breakdown
console.log('Scenario: capacity breakdown');
check('active paid providers = 1', ovr.capacity.active_paid_providers === 1);
check('paid sources active = 0 (credential gated)', ovr.capacity.paid_sources_active === 0);
check('paid sources disabled by settings', ovr.budget.paid_sources_enabled === false);

// 7. confirmed history surfaced separately (not merged into spend-now)
console.log('Scenario: history separated');
check('pre-ledger history separate', ovr.history.confirmed_pre_ledger_units === 196554);
check('total known units', ovr.history.total_known_units === 436554);

// 8. no limit → UNKNOWN percent
console.log('Scenario: no limit configured');
const ovrNoLimit = cost.costOverview({ usageSummary, settings: { daily_calculated_units_limit: 0 } });
check('no limit → percent UNKNOWN', ovrNoLimit.budget.percent_used === 'UNKNOWN');
check('no limit → limit UNKNOWN', ovrNoLimit.budget.daily_calculated_units_limit === 'UNKNOWN');

// 9. missing inputs → UNKNOWN, never crash
console.log('Scenario: missing inputs degrade to UNKNOWN');
const ovrEmpty = cost.costOverview({});
check('empty → 0 units', ovrEmpty.total_calculated_units === 0);
check('empty → capacity UNKNOWN', ovrEmpty.capacity.providers === 'UNKNOWN');
check('empty → provider_calls UNKNOWN', ovrEmpty.provider_calls === 'UNKNOWN');

// 10. no-spend invariant
console.log('Scenario: no-spend invariant');
check('performs no payment', ovr.performs_payment === false);
check('sends nothing', ovr.sends === false);
const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'cost_center.mjs'), 'utf8');
check('no writeFile/appendFile in cost center', !/writeFileSync|appendFileSync|updateStoreWithRevision/.test(src));
check('no nodemailer/smtp in cost center', !/nodemailer|createTransport/i.test(src));

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
