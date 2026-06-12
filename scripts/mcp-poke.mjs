// E2E smoke test without Chrome: spawns the MCP server, attaches the fake
// extension, and exercises tools over real MCP stdio JSON-RPC.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = spawn('node', ['server/dist/index.js'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
let serverExitError = null;
let serverStderr = '';

server.stderr.on('data', (d) => {
  const text = d.toString();
  serverStderr = (serverStderr + text).slice(-4000);
  process.stderr.write(`[server] ${text}`);
});

let nextId = 1;
const pending = new Map();
let buf = '';
server.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, timer } = pending.get(msg.id);
      clearTimeout(timer);
      resolve(msg);
      pending.delete(msg.id);
    }
  }
});

server.on('exit', (code, signal) => {
  const detail = signal ? `signal ${signal}` : `code ${code}`;
  const stderrHint = serverStderr.trim() ? `\nServer stderr:\n${serverStderr.trim()}` : '';
  serverExitError = new Error(`server exited before completing the smoke test (${detail})${stderrHint}`);
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(serverExitError);
  }
  pending.clear();
});

function rpc(method, params) {
  if (serverExitError) return Promise.reject(serverExitError);
  const id = nextId++;
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
  });
}

function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

async function call(name, args = {}) {
  const res = await rpc('tools/call', { name, arguments: args });
  const text = res.result?.content?.[0]?.text ?? JSON.stringify(res);
  const flag = res.result?.isError ? 'TOOL-ERROR' : 'ok';
  console.log(`\n=== ${name} [${flag}] ===\n${text}`);
  return res;
}

let fakeExt;

try {
  const init = await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'mcp-poke', version: '0.0.1' },
  });
  notify('notifications/initialized');
  console.log('initialized:', init.result.serverInfo.name, init.result.serverInfo.version);

  const tools = await rpc('tools/list');
  console.log('tools:', tools.result.tools.map((t) => t.name).join(', '));

  // Before the fake extension connects: video tools must fail fast with the offline hint.
  await call('get_state');
  await call('pause');

  fakeExt = spawn('node', ['scripts/fake-extension.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  fakeExt.stdout.on('data', (d) => process.stderr.write(`[fake-ext] ${d}`));
  await new Promise((r) => setTimeout(r, 500));

  await call('save_video', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'fake practice video' });
  await call('find_videos', { query: 'fake' });
  await call('save_timestamp', { label: 'intro solo', time: '0:15', end_time: '0:42' });
  await call('save_timestamp', { label: 'verse riff' }); // no time → capture current position (42.5s)
  await call('list_timestamps');
  await call('set_speed', { rate: '0.75x' });
  await call('set_volume', { level: '+10' });
  await call('seek', { to: 'verse riff' });
  await call('play', { from: 'intro solo' });
  await call('loop_section', { label: 'intro solo', times: 3, speeds: [0.5, 0.75, 1.0] });
  await call('stop_loop');
  await call('get_state');
  await call('delete_timestamp', { label: 'verse riff' });
  await call('seek', { to: 'nonexistent label' }); // expect graceful TOOL-ERROR listing saved labels

  console.log('\nAll calls completed.');
} finally {
  fakeExt?.kill();
  server.kill();
}
