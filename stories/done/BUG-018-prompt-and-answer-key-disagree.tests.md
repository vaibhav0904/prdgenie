# Test cases: BUG-018 The prompt forbids the requirement the answer key demands

**Decided by Vaibhav on 2026-09-02: Option 1** — `T3-R07` stands, the prompt clause is
narrowed. The recommendation and its reasoning are on the card.

**What was changed.** One exclusion bullet in `n8n/prompts/extract-requirements.md`, and
nothing else. It told the model to watch for **hedging words** — *"let's call it cut for
now"*, *"we'll come back to it"* — which is BUG-007's defect in a different hat: keying on
tone. It now states a test on a **fact about the document**:

| | Is it a requirement? | The tell in the text |
|---|---|---|
| `T3-R07` tablet cut | **Yes** — settled | Wei: *"I'm okay with you deciding it."* Marcus decides. |
| `T3-Q01` SAML vs self-serve | **No** — unsettled | Marcus: *"I'm not settling that in this meeting."* |
| `T3-Q02` alert latency | **No** — unsettled | Named as odd, deferred, never resolved. |

Both cases live in **one fixture, twenty lines apart**, which is why this change can be
controlled in both directions with data that already exists.

**The trap this test plan exists to catch:** the fix is "make T3 recall 100% again", and the
cheapest way to reach that number is a clause loose enough to let `T3-Q01` and `T3-Q02`
through as requirements too. **Recall without precision is not a pass.**

`prompt_version` `5ad1a07854f1` → **`47ac49c6330b`**. Three graded runs, result files
`2026-09-02-C1-run11/12/13` and `-C2-run20/21/22`.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`T3-R07` is extracted again** | The tablet cut appears in **3 of 3** | **FAIL** | present in runs 12 and 13, **missing in run 11**. Pooled with the negative control: **4 of 6** at the new clause against **2 of 6** at the old one |
| TC2 | **T3 recall returns to its measured level** | **100%** in all three runs, as at prompt `7267c39b005e` | **FAIL** | **85.7 / 100 / 100**. Better than the 85.7 / 71.4 / 100 that opened this card, short of the 100 / 100 / 100 before it |
| TC3 | **T3 precision does not pay for it** | **≥ 77.8%**, the level measured before | **FAIL (1 of 3)** | **75.0 / 77.8 / 77.8**. Run 11 sits exactly on the 0.75 floor. Two of three match the prior level; one is below it |
| TC4 | **BUG-007 does not re-open** | Neither side of `T3-Q01` nor `T3-Q02` appears as a requirement | **FAIL — the row overshot the claim** | `T3-Q02`: clean, 3 of 3. `T3-Q01`: **both sides extracted in 3 of 3**, exactly as before this change. The row demanded a fix this card never promised; the fair reading is *unchanged, not worsened*. Recorded on BUG-007 as its third data point |
| TC5 | **T1 is not damaged** | ≥0.80 / ≥0.75, inside recall 86.7–93.3% | Pass | recall **86.7 / 86.7 / 86.7**, precision **81.3 / 92.9 / 92.9** — inside the range measured before |
| TC6 | **BUG-004 is not undone** | G1: **0 requirements**, parked, 3 of 3 | Pass | parked `no_requirements_found`, 0 requirements, all three runs |
| TC7 | **C2 still passes** | All three auto-fail rules green, 3 of 3 | Pass | C2 PASS in runs 20, 21 and 22 |
| TC8 | **BUG-004's TC6 closes** | The row left failing when BUG-004 was promoted now passes | **Partial** | 2 of 3 runs match its `100% / 77.8%` exactly; run 11 does not. Evidence cell updated in `stories/done/` rather than left stale |
| TC9 | **NEGATIVE CONTROL: the clause is what did it** | Old bullet back → `T3-R07` goes missing; hygiene check flips | **Partial** | **Deterministic half clean both ways:** hygiene PASSES on the new clause, FAILS on the old one and names `T3-R07`. **Statistical half is one run wide:** new 2 of 3, old 1 of 3. Prompt restored byte-for-byte and redeployed |
| TC10 | **The prompt no longer quotes the answer key** | No label quote appears in any prompt | Pass — **after the check itself was fixed** | 109 quotes × 1 prompt, no hit. Its first version passed on the *old* prompt too: the label is `"Let's call it cut for now."`, the prompt read `"let's call it cut for now"`, and an exact substring test missed by one full stop |
| TC11 | **`prompt_version` moved and was recorded** | Hash changes, workflow carries it, results name it | Pass | `5ad1a07854f1` → `47ac49c6330b`, synced, imported, named in all six result files |
| TC12 | **Three runs, and the range is published** | The spread is reported, not a best run | Pass | every figure above is a triple; nothing in the write-up quotes a single run |

**7 of 12 pass. Four rows fail and one is partial, and none of them are being rewritten to
agree with the output.**

## What the failures mean, taken together

**The clause did what it was asked to do, and the model applies it about two-thirds of the
time.** That is the same adherence rate BUG-007 measured, BUG-004 hit at three prompt
iterations, and this card has now measured a third time. It is the most reliable finding
this project has about this model: **an instruction to withhold is followed roughly two runs
in three, and no rewording has moved that.**

C1 passes 3 of 3, which was the gate this card set out to unblock. It passes **marginally** —
run 11's T3 precision sits exactly on the floor — and that is written here so nobody quotes
"C1 green" without it.

## Out of scope, named so it is not smuggled in

- **E3-S4 is not built by this card**, and it is now the fix for two closed cards rather than
  one. `T3-Q01` still has nowhere to go.
- **BUG-016 is not fixed here.** Touching prose in the same edit would make both diagnoses
  unattributable.
- **No other exclusion bullet was edited**, so the negative control means something.
