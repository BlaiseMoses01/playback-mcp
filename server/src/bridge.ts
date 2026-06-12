import { WebSocketServer, WebSocket } from 'ws';

const log = (...args: unknown[]) => console.error('[bridge]', ...args);

export const OFFLINE_HINT =
  'Chrome extension is not connected. Open Chrome and confirm the YT Controller extension is loaded ' +
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

/** WebSocket hub the Chrome extension connects to. One live socket; newest connection wins. */
export class Bridge {
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  /** Last loop progress/done event, surfaced via get_state. */
  loopStatus: Record<string, unknown> | null = null;

  start(port = 8765): void {
    const wss = new WebSocketServer({ host: '127.0.0.1', port });
    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log(`port ${port} is already in use — is another session running this MCP server? Exiting.`);
        process.exit(1);
      }
      log('websocket server error:', err.message);
    });
    wss.on('connection', (ws) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close();
      this.socket = ws;
      log('extension connected');
      ws.on('message', (data) => this.onMessage(String(data)));
      ws.on('close', () => {
        if (this.socket === ws) {
          this.socket = null;
          log('extension disconnected');
        }
      });
      ws.on('error', (err) => log('socket error:', err.message));
    });
    // App-level ping keeps the MV3 service worker alive (Chrome 116+: WS activity resets the idle timer).
    setInterval(() => {
      if (this.connected) this.socket!.send(JSON.stringify({ event: 'ping' }));
    }, 20_000).unref();
    log(`listening on ws://127.0.0.1:${port}`);
  }

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
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
        case 'pong':
          break;
        case 'hello':
          log('extension hello, protocol version', msg.version);
          break;
        case 'loop_progress':
        case 'loop_done':
          this.loopStatus = msg;
          log(msg.event, JSON.stringify(msg));
          break;
        case 'video_changed':
          this.loopStatus = null;
          log('video changed:', msg.videoId, msg.title ?? '');
          break;
        default:
          log('event:', JSON.stringify(msg));
      }
    }
  }
}
