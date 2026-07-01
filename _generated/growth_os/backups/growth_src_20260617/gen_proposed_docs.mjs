#!/usr/bin/env node
// tools/growth_os/gen_proposed_docs.mjs — generates proposed canonical docs (MP37). Read-only.
// Writes ONLY under docs_canonical_proposed/. Does NOT apply. Owner applies post-review.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'docs_canonical_proposed');
const SUB = '12_growth_os';

const DOCS = [
  ['growth_os_command_center.md', 'Growth OS — Canonical Note', '07_revenue_os/growth_os_command_center.md', 'Growth & Marketing OS is a demand-generation PLANNING layer over the full OS chain. It owns segmentation, ICP, positioning, channel/campaign/content/SEO/landing/lead-magnet definitions, campaign economics proposals, experiment backlog, nurture/partner/referral strategy, and the controlled-cycle runbook. It NEVER stores canonical leads, runs discovery, sends, publishes, installs tracking, creates ads, mutates catalog/price/status, or treats synthetic outcomes as real.'],
  ['market_segmentation_standard.md', 'Market Segmentation Standard', '12_growth_os/market_segmentation_standard.md', 'Segments across industry/region/size/digital-maturity/urgency/contactability/product-fit/delivery-complexity/financial-viability/support-risk. Digital maturity reuses the upstream Product/Revenue model. Market sizes are NOT invented; priority derives from product readiness + evidence.'],
  ['icp_standard.md', 'ICP Standard', '12_growth_os/icp_standard.md', 'ICP per product with must-have/disqualifiers/pain/urgency/ability-to-pay/delivery-fit/support-fit/evidence/channel-fit. READY_TO_MARKET requires Revenue state=ACTIVE + owner-approved price. Currently only mini_audit qualifies.'],
  ['positioning_standard.md', 'Positioning Standard', '12_growth_os/positioning_standard.md', 'Positioning per product: category/problem/alternatives/differentiation/value-prop/proof/limitations/claims/prohibited-claims. Mini Audit = evidence-backed findings at 10000 RUB, not redesign/implementation/guaranteed growth.'],
  ['channel_strategy.md', 'Channel Strategy', '12_growth_os/channel_strategy.md', 'Owned/earned/inbound/outbound/paid-future channels with entry criteria, cost, capacity, risk, permissions, measurement, readiness, stop criteria. No channel is activated. Outbound routes via Conversation Hub.'],
  ['content_strategy.md', 'Content Strategy', '12_growth_os/content_strategy.md', '9 pillars, 12 formats, week-relative 30/60/90 plan. No publication, no fabricated cases.'],
  ['seo_planning_policy.md', 'SEO Planning Policy', '12_growth_os/seo_planning_policy.md', 'Offline topic clusters + intents. Volumes never invented (UNKNOWN/EXTERNAL_DATA_REQUIRED/OWNER_ESTIMATE). Future DataForSEO/Yandex contracts; no credentials, no live calls.'],
  ['local_presence_strategy.md', 'Local Presence Strategy', '12_growth_os/local_presence_strategy.md', 'Strategy for no-site/maps-only/directory-only/social-only/weak-presence businesses. Checklists + roadmaps only; no profile creation or directory mutation.'],
  ['landing_standard.md', 'Landing Standard', '12_growth_os/landing_standard.md', 'Landing specs: audience/problem/outcome/evidence/scope/exclusions/process/price-status/CTA/privacy/measurement/readiness. Markdown/JSON/optional static HTML preview only — no publication, no tracking, no production forms.'],
  ['lead_magnet_policy.md', 'Lead Magnet Policy', '12_growth_os/lead_magnet_policy.md', 'Lead magnets tied to real problems + product routes. No download page published. Follow-up is consent-aware.'],
  ['outbound_campaign_policy.md', 'Outbound Campaign Policy', '12_growth_os/outbound_campaign_policy.md', 'Outbound campaigns are draft-only with eligibility/evidence thresholds, daily limit proposal, owner approval per message, follow-up policy, stop criteria. No send; synthetic recipients; routes via Conversation Hub.'],
  ['nurture_policy.md', 'Nurture Policy', '12_growth_os/nurture_policy.md', 'Consent-aware nurture states. Opt-out terminal for commercial nurture. No auto-nurture without consent. Support + customer success separate from marketing.'],
  ['partnership_policy.md', 'Partnership Policy', '12_growth_os/partnership_policy.md', 'Partner categories with mutual value, conflict risk, referral terms, privacy, lead ownership, approval. No real partner contact.'],
  ['referral_policy.md', 'Referral Policy', '12_growth_os/referral_policy.md', 'Referral eligibility (accepted project + positive evidence + no critical support + permission + owner approval + timing). No automatic requests.'],
  ['social_proof_policy.md', 'Social Proof Policy', '12_growth_os/social_proof_policy.md', 'Social proof requires source/evidence/permission/restrictions/expiry/relevance. Permission never inferred from positive feedback. No publication.'],
  ['campaign_readiness_gate.md', 'Campaign Readiness Gate', '12_growth_os/campaign_readiness_gate.md', '13 conditions gate READY. ACTIVE prohibited this task. Statuses IDEA..COMPLETED.'],
  ['campaign_economics.md', 'Campaign Economics', '12_growth_os/campaign_economics.md', 'Cost per candidate/verified/reply/opportunity/win, gross-per-win, break-even, capacity ceiling. Every value confidence-tagged; send is never a result; nothing estimated marked CONFIRMED.'],
  ['experiment_backlog.md', 'Experiment Backlog', '12_growth_os/experiment_backlog.md', 'Experiments for positioning/subject/offer/CTA/routing/landing/magnet/follow-up. Max status READY; RUNNING prohibited; governed by Analytics OS.'],
  ['controlled_commercial_cycle_runbook.md', 'Controlled Commercial Cycle Runbook', '12_growth_os/controlled_commercial_cycle_runbook.md', 'Future runbook on Analytics measurement plan. Preconditions (freeze lifted, owner approval, product/price/capacity/support/measurement/opt-out/rollback ready). Hard-stop conditions defined. Not executed.'],
  ['growth_dashboard.md', 'Growth Dashboard', '09_dashboards/growth_dashboard.md', 'Segments/ICP/product-market/channel/campaign readiness, content backlog, SEO, magnets, partnerships, referrals, social proof, experiments, economics, owner decisions, blockers. References Revenue/Analytics; no duplication.'],
  ['owner_growth_command_center.md', 'Owner Growth Command Center', '09_dashboards/owner_growth_command_center.md', 'Compact owner view: priority segment/product, campaign closest to ready, missing decisions/price, capacity blocker, claim/asset approval, next safe action, intentionally-not-launched items.'],
  ['integration_contracts.md', 'Integration Contracts', '12_growth_os/integration_contracts.md', 'Contracts with AI HQ, Revenue, Product, Delivery, Finance, Customer Success, Analytics, Executive, Lead Hunter (future), Master Controller (propose-only), Conversation Hub (send-only-future). Growth never sends or promotes leads.'],
  ['source_of_truth_extension.md', 'Source of Truth Extension', '12_growth_os/source_of_truth_extension.md', 'Growth OS owns segmentation/ICP/positioning/campaign/content definitions only. Leads -> Master Controller; catalog/price -> Revenue; readiness/claims -> Product; metrics/experiments -> Analytics; send -> Conversation Hub.'],
  ['what_already_exists_links.md', 'WHAT_ALREADY_EXISTS + AI System Map Links', '12_growth_os/what_already_exists_links.md', 'Growth OS adds segmentation, ICP, positioning, channels, content, SEO, local presence, landings, lead magnets, demand capture, campaigns, nurture, partner/referral/social proof, readiness gate, economics, experiment backlog, controlled-cycle runbook, dashboard, owner center. Links: tools/growth_os/, _generated/growth_os/. Also fixed AI HQ context_pack staleness defect.'],
];

mkdirSync(path.join(ROOT, SUB), { recursive: true });
let count = 0;
for (const [file, title, target, body] of DOCS) {
  const dir = target.includes('/') ? path.dirname(target) : SUB;
  mkdirSync(path.join(ROOT, dir), { recursive: true });
  const md = `---\ncanonical_target: ${target}\nrelated_project: growth-os\nstatus: PROPOSED_NOT_APPLIED\nsynthetic: true\n---\n\n# ${title}\n\n${body}\n\n> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.\n`;
  writeFileSync(path.join(ROOT, dir, file), md);
  count++;
}
console.log(`[gen-proposed-docs] wrote ${count} growth proposed docs under docs_canonical_proposed/`);
