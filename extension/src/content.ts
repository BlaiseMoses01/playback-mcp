// Content script: controls the raw HTML5 <video> element on youtube.com and runs the loop engine.
// Only element properties are read/written (currentTime, playbackRate, volume, play/pause) —
// never YouTube UI clicks — so nothing here is visible to YouTube's servers.

interface LoopState {
  start: number;
  end: number;
  times: number;
  pass: number; // 0-based index of the pass currently playing
  rates: number[];
  savedRate: number;
  timer: number;
}

interface SequenceClip {
  start: number;
  end: number;
  label?: string;
}

interface SequenceState {
  clips: SequenceClip[];
  index: number; // 0-based index of the clip currently playing
  timer: number;
}

let loop: LoopState | null = null;
let sequence: SequenceState | null = null;
let lastHref = location.href;
let lastAdShowing = false;

function getVideo(): HTMLVideoElement {
  const v = document.querySelector<HTMLVideoElement>(
    '#movie_player video, video.html5-main-video, video',
  );
  if (!v) throw new Error('No video element on this page — open a YouTube watch page first.');
  return v;
}

function adShowing(): boolean {
  return document.querySelector('#movie_player')?.classList.contains('ad-showing') ?? false;
}

function getVideoId(): string | null {
  return new URL(location.href).searchParams.get('v');
}

function cleanTitle(): string {
  return document.title.replace(/ - YouTube$/, '');
}

function emit(event: Record<string, unknown>): void {
  try {
    void chrome.runtime.sendMessage(event);
  } catch {
    // extension context invalidated (e.g. after reload) — nothing to do
  }
}

function state(): Record<string, unknown> {
  const v = getVideo();
  return {
    videoId: getVideoId(),
    url: location.href,
    title: cleanTitle(),
    currentTime: v.currentTime,
    duration: v.duration,
    paused: v.paused,
    rate: v.playbackRate,
    volume: v.volume,
    loop: loop
      ? {
          start: loop.start,
          end: loop.end,
          times: loop.times,
          pass: loop.pass + 1,
          rates: loop.rates,
        }
      : null,
    sequence: sequence
      ? {
          clips: sequence.clips,
          index: sequence.index + 1,
          of: sequence.clips.length,
        }
      : null,
    adShowing: adShowing(),
  };
}

function rateFor(pass: number): number | undefined {
  if (!loop || loop.rates.length === 0) return undefined;
  return loop.rates[pass] ?? loop.rates[loop.rates.length - 1];
}

function startLoop(params: {
  start: number;
  end: number;
  times: number;
  rates?: number[];
}): Record<string, unknown> {
  cancelLoop(false);
  cancelSequence(false);
  const v = getVideo();
  loop = {
    start: params.start,
    end: params.end,
    times: params.times,
    pass: 0,
    rates: params.rates ?? [],
    savedRate: v.playbackRate,
    timer: 0,
  };
  v.currentTime = params.start;
  const r = rateFor(0);
  if (r !== undefined) v.playbackRate = r;
  void v.play();
  // 50ms polling: `timeupdate` only fires ~every 250ms, too sloppy for loop boundaries.
  loop.timer = window.setInterval(loopTick, 50);
  emit({ event: 'loop_progress', pass: 1, of: loop.times, rate: v.playbackRate });
  return state();
}

function loopTick(): void {
  if (!loop) return;
  if (adShowing()) return; // an ad owns the video element right now — suspend boundary checks
  let v: HTMLVideoElement;
  try {
    v = getVideo();
  } catch {
    cancelLoop(false);
    return;
  }
  if (v.currentTime < loop.end - 0.03) return;
  loop.pass++;
  if (loop.pass < loop.times) {
    v.currentTime = loop.start;
    const r = rateFor(loop.pass);
    if (r !== undefined) v.playbackRate = r;
    emit({ event: 'loop_progress', pass: loop.pass + 1, of: loop.times, rate: v.playbackRate });
  } else {
    const passes = loop.times;
    const savedRate = loop.savedRate;
    window.clearInterval(loop.timer);
    loop = null;
    v.pause();
    v.playbackRate = savedRate;
    emit({ event: 'loop_done', passes });
  }
}

function cancelLoop(restore: boolean): void {
  if (!loop) return;
  window.clearInterval(loop.timer);
  const savedRate = loop.savedRate;
  loop = null;
  if (restore) {
    try {
      const v = getVideo();
      v.pause();
      v.playbackRate = savedRate;
    } catch {
      // no video element anymore — nothing to restore
    }
  }
}

