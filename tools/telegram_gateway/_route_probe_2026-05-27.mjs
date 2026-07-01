// Probes Telegram API via direct + HTTP proxy + SOCKS proxy candidates using curl.exe.
// Never uses BOT_TOKEN. Only HEAD https://api.telegram.org/.
import { spawnSync } from 'node:child_process';

const GW = process.argv[2] || '10.72.43.143';
const TARGET = 'https://api.telegram.org/';

const candidates = [
  { label: 'direct',                              mode: 'direct' },
  { label: 'http://127.0.0.1:10809',              mode: 'http',   host: '127.0.0.1', port: 10809 },
  { label: 'http://127.0.0.1:7890',               mode: 'http',   host: '127.0.0.1', port: 7890  },
  { label: 'http://127.0.0.1:8080',               mode: 'http',   host: '127.0.0.1', port: 8080  },
  { label: 'http://127.0.0.1:2080',               mode: 'http',   host: '127.0.0.1', port: 2080  },
  { label: `http://${GW}:10809`,                  mode: 'http',   host: GW,          port: 10809 },
  { label: `http://${GW}:7890`,                   mode: 'http',   host: GW,          port: 7890  },
  { label: `http://${GW}:8080`,                   mode: 'http',   host: GW,          port: 8080  },
  { label: `http://${GW}:2080`,                   mode: 'http',   host: GW,          port: 2080  },
  { label: 'socks5://127.0.0.1:10808',            mode: 'socks5', host: '127.0.0.1', port: 10808 },
  { label: 'socks5://127.0.0.1:7891',             mode: 'socks5', host: '127.0.0.1', port: 7891  },
  { label: 'socks5://127.0.0.1:2081',             mode: 'socks5', host: '127.0.0.1', port: 2081  },
  { label: `socks5://${GW}:10808`,                mode: 'socks5', host: GW,          port: 10808 },
  { label: `socks5://${GW}:7891`,                 mode: 'socks5', host: GW,          port: 7891  },
  { label: `socks5://${GW}:2081`,                 mode: 'socks5', host: GW,          port: 2081  },
];

const results = [];
for (const c of candidates) {
  const args = ['-s', '-o', 'NUL', '-w', 'HTTP_CODE=%{http_code}', '--max-time', '10', '-I', TARGET];
  if (c.mode === 'http')   args.unshift('-x', `http://${c.host}:${c.port}`);
  if (c.mode === 'socks5') args.unshift('--socks5-hostname', `${c.host}:${c.port}`);

  const t0 = Date.now();
  const r = spawnSync('curl.exe', args, { encoding: 'utf8', timeout: 15000 });
  const ms = Date.now() - t0;
  const exit = r.status;
  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();

  let ok = false, code = '';
  const m = stdout.match(/HTTP_CODE=(\d+)/);
  if (m) { code = m[1]; ok = (m[1] !== '000'); }

  const status = ok ? `OK http=${code}` : `FAIL exit=${exit} http=${code || '000'}`;
  const detail = (stderr || stdout).replace(/\s+/g, ' ').slice(0, 160);
  const line = `ROUTE=${c.label.padEnd(38)} ${status.padEnd(22)} lat=${ms}ms ${detail}`;
  console.log(line);
  results.push({ route: c.label, ok, code, exit, latency_ms: ms, detail });
}

const working = results.filter(r => r.ok);
console.log('\n---SUMMARY---');
console.log('direct_ok=' + (results[0].ok ? 'yes' : 'no'));
console.log('working_routes=' + (working.length ? working.map(w => w.route).join(', ') : 'NONE'));
