#!/usr/bin/env node
// tools/ai_hq/tests/safety.test.mjs
// Safety/invariant tests: no production path writes, no send path, no VPS calls, determinism.
// Static + behavioral checks. Run: node tools/ai_hq/tests/safety.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TOOLS = path.join(ROOT, 'tools/ai_hq');

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const toolFiles = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.mjs'));
const allSource = toolFiles.map((f) => fs.readFileSync(path.join(TOOLS, f), 'utf8')).join('\n');
const libSource = fs.readdirSync(path.join(TOOLS, 'lib')).map((f) => fs.readFileSync(path.join(TOOLS, 'lib', f), 'utf8')).join('\n');

console.log('[test] safety invariants');

// No tool performs network calls (no http/https/fetch/net imports for sending).
{
  const net = /(require\(['"](https?|net|tls|dgram)['"]\)|from ['"]node:(https?|net|tls)['"]|\bfetch\s*\()/.test(allSource + libSource);
  ok('no network/send primitives in tools', !net);
}
// No SSH / ssh2 / scp / VPS IP usage.
{
  const ssh = /(ssh2|\bscp\b|\bssh\b\s|195\.96\.132\.82)/.test(allSource + libSource);
  ok('no SSH/VPS host references', !ssh);
}
// No SMTP / nodemailer / actual send operations. (Scan for send CALLS, not the word in regex/docs.)
{
  const smtp = /(nodemailer|createTransport|\.sendMail\s*\(|sendApprovedMessage\s*\(|allowRealSend\s*=\s*true)/i.test(allSource + libSource);
  ok('no SMTP/send operations in tools', !smtp);
}
// No writes outside _generated / docs_canonical_proposed (no fs.write into protected prod paths literal).
{
  const badWrite = /writeFileSync\([^)]*tools\/(telegram_gateway|mater_controller_api|master_controller)/.test(allSource);
  ok('no writes targeting production tool dirs', !badWrite);
}
// Tools do not call Date.now()/Math.random()/new Date() argless (determinism/resume-safety).
{
  // allow new Date(<arg>) but flag argless new Date() and Date.now()/Math.random()
  const nondet = /(Date\.now\(\)|Math\.random\(\)|new Date\(\s*\))/.test(allSource);
  ok('tools deterministic (no Date.now/Math.random/argless new Date)', !nondet);
}
// Redaction lib actually strips a telegram token.
{
  const mod = pathToFileURL(path.join(TOOLS, 'lib/redact.mjs')).href;
  const r = execFileSync('node', ['--input-type=module', '-e', `import('${mod}').then(m=>{const{text,hits}=m.redactString('TELEGRAM_BOT_TOKEN=123456789:AAFakeTokenValueForTesting_abcdefghij12345');console.log(JSON.stringify({leak:/AAFakeToken/.test(text),hits:hits.length}))})`], { encoding: 'utf8' });
  const parsed = JSON.parse(r.trim());
  ok('redact strips telegram token', !parsed.leak && parsed.hits > 0);
}
// Generated context packs contain freeze safety + no live-send enable.
{
  const cpDir = path.join(ROOT, '_generated/ai_hq/context_packs');
  let bad = false;
  if (fs.existsSync(cpDir)) {
    const stack = [cpDir];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.endsWith('.md') && /allowRealSend\s*=\s*true|SEND_ALLOWED_LIVE=ON/.test(fs.readFileSync(p, 'utf8'))) bad = true;
      }
    }
  }
  ok('no context pack enables live send', !bad);
}
// file_intake refuses --apply.
{
  let code = 0;
  try { execFileSync('node', [path.join(TOOLS, 'file_intake.mjs'), '--incoming', path.join(TOOLS, 'fixtures/incoming'), '--apply'], { stdio: 'ignore' }); }
  catch (e) { code = e.status; }
  ok('file_intake --apply refused (exit 3)', code === 3, `code=${code}`);
}

console.log(`\n[test] safety: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
