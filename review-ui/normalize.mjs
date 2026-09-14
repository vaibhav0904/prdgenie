// Door-side normalization: raw input -> the canonical SourceDocument of
// docs/contracts.md §1a. Every door produces exactly this shape, and nothing downstream
// of WF1 may tell the doors apart.
//
// Redaction happens HERE, before storage, so no un-redacted text is ever persisted and
// every span offset refers to the same immutable string forever (ADR 0003).

// --- Canonical text --------------------------------------------------------
// Line endings are canonicalised BEFORE redaction and before storage, because `raw_text`
// is immutable from insert onward and every citation offset in the system refers to it
// forever (ADR 0003).
//
// Browsers submit textarea content with CRLF; a JSON caller sends LF. Without this, the
// same document through two doors became two different immutable strings — a quote
// spanning a line break would match through one door and not the other, and every offset
// after the first newline would drift (BUG-006).

const BOM = String.fromCharCode(0xFEFF);

function canonicaliseText(text) {
  // The BOM is built from its code point rather than typed: a literal BOM in source is
  // invisible, and an invisible character inside the rule about invisible characters is
  // exactly how this defect comes back.
  const withoutBom = text.startsWith(BOM) ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

// --- PII -------------------------------------------------------------------
// External contact details only. Internal stakeholder names are deliberately KEPT:
// "Priya (Eng Lead) asked for this" is the attribution that makes a requirement
// reviewable (docs/assumptions.md). Do not "improve" this without changing that
// assumption first.

// A phone number is matched by SHAPE, not by "a run of digit groups" (BUG-008).
//
// The old rule required every group to be 3-4 digits, so `+44 20 7946 0812` and
// `+39 02 8088 1140` — a London and a Milan number, two of the commonest formats in
// Europe — could not be matched from the `+`. What the pattern could match further along
// was 8 digits, which the >=9-digit guard then correctly rejected, and the whole number
// survived. **A validity guard applied to a bad match does not fail safe:** it turns
// "redact too little" into "redact nothing", silently.
//
// So groups are now 2-6 digits, and the thing that stops a date or a version string
// matching is no longer the group size but the fact that a dialable number ANNOUNCES
// ITSELF in one of three ways:
//
//   international   +44 20 7946 0812   +39 02 8088 1140   +442079460812
//   national trunk  07700 900412       0207 946 0812
//   parenthesised   (0161) 496 0033    (415) 555-0123
//
// Nothing else is treated as a phone number. `2026-09-02`, `10.0.26200.9106`, `v1.2.3`,
// `41 000 000` and a bare ISBN all fail on that structure rather than on a digit count.
//
// KNOWN AND DELIBERATE GAP: a bare national number with no trunk zero and no country code
// — the US `415 555 0123` written without parentheses — is not matched. Widening to catch
// it means matching any three digit groups, which is the old rule and the reason this bug
// exists. The corpus has no such number; if one is ever added, this comment is the place
// the decision was made, and `docs/assumptions.md` is where the limit is claimed.
const PHONE_SHAPES = [
  // +CC then 1-5 groups. The separator is optional so E.164 compact form is covered.
  '\\+\\d{1,3}(?:[\\s.-]?\\d{2,6}){1,5}',
  // (area) then 1-5 groups.
  '\\(\\d{1,5}\\)[\\s.-]?\\d{2,6}(?:[\\s.-]?\\d{2,6}){0,4}',
  // National trunk zero. The separator is REQUIRED here: without it, any long digit run
  // beginning with a zero would qualify.
  '0\\d{1,4}(?:[\\s.-]\\d{2,6}){1,4}',
];

// The lookarounds stop a match STARTING or ENDING inside a longer token. Without the
// lookbehind, `10.0.26200.9106` offers `26200.9106` — nine digits, which passes the guard.
const PHONE_RE = new RegExp(`(?<![\\w.])(?:${PHONE_SHAPES.join('|')})(?![\\w.]*\\d)`, 'g');

// E.164: a dialable number is 9 to 15 digits. The lower bound keeps a date range out; the
// upper bound keeps a long grouped figure — an account number, an ISBN — out.
const PHONE_MIN_DIGITS = 9;
const PHONE_MAX_DIGITS = 15;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const PII_RULES = [
  { kind: 'email', re: EMAIL_RE },
  { kind: 'phone', re: PHONE_RE },
];

// --- Names are NOT redacted, and that is the decision, not the backlog -----
//
// Two rules, both contact details. A name — internal or external, individual or company —
// is deliberately kept.
//
// BUG-009 built external-name redaction and it worked: anchored on the local part of an
// external email address, it removed all eight of H2's labelled name forms while leaving
// the internal stakeholders, the customer organisations and the job titles alone. Vaibhav
// withdrew it on 2026-09-02, and the reason is a product reason rather than a technical
// one: **a requirement is only reviewable if you can tell who asked for it.** A speaker
// whose role is never stated in the document is identified by nothing but their name, so
// redacting it does not anonymise the requirement — it orphans it.
//
// So the claim this system makes is narrow and stated: **contact details are removed;
// names are kept.** Not "PII is redacted". See docs/assumptions.md, which also records what
// that costs — real external individuals' names reach the database the moment a real
// transcript does, and those people have not agreed to it the way an employee has.
//
// The answer key enforces BOTH halves. H2's `expected_retentions` lists the names that must
// SURVIVE, and C2 fails on a retention that goes missing, so a future "improvement" that
// starts eating names is a red case rather than a silent change of policy. That assertion
// is the durable part of BUG-009; the code it replaced is in the history.

export function redact(text) {
  let out = text;
  const redactions = [];
  for (const { kind, re } of PII_RULES) {
    const seen = new Map();
    out = out.replace(re, (match) => {
      // The guard runs on the WHOLE candidate region, which is the half of BUG-008 that
      // the pattern alone does not fix. Applied to a partial match it fails open: the
      // fragment is rejected and the rest of the real number is left in the text.
      if (kind === 'phone') {
        const digits = match.replace(/\D/g, '').length;
        if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) return match;
      }
      if (!seen.has(match)) seen.set(match, `[${kind.toUpperCase()}-${seen.size + 1}]`);
      return seen.get(match);
    });
    for (const [value, replacement] of seen) {
      redactions.push({ kind, replacement, count: countOccurrences(text, value) });
    }
  }

  return { text: out, redactions };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) { count++; i = haystack.indexOf(needle, i + needle.length); }
  return count;
}

