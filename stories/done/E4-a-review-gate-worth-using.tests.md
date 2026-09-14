# Test cases: E4 — a review gate worth using daily

**One test plan for six stories (E4-S1 … E4-S6), built as one chunk.** The same two
deviations as the E3 chunk apply and are named again rather than assumed forgiven: **WIP=1**
was set aside on an instruction to take larger chunks, and **G3** was met by the acceptance
criteria on the cards rather than by a test plan written first.

## The claim this epic has to earn

> **The disabled button is a courtesy. The endpoint is the check. The trigger is the
> guarantee.**

Only the last two are guarantees, and **every row below is exercised through the HTTP API with
no browser involved** — because a gate that only holds in a browser is a convention.

## E4-S1 — decide one item at a time

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | Every requirement and story carries its own decision, one `review_actions` row each | append-only | Pass | `verify-review-gate` TC10 — three decisions, three rows, in order |
| TC2 | A reason is **required** on reject, edit and override, enforced at the storage layer | refused without one | Pass | TC3: `reason_required` comes back from the **trigger**, not the form |
| TC3 | An edit stores `before_text` and `after_text` and is another row, never a mutation | history whole | Pass | the statement is rewritten; the action row keeps both texts |
| TC4 | An edited requirement is `pm_authored` and **leaves M1 entirely** | grounding rate cannot be improved by editing | Pass | TC5: `grounded_of` fell from 2 to 1 the moment the edit landed |
| TC5 | An edited requirement **keeps its citations**, marked as from the original extraction | citations intact | Pass | TC5 |
| TC6 | A decision on an item that is not on this version is refused | 400 | Pass | TC4 — otherwise it would count toward readiness invisibly |
| TC7 | **Amended: `subject` is persisted and rendered** (BUG-016's residue) | visible beside the statement | **Not done — moved** | See below |

## E4-S2 — click a citation, see the sentence

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC8 | Chips render on requirements, open questions and unsettled positions | every cited kind | Pass | `review.html`; features carry factor rationales, and factor citations are `req_id`s rather than spans |
| TC9 | Spans render from **the offsets the grounding check rewrote** | never the model's | Pass | the API returns stored `start_char`/`end_char`/`match_kind` |
| TC10 | The source pane follows the citation and names the document | switches on click | Pass | `showCitation` fetches and caches per `doc_id`; the name and authorship are always visible |
| TC11 | Source text is rendered as **text, never markup** | zero markup sinks | Pass | **No assignment to `innerHTML` anywhere**, and none to `outerHTML`, `insertAdjacentHTML` or `document.write` either — all four counted at zero. The one match for the bare word `innerHTML` is the comment saying there are none. Every node is `createTextNode` or `createElement`. |
| TC12 | An unplaceable citation shows as unresolvable rather than rendering nothing | dashed chip, not clickable | Pass | `match_kind === 'not_found'` renders "unplaceable: …" with a title explaining it |

## E4-S3 — the endpoint refuses, not the button

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC13 | Sign-off recomputes readiness **from the rows** at the moment of sign-off | not a stored flag | Pass | there is no `is_ready` column; `readiness()` queries every time |
| TC14 | A `curl` mid-review is refused with a reason that **names what is undecided** | 409 + the list | Pass | `items_undecided — 3 of 3 items have no decision`, listing all three |
| TC15 | **NEGATIVE CONTROL: remove the recomputation → a mid-review sign-off succeeds** | both directions | Pass | `negative-control-review-gate.mjs`; the file is restored byte-for-byte |
| TC16 | The marker is re-proven, not assumed: a hand-run `UPDATE` on a **different** version immediately after a real sign-off | refused | Pass | `verify-review-gate` TC8 — v1 refused on the same connection |
| TC17 | An approved version cannot be walked back | illegal transition | Pass | TC8 |

## E4-S4 — approving something unproven costs a sentence

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC18 | Ungrounded requirements carry a visible badge | no hover, no expand | Pass | *"not verified against the source"* renders in the item head |
| TC19 | Approving one uses `approve_ungrounded` with a **required** reason | distinct decision | Pass | `verify-review-gate` TC3 |
| TC20 | An ungrounded item **cannot** reach approval through the plain path | refused | Pass | TC3: `ungrounded_requires_override` |
| TC21 | Overrides are counted **separately**, everywhere | never blended | Pass | `approved` and `approved_ungrounded` are distinct in the API, the header pill and the sign-off response |
| TC22 | **NEGATIVE CONTROL: remove the guard → the unverified item takes the plain path** | and lands in the wrong bucket | Pass | `approved=1, overrides=0` with the guard gone. **That is what the count would have said while an unverified requirement shipped** |

## E4-S5 — the screen says what it is unsure of

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC23 | Every figure computed at render from rows | no stored summary | Pass | `figures()` queries on every call |
| TC24 | A rate never appears without its denominator | "1 of 2", not "50%" | Pass | the API returns counts; the screen renders `grounded of grounded_of` |
| TC25 | The caveat line is **computed from state** and absent on a clean version | never hand-written | Pass | `caveats()` returns `[]` for a clean version; the screen renders nothing |
| TC26 | The trend says **"no prior version"** rather than zero | not faked | **Pass, after a fix** | It was faked. See below |

## E4-S6 — my own words are not evidence

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC27 | `authorship` is set **at the door** and nowhere else | on `source_documents` | Pass | `normalize()` refuses an unrecognised value rather than defaulting a typo |
| TC28 | **Both** doors collect it | form dropdown, optional webhook field | Pass | form: *"Who wrote this?"*, required. Webhook: `authorship`, defaulting to `third_party` |
| TC29 | A requirement from a first-party document is `pm_authored = 1` and **excluded from M1** | same exclusion as an edit | Pass | live: `DOC-2026-0574` → v672, both requirements `pm_authored=1` |
| TC30 | The screen distinguishes the two visibly | a different badge | Pass | *"the PM's own words"*, and the source pane says *"written by the PM — not corroboration"* |
| TC31 | `docs/metrics.md` M1 names **both** exclusions in one sentence | one stated meaning | Pass | amended, and the SQL now carries `AND pm_authored = 0` |
| TC32 | Nothing downstream of WF1 branches on `authorship` | recorded, not routed | Pass | one grep: it appears in the doors, storage, `figures()` and the screen — nowhere in WF2 |
| TC33 | **NEGATIVE CONTROL: relabel first-party as third-party → its requirements re-enter M1** | both directions | Pass | 2 of 2 excluded → 1 of 2 grounded → restored |

**32 of 33 pass. One was moved rather than done, and it is named below.**

---

## The defect the tests found: sign-off signed the wrong session

`verify-review-gate` asserted there was exactly **one** review session per version. There were
two: every decision went into the session the reviewer worked in, and **sign-off inserted a
fresh row for the signature**.

Nothing failed visibly. The signature existed, the actions existed, and the rows were fine on
their own — but *"who approved this, having decided what?"* could not be answered from the
database, because the two halves were in different sessions. Fixed: sign-off stamps
`signed_off_at` on the session that did the work.

**That assertion existed only because it was cheap to write.** It is the kind of row that
looks like padding until it fires.

## The number that was faked, and it was mine

The first `trend()` took *"the previous version of this `prd_id`"*. Every fixture in this
project ingests under one `prd_id`, so the screen would have shown **"requirements 6 → 13"** —
two unrelated documents, rendered as growth.

E4-S5 says the trend must render *"no prior version"* until E6 makes one exist, and *"is not
faked, hidden, or shown as zero"*. It was faked, plausibly, on the first attempt. A version now
has a predecessor only when it was **produced from one** — when `prd_changes` rows exist, which
WF3 writes and nothing does yet.

## TC7 — moved, not done

BUG-016 closed on the promise that E4-S1 would persist and render `subject`, to test whether
the model is satisfying *"name the subject"* in that field and dropping it from the statement.

**It is not built.** `subject` is still required by the extraction schema and still discarded
at storage. Doing it needs a column, a migration and a change to the extraction path — small,
but it is not the review gate, and folding it in here would have hidden it inside a chunk that
already set aside two rules.

**Filed as BUG-027** so it is a card with an owner rather than a sentence in a closed card's
appendix, which is exactly what BUG-016's closure promised not to do.

## Out of scope, named

- **No authentication.** Every action is attributed to `local-operator`, and
  `docs/assumptions.md` calls this the biggest gap. It is stored honestly rather than
  simulated: an unattributed signature that looks attributed is worse than one that admits it.
- **No metrics page.** E8 owns it; this screen shows only its own version's numbers.
- **Rejected items are excluded from the approved content with their reason** and do not block
  sign-off (decided 2026-09-01) — blocking would make rejecting expensive enough that nobody
  would do it.
