// Mock Chrome extension for testing the broker without a browser.
// Connects to the broker's WebSocket, answers pings, and acks every command against a
// PER-SESSION simulated player state — so two MCP servers (sessions) drive independent videos,
// mirroring the real extension's per-session managed tabs.
import WebSocket from 'ws';

function newState() {
  return {
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Fake Practice Video',
    currentTime: 42.5,
    duration: 212,
    paused: false,
    rate: 1,
    volume: 0.8,
    loop: null,
    sequence: null,
    adShowing: false,
  };
}

const sessions = new Map(); // sessionId -> simulated player state
function stateFor(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = newState();
    sessions.set(sessionId, s);
  }
  return s;
}

const ws = new WebSocket(`ws://127.0.0.1:${process.env.YT_BRIDGE_PORT ?? 8765}`);

ws.on('open', () => {
  console.log('[fake-ext] connected');
  ws.send(JSON.stringify({ event: 'hello', version: 1 }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(String(data));
  if (msg.event === 'ping') {
    ws.send(JSON.stringify({ event: 'pong' }));
    return;
  }
  if (msg.event === 'session_gone') {
    sessions.delete(msg.sessionId);
    return;
  }
  if (!msg.id || !msg.cmd) return;
  const sessionId = msg.sessionId ?? 'default';
  const state = stateFor(sessionId);
  // strip control chars from wire-sourced values before logging (no log injection)
  const clean = (v) => String(v).replace(/[^\x20-\x7e]/g, '');
  console.log(
    '[fake-ext] cmd:',
    clean(msg.cmd),
    'session',
    clean(sessionId).slice(0, 8),
    JSON.stringify(msg.params ?? {}),
  );
  switch (msg.cmd) {
    case 'load_video':
      state.videoId = msg.params.videoId;
      state.url = `https://www.youtube.com/watch?v=${msg.params.videoId}`;
      if (msg.params.t) state.currentTime = msg.params.t;
      ws.send(
        JSON.stringify({
          id: msg.id,
          ok: true,
          result: { navigating: true, videoId: state.videoId },
        }),
      );
      return;
    case 'seek':
      state.currentTime = msg.params.seconds;
      break;
    case 'play':
      state.paused = false;
      break;
    case 'pause':
      state.paused = true;
      break;
    case 'set_rate':
      state.rate = msg.params.rate;
      break;
    case 'set_volume':
      state.volume =
        msg.params.volume ?? Math.min(1, Math.max(0, state.volume + (msg.params.delta ?? 0)));
      break;
    case 'loop':
      state.loop = { ...msg.params, pass: 1 };
      break;
    case 'loop_cancel':
      state.loop = null;
      state.paused = true;
      break;
    case 'sequence':
      state.sequence = { ...msg.params, index: 1 };
      break;
    case 'sequence_cancel':
      state.sequence = null;
      state.paused = true;
      break;
  }
  ws.send(JSON.stringify({ id: msg.id, ok: true, result: { ...state } }));
});

ws.on('close', () => {
  console.log('[fake-ext] disconnected');
  process.exit(0);
});
ws.on('error', (e) => {
  console.error('[fake-ext] error:', e.message);
  process.exit(1);
});