// --- Segments --------------------------------------------------------------
// Advisory only: speaker attribution and chunk boundaries. Nothing downstream may
// require a speaker to exist (docs/contracts.md §1a), which is why a document with no
// speaker labels legitimately returns [].

const SPEAKER_LINE = /^([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*(?: \([^)]{1,40}\))?):\s/;

export function segment(text) {
  const segments = [];
  let offset = 0;
  let current = null;

  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1; // +1 for the newline consumed by split
    const m = line.match(SPEAKER_LINE);
    if (m) {
      if (current) { current.end_char = lineStart; segments.push(current); }
      current = { segment_id: segments.length + 1, speaker: m[1], start_char: lineStart, end_char: offset };
    } else if (current) {
      current.end_char = offset;
    }
  }
  if (current) { current.end_char = Math.min(current.end_char, text.length); segments.push(current); }
  return segments;
}

// --- Titles and dates ------------------------------------------------------
// The only thing that differs per doc_type. Adding a fifth type is a case here, not a
// branch anywhere downstream.

function emailHeaders(text) {
  const grab = (field) => {
    const m = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'im'));
    return m ? m[1].trim() : null;
  };
  const rawDate = grab('Date');
  let received = null;
  if (rawDate) {
    const parsed = new Date(rawDate);
    // The header date, not ingest time: chronology is meaningless otherwise, and E6 asks
    // which source is newer.
    if (!Number.isNaN(parsed.valueOf())) received = parsed.toISOString();
  }
  return { title: grab('Subject'), received_at: received };
}

function firstMeaningfulLine(text) {
  // Prefer a non-speaker line: in notes and briefs that is usually a heading.
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t && !SPEAKER_LINE.test(line)) return t.replace(/^#+\s*/, '').slice(0, 120);
  }
  // A transcript can be nothing but speaker turns. Falling through to a generic
  // "transcript document" makes every such document indistinguishable in the inbox,
  // so use what the first speaker actually said.
  for (const line of text.split('\n')) {
    const stripped = line.replace(SPEAKER_LINE, '').trim();
    if (stripped) return stripped.slice(0, 120);
  }
  return null;
}

/**
 * Normalize any door's input into the canonical SourceDocument.
 * Returns { ok: true, document } or { ok: false, reason, missing }.
 */
export function normalize({ doc_type, product_id, raw_text, title, received_at,
  source_channel, target_prd_id = null, authorship = 'third_party' }) {
  const missing = [];
  if (!doc_type) missing.push('doc_type');
  if (!product_id) missing.push('product_id');
  if (!source_channel) missing.push('source_channel');
  if (missing.length) return { ok: false, reason: 'envelope_invalid', missing };

  if (!raw_text || !raw_text.trim()) {
    // Refused at the door: validate on entry, never partial-process.
    return { ok: false, reason: 'empty_source', missing: ['raw_text'] };
  }
  if (!['transcript', 'notes', 'email', 'feature_brief'].includes(doc_type)) {
    return { ok: false, reason: 'envelope_invalid', missing: [`doc_type=${doc_type}`] };
  }
  // E4-S6. Who wrote the document is collected HERE, at the door, and nowhere else.
  // An unrecognised value is refused rather than defaulted: defaulting a typo to
  // 'third_party' would be the safe direction, but it would also mean a door could claim to
  // set this and silently not.
  if (!['first_party', 'third_party'].includes(authorship)) {
    return { ok: false, reason: 'envelope_invalid', missing: [`authorship=${authorship}`] };
  }

  const { text, redactions } = redact(canonicaliseText(raw_text));

  let derivedTitle = title ?? null;
  let derivedReceived = received_at ?? null;
  if (doc_type === 'email') {
    const h = emailHeaders(text);
    derivedTitle ??= h.title;
    derivedReceived ??= h.received_at;
  }
  derivedTitle ??= firstMeaningfulLine(text) ?? `${doc_type} document`;
  derivedReceived ??= new Date().toISOString();

  return {
    ok: true,
    document: {
      doc_type,
      product_id,
      title: derivedTitle,
      received_at: derivedReceived,
      source_channel,
      raw_text: text,
      segments: segment(text),
      pii_redactions: redactions,
      target_prd_id,
      authorship,
    },
  };
}
