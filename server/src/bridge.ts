import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const log = (...args: unknown[]) => console.error('[bridge]', ...args);

export const OFFLINE_HINT =
  'Chrome extension is not connected. Open Chrome and confirm the Playback MCP extension is loaded ' +
  '(chrome://extensions → Developer mode → Load unpacked), then retry.';

export class BridgeOfflineError extends Error {
  constructor() {
    super(OFFLINE_HINT);
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Client link to the shared broker daemon. Each MCP server process owns one Bridge with a unique
 * sessionId; the broker relays this session's commands to the extension (which drives a dedicated
 * tab per session) and routes acks/events back. The broker is auto-spawned if it isn't running.
 * Public surface is unchanged from the old in-process WebSocket server, so the tools don't change.
 */
export class Bridge {
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private readonly sessionId = randomUUID();
  private port = 8765;
  private backoffMs = 300;
  private extensionOnline = false;
  private brokerSpawned = false;
  /** Last loop progress/done event, surfaced via get_state. */
  loopStatus: Record<string, unknown> | null = null;
  /** Last sequence progress/done event, surfaced via get_state. */
  sequenceStatus: Record<string, unknown> | null = null;

  start(port = 8765): void {
    this.port = port;
    this.connect();
  }

  private connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    } catch {
      this.ensureBroker();
      this.scheduleReconnect();
      return;
    }
    this.socket = ws;
    ws.on('open', () => {
      this.backoffMs = 300;
      this.brokerSpawned = false; // a later outage may need to respawn
      ws.send(JSON.stringify({ event: 'hello', role: 'mcp', sessionId: this.sessionId }));
      log(`connected to broker on ws://127.0.0.1:${this.port} (session ${this.sessionId})`);
    });
    ws.on('message', (data) => this.onMessage(String(data)));
    ws.on('close', () => {
      if (this.socket === ws) {
        this.socket = null;
        this.extensionOnline = false;
      }
      this.scheduleReconnect();
    });
    ws.on('error', () => {
      // Broker likely not up yet — spawn it; a 'close' follows and triggers the reconnect.
      this.ensureBroker();
    });
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.connect(), this.backoffMs).unref();
    this.backoffMs = Math.min(this.backoffMs * 2, 3000);
  }

  /** Start the broker daemon if this process can't reach one. Idempotent per outage; a duplicate
   * broker exits itself on EADDRINUSE, so a spurious spawn is harmless. */
  private ensureBroker(): void {
    if (this.brokerSpawned) return;
    this.brokerSpawned = true;
    try {
      const brokerPath = fileURLToPath(new URL('./broker.js', import.meta.url));
      const child = spawn(process.execPath, [brokerPath], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
      log('spawned broker daemon');
    } catch (e) {
      log('failed to spawn broker:', (e as Error).message);
    }
  }

  get connected(): boolean {
    return (
      this.socket !== null && this.socket.readyState === WebSocket.OPEN && this.extensionOnline
    );
  }

  /** Send a command and await the extension's ack. Rejects immediately when offline. */
  send(cmd: string, params?: Record<string, unknown>, timeoutMs = 10_000): Promise<any> {
    if (!this.connected) return Promise.reject(new BridgeOfflineError());
    const id = `req-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension did not respond to "${cmd}" within ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify({ id, cmd, params }));
    });
  }

  private onMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      log('unparseable message:', raw.slice(0, 200));
      return;
    }
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error ?? 'extension reported an unknown error'));
      return;
    }
    if (msg.event) {
      switch (msg.event) {
        case 'extension_online':
          this.extensionOnline = true;
          log('extension online');
          break;
        case 'extension_offline':
          this.extensionOnline = false;
          log('extension offline');
          break;
        case 'loop_progress':
        case 'loop_done':
          this.loopStatus = msg;
          log(msg.event, JSON.stringify(msg));
          break;
        case 'sequence_progress':
        case 'sequence_done':
          this.sequenceStatus = msg;
          log(msg.event, JSON.stringify(msg));
          break;
        case 'video_changed':
          this.loopStatus = null;
          this.sequenceStatus = null;
          log('video changed:', msg.videoId, msg.title ?? '');
          break;
        default:
          log('event:', JSON.stringify(msg));
      }
    }
  }
}
