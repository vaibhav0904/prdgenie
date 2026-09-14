# Test cases: BUG-063 — the reason-code check cannot see a ternary

```
.\run.cmd review-ui\scripts\check-reason-codes.mjs             every reason expression, not every literal
.\run.cmd review-ui\scripts\negative-control-reason-codes.mjs  and a ternary is planted in it
.\run.cmd check-all.mjs                                        every standing check
```

**The row that decides this card is TC4.** The two missing codes are the symptom; if the
extractor still reads only "a quoted literal immediately after the colon", the next code written
as a ternary is just as invisible and the check still prints a coverage claim it cannot support.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`nothing_to_review` and `items_undecided` are in `DOOR_REASONS` and in `docs/contracts.md` §1** | both, both places | **Pass** | `DOOR_REASONS` is 17 codes; §1's table gives each a "when" row |
| TC2 | **The check finds them** — it did not before, and that is the whole card | 2 more | **Pass** | the widened extractor's first run named exactly those two and nothing else, at `server.js:1098` |
| TC3 | **The literal count rises**, and the new figure is stated rather than the old one quietly replaced | figure printed | **Pass** | **89 → 98 literals**, 44 → 47 declared codes |
| TC4 | **Both arms of a ternary are read** | both arms | **Pass** | NC2b and NC2c plant an undeclared code in each arm **separately** — a checker that read only the first would pass a test that planted only the first |
| TC5 | **A value with no literal at all is REPORTED, not skipped** | listed | **Pass** | **14 pass-throughs** listed by name and expression, and explicitly subtracted from the coverage figure |
| TC6 | **A partly-dynamic value is read for what it does contain** | both | **Pass** | `reason: env.payload?.reason ?? classifyProviderError(raw)` is listed; `x ?? 'llm_error'` yields the literal and is marked dynamic |
| TC7 | **A literal containing a comma or brace does not truncate the expression** | intact | **Pass** | the scanner skips strings rather than counting their punctuation |
| TC8 | **The workflow exports still work**, where quotes arrive escaped | same as before | **Pass, after a fix** | see below — this one nearly went the wrong way |
| TC9 | **Everything else the widened extractor finds is a contract amendment or a card** | each named | **Pass** | six more findings, and **four of them were the checker's fault, not the code's** — see below |
| TC10 | **CONTROL: a ternary arm naming an undeclared code turns the check red** | red, names it | **Pass** | NC2b/NC2c, `invented_first_arm` / `invented_second_arm` at `delta.mjs:63` |
| TC11 | **CONTROL: a pass-through is not treated as a failure** | green | **Pass** | NC2d: `reason: someRuntimeValue` → exit 0, listed as a pass-through |
| TC12 | **The existing controls still behave** | all | **Pass** | **13/13**, NC1–NC7 unchanged and five new |
| TC13 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | byte-identical twice; control 13/13 twice |
| TC14 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, two named** | **63 of 65 in 258s** — BUG-046, and BUG-059, which produced a new observation: it is now **NC1** that fails, so its leavings survive between runs. Recorded on that card |

One row the plan did not have:

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC15 | **CONTROL: a literal being COMPARED is not read as a code** | green | **Pass** | NC2e. `reason: kind === 'conflict' ? … : …` is real, in `gaps.mjs` |

## Widening it found six more things, and four were mine

The first widened run reported eight undeclared codes. Two were the card's. **The other four were
the checker over-reading**, and each is now a rule with a control behind it:

| Reported | What it actually was |
|---|---|
| `conflict` | the **condition** of a ternary in `gaps.mjs`: `kind === 'conflict' ? 'conflict_needs_both_sides' : 'no_citation'`. Comparison operands are stripped — general, so it catches the shape wherever it appears rather than only in a first ternary |
| `main` | the tail of the n8n node named **"Refused — log the reason"**, whose connections object is `{"main": […]}`. A key is in property position, preceded by `{`, `,` or a line start — never by a letter or a space inside a longer phrase |
| `type`, `string` | `\"reason\": { \"type\": \"string\" }` — a JSON **schema** for the model's output. A `reason` whose value is an object is a shape, not a code slot. Two of them, listed |

**And then TC8 nearly went the wrong way.** Requiring the key to be in property position made the
schema case vanish *silently* — `\s*` does not match the two characters `\` and `n`, which is how
a Code node's newlines arrive inside a JSON string. **A blind spot introduced by the fix for a
blind spot.** Caught by re-reading the output for the findings that had stopped appearing, and
fixed with `(?:\s|\\n)*`; three more workflow occurrences came back with it.

## What the check now says it cannot see

```
Not statically readable, and therefore NOT covered by the figure below:
  pass-through  review-ui/server.js:1182  reason: err.reason
  pass-through  n8n/workflows/WF0-llm-call.json:89  reason: classifyProviderError(err)
  schema field  n8n/workflows/WF2-generate-prd.json:245  reason is a shape, not a code
  ... 14 pass-throughs, 2 schema fields
```

A denominator that silently excludes what it could not see is the hand-counted denominator this
project has been bitten by three times (BUG-003/019/032). These are subtracted **out loud**.

## The thing that must not happen

**Adding the two codes and leaving the extractor alone** — the card's own non-fix. And the
mirror of it: a check that goes red on every pass-through. `reason: err.reason` cannot be read
statically and never will be; a rule that failed on it would be switched off within a day, and a
check nobody runs is worse than one that under-reports. TC5 and TC11 are the pair that pins that
distinction, and NC2d is the control that would catch it drifting.

## Not tested here, and named

- **Whether a pass-through's runtime value is declared.** Only a run can say. This card makes the
  check honest about what it cannot see, which is a different thing from seeing it.
- **A literal compared with something other than `==`/`===`/`!=`/`!==`** — inside `includes()`,
  say — is still read as a code. That is a false positive, and a false positive fails loudly;
  the direction this check must never fail in is the quiet one. Stated in the source.
