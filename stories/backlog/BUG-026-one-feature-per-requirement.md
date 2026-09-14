# BUG-026: The clusterer makes one feature per requirement, so the feature layer is a rename

**Found by:** C3, printing the one figure it is not allowed to fail on
**Severity:** major — the epic exists to turn thirty statements into something an engineer can
plan from, and half of that structure currently adds nothing

## The finding

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| Requirements | 69 | 66 | 68 |
| Features | 68 | 63 | 63 |
| Epics | 38 | 36 | 34 |
| **Requirements per feature** | **1.01** | **1.05** | **1.08** |
| Features per epic | 1.79 | 1.83 | 1.85 |

**The epic layer works.** Each holds about two features, grouped by outcome — *"Dashboard
export and sharing"*, *"Security and compliance"*, *"Data source constraints"*.

**The feature layer does not.** Almost every feature holds exactly one requirement, with a
title that restates it:

> `Export Chart Data as CSV` — REQ: *"Every chart must allow the user to export its underlying
> rows as a CSV file."*
> `Hourly Data Refresh` — REQ: *"The product must refresh data hourly for the pilot release."*

The prompt names this failure directly: *"a feature holding one requirement whose title is that
requirement with the verb changed has added nothing."* It happens anyway, on 63 features of 63.

## Why C3 passes on it, and why that is correct

Every link resolves. Every score recomputes. **C3 is green on all three runs**, and it should
be: the structure is well-formed. It is just empty of grouping.

This is why the case prints requirements-per-feature **with no threshold**, and why that
paragraph was written into the case file before the first run:

> *"A clusterer that puts one requirement into each of thirty features produces a perfectly
> linked document with no grouping in it, and every check above passes."*

**A case that reported only what it can fail on would have called this a clean pass.**

## Not fixed here, deliberately

E3-S1's own instruction: *"No hard cap on epic count. If clustering is routinely poor, that is
a BUG card naming the pattern, not a prompt quietly tightened until the fixtures look good."*

Three candidates, not yet separated:

1. **The prompt describes the failure but does not redirect it.** It says a one-requirement
   feature "has added nothing" — a prohibition, and this project has measured what those are
   worth six times. The redirect would name where a lone requirement goes instead: *attached to
   the nearest feature it constrains*, or *straight to the epic with no feature at all*.
2. **The schema makes one-per-feature the path of least resistance.** Every requirement must
   land somewhere, features are cheap to create, and nothing in the shape costs the model
   anything for making sixty-three of them.
3. **The fixtures may not have much to group.** T1's fifteen requirements really are fairly
   distinct. **This is the candidate to test first, because if it is true the other two are
   solutions to a fixture problem** — and F1, a feature brief about one capability, is where a
   correct clusterer should produce few features and many requirements each.

**Re-run when:** C3. Read the ratio line, not the verdict — the verdict is green and will stay
green while this bug is open.

## Lesson

**A number a case is not allowed to fail on is still worth printing.** Every threshold in C3
passed, three runs running, on a document whose middle layer is a rename. The only thing that
caught it was a line in the result file that exists to describe rather than to judge — and it
was written before the first run, when there was nothing to be embarrassed about yet.
