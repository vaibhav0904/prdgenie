// Does redaction remove what the answer key says it must, and nothing else?
//
// This exists because BUG-008 and BUG-009 were both invisible for two epics. The redaction
// test written in E1-S2 checked that the emails and phones it HAD implemented were removed
// — a check written from the implementation, which by construction cannot find a missing
// implementation or an unhandled shape.
//
// So this script asks the opposite question. It starts from H2's LABELS, asserts its own
// coverage against them (BUG-003), and reads the text back from STORAGE rather than
// trusting the return value of the function under test.
//
// Usage:  .\run.cmd review-ui/scripts/verify-redaction.mjs

import { readFileSync } from 'node:fs';
import { redact, normalize } from '../normalize.mjs';

let failed = 0;
const rows = [];
function ok(id, name, pass, evidence = '') {
  rows.push({ id, name, pass, evidence });
  if (!pass) failed++;
}

const H2_DOC = JSON.parse(readFileSync('evals/datasets/docs/H2.json', 'utf8'));
const H2_LAB = JSON.parse(readFileSync('evals/datasets/labels/H2.labels.json', 'utf8'));
const labelled = H2_LAB.expected_redactions;
const byKind = (k) => labelled.filter((r) => r.kind === k).map((r) => r.value);

const PHONES = byKind('phone');
const EMAILS = byKind('email');
const NAMES = byKind('customer_name');

const { text: redacted } = redact(H2_DOC.raw_text);
const survives = (v) => redacted.includes(v);

// --- TC10 first: a check that has not asserted its own coverage is not a check ---------
ok('TC10', 'Coverage asserted: every labelled value is examined',
  labelled.length === PHONES.length + EMAILS.length + NAMES.length && labelled.length > 0,
  `${labelled.length} labelled = ${PHONES.length} phone + ${EMAILS.length} email + ${NAMES.length} name`);

// --- TC1: the three BUG-008 missed --------------------------------------------------
const BUG008_MISSED = ['+44 20 7946 0812', '07700 900412', '+39 02 8088 1140'];
const stillMissed = BUG008_MISSED.filter(survives);
ok('TC1', 'The three numbers BUG-008 named are redacted',
  stillMissed.length === 0,
  stillMissed.length ? `SURVIVED: ${stillMissed.join(', ')}` : 'all three gone');

// --- TC2: the two that already worked ------------------------------------------------
const BUG008_WORKED = ['+44 161 496 0033', '+39 335 774 2210'];
const regressed = BUG008_WORKED.filter(survives);
ok('TC2', 'The two that already worked still work',
  regressed.length === 0,
  regressed.length ? `REGRESSED: ${regressed.join(', ')}` : 'both still gone');

// --- TC8: the whole number, not a fragment -------------------------------------------
// The old failure mode left a partial number behind. Assert no DIGIT RUN of a labelled
// number survives, not merely that the exact string is absent.
const fragments = [];
for (const p of PHONES) {
  const digits = p.replace(/\D/g, '');
  // the last 6 digits are the part that would remain if the match started too late
  const tail = digits.slice(-6);
  const tailInText = redacted.replace(/\D/g, '').includes(tail);
  if (tailInText) fragments.push(`${p} (tail ${tail} still present)`);
}
ok('TC8', 'No fragment of a labelled number survives',
  fragments.length === 0,
  fragments.length ? fragments.join('; ') : 'no tails found in the redacted digit stream');

// --- TC4: emails untouched -------------------------------------------------------------
const emailsLeft = EMAILS.filter(survives);
ok('TC4', 'All labelled email addresses are redacted',
  emailsLeft.length === 0,
  emailsLeft.length ? `SURVIVED: ${emailsLeft.join(', ')}` : `${EMAILS.length}/${EMAILS.length} gone`);

