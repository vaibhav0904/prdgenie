# BUG-089: Closing BUG-084 did not fix the render — the cause was load, not keyframes

**Severity:** major · BUG-084 was closed as fixed, and the very next full render failed the same way
on the same clip. A fix declared on one success is BUG-040/BUG-068 again, in the film pipeline
**Found:** 2026-09-15, re-rendering the film after BUG-087 corrected a count on slide 8
**Area:** `prdgenie-video/scripts/finalize.ts` · `scripts/capture.ts` · new `scripts/seek-test.ts`

## What happened

```
Error: Compositor error: No frame found at position 28672 for source …/9403562548104674.mp4
  http://localhost:3001/proxy?src=…/public/shots/s3r1.mp4&time=1.8666666666666667
```

Same clip, same error, same point in the render as BUG-084 — and the clip carried the keyframe every
ten frames that BUG-084 had added. BUG-084's diagnosis rested on one successful render after the change.

## Measuring it instead of rendering it

A full render takes about twenty-five minutes, so one sample per attempt could never settle an
intermittent fault. `scripts/seek-test.ts` renders only the frames covering one beat, N times, and
counts failures. The "position" in the error turned out to be a timestamp in the clip's time base
(15872 / 15360 = 1.0333 s, exactly the `time=` the request asked for), which pointed at the renderer's
frame lookup rather than the file.

One variable at a time, on `s3r1`:

| Clip | Machine | Frames in parallel | Failed |
|---|---|---|---|
| as shipped | busy (ten clips re-encoding) | 6, the default | **3 of 5** |
| re-encoded, no B-frames | idle | 6 | 0 of 8 |
| re-encoded, B-frames kept (control) | idle | 6 | 0 of 6 |
| **as shipped** | **idle** | 6 | **0 of 8** |
| as shipped | loaded on purpose (3 encoders) | 6 | **3 of 6** |
| as shipped | loaded harder (6 encoders) | **2** | **0 of 6** compositor failures* |

\* One run failed differently — the browser could not start within 25 s under that load.

The first row misled for a while: B-frames looked like the cause because the no-B-frame clip passed,
but so did the control, and so did the original once the machine was idle. **The failure follows CPU
contention, not the encoding.** A full render supplies its own contention: six frames at once, each
asking the compositor for a frame of the same clips.

## Fixed

- `finalize.ts` renders with **concurrency 2** (`--concurrency N` overrides), with the table's evidence
  beside the constant.
- `capture.ts`'s comment no longer claims keyframes fixed the failure. The flags stay: they are cheap
  and keep every seek short.
- `scripts/seek-test.ts` is added as the instrument, so the next person to change the render can
  measure it rather than hope.
- The film was re-rendered end to end at concurrency 2 and completed.

## Release

**Not published yet.** The change was pushed to *prdgenie-video* on 2026-09-15 and reverted the same
day (`c22149d`): it had been tested on one machine only, and that repository takes nothing that has
not been tested across. It waits on the local branch `testing-render-fixes`. Until it is released,
the public repository still carries the defect this card describes.

## Lesson

**An intermittent failure is closed by a rate, not by a run.** And when the fix and a control both
pass, the variable you changed is not the one that mattered.

## Still open

Concurrency 2 was chosen from six runs under one kind of load; it is not a proof. The render has no
retry, so a failure still costs the run.
