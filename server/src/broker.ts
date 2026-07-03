#!/usr/bin/env node
// Standalone daemon that owns the localhost WebSocket port and multiplexes many MCP-server
// clients onto the one Chrome extension. Each MCP server connects as a client tagged with a
// sessionId; the broker relays commands to the extension, routes acks back to the originating
// client by request id, and routes the extension's events to the owning session. The extension
// picks a tab per sessionId, so different sessions drive different videos in parallel.
//
// One broker per port: a second instance hitting EADDRINUSE exits quietly, so concurrent
// auto-spawn (from several servers starting at once) is harmless — the OS bind picks the winner.
import { WebSocketServer, WebSocket } from 'ws';
import { OFFLINE_HINT } from './bridge.js';

const log = (...args: unknown[]) => console.error('[broker]', ...args);

const PORT = Number(process.env.YT_BRIDGE_PORT ?? 8765);
const IDLE_EXIT_MS = 60_000;

/** The single Chrome extension socket (newest connection wins). */
let extension: WebSocket | null = null;
/** MCP-server clients keyed by their sessionId. */
const clients = new Map<string, WebSocket>();
/** In-flight requests: broker-global id -> the client + its original request id. */
const pending = new Map<string, { sessionId: string; originalId: string }>();
let nextReqSeq = 1;
let idleTimer: NodeJS.Timeout | null = null;

function extensionConnected(): boolean {
  return extension !== null && extension.readyState === WebSocket.OPEN;
}

function sendJson(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastToClients(obj: unknown): void {
  for (const ws of clients.values()) sendJson(ws, obj);
}

/** Exit once no client has been connected for a while, so no daemon lingers after all Claudes quit. */
function scheduleIdleExit(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (clients.size === 0) {
      log('idle with no clients — exiting');
      process.exit(0);
    }
  }, IDLE_EXIT_MS);
  idleTimer.unref();
}

function originAllowed(origin?: string): boolean {
  // Node clients (MCP bridge, fake-extension) send no Origin. Browsers ALWAYS send one and
  // cannot forge it, so a web page's http/https Origin is rejected while the extension's
  // chrome-extension origin passes. This is the trust boundary — see issue #18.
  if (!origin) return true;
  if (origin.startsWith('chrome-extension://')) return true;
  log('rejected connection from origin', origin);
  return false;
}

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT,
  verifyClient: (info: { origin?: string }) => originAllowed(info.origin),
});
wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    log(`port ${PORT} already in use — another broker owns it. Exiting.`);
    process.exit(0);
  }
  log('server error:', err.message);
});

// Classify each socket by its first message: MCP clients announce role:'mcp', the extension
// sends a bare hello.
wss.on('connection', (ws) => {
  ws.once('message', (data) => classify(ws, String(data)));
});

function classify(ws: WebSocket, raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    msg = {};
  }
  if (msg.event === 'hello' && msg.role === 'mcp' && typeof msg.sessionId === 'string') {
    registerClient(ws, msg.sessionId);
  } else {
    adoptExtension(ws);
    onExtensionMessage(raw); // process the extension's opening hello like any other message
  }
}

function registerClient(ws: WebSocket, sessionId: string): void {
  const existing = clients.get(sessionId);
  if (existing && existing !== ws) existing.close();
  clients.set(sessionId, ws);
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  log(`client connected: session ${sessionId} (${clients.size} total)`);
  sendJson(ws, { event: extensionConnected() ? 'extension_online' : 'extension_offline' });
  ws.on('message', (data) => onClientMessage(sessionId, String(data)));
  ws.on('close', () => onClientClose(sessionId, ws));
  ws.on('error', (err) => log('client socket error:', err.message));
}

function onClientMessage(sessionId: string, raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg.id || !msg.cmd) return;
  const client = clients.get(sessionId);
  if (!client) return;
  if (!extensionConnected()) {
    sendJson(client, { id: msg.id, ok: false, error: OFFLINE_HINT });
    return;
  }
  const brokerId = `b${nextReqSeq++}`;
  pending.set(brokerId, { sessionId, originalId: msg.id });
  sendJson(extension!, { id: brokerId, cmd: msg.cmd, params: msg.params, sessionId });
}

function onClientClose(sessionId: string, ws: WebSocket): void {
  if (clients.get(sessionId) !== ws) return; // superseded by a reconnect
  clients.delete(sessionId);
  for (const [brokerId, p] of pending) if (p.sessionId === sessionId) pending.delete(brokerId);
  log(`client disconnected: session ${sessionId} (${clients.size} remain)`);
  if (extensionConnected()) sendJson(extension!, { event: 'session_gone', sessionId });
  if (clients.size === 0) scheduleIdleExit();
}

function adoptExtension(ws: WebSocket): void {
  if (extension && extension.readyState === WebSocket.OPEN && extension !== ws) extension.close();
  extension = ws;
  log('extension connected');
  broadcastToClients({ event: 'extension_online' });
  ws.on('message', (data) => onExtensionMessage(String(data)));
  ws.on('close', () => {
    if (extension !== ws) return;
    extension = null;
    log('extension disconnected');
    for (const p of pending.values()) {
      const client = clients.get(p.sessionId);
      if (client) sendJson(client, { id: p.originalId, ok: false, error: OFFLINE_HINT });
    }
    pending.clear();
    broadcastToClients({ event: 'extension_offline' });
  });
  ws.on('error', (err) => log('extension socket error:', err.message));
}

function onExtensionMessage(raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)!;
    pending.delete(msg.id);
    const client = clients.get(p.sessionId);
    if (client) sendJson(client, { ...msg, id: p.originalId });
    return;
  }
  if (msg.event) {
    if (msg.event === 'hello') {
      log('extension hello, protocol version', msg.version);
      return;
    }
    if (msg.event === 'pong') return;
    // Events carry the originating tab's sessionId; route to that client, else broadcast.
    if (typeof msg.sessionId === 'string') {
      const client = clients.get(msg.sessionId);
      if (client) sendJson(client, msg);
    } else {
      broadcastToClients(msg);
    }
  }
}

// App-level ping keeps the MV3 service worker alive (Chrome 116+: WS activity resets the idle timer).
setInterval(() => {
  if (extensionConnected()) sendJson(extension!, { event: 'ping' });
}, 20_000).unref();

log(`listening on ws://127.0.0.1:${PORT}`);
scheduleIdleExit();
