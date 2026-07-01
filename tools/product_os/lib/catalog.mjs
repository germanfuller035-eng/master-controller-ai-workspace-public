// tools/product_os/lib/catalog.mjs
// Shared loader for Revenue catalog + Delivery playbooks (read-only). No duplication of data.
import { readFileSync, existsSync } from 'node:fs';
import { REVENUE_CATALOG, DELIVERY_PLAYBOOKS, DELIVERY_ADV_PLAYBOOKS } from './common.mjs';

let CAT = null, PB = null, ADV = null;
export function catalog() { if (!CAT) CAT = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8')); return CAT.products; }
export function product(id) { return catalog().find((p) => p.product_id === id) || null; }
export function playbooks() { if (!PB && existsSync(DELIVERY_PLAYBOOKS)) PB = JSON.parse(readFileSync(DELIVERY_PLAYBOOKS, 'utf8')).playbooks; return PB || {}; }
export function advPlaybooks() { if (!ADV && existsSync(DELIVERY_ADV_PLAYBOOKS)) ADV = JSON.parse(readFileSync(DELIVERY_ADV_PLAYBOOKS, 'utf8')); return ADV || {}; }
export function playbook(id) { return playbooks()[id] || advPlaybooks()[id] || null; }
