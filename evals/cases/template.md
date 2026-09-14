# Eval case: <name>

**Measures:** <the one quality question this answers, in a sentence>

**Method:** <how actuals are pulled, how they are compared to labels, how
partial credit works. Name the fields compared and the verdict classes:
ok / wrong / missed / HALLUCINATED / manual-review.>

**Pass threshold:** <number> — plus any auto-fail rule, stated separately.
e.g. "≥ 90% field accuracy AND zero hallucinated fields — a single invented
value fails the case at any accuracy."

**Why this threshold:** <which error is the expensive one, and why the bar
sits here. If one class of miss is a trust incident rather than a quality
dip, say so and set that class to 100%.>

**Gates:** <story ids that cannot reach done/ until this passes>

**Automated?** <yes — `<command that runs it>`, failing verdict = non-zero
exit | NO — and if no, this case is a wish until it is: name the story that
will automate it. "Hand-run for now" goes stale within two changes.>

**Re-run when:** <the prompts, queries, configs and schemas whose change
invalidates this case's last result — e.g. "the extraction prompt, the
grounding SQL, any vendor/fallback change". Consulted on every change,
not remembered.>

**Result file:** `evals/results/<YYYY-MM-DD>-<name>.md`

---

## Result format

Each run archives: dataset size, the version of whatever was being graded,
score vs threshold, a per-item diff table, and a `## Verdict:` line reading
PASS / FAIL / PASS-PENDING-MANUAL-REVIEW.

Results are dated files, never overwritten in place. When a re-run supersedes
an earlier figure, the old file stays and says what it is — corrections are
appended and labeled, never erased.
