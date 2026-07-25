---
name: playlist-notes
description: Study a whole YouTube playlist or series at once — enumerate it, fan out cheap subagents to read every transcript in parallel, and synthesize one set of notes. Use when asked for notes/a summary/an outline of a playlist, a course, or a multi-part series.
---

# Notes from a playlist

Creators spread one topic across many videos. This turns a playlist into one coherent set of
notes without watching — or even opening — anything.

The shape is **map-reduce**: a cheap model extracts from each video in parallel, and you do
the expensive synthesis once, at the end. Reading 30 transcripts yourself would blow your
context long before you got to the thinking.

## 1. Enumerate and agree on scope

```
list_playlist(playlist: "<URL or id>")
```

Accepts a playlist URL, a watch URL containing `list=`, or a bare id. Returns
`{playlist, count, total?, videos: [{videoId, title, duration}]}`.

Read the response carefully before doing anything else:

- **`total`** is how many videos the playlist actually holds. It's absent for some playlists.
- **`truncated`** means you got fewer than all of them; raise `limit` for the rest.
- No `truncated` field means the list you have is complete, even when `total` is absent.

**Stop and check with the user when the playlist is large** — say, more than ~15 videos, or
more than a couple of hours of total runtime. Tell them the count and roughly what it will
cost, and offer the alternatives:

- all of it,
- the first N,
- only the videos whose titles match what they actually care about.

A 241-video channel archive is not a reasonable thing to read uninvited.

## 2. Fan out — one cheap agent per video

Spawn a subagent per video **on a small, fast model** (Haiku or equivalent). Per-video
extraction is mechanical: read a transcript, pull out the claims. It does not need a
frontier model, and using one for 30 videos is slow and wasteful.

Batch the fan-out — roughly 5–10 at a time rather than all at once — so you can show progress
and abandon the run cheaply if the early results come back useless.

Because the transcript tools are **headless**, no subagent opens a tab and none of them
contend over the browser. They can all run at once safely.

Give every subagent the same instruction and an explicit output contract:

> You are extracting study notes from one YouTube video. Do not open or play anything.
>
> 1. `get_video_outline(video: "<videoId>")` — the section map, word counts, and previews.
> 2. `get_transcript(video: "<videoId>", start: ..., end: ...)` for the sections that carry
>    real content. Skip intros, sponsor reads, and sign-offs.
>
> Return **only** this, and nothing else:
>
> - `title` — the video's title
> - `summary` — 2–3 sentences on what this video covers
> - `keyPoints` — 3–8 bullets, each with the timestamp where it's explained
> - `terms` — terms or concepts defined here, with one-line definitions
> - `connections` — anything explicitly building on or referring to another video
>
> Never return raw transcript. If the captions are garbled and you can't tell what was said,
> say so rather than guessing.

That contract is what keeps the reduce step affordable: you get back a few hundred words per
video instead of tens of thousands.

## 3. Synthesize

Now do the part that needs your judgment. Merge the returned notes into one document
organized by **topic, not by video** — the whole premise is that the creator split one topic
across many.

- Lead with the throughline: what does the series as a whole teach?
- Fold duplicate explanations together, and note where videos disagree or where a later one
  supersedes an earlier one.
- Use `connections` to reconstruct the intended order, which is not always the playlist order.
- Cite every claim as _video title + timestamp_ so the user can jump straight to it.
- Call out gaps — things the series references but never explains.

If any subagent flagged bad captions, carry that caveat through instead of quietly dropping it.

## Navigating afterwards

Timestamps feed directly into `seek` and `loop_section`. When a moment matters, offer to
`open_video` and jump there.

If the user wants several videos actually _playing_ at once, each concurrent session drives
its own tab — pass `background: true` to `open_video` so they don't fight over the
foreground. Without it, every open activates its tab and focuses its window.
