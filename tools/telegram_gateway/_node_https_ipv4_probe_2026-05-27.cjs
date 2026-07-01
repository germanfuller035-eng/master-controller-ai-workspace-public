/* Node HTTPS IPv4 probe — 2026-05-27
 * Read-only. No BOT_TOKEN used.
 * Methods:
 *   A) fetch default
 *   B) fetch after dns.setDefaultResultOrder('ipv4first')
 *   C) https.request with family:4
 *   D) https.request with explicit lookup forcing IPv4
 * Output per method: method | ok yes/no | status/error | latency_ms
 */
'use strict';
const https = require('node:https');
const dns   = require('node:dns');

const HOST = 'api.telegram.org';
const TIMEOUT_MS = 10000;

function fmt(method, ok, statusOrErr, t0) {
  const ms = Date.now() - t0;
  console.log(`method=${method} | ok=${ok ? 'yes' : 'no'} | ${ok ? 'status' : 'error'}=${statusOrErr} | latency_ms=${ms}`);
}

async function methodFetchDefault() {
  const m = 'A_fetch_default';
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(`https://${HOST}/`, { signal: ctrl.signal });
    clearTimeout(tm);
    fmt(m, true, r.status, t0);
  } catch (e) {
    fmt(m, false, (e && e.message || String(e)).slice(0, 120), t0);
  }
}

async function methodFetchIpv4First() {
  const m = 'B_fetch_ipv4first';
  const t0 = Date.now();
  try {
    if (typeof dns.setDefaultResultOrder === 'function') {
      dns.setDefaultResultOrder('ipv4first');
    }
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(`https://${HOST}/`, { signal: ctrl.signal });
    clearTimeout(tm);
    fmt(m, true, r.status, t0);
  } catch (e) {
    fmt(m, false, (e && e.message || String(e)).slice(0, 120), t0);
  }
}

function methodHttpsFamily4() {
  return new Promise((resolve) => {
    const m = 'C_https_family4';
    const t0 = Date.now();
    let done = false;
    const req = https.request({
      hostname: HOST,
      port: 443,
      path: '/',
      method: 'GET',
      family: 4,
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (done) return; done = true;
      fmt(m, true, res.statusCode, t0);
      res.resume();
      resolve();
    });
    req.on('timeout', () => {
      if (done) return; done = true;
      req.destroy(new Error('timeout'));
      fmt(m, false, 'timeout', t0);
      resolve();
    });
    req.on('error', (e) => {
      if (done) return; done = true;
      fmt(m, false, (e.message || String(e)).slice(0, 120), t0);
      resolve();
    });
    req.end();
  });
}

function methodHttpsLookupIpv4() {
  return new Promise((resolve) => {
    const m = 'D_https_lookup_ipv4';
    const t0 = Date.now();
    let done = false;
    const lookup = (hostname, options, cb) => {
      // Force A records only
      dns.lookup(hostname, { family: 4 }, cb);
    };
    const req = https.request({
      hostname: HOST,
      port: 443,
      path: '/',
      method: 'GET',
      lookup,
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (done) return; done = true;
      fmt(m, true, res.statusCode, t0);
      res.resume();
      resolve();
    });
    req.on('timeout', () => {
      if (done) return; done = true;
      req.destroy(new Error('timeout'));
      fmt(m, false, 'timeout', t0);
      resolve();
    });
    req.on('error', (e) => {
      if (done) return; done = true;
      fmt(m, false, (e.message || String(e)).slice(0, 120), t0);
      resolve();
    });
    req.end();
  });
}

(async () => {
  console.log(`probe_start host=${HOST} timeout_ms=${TIMEOUT_MS} node=${process.version}`);
  await methodFetchDefault();
  await methodFetchIpv4First();
  await methodHttpsFamily4();
  await methodHttpsLookupIpv4();
  console.log('probe_end');
})();
