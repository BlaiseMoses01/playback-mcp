import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Per-user data dir (override with YT_CONTROLLER_DATA_DIR).
function defaultDataDir(): string {
  if (process.env.YT_CONTROLLER_DATA_DIR) return process.env.YT_CONTROLLER_DATA_DIR;
  const home = os.homedir();
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', 'yt-controller');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'yt-controller');
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'),
    'yt-controller',
  );
}

const dataDir = defaultDataDir();
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'library.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id             INTEGER PRIMARY KEY,
    youtube_id     TEXT NOT NULL UNIQUE,
    url            TEXT NOT NULL,
    title          TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    last_played_at TEXT
  );
  CREATE TABLE IF NOT EXISTS timestamps (
    id          INTEGER PRIMARY KEY,
    video_id    INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    seconds     REAL NOT NULL,
    end_seconds REAL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(video_id, label)
  );
`);
db.exec('PRAGMA foreign_keys = ON');

export interface VideoRow {
  id: number;
  youtube_id: string;
  url: string;
  title: string;
  created_at: string;
  last_played_at: string | null;
}

export interface TimestampRow {
  id: number;
  video_id: number;
  label: string;
  seconds: number;
  end_seconds: number | null;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function normalizeYoutubeId(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  return YOUTUBE_ID_RE.test(trimmed) ? trimmed : null;
}

/** Extract the 11-char video id from any common YouTube URL form, or a bare id. */
export function parseYoutubeId(input: string): string | null {
  const s = input.trim();
  const direct = normalizeYoutubeId(s);
  if (direct) return direct;
  try {
    const u = new URL(s);
    if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname)) return null;
    if (u.hostname === 'youtu.be') return normalizeYoutubeId(u.pathname.slice(1));
    const v = normalizeYoutubeId(u.searchParams.get('v'));
    if (v) return v;
    const m = /\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
    return normalizeYoutubeId(m?.[2]);
  } catch {
    return null;
  }
}

export function upsertVideo(youtubeId: string, url: string, title: string): VideoRow {
  return db
    .prepare(
      `INSERT INTO videos (youtube_id, url, title) VALUES (?, ?, ?)
       ON CONFLICT(youtube_id) DO UPDATE SET title = excluded.title, url = excluded.url
       RETURNING *`,
    )
    .get(youtubeId, url, title) as unknown as VideoRow;
}

export function findVideos(query?: string): VideoRow[] {
  if (query && query.trim()) {
    return db
      .prepare(
        `SELECT * FROM videos WHERE title LIKE '%' || ? || '%' COLLATE NOCASE ORDER BY COALESCE(last_played_at, created_at) DESC`,
      )
      .all(query.trim()) as unknown as VideoRow[];
  }
  return db
    .prepare(`SELECT * FROM videos ORDER BY COALESCE(last_played_at, created_at) DESC LIMIT 10`)
    .all() as unknown as VideoRow[];
}

export function getVideoByYoutubeId(youtubeId: string): VideoRow | undefined {
  return db.prepare(`SELECT * FROM videos WHERE youtube_id = ?`).get(youtubeId) as unknown as
    | VideoRow
    | undefined;
}

export function touchLastPlayed(id: number): void {
  db.prepare(`UPDATE videos SET last_played_at = datetime('now') WHERE id = ?`).run(id);
}

export function upsertTimestamp(
  videoId: number,
  label: string,
  seconds: number,
  endSeconds?: number,
): TimestampRow {
  return db
    .prepare(
      `INSERT INTO timestamps (video_id, label, seconds, end_seconds) VALUES (?, ?, ?, ?)
       ON CONFLICT(video_id, label) DO UPDATE SET seconds = excluded.seconds, end_seconds = excluded.end_seconds
       RETURNING *`,
    )
    .get(videoId, label, seconds, endSeconds ?? null) as unknown as TimestampRow;
}

export function listTimestamps(videoId: number): TimestampRow[] {
  return db
    .prepare(`SELECT * FROM timestamps WHERE video_id = ? ORDER BY seconds`)
    .all(videoId) as unknown as TimestampRow[];
}

export function findTimestamps(videoId: number, label: string): TimestampRow[] {
  return db
    .prepare(
      `SELECT * FROM timestamps WHERE video_id = ? AND label LIKE '%' || ? || '%' COLLATE NOCASE ORDER BY seconds`,
    )
    .all(videoId, label.trim()) as unknown as TimestampRow[];
}

export function deleteTimestamp(videoId: number, label: string): boolean {
  const exact = db
    .prepare(`DELETE FROM timestamps WHERE video_id = ? AND label = ? COLLATE NOCASE`)
    .run(videoId, label);
  if (exact.changes > 0) return true;
  const matches = findTimestamps(videoId, label);
  if (matches.length === 1) {
    db.prepare(`DELETE FROM timestamps WHERE id = ?`).run(matches[0].id);
    return true;
  }
  return false;
}
