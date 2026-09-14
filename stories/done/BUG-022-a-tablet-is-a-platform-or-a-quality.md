# BUG-022: The prompt's tie-break and the answer key disagree about tablets

**Found while:** BUG-016, reading *why* T1 recall sits at 80.0% rather than assuming the
prose change caused it
**Severity:** minor — one label, costing 6.7 points of T1 recall in **every run measured**,
and it has been doing so since long before the card that found it

## The finding, in two rules

`T1-R02` is labelled **`nonfunctional`**:

> *Dashboards are viewable, read-only, on a tablet in landscape orientation.*

The extraction prompt's tie-break says:

> **If it names a specific external thing the product must conform to — a named vendor,
> protocol or system, a brand or logo, a legal or compliance regime, a date, a named customer
> account — it is a `constraint`.**

**A tablet is a platform**, and the same paragraph lists "a platform" among the things that
make a `constraint` (see the `constraint` definition: *"a date or deadline, a scope limit, a
platform, a compliance or legal rule…"*).

So the model calls it a `constraint`, the key says `nonfunctional`, and C1's matcher requires
the kind to agree — the item is found, correctly cited, and scored as `wrong_kind`, which
counts as both a miss and a false positive.

## It is not new, and that is the point

| Run | Prompt | `T1-R02` |
|---|---|---|
| 15, 16, 17 | `47ac49c6330b` | `wrong_kind` |
| 18, 19, 20 | `4da5ffb95e7d` | `wrong_kind` |

**Six of six.** It was invisible because T1 recall was comfortably above the floor; BUG-016
brought the number down to exactly 0.80 and made the standing losses worth reading one by
one.

## Why it matters

**A label the extractor can never match is a permanent 6.7-point tax on T1 recall**, and it
is currently the difference between a comfortable pass and sitting on the floor. Any future
change that costs one more label will fail C1 for a reason that is half this bug's.

## The question, which is not mine to answer

`T1-R02` and the tie-break cannot both stand — the same shape as BUG-018, and it should be
handled the same way.

1. **The label is right, the tie-break is too broad.** *"Viewable on a tablet"* is a quality
   of the product (how well it behaves on a device class), not an external commitment. Then
   the tie-break needs to distinguish "conforms to a named external system" from "works on a
   class of device".
2. **The tie-break is right, the label should be `constraint`.** A platform is named in the
   `constraint` definition in as many words. Then this is a labelling error from E1-S3 —
   allowed to correct, but it is a **specification change** and must be written down as one.

**No recommendation attached, for BUG-009's reason.** This is a reading of the answer key,
and the answer key is Vaibhav's.

**Do not "fix" this by relaxing C1's kind matching.** Kind agreement is what stops a
requirement being counted as found when the system filed it in the wrong drawer, and that is
the whole subject of BUG-007.

## Lesson

**A number comfortably above its floor hides everything that is losing it points.** T1 recall
had been 86.7% for weeks with a permanently unmatchable label inside it. It took an unrelated
change pushing the figure to exactly 0.80 for anyone to read the misses.

## Decision — delegated to me by Vaibhav, 2026-09-02

> *"Proceed with the approach that is best according to you."*

**Option 1: the label is right, the tie-break is too broad.** `T1-R02` stays
`nonfunctional`; the prompt is narrowed.

**The deciding reason is precedent, not taste.** BUG-018 was the same shape — a prompt clause
written after a label, contradicting it — and the resolution chosen there was *keep the label,
narrow the clause*, on the grounds that **a label changed after watching the model fail on
that label is indistinguishable from tuning**, whatever its merits. That reasoning applies
here unchanged. Relabelling `T1-R02` today would need "changed after seeing the failure"
written beside it, and would discount every T1 number.

**And it holds on the merits too.** The tie-break's list is about conforming to something with
**a name and an owner outside the product** — SAML, a logo, a law, a date, a customer account.
A tablet has none of those. *"Viewable on a tablet in landscape"* describes how well and where
the product behaves for its users, which is the definition of a quality attribute.

### What changed

Two edits, kept consistent with each other so the prompt cannot contradict itself:

- The `constraint` definition now reads *"a **named** platform"*, not *"a platform"*.
- A new paragraph after the tie-break: **a class of device is not a named external thing.**
  *"Works on tablets"*, *"usable on a phone"*, *"supported in the browser"* are qualities. A
  platform becomes a `constraint` only when the sentence commits to a named one — *"ships on
  the App Store"*, *"certified for Windows 11"*.

### The regression this must not cause

The tie-break exists because `nonfunctional` and `constraint` were being confused in the other
direction. Narrowing it must not pull the genuine constraints back out:

- `T1-R09` SAML identity provider → must stay `constraint`
- `T1-R12` customer logo and palette → must stay `constraint`
- `T1-R05` the fixed Q4 date → must stay `constraint`
- `T3-R06` the three named pilot accounts → must stay `constraint`

Checked by C1's per-item diff on both graded fixtures, three runs.

## Outcome — fixed, 2026-09-02, prompt `b9d627e994f8`

**`T1-R02` matches in 3 runs of 3.** It had been `wrong_kind` in **all six** runs before.

```
| T1 | 15 | 13 | 13 | 2 | 0 | 0 | 0 | 86.7% | 100.0% | pass |   x3
```

**The regression the narrowing could have caused did not happen.** Every genuine constraint
the tie-break was written for still classifies as one, in all three runs:

| Label | Kind | |
|---|---|---|
| `T1-R09` SAML identity provider | `constraint` | match |
| `T1-R12` customer logo and palette | `constraint` | match |
| `T3-R06` the three named pilot accounts | `constraint` | match |

**Zero `wrong_kind` rows anywhere in the batch**, on either graded fixture.

**Side effects, both good and both measured:** T1 recall came off the floor, 80.0 → **86.7%
×3**, and T1 precision reached **100.0% ×3** — the first clean run in this project's history.
Some of that is BUG-016's change in the same batch; the `wrong_kind` half is unambiguously
this card's, because it is the only thing that could have moved a *kind*.

**Closed.**