// --- TC5: NEGATIVE CONTROL — things that are not phone numbers -------------------------
// Widening a pattern is how over-redaction starts. Over-redaction does not break the
// grounding check (the model reads the post-redaction text and quotes that), but it
// corrupts the document a PM reviews and can silently destroy the content of a real
// requirement — "the warehouse runs 10.0.26200.9106" becoming "[PHONE-3]".
const NOT_PHONES = [
  ['a year range', '2024-2026'],
  ['a semver', 'v1.2.3'],
  ['a Windows build', '10.0.26200.9106'],
  ['a row count', '41 000 000'],
  ['an ISBN', '9 780 141 036 137'],
  ['an ISO date', '2026-09-02'],
  ['spaced single digits', '1 2 3 4 5 6 7 8 9'],
  ['a git sha', '40459fc'],
  ['a price', '1,250.00'],
  ['a port range', '3000-5678'],
  ['a percentage pair', '93.3 / 77.8'],
  ['a large plain integer', '4124152'],
];
const overRedacted = [];
for (const [what, sample] of NOT_PHONES) {
  const { text: after } = redact(`The figure is ${sample} and that is all.`);
  if (!after.includes(sample)) overRedacted.push(`${what}: ${sample} -> ${after}`);
}
ok('TC5', 'NEGATIVE CONTROL: non-phone digit runs are not redacted',
  overRedacted.length === 0,
  overRedacted.length ? overRedacted.join(' | ') : `${NOT_PHONES.length} samples all survive intact`);

// --- TC5b: the shapes that ARE phone numbers, beyond the fixture ------------------------
// The fixture is not enough evidence — five numbers covering two shapes is how this bug
// survived. These are shapes H2 does not contain.
const ARE_PHONES = [
  ['E.164 compact', '+442079460812'],
  ['UK trunk, three groups', '0207 946 0812'],
  ['parenthesised UK', '(0161) 496 0033'],
  ['parenthesised US', '(415) 555-0123'],
  ['dot separated international', '+49.30.12345678'],
  ['hyphen separated trunk', '020-7946-0812'],
];
const missedShapes = [];
for (const [what, sample] of ARE_PHONES) {
  const { text: after } = redact(`Call ${sample} tomorrow.`);
  if (after.includes(sample)) missedShapes.push(`${what}: ${sample}`);
}
ok('TC5b', 'Phone shapes absent from the fixture are still caught',
  missedShapes.length === 0,
  missedShapes.length ? `NOT REDACTED: ${missedShapes.join(', ')}` : `${ARE_PHONES.length} shapes all redacted`);

// --- TC7: no other fixture's redactions change ------------------------------------------
// A change to T1 or T3's stored bytes would invalidate every citation offset in the corpus
// (ADR 0003, BUG-006). Only H2 may differ, and only by gaining phone redactions.
const OTHERS = ['T1', 'T2', 'T3', 'N1', 'E1', 'F1', 'G1', 'H1'];
const changed = [];
for (const id of OTHERS) {
  const doc = JSON.parse(readFileSync(`evals/datasets/docs/${id}.json`, 'utf8'));
  const { text: after, redactions } = redact(doc.raw_text);
  if (after !== doc.raw_text) changed.push(`${id}: ${redactions.length} redaction(s) — ${redactions.map((r) => r.replacement).join(', ')}`);
}
ok('TC7', 'No other fixture has any text redacted',
  changed.length === 0,
  changed.length ? changed.join(' | ') : `${OTHERS.length} fixtures unchanged byte-for-byte`);

// --- TC9: redactions are recorded, with kind and count ----------------------------------
const { redactions } = redact(H2_DOC.raw_text);
const phoneRecs = redactions.filter((r) => r.kind === 'phone');
ok('TC9', 'Every phone redaction is recorded with a replacement and a count',
  phoneRecs.length === PHONES.length
    && phoneRecs.every((r) => /^\[PHONE-\d+\]$/.test(r.replacement) && r.count >= 1),
  `${phoneRecs.length} phone records, expected ${PHONES.length}`);

// --- BUG-009 as decided: names are KEPT ---------------------------------------------------
// Vaibhav withdrew external-name redaction on 2026-09-02. A requirement is only reviewable
// if you can tell who asked for it, and a speaker whose role is never stated is identified
// by nothing but their name — so redacting it orphans the requirement rather than
// anonymising it. Two rules remain, both contact details.
//
// The answer key now carries `expected_retentions`, and these rows check it. Until that
// list existed the dataset could not see over-redaction at all: it named 21 values that had
// to GO and nothing that had to STAY, so a rule deleting every capitalised word would have
// scored 21 of 21 and passed the 100% floor.
const KEEP = H2_LAB.expected_retentions ?? [];
const erased = KEEP.filter((r) => !redacted.includes(r.value));
const keepKinds = [...new Set(KEEP.map((r) => r.kind))].sort().join('/');
ok('TC12', 'Every labelled retention SURVIVES — names, organisations, roles',
  KEEP.length > 0 && erased.length === 0,
  erased.length
    ? `WRONGLY REDACTED: ${erased.map((r) => r.value).join(', ')}`
    : `${KEEP.length}/${KEEP.length} kept (${keepKinds})`);

