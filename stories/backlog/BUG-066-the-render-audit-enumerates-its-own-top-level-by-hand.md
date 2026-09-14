# BUG-066: The render audit enumerates its own top level by hand

**Severity:** minor · a new top-level payload key is invisible to the audit until someone
remembers it
**Found:** 2026-09-05, adding `population_split` while fixing BUG-065
**Area:** `review-ui/scripts/audit-render.mjs`

## What happens

`audit-render` walks `payload.metrics`, `payload.caveat`, `payload.c1`,
`payload.uncomfortable`, the sessions rows and the weekly report — **as six hand-written
entries**. Adding `population_split` to `allMetrics()` produced a field the page did not render
and the audit reported **0 with no home**.

The audit's whole subject is "every number this surface computes is rendered or explicitly
consumed". Its per-metric walk is properly derived — `Object.keys(m)` — so `M1.populations`
was caught the moment it existed. Its *top level* is a list.

## Why it matters

This is the check-asserts-its-own-coverage rule (BUG-003/019/026/032) applied one level up and
found wanting. The nested walk is derived and the outer one is typed, which is the shape where
a check keeps passing while its coverage quietly shrinks — the failure this repository has
filed five cards about.

It is **minor** rather than major only because the miss is loud: a payload key with no home is
the audit's own headline output, so the gap is one commit wide, not permanent.

## The fix

Walk `Object.keys(payload)` and require every top-level key to be either an object the audit
knows how to descend, an array it knows how to sample, or a declared exemption with a printed
reason — the shape `check-exclusive` and `check-reason-codes` already use.

Its control must include the case that matters: **add a top-level key to the payload and require
the audit to notice without being told about it.**

## Not a fix

Adding `population_split` to the list, which is what BUG-065 did to unblock itself and is
recorded in a comment at the line. That homes one field and leaves the enumeration typed.
