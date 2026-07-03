// MV3 service worker: WebSocket client to the local broker + YouTube tab management.
// Each MCP server (Claude session) is identified by a sessionId and drives its OWN managed tab,
// so several sessions can control different videos in parallel. The broker tags every command
// with its session's id; we route the command to that session's tab and tag outgoing events
// with the tab's session so the broker can return them to the right client.
// Chrome 116+ keeps the SW alive while WebSocket messages flow (broker pings every 20s);
// a 1-minute alarm additionally revives the SW and reconnects after broker restarts/sleep.

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
  sessionId?: string;
  event?: string;
}): Promise<void> {
  if (msg.event === 'ping') {
    wsSend({ event: 'pong' });
    return;
  }
  if (msg.event === 'session_gone' && typeof msg.sessionId === 'string') {
    await unbindSession(msg.sessionId);
    return;
  }
  if (!msg.id || !msg.cmd || typeof msg.sessionId !== 'string') return;
  try {
    const result = await execute(msg.sessionId, msg.cmd, msg.params ?? {});
    wsSend({ id: msg.id, ok: true, result });
  } catch (e: any) {
    wsSend({ id: msg.id, ok: false, error: String(e?.message ?? e) });
  }
}

async function execute(
  sessionId: string,
  cmd: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (cmd === 'load_video') return loadVideo(sessionId, params as { videoId: string; t?: number });
  const tabId = await getManagedTab(sessionId);
  if (tabId === null)
    throw new Error('No YouTube tab is open for this session — use open_video first.');
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

// sessionId -> managed tabId, persisted in session storage so it survives SW restarts.
async function getSessionTabs(): Promise<Record<string, number>> {
  const { sessionTabs } = await chrome.storage.session.get('sessionTabs');
  return (sessionTabs as Record<string, number> | undefined) ?? {};
}

async function setSessionTab(sessionId: string, tabId: number): Promise<void> {
  const tabs = await getSessionTabs();
  tabs[sessionId] = tabId;
  await chrome.storage.session.set({ sessionTabs: tabs });
}

async function unbindSession(sessionId: string): Promise<void> {
  const tabs = await getSessionTabs();
  if (sessionId in tabs) {
    delete tabs[sessionId];
    await chrome.storage.session.set({ sessionTabs: tabs });
  }
}

async function getManagedTab(sessionId: string): Promise<number | null> {
  const tabs = await getSessionTabs();
  const bound = tabs[sessionId];
  if (typeof bound === 'number') {
    try {
      await chrome.tabs.get(bound);
      return bound;
    } catch {
      // tab was closed — fall through and adopt another
    }
  }
  // Adopt a YouTube tab not already claimed by a different session.
  const claimed = new Set(
    Object.entries(tabs)
      .filter(([s]) => s !== sessionId)
      .map(([, id]) => id),
  );
  const ytTabs = await chrome.tabs.query({ url: '*://www.youtube.com/watch*' });
  const free = ytTabs.filter((t) => t.id !== undefined && !claimed.has(t.id));
  if (free.length > 0) {
    const tab = free.find((t) => t.active) ?? free[free.length - 1];
    await setSessionTab(sessionId, tab.id!);
    return tab.id!;
  }
  return null;
}

async function loadVideo(
  sessionId: string,
  params: { videoId: string; t?: number },
): Promise<unknown> {
  const t = params.t && params.t > 0 ? `&t=${Math.floor(params.t)}s` : '';
  const url = `https://www.youtube.com/watch?v=${params.videoId}${t}&autoplay=1`;
  let tabId = await getManagedTab(sessionId);
  if (tabId === null) {
    const tab = await chrome.tabs.create({ url });
    tabId = tab.id!;
  } else {
    await chrome.tabs.update(tabId, { url, active: true });
  }
  await setSessionTab(sessionId, tabId);
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // window focus is best-effort
  }
  return { navigating: true, videoId: params.videoId };
}

// Forward content-script events (loop progress, video changes) from a managed tab to the broker,
// tagged with the tab's session so the broker returns them to the owning client.
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (msg && msg.event && tabId !== undefined) {
    void getSessionTabs().then((tabs) => {
      for (const [sessionId, id] of Object.entries(tabs)) {
        if (id === tabId) wsSend({ ...msg, sessionId });
      }
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
