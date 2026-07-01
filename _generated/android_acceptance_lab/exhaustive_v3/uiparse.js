#!/usr/bin/env node
// uiparse.js — parse uiautomator XML. Modes:
//   <file>                      -> print summary: texts + resource-ids + clickable nodes
//   <file> center-rid <rid>     -> print "cx cy" center of node whose resource-id ends with rid
//   <file> center-text <txt>    -> print "cx cy" center of node whose text contains txt
//   <file> find <rid>           -> print bounds+attrs of matching node(s)
const fs = require('fs');
const file = process.argv[2];
const mode = process.argv[3];
const sel = process.argv[4];
const xml = fs.readFileSync(file, 'utf8');

// crude node extraction: each <node .../> or <node ...>
const nodes = [];
const re = /<node\b([^>]*?)\/?>/g;
let m;
while ((m = re.exec(xml)) !== null) {
  const attrs = {};
  const ar = /(\w[\w-]*)="([^"]*)"/g;
  let a;
  while ((a = ar.exec(m[1])) !== null) attrs[a[1]] = a[2];
  nodes.push(attrs);
}
function center(b) {
  const mm = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(b || '');
  if (!mm) return null;
  const x = Math.round((+mm[1] + +mm[3]) / 2);
  const y = Math.round((+mm[2] + +mm[4]) / 2);
  return [x, y, +mm[1], +mm[2], +mm[3], +mm[4]];
}
if (mode === 'center-rid') {
  const n = nodes.find(n => (n['resource-id'] || '').split('/').pop() === sel || (n['resource-id'] || '') === sel);
  if (n) { const c = center(n.bounds); if (c) console.log(c[0], c[1]); }
  process.exit(0);
}
if (mode === 'center-text') {
  const n = nodes.find(n => (n.text || '').includes(sel));
  if (n) { const c = center(n.bounds); if (c) console.log(c[0], c[1]); }
  process.exit(0);
}
if (mode === 'find') {
  for (const n of nodes) {
    const rid = (n['resource-id'] || '');
    if (rid.split('/').pop() === sel || rid.includes(sel)) {
      const c = center(n.bounds);
      console.log(`rid=${rid} text="${n.text||''}" enabled=${n.enabled} clickable=${n.clickable} bounds=${n.bounds} ${c?('center='+c[0]+','+c[1]+' h='+(c[5]-c[3])):''}`);
    }
  }
  process.exit(0);
}
// summary
const texts = [...new Set(nodes.map(n => n.text).filter(Boolean))];
const rids = [...new Set(nodes.map(n => (n['resource-id']||'').split('/').pop()).filter(Boolean))];
const clickable = nodes.filter(n => n.clickable === 'true' && (n['resource-id'] || n.text));
console.log('TEXTS: ' + texts.slice(0, 60).join(' | '));
console.log('RIDS: ' + rids.slice(0, 60).join(' | '));
console.log('CLICKABLE: ' + clickable.map(n => (n['resource-id']||'').split('/').pop() || ('"'+(n.text||'').slice(0,20)+'"')).slice(0, 40).join(' | '));
