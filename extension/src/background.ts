// MV3 service worker: WebSocket client to the local MCP server + YouTube tab management.
// Chrome 116+ keeps the SW alive while WebSocket messages flow (server pings every 20s);
// a 1-minute alarm additionally revives the SW and reconnects after server restarts/sleep.

declare const __WS_PORT__: string; // injected at build time (esbuild define), default 8765
const WS_URL = `ws://127.0.0.1:${__WS_PORT__}`;

let ws: WebSocket | null = null;
let backoffMs = 1000;

function wsSend(obj: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    backoffMs = 1000;
    wsSend({ event: 'hello', version: 1 });
  };
  ws.onmessage = (e) => {
    void handleMessage(JSON.parse(String(e.data)));
  };
  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect(): void {
  setTimeout(connect, backoffMs);
  backoffMs = Math.min(backoffMs * 2, 5000);
}

async function handleMessage(msg: {
  id?: string;
  cmd?: string;
  params?: Record<string, unknown>;
  event?: string;
}): Promise<void> {
  if (msg.event === 'ping') {
    wsSend({ event: 'pong' });
    return;
  }
  if (!msg.id || !msg.cmd) return;
  try {
    const result = await execute(msg.cmd, msg.params ?? {});
    wsSend({ id: msg.id, ok: true, result });
  } catch (e: any) {
    wsSend({ id: msg.id, ok: false, error: String(e?.message ?? e) });
  }
}

async function execute(cmd: string, params: Record<string, unknown>): Promise<unknown> {
  if (cmd === 'load_video') return loadVideo(params as { videoId: string; t?: number });
  const tabId = await getManagedTab();
  if (tabId === null) throw new Error('No YouTube tab is open — use open_video first.');
  const response = (await chrome.tabs.sendMessage(tabId, { cmd, params })) as
    | { ok: true; result: unknown }
    | { ok: false; error: string }
    | undefined;
  if (!response)
    throw new Error(
      'The YouTube tab did not respond — it may still be loading; retry in a moment.',
    );
  if (!response.ok) throw new Error(response.error);
  return response.result;
}

async function setManaged(tabId: number): Promise<void> {
  await chrome.storage.session.set({ managedTabId: tabId });
}

async function getManagedTab(): Promise<number | null> {
  const { managedTabId } = await chrome.storage.session.get('managedTabId');
  if (typeof managedTabId === 'number') {
    try {
      await chrome.tabs.get(managedTabId);
      return managedTabId;
    } catch {
      // tab was closed — fall through and adopt another
    }
  }
  const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/watch*' });
  if (tabs.length > 0) {
    const tab = tabs.find((t) => t.active) ?? tabs[tabs.length - 1];
    await setManaged(tab.id!);
    return tab.id!;
  }
  return null;
}

async function loadVideo(params: { videoId: string; t?: number }): Promise<unknown> {
  const t = params.t && params.t > 0 ? `&t=${Math.floor(params.t)}s` : '';
  const url = `https://www.youtube.com/watch?v=${params.videoId}${t}&autoplay=1`;
  let tabId = await getManagedTab();
  if (tabId === null) {
    const tab = await chrome.tabs.create({ url });
    tabId = tab.id!;
  } else {
    await chrome.tabs.update(tabId, { url, active: true });
  }
  await setManaged(tabId);
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // window focus is best-effort
  }
  return { navigating: true, videoId: params.videoId };
}

// Forward content-script events (loop progress, video changes) from the managed tab to the server.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.event && sender.tab?.id !== undefined) {
    void chrome.storage.session.get('managedTabId').then(({ managedTabId }) => {
      if (sender.tab!.id === managedTabId) wsSend(msg);
    });
  }
});

chrome.alarms.create('ws-keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ws-keepalive') connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect(); // also runs on every service-worker wake
