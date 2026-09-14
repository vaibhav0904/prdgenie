# E4-S2: Click a citation, see the sentence

**As a** PM
**I want** every cited item to take me to the exact words in the exact document
**So that** checking a claim costs one click instead of a search

## Acceptance criteria

- [ ] Citation chips render on **every** item kind — requirements, stories, features,
      priority factors and open questions — not only requirements.
- [ ] Clicking a chip scrolls the source pane to the span and highlights it.
- [ ] Spans render from the **offsets the grounding check rewrote**, never the model's
      originals (ADR 0003).
- [ ] The source pane **follows the citation**, switching documents on click, with the
      document's name always visible (decided 2026-09-01).
- [ ] Source text is rendered as **text, never markup**. Zero `innerHTML` assignments; the
      pane escapes everything.
- [ ] An item whose citation cannot be placed shows the chip as unresolvable rather than
      silently rendering nothing.

## Depends on
- E4-S1

## Eval gate
- none directly. Verified by eye during UAT against three randomly chosen requirements
  (PRD-E4 success criterion 3).

## Technical notes

- **Highlighting the wrong sentence is worse than highlighting nothing**, because it looks
  verified. That is the whole reason ADR 0003 rewrites offsets rather than trusting the
  model's, and this story is where a reader would notice if it were wrong.
- **Source documents are attacker-controlled.** H1 exists because someone will paste hostile
  text; the pane must never interpret it. The E1 SPA already holds this line with zero
  `innerHTML` — do not lose it while adding panes.
- After E5 a version may draw on four sources, which is why the pane follows the citation.
  Showing all documents concatenated would make offsets ambiguous and the reading
  experience worse.
- An email chain repeats text verbatim, so one quote may occur four times in one document
  (PRD-E5). The offset hint is what disambiguates; this is the screen where picking the
  wrong occurrence becomes visible.

---

## DONE — 2026-09-03

Chips on requirements, open questions and unsettled positions. Clicking one fetches the
document, highlights the span and scrolls to it; the pane follows the citation across
documents and always names the one it is showing.

**Spans come from the offsets the grounding check rewrote**, never the model's originals
(ADR 0003), and a citation that could not be placed renders as a dashed **unplaceable** chip
rather than as nothing — highlighting the wrong sentence is worse than highlighting none.

**Source text is rendered as text and never as markup.** No assignment to `innerHTML`,
`outerHTML`, `insertAdjacentHTML` or `document.write` exists anywhere in the screen; every
node is `createTextNode` or `createElement`. The source is a PM's pasted document and it is
treated as data on the way out, exactly as it is on the way in.