ok('TC13', 'No name is listed as a redaction any more — the relabel is complete',
  NAMES.length === 0,
  NAMES.length === 0
    ? 'expected_redactions holds contact details only: 8 email + 5 phone'
    : `${NAMES.length} customer_name entries still listed as redactions`);

// --- TC17: shapes H2 does not contain ------------------------------------------------------
// Only ONE of the nine fixtures contains an email address at all, so the door's behaviour on
// contact details is exercised by a single document. That is precisely how BUG-008 survived
// two epics: a rule judged only against the examples it was written from is an assumption.
//
// Every `kept` entry below is a name. That is the policy, asserted seven different ways so
// that reintroducing name redaction — however well-intentioned — is a red case rather than
// a quiet change of what the system claims.
const NAME_CASES = [
  { what: 'an external contact: the address goes, the name stays',
    text: 'Contact Ana Silva at ana.silva@acme.example for the pilot.',
    gone: ['ana.silva@acme.example'], kept: ['Ana Silva'] },
  { what: 'a surname-only local part does not drag the name out either',
    text: 'Reach Bob Mcallister at b.mcallister@acme.example before Friday.',
    gone: ['b.mcallister@acme.example'], kept: ['Bob Mcallister'] },
  { what: 'an internal contact: same rule, no special case needed any more',
    text: 'Priya Raghavan (priya.raghavan@neuronforge.com) owns this.',
    gone: ['priya.raghavan@neuronforge.com'], kept: ['Priya Raghavan'] },
  { what: 'a subdomain address is still an address',
    text: 'Dana Osei (dana.osei@mail.neuronforge.com) replied.',
    gone: ['dana.osei@mail.neuronforge.com'], kept: ['Dana Osei'] },
  { what: 'a company, a person and a role beside an address all survive',
    text: 'Acme Logistics — Ana Silva, Head of Delivery (ana.silva@acme.example).',
    gone: ['ana.silva@acme.example'], kept: ['Acme Logistics', 'Ana Silva', 'Head of Delivery'] },
  { what: 'a name with no contact detail is untouched, as it always was',
    text: 'Marta Kowalski said the depot view was useless.',
    gone: [], kept: ['Marta Kowalski'] },
  { what: 'a phone number beside a name removes only the number',
    text: 'Ana Silva is on +44 20 7946 0812 most mornings.',
    gone: ['+44 20 7946 0812'], kept: ['Ana Silva'] },
];
const nameProblems = [];
for (const c of NAME_CASES) {
  const { text: after } = redact(c.text);
  for (const g of c.gone) if (after.includes(g)) nameProblems.push(`${c.what}: "${g}" SURVIVED`);
  for (const k of c.kept) if (!after.includes(k)) nameProblems.push(`${c.what}: "${k}" WRONGLY REDACTED -> ${after}`);
}
ok('TC17', 'Contact details go, names stay, in shapes the fixture does not contain',
  nameProblems.length === 0,
  nameProblems.length ? nameProblems.join(' | ') : `${NAME_CASES.length} cases, every address and number removed, every name kept`);

// --- normalize() end to end, since redact() alone is not the door ------------------------
const norm = normalize({
  product_id: 'forgesight', doc_type: 'transcript', title: 'H2',
  raw_text: H2_DOC.raw_text, source_channel: 'webhook',
});
const throughDoor = norm.ok ? PHONES.filter((v) => norm.document.raw_text.includes(v)) : PHONES;
ok('TC3', 'All five numbers are gone after normalize(), the real door path',
  norm.ok && throughDoor.length === 0,
  !norm.ok ? `normalize refused: ${norm.reason}`
    : throughDoor.length ? `SURVIVED: ${throughDoor.join(', ')}` : '5/5 gone through normalize()');

// --- report -------------------------------------------------------------------------------
const w = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(7)} ${r.name.padEnd(w)}  ${r.evidence}`);
}
console.log(`\n${rows.length - failed}/${rows.length} passed`);
if (failed) {
  console.error('REDACTION VERIFICATION FAILED');
  process.exitCode = 1;
} else {
  console.log('Contact details are removed before storage. Names, organisations and roles are not.');
}
