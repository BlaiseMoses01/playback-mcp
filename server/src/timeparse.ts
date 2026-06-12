/** Flexible time parsing for agent-supplied values: "90", "1:30", "0:15", "1m30s", "1:02:03", "2m". */
export function parseTime(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error(`Invalid time: ${input}`);
    return input;
  }
  const s = input.trim().toLowerCase().replace(/^@/, '');
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) {
    return s.split(':').map(Number).reduce((acc, p) => acc * 60 + p, 0);
  }
  const unit = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/.exec(s);
  if (unit && (unit[1] || unit[2] || unit[3])) {
    return Number(unit[1] ?? 0) * 3600 + Number(unit[2] ?? 0) * 60 + Number(unit[3] ?? 0);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  throw new Error(`Cannot parse time "${input}" — use forms like "90", "1:30", "1m30s", "1:02:03"`);
}

export function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** "0.75x" | "0.75" | 0.75 → 0.75, clamped to YouTube's supported 0.25–2.0 range. */
export function parseRate(input: string | number): number {
  const n = typeof input === 'number' ? input : Number(String(input).trim().toLowerCase().replace(/x$/, ''));
  if (!Number.isFinite(n)) throw new Error(`Cannot parse playback rate "${input}"`);
  return Math.min(2, Math.max(0.25, n));
}

/** "50" → {volume: 0.5}; "+10"/"-10" → {delta: ±0.1}. Accepts 0–100 scale. */
export function parseVolume(input: string | number): { volume?: number; delta?: number } {
  const s = String(input).trim();
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Cannot parse volume "${input}" — use 0-100, "+10", or "-10"`);
  const clamped = Math.min(100, Math.max(-100, n));
  if (/^[+-]/.test(s)) return { delta: clamped / 100 };
  return { volume: Math.max(0, clamped) / 100 };
}
