---
name: video-quiz
description: Turn a video into quiz questions and chapter markers — self-check questions for someone studying it, or Studio-ready chapters and quiz drafts for the creator who made it. Use when asked to quiz someone on a video, test their understanding, or generate chapters/quiz questions for their own content.
---

# Quiz and chapter meta from a video

Two audiences, one source. Ask which one you're serving if it isn't obvious — the output
differs a lot.

## Get the material first

```
get_video_outline(video: "<URL, id, or omit for the open video>")
```

One call gives every chapter with its time range, a preview of what's said in it, a word
count, and any `quizMoments`. Read it before anything else — it tells you where the
substance is.

Then pull full text only for the sections that matter:

```
get_transcript(video: "<same>", start: "<section start>", end: "<section end>")
```

Don't fetch the whole transcript up front. Long videos exceed the 12,000-character cap and
you'll spend context on filler (intros, sponsor reads) instead of the parts you'll quiz on.

If the video has **no chapters**, `get_video_outline` says so. Fall back to
`get_transcript` in windows, or `search_transcript` for specific concepts.

### About `quizMoments`

These are timestamps where YouTube placed quiz markers. **The question text is not exposed
by the API** — only the positions. Treat them as evidence about where a comprehension check
belongs, never as questions you can quote.

## For a viewer studying the video

Write questions that test understanding, not recall of phrasing.

- Anchor every question to the timestamp where its answer appears, so `seek` jumps straight
  there and `loop_section(start, end)` can replay the explanation.
- Prefer "why does X happen" and "what breaks if you skip Y" over "what word did they use".
- Cover chapters with high word counts — those are where the content actually is.
- Give answers separately from questions so the user can genuinely self-test first.
- Offer to open the video and seek to a moment when they get one wrong.

## For a creator working on their own video

Two deliverables, both paste-ready.

**Chapters** for the description box, in YouTube's required format — first entry at `0:00`,
at least three entries, ascending, each at least 10 seconds long:

```
0:00 Introduction
1:30 Setting up the project
4:15 The first real problem
```

If the video already has chapters, propose improvements to unclear titles rather than
rewriting the set wholesale — the creator chose those.

**Quiz questions** positioned at chapter boundaries or just after a concept is fully
explained, never before. For each, give the timestamp, the question, the options, the
correct answer, and one line on why it's right. Keep them answerable from the video alone.

## Be honest about the source

Everything you write is derived from captions, which are often auto-generated and
occasionally wrong. If a passage is garbled and you're unsure what was said, say so instead
of inventing a question about it.
