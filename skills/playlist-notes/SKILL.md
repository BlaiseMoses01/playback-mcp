---
name: playlist-notes
description: Study a whole YouTube playlist or series at once — enumerate it, read every transcript in parallel, and synthesize one set of notes. Use when asked for notes/a summary/an outline of a playlist, a course, or a multi-part series.
---

# Notes from a playlist

Creators spread one topic across many videos. This turns a playlist into one coherent
set of notes without watching — or even opening — anything.

## The shape of the work

`list_playlist` gives you the videos; `get_chapters` and `get_transcript` read each one
**headlessly**, with no tab and no browser. That means the per-video work is independent
and should be fanned out, not done in a loop.

## 1. Enumerate

```
list_playlist(playlist: "<URL or id>")
```

Accepts a playlist URL, a watch URL containing `list=`, or a bare id. Returns
`{playlist, count, videos: [{videoId, title, duration}]}`.

Check the response for a `truncated` field — it means the playlist has more videos than
were returned. Either raise `limit` or tell the user what you covered. **Never present a
truncated list as the whole playlist.**

If the playlist is long, confirm scope with the user before reading everything —
150 transcripts is a lot of work to do uninvited.

## 2. Read every video in parallel

Fan out one subagent per video. Each one gets a `videoId` from step 1 and does:

```
get_chapters(video: "<videoId>")      # cheap outline; may be empty, that's normal
get_transcript(video: "<videoId>")    # windowed with start/end for long videos
```

Have each subagent return **structured notes, not raw transcript** — key claims,
definitions, and the timestamps worth revisiting. Raw transcripts will swamp your context;
a 1-hour video is far more than the 12,000-character cap `get_transcript` returns at once,
so long videos need `start`/`end` windows or `search_transcript` for specific topics.

## 3. Synthesize

Merge into one document organized by _topic_, not by video, since the whole point is that
the creator split one topic across many. For every claim, cite the video title and
timestamp so the user can jump straight there.

## Citing so the user can actually navigate

Timestamps from `get_chapters`/`search_transcript` feed directly into `seek` and
`loop_section`. When a moment matters, give the user the video and the time — and offer to
open it with `open_video`.

## Watching in parallel (optional)

If the user genuinely wants several videos _playing_ at once rather than just read, each
concurrent session drives its own tab. Pass `background: true` to `open_video` so the
sessions don't fight over the foreground:

```
open_video(query: "<videoId>", background: true)
```

Without that flag every open activates its tab and focuses its window, so N parallel opens
will yank the user's screen around N times.
