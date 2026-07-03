// E2E smoke test without Chrome: spawns the broker + TWO MCP servers, attaches the fake
// extension, and exercises tools over real MCP stdio JSON-RPC. The second server proves the
// one-to-many upgrade: each server is its own session and drives an independent video.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const root = fileURLToPath(new URL('..', import.meta.url));
// Hermetic library so the smoke test never touches the real user DB.
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'playback-smoke-'));
const childEnv = { ...process.env, PLAYBACK_MCP_DATA_DIR: dataDir };

// One broker owns the port; both servers connect to it as clients. Spawning it explicitly (rather
// than relying on a server's auto-spawn) makes lifecycle deterministic and killable in `finally`.
const broker = spawn('node', ['server/dist/broker.js'], {
  cwd: root,
  env: childEnv,
  stdio: ['ignore', 'inherit', 'inherit'],
});
await new Promise((r) => setTimeout(r, 400)); // let the broker bind the port

function makeServer(label) {
  const proc = spawn('node', ['server/dist/index.js'], {
    cwd: root,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let exitError = null;
  let stderr = '';
  proc.stderr.on('data', (d) => {
    const text = d.toString();
    stderr = (stderr + text).slice(-4000);
    process.stderr.write(`[${label}] ${text}`);
  });

  let nextId = 1;
  const pending = new Map();
  let buf = '';
  proc.stdout.on('data', (d) => {
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

  proc.on('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    const stderrHint = stderr.trim() ? `\n${label} stderr:\n${stderr.trim()}` : '';
    exitError = new Error(
      `${label} exited before completing the smoke test (${detail})${stderrHint}`,
    );
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(exitError);
    }
    pending.clear();
  });

  function rpc(method, params) {
    if (exitError) return Promise.reject(exitError);
    const id = nextId++;
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method} on ${label}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
    });
  }

  function notify(method, params) {
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async function call(name, args = {}) {
    const res = await rpc('tools/call', { name, arguments: args });
    const text = res.result?.content?.[0]?.text ?? JSON.stringify(res);
    const flag = res.result?.isError ? 'TOOL-ERROR' : 'ok';
    console.log(`\n=== [${label}] ${name} [${flag}] ===\n${text}`);
    return res;
  }

  return { proc, rpc, notify, call };
}

async function initialize(s, label) {
  const init = await s.rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'mcp-poke', version: '0.0.1' },
  });
  s.notify('notifications/initialized');
  console.log(`initialized ${label}:`, init.result.serverInfo.name, init.result.serverInfo.version);
}

const A = makeServer('server-A');
const B = makeServer('server-B');
let fakeExt;

try {
  await initialize(A, 'server-A');
  await initialize(B, 'server-B');

  const tools = await A.rpc('tools/list');
  console.log('tools:', tools.result.tools.map((t) => t.name).join(', '));

  // Before the fake extension connects: video tools must fail fast with the offline hint (both servers).
  await A.call('get_state');
  await A.call('pause');
  await B.call('get_state');

  // Security (#18): a browser web origin must be rejected at the WS handshake. Node clients
  // (the MCP bridge, the fake extension) send no Origin and are allowed; a web page sends an
  // unforgeable http/https Origin and must be turned away with a 403 (no 'open').
  const port = process.env.YT_BRIDGE_PORT ?? 8765;
  const evilAccepted = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://evil.com' });
    ws.on('open', () => {
      ws.close();
      resolve(true);
    });
    ws.on('error', () => resolve(false));
  });
  if (evilAccepted)
    throw new Error('SECURITY: broker accepted a WS connection from origin https://evil.com');
  console.log('\n=== [security] web-origin handshake rejected [ok] ===');

  fakeExt = spawn('node', ['scripts/fake-extension.mjs'], {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  fakeExt.stdout.on('data', (d) => process.stderr.write(`[fake-ext] ${d}`));
  await new Promise((r) => setTimeout(r, 800)); // let the extension connect + broker broadcast online

  // Full tool suite against server A (its own session / default video).
  await A.call('save_video', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'fake practice video' });
  await A.call('find_videos', { query: 'fake' });
  await A.call('save_timestamp', { label: 'intro solo', time: '0:15', end_time: '0:42' });
  await A.call('save_timestamp', { label: 'verse riff' }); // no time → capture current position (42.5s)
  await A.call('list_timestamps');
  await A.call('set_speed', { rate: '0.75x' });
  await A.call('set_volume', { level: '+10' });
  await A.call('seek', { to: 'verse riff' });
  await A.call('play', { from: 'intro solo' });
  await A.call('loop_section', { label: 'intro solo', times: 3, speeds: [0.5, 0.75, 1.0] });
  await A.call('stop_loop');
  await A.call('play_sequence', {
    clips: [
      { start: 'intro solo', end: '0:42', label: 'intro' },
      { start: '1:00', end: '1:30' },
    ],
  });
  await A.call('stop_sequence');
  await A.call('get_state');
  // get_transcript/search_transcript are not exercised here: they fetch from YouTube
  // directly (not via the bridge), and the smoke test must stay offline-safe.
  await A.call('delete_timestamp', { label: 'verse riff' });
  await A.call('seek', { to: 'nonexistent label' }); // expect graceful TOOL-ERROR listing saved labels

  // One-to-many proof: server B opens a DIFFERENT video and both sessions stay independent.
  await B.call('save_video', {
    url: 'https://youtu.be/jNQXAC9IVRw',
    title: 'second session video',
  });
  await B.call('open_video', { query: 'jNQXAC9IVRw' });
  await new Promise((r) => setTimeout(r, 200));
  const bVideo = JSON.parse((await B.call('get_state')).result.content[0].text).player?.videoId;
  const aVideo = JSON.parse((await A.call('get_state')).result.content[0].text).player?.videoId;
  if (bVideo !== 'jNQXAC9IVRw')
    throw new Error(`server B should report its own video, got ${bVideo}`);
  if (aVideo === bVideo)
    throw new Error('sessions are not isolated — both servers report the same video');
  console.log(`\nPARALLEL OK — A drives ${aVideo}, B drives ${bVideo} concurrently.`);

  console.log('\nAll calls completed.');
} finally {
  fakeExt?.kill();
  A.proc.kill();
  B.proc.kill();
  broker.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
