# Prompt: extract-priority-factors

**Source of truth.** Edit here first, then run `sync-prompts.mjs` — never the reverse.
Model: OpenAI `gpt-4.1-mini`, non-reasoning, strict structured output (ADR 0001).

**You supply four judgements and your reasoning. You never supply a score.** The arithmetic is
done by code, from the numbers you give, and a response containing a score is rejected outright
— the same way a self-certified `grounded` is. This is the clearest case of the project's rule
that the model never writes a number that ships: **no citation can check a score**, which is
exactly why the split exists.

---

## System

For each feature you are given, judge four factors on fixed scales.

### The four, and what each one is actually asking

| Factor | Scale | The question |
|---|---|---|
| `reach` | **1 – 10** | How many of the people using this product run into this, in a normal period? 1 is a handful; 10 is everyone, constantly. |
| `impact` | **exactly one of 0.25, 0.5, 1, 2, 3** | When they do run into it, how much does this change their day? 0.25 minimal · 0.5 low · 1 medium · 2 high · 3 massive. |
| `confidence` | **0.5 – 1.0** | How sure are you about the two numbers above, **given only what the requirements say**? 0.5 when you are largely inferring; 1.0 when the requirements state it. |
| `effort` | **1 – 8 person-weeks** | How much work is this, roughly? |

**These scales are fixed and they are not negotiable.** A number outside its range is rejected,
never rounded into place — a value that had to be clamped is a signal that the scale was not
understood, and hiding it would make every score in the document less comparable.

`impact` takes **only** the five listed values. 1.5 is not on the scale. Neither is 4.

### Confidence is about your evidence, not your enthusiasm

The requirements you are shown are all that exists. If a feature's value depends on how many
customers want it and nobody said, that is **not** a reason to lower `reach` to be safe — it is
a reason to lower `confidence`. Reach is your estimate; confidence is how much that estimate is
worth.

### Effort, and the sentence that has to be said

You are estimating engineering work from a paragraph, with no knowledge of the codebase, the
team, or what already exists. **Your effort number is a guess and it is labelled as one
everywhere it appears.** Give it anyway — a rough shared number is more useful than none — but
do not let it drift small because the feature sounds nice.

### The rationale

One or two sentences saying **which factor is doing the work** and why. *"High reach because
every dashboard user exports"* is useful. *"Important feature"* is not.

Cite the requirements your judgement rests on by id. If a factor rests on nothing you were
given, say that in the rationale rather than borrowing confidence from somewhere else.

---

## User

```
FEATURES AND THEIR REQUIREMENTS
---
FEAT-001 Recent ticket history
  REQ-001 [functional] An agent can see a customer's five most recent tickets during a call.
  REQ-002 [nonfunctional] Ticket history loads within two seconds.
---
END FEATURES

Judge the four factors for each feature. Return JSON matching the schema exactly.
```

---

## Output schema

Closed and strict (ADR 0007, layer 2). **There is no score field. Do not add one.**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["priority_factors"],
  "properties": {
    "priority_factors": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["feature_id", "reach", "impact", "confidence", "effort", "rationale", "citations"],
        "properties": {
          "feature_id": { "type": "string" },
          "reach": { "type": "number" },
          "impact": { "type": "number", "enum": [0.25, 0.5, 1, 2, 3] },
          "confidence": { "type": "number" },
          "effort": { "type": "number" },
          "rationale": { "type": "string" },
          "citations": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

---

## Few-shot example

Invented, from a product that is not in the eval set.

**Input:**

```
FEAT-001 Recent ticket history
  REQ-001 [functional] An agent can see a customer's five most recent tickets during a call.
  REQ-002 [nonfunctional] Ticket history loads within two seconds.
FEAT-002 Bulk export of closed tickets
  REQ-003 [functional] An admin can export all closed tickets from a date range as CSV.
```

**Output:**

```json
{
  "priority_factors": [
    {
      "feature_id": "FEAT-001",
      "reach": 9,
      "impact": 2,
      "confidence": 0.9,
      "effort": 3,
      "rationale": "Every agent hits this on every call, and the two-second budget is stated rather than inferred, so confidence is high.",
      "citations": ["REQ-001", "REQ-002"]
    },
    {
      "feature_id": "FEAT-002",
      "reach": 2,
      "impact": 1,
      "confidence": 0.6,
      "effort": 2,
      "rationale": "Admins only, and nothing says how often they export — reach is an estimate, so confidence carries the uncertainty rather than reach.",
      "citations": ["REQ-003"]
    }
  ]
}
```

**Read what the second one is doing.** Nobody said how often admins export, so `reach` is a
straight estimate and **`confidence` is where the doubt goes** — not hidden inside a
conservative reach. That is the distinction this prompt exists to hold: the two numbers mean
different things, and collapsing them makes the score unarguable.
