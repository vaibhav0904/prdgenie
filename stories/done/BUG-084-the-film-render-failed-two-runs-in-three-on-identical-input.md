# BUG-084: The film render failed two runs in three on identical input

**Severity:** major · the whole point of generating the film is that it can be rebuilt on demand.
A build that fails two times in three is not a pipeline, it is a lottery
**Found:** 2026-09-14, re-rendering after a one-word change to slide 8
**Area:** `prdgenie-video/scripts/capture.ts` — how the demo clips are encoded

## What happened

```
Could not extract frame from compositor
Error: Compositor error: No frame found at position 36352 for source …/9403562548104674.mp4
  http://localhost:3001/proxy?src=…/public/shots/s3r1.mp4&time=2.3666666666666667
```

Always `s3r1.mp4`, always about two and a third seconds in, always around 10% of the render. Three
runs on unchanged inputs: **failed, succeeded, failed.** Clearing Remotion's 66 stale temp asset
directories did not help; the second failure came after a clean cache.

The clip itself is fine. `ffprobe` reads it, and `ffmpeg -ss 2.2` seeks into it without complaint.

## The cause

`capture.ts` encoded every demo clip with libx264 at its default keyframe placement for this
input, which produced **exactly one keyframe — the first frame — for the entire clip:**

```
100000000000000000000000000000000000000000000000000000000000   (first 60 frames of 322)
```

Remotion does not play these clips; it *seeks* into them, frame by frame, from a Rust compositor
that keeps a pool of opened video handles. With one keyframe per clip, every seek is a decode
from frame zero, and under that load the compositor intermittently reported no frame at a byte
position it had computed. Intermittent, because it depends on what else is in the handle pool
when the request lands.

**The encoder was chosen for a file to be watched, and these files are never watched.** They are
random-access material for a renderer.

## Fixed

Both encoders in `capture.ts` — the screencast path and the held-frame fallback — now emit

```
-g 10  -keyint_min 10  -sc_threshold 0
```

a keyframe every third of a second, so any seek lands within five frames of one. The ten existing
clips were re-encoded in place with the same flags rather than re-shot, because re-shooting
consumes the demo state and proves nothing about the encoding. They grow from 8.5 MB to 71 MB in
total, which costs nothing: they are git-ignored intermediates.

## Still open

Nothing checks that a clip is seekable before a render spends twenty-five minutes discovering it
is not. The cheap version is one `ffprobe` in `finalize.ts` asserting more than one keyframe per
clip, and it is not built. Noted rather than done, because adding it now would change the checker
count this project quotes on a slide and in its README, and that number has already moved twice
today.