function startSequence(params: { clips: SequenceClip[] }): Record<string, unknown> {
  cancelLoop(false);
  cancelSequence(false);
  const v = getVideo();
  sequence = { clips: params.clips, index: 0, timer: 0 };
  v.currentTime = sequence.clips[0].start;
  void v.play();
  // 50ms polling: `timeupdate` only fires ~every 250ms, too sloppy for clip boundaries.
  sequence.timer = window.setInterval(sequenceTick, 50);
  emit({
    event: 'sequence_progress',
    index: 1,
    of: sequence.clips.length,
    label: sequence.clips[0].label,
  });
  return state();
}

function sequenceTick(): void {
  if (!sequence) return;
  if (adShowing()) return; // an ad owns the video element right now — suspend boundary checks
  let v: HTMLVideoElement;
  try {
    v = getVideo();
  } catch {
    cancelSequence(false);
    return;
  }
  const clip = sequence.clips[sequence.index];
  if (v.currentTime < clip.end - 0.03) return;
  sequence.index++;
  if (sequence.index < sequence.clips.length) {
    const next = sequence.clips[sequence.index];
    v.currentTime = next.start;
    emit({
      event: 'sequence_progress',
      index: sequence.index + 1,
      of: sequence.clips.length,
      label: next.label,
    });
  } else {
    const total = sequence.clips.length;
    window.clearInterval(sequence.timer);
    sequence = null;
    v.pause();
    emit({ event: 'sequence_done', clips: total });
  }
}

function cancelSequence(restore: boolean): void {
  if (!sequence) return;
  window.clearInterval(sequence.timer);
  sequence = null;
  if (restore) {
    try {
      getVideo().pause();
    } catch {
      // no video element anymore — nothing to restore
    }
  }
}

function handle(cmd: string, params: Record<string, any>): Record<string, unknown> {
  const v = getVideo();
  switch (cmd) {
    case 'play':
      void v.play();
      return state();
    case 'pause':
      v.pause();
      return state();
    case 'seek':
      cancelLoop(false); // a manual seek supersedes any active loop
      cancelSequence(false); // ...and any active sequence
      v.currentTime = Number(params.seconds);
      return state();
    case 'set_rate':
      v.playbackRate = Number(params.rate);
      return state();
    case 'set_volume': {
      const target =
        params.volume !== undefined ? Number(params.volume) : v.volume + Number(params.delta ?? 0);
      v.volume = Math.min(1, Math.max(0, target));
      v.muted = false;
      return state();
    }
    case 'loop':
      return startLoop(params as { start: number; end: number; times: number; rates?: number[] });
    case 'loop_cancel':
      cancelLoop(true);
      return state();
    case 'sequence':
      return startSequence(params as { clips: SequenceClip[] });
    case 'sequence_cancel':
      cancelSequence(true);
      return state();
    case 'get_state':
      return state();
    default:
      throw new Error(`Unknown command "${cmd}"`);
  }
}

chrome.runtime.onMessage.addListener(
  (msg: { cmd?: string; params?: Record<string, unknown> }, _sender, sendResponse) => {
    if (!msg?.cmd) return;
    Promise.resolve()
      .then(() => handle(msg.cmd!, msg.params ?? {}))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e: any) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true; // sendResponse fires in a microtask, after the listener returns
  },
);

function onNavigate(): void {
  lastHref = location.href;
  cancelLoop(false);
  cancelSequence(false);
  emit({ event: 'video_changed', videoId: getVideoId(), title: cleanTitle() });
  // The &autoplay=1 flag is unreliable on watch pages — nudge playback when we requested it.
  if (new URL(location.href).searchParams.get('autoplay') === '1') {
    setTimeout(() => {
      try {
        void getVideo().play();
      } catch {
        // video not ready yet; YouTube usually autoplays watch pages anyway
      }
    }, 1000);
  }
}

document.addEventListener('yt-navigate-finish', onNavigate);
setInterval(() => {
  if (location.href !== lastHref) onNavigate(); // fallback if yt-navigate-finish ever goes away
  const ad = adShowing();
  if (ad !== lastAdShowing) {
    lastAdShowing = ad;
    emit({ event: 'ad_state', showing: ad });
  }
}, 500);
