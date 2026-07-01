/**
 * _node_https_ipv4_probe_2026-05-29.cjs
 * Read-only Node transport diagnosis. NO BOT_TOKEN used.
 * Methods:
 *   A) Node fetch default
 *   B) Node fetch after dns.setDefaultResultOrder('ipv4first')
 *   C) built-in https.request with family:4
 *   D) built-in https.request with custom IPv4 lookup
 * Output: method | ok | status/error | latency
 */
const https = require('https');
const dns = require('dns');
const URL = 'https://api.telegram.org/';
const HOST = 'api.telegram.org';

function out(method, ok, statusOrErr, latency) {
    console.log(`method=${method} ok=${ok ? 'yes' : 'no'} ${ok ? 'status' : 'error'}=${statusOrErr} latency=${latency}ms`);
}

async function fetchDefault() {
    const t = Date.now();
    try {
        const r = await fetch(URL, { method: 'GET' });
        out('A_node_fetch_default', true, r.status, Date.now() - t);
    } catch (e) {
        out('A_node_fetch_default', false, (e && e.message ? e.message : String(e)).substring(0, 80), Date.now() - t);
    }
}

async function fetchIPv4First() {
    const t = Date.now();
    try {
        dns.setDefaultResultOrder('ipv4first');
        const r = await fetch(URL, { method: 'GET' });
        out('B_node_fetch_ipv4first', true, r.status, Date.now() - t);
    } catch (e) {
        out('B_node_fetch_ipv4first', false, (e && e.message ? e.message : String(e)).substring(0, 80), Date.now() - t);
    }
}

function httpsFamily4() {
    return new Promise((resolve) => {
        const t = Date.now();
        const req = https.request({
            hostname: HOST, port: 443, path: '/', method: 'GET',
            family: 4, timeout: 12000,
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                out('C_https_family4', true, res.statusCode, Date.now() - t);
                resolve();
            });
        });
        req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
        req.on('error', (e) => {
            out('C_https_family4', false, (e && e.message ? e.message : String(e)).substring(0, 80), Date.now() - t);
            resolve();
        });
        req.end();
    });
}

function httpsCustomLookupIPv4() {
    return new Promise((resolve) => {
        const t = Date.now();
        const req = https.request({
            hostname: HOST, port: 443, path: '/', method: 'GET',
            family: 4,
            lookup: (h, _o, cb) => dns.lookup(h, { family: 4 }, cb),
            timeout: 12000,
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                out('D_https_custom_lookup_ipv4', true, res.statusCode, Date.now() - t);
                resolve();
            });
        });
        req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
        req.on('error', (e) => {
            out('D_https_custom_lookup_ipv4', false, (e && e.message ? e.message : String(e)).substring(0, 80), Date.now() - t);
            resolve();
        });
        req.end();
    });
}

(async () => {
    await fetchDefault();
    await fetchIPv4First();
    await httpsFamily4();
    await httpsCustomLookupIPv4();
})();
