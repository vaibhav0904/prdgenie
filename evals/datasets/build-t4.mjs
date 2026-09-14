// Builds T4 from a plain-text transcript so the JSON is never hand-edited and the quotes in
// the labels are lifted from the same string the fixture stores.

import { writeFileSync } from 'node:fs';

// THE DECOY WAS WRITTEN FIRST (E3-S6 technical note): written the other way round, a decoy
// comes out as a watered-down conflict rather than a real decision, which is how T3-Q03 went
// wrong. The SSO exchange below is a decision taken over a registered dissent, and it is the
// most heated passage in the document on purpose.

const raw = `ForgeSight pilot onboarding review — 4 September 2026, 14:00
Present: Marcus (Head of Product), Priya (Eng Lead), Wei (Design), Tom (Sales). Nadia (Analytics) joined at 14:19.

Marcus (Head of Product): Onboarding and data. Two things I want decided today and one I already know we'll argue about. Wei, you first.
Wei (Design): The empty state. Right now a new customer signs in and gets a grid with nothing in it and a link to documentation.
Tom (Sales): It's the worst thirty seconds of the whole demo and I skip it.
Wei (Design): So the first screen should walk them through picking a data source and a template, three steps, and at the end they have a dashboard with their own numbers in it.
Marcus (Head of Product): Dana — sorry, Dana isn't here, she's with Halcyon. I'll take her notes after.
Wei (Design): Anyway. Guided setup, three steps.
Tom (Sales): Yeah, totally. As long as nothing stands between them and seeing data. The moment they land they should be looking at their own numbers, not answering questions about them.
Wei (Design): Right.
Marcus (Head of Product): Good. Next. Invites.
Tom (Sales): A customer admin needs to be able to invite their own people. Every deal I've lost time on, it's been waiting for someone on our side to add three users.
Priya (Eng Lead): No. Users come from the customer's directory. If we let admins invite by email we own an identity system, and we said we weren't doing that.
Tom (Sales): I'm not asking for an identity system, I'm asking for an invite button.
Priya (Eng Lead): The invite button is the identity system. That's how it starts.
Marcus (Head of Product): Park it. I want to see how many customers actually ask for it before we decide, and nobody's asked yet — Tom, you're predicting. Write both positions up and we'll take it next week.
Tom (Sales): It'll be too late by next week for Meridian.
Marcus (Head of Product): Then it's too late. It's not being decided in this meeting.
Priya (Eng Lead): While we're on Meridian. They've asked about single sign-on again.
Tom (Sales): They've asked three times. It's the last thing on their security review.
Priya (Eng Lead): It's four weeks of work and it lands in the middle of the pilot. I'd be doing it instead of the render budget.
Tom (Sales): I know what it costs. I also know what happens if we say no.
Marcus (Head of Product): We're not doing SSO in the pilot. Write it down as explicitly out of scope for the pilot, and I'll take the call with Meridian myself.
Tom (Sales): For the record I think that costs us Meridian.
Marcus (Head of Product): Noted, and it's still out of scope. Priya, that's your four weeks back.
Priya (Eng Lead): Thank you.

[14:19 — Nadia joins]

Nadia (Analytics): Sorry. What have I missed?
Marcus (Head of Product): Onboarding, invites parked, SSO cut. Data retention next, which is you.
Priya (Eng Lead): Retention is whatever legal says it is. I don't have a view.
Marcus (Head of Product): Legal says twelve months minimum for anything customer-identifiable.
Priya (Eng Lead): Fine. Separately — and this is a storage thing, not a policy thing — I want to drop raw events after thirty days. We keep the hourly rollups, we delete the rows underneath them. It's most of our disk.
Marcus (Head of Product): Rollups are enough for the dashboards.
Nadia (Analytics): They're enough for the dashboards, yes. I'm sure that's fine.
Marcus (Head of Product): Good.
Nadia (Analytics): The only thing is the year-on-year comparison Dana keeps promising people needs thirteen months of history to be a comparison at all. But we can probably do both.
Priya (Eng Lead): Probably.
Marcus (Head of Product): Right. Two more from my list. Exports.
Tom (Sales): The export has to carry the customer's logo, same as the dashboard. Half of these end up in a board pack.
Marcus (Head of Product): Agreed, the PDF export carries the customer's logo and colours, not ours.
Wei (Design): And an audit entry when someone exports.
Priya (Eng Lead): Every export is already written to the audit log. That's done.
Marcus (Head of Product): Last one. The pilot has to run on the two accounts we have and nothing else — Northwind and Meridian. Nobody adds a third account without me.
Priya (Eng Lead): Understood.
Wei (Design): Back on the empty state for one second. If the three steps take a minute, is that a minute before they see anything?
Tom (Sales): It won't take a minute.
Wei (Design): It might.
Marcus (Head of Product): We're out of time. Wei, mock it up. Nadia, retention numbers to me by Friday.
`;

// --- sanity: every quote used in the labels must exist verbatim in `raw` ------------------
const Q = (q) => {
  if (!raw.includes(q)) { console.error(`QUOTE NOT IN T4: ${q}`); process.exit(1); }
  return q;
};

const fixture = {
  fixture_id: 'T4',
  doc_type: 'transcript',
  title: 'ForgeSight pilot onboarding review',
  received_at: '2026-09-04T14:00:00Z',
  raw_text: raw,
};

const labels = {
  fixture_id: 'T4',
  rule: 'Labels written BEFORE any tuning. Never edit labels to match output.',
  written: '2026-09-02',
  written_before_any_run: 'No extraction has ever been run against T4 at the time these labels were written. E3-S6 requires Vaibhav to read them before C4 exists.',
  expected_requirements: [
    {
      label_id: 'T4-R01',
      kind: 'functional',
      statement: 'A new customer is taken through a three-step guided setup — choose a data source, choose a template — that ends with a dashboard showing their own data.',
      stakeholder: 'Wei (Design)',
      quotes: [
        Q('the first screen should walk them through picking a data source and a template, three steps, and at the end they have a dashboard with their own numbers in it'),
      ],
    },
    {
      label_id: 'T4-R02',
      kind: 'constraint',
      statement: 'Single sign-on is explicitly out of scope for the pilot.',
      stakeholder: 'Marcus (Head of Product)',
      decoy: true,
      quotes: [
        Q("We're not doing SSO in the pilot"),
        Q('Write it down as explicitly out of scope for the pilot'),
      ],
    },
    {
      label_id: 'T4-R03',
      kind: 'constraint',
      statement: 'Customer-identifiable data is retained for at least twelve months, as required by legal.',
      stakeholder: 'Marcus (Head of Product)',
      quotes: [
        Q('Legal says twelve months minimum for anything customer-identifiable'),
      ],
    },
    {
      label_id: 'T4-R04',
      kind: 'nonfunctional',
      statement: 'Raw event rows are deleted after thirty days; the hourly rollups built from them are kept.',
      stakeholder: 'Priya (Eng Lead)',
      quotes: [
        Q('I want to drop raw events after thirty days. We keep the hourly rollups, we delete the rows underneath them'),
      ],
    },
    {
      label_id: 'T4-R05',
      kind: 'constraint',
      statement: "The PDF export carries the customer's own logo and colours, not ForgeSight's.",
      stakeholder: 'Marcus (Head of Product)',
      quotes: [
        Q("the PDF export carries the customer's logo and colours, not ours"),
      ],
    },
    {
      label_id: 'T4-R06',
      kind: 'constraint',
      statement: 'The pilot runs on two customer accounts only — Northwind and Meridian — and no third account is added without Marcus.',
      stakeholder: 'Marcus (Head of Product)',
      quotes: [
        Q('The pilot has to run on the two accounts we have and nothing else — Northwind and Meridian. Nobody adds a third account without me'),
      ],
    },
  ],
  expected_open_questions: [
    {
      label_id: 'T4-Q01',
      kind: 'conflict',
      explicitness: 'explicit',
      question: 'Can a customer admin invite users by email, or must every user come from the customer\'s directory? Marcus parked it in the room and asked for both positions to be written up.',
      quotes: [
        Q('A customer admin needs to be able to invite their own people'),
        Q("Users come from the customer's directory"),
        Q("It's not being decided in this meeting"),
      ],
    },
    {
      label_id: 'T4-Q02',
      kind: 'conflict',
      explicitness: 'implicit',
      question: 'Does the new customer see a three-step guided setup before any data, or their own data immediately? Wei\'s guided setup and Tom\'s "nothing between them and seeing data" cannot both be true, and Tom agreed to the first while stating the second.',
      quotes: [
        Q('So the first screen should walk them through picking a data source and a template, three steps'),
        Q('As long as nothing stands between them and seeing data. The moment they land they should be looking at their own numbers, not answering questions about them'),
      ],
    },
    {
      label_id: 'T4-Q03',
      kind: 'conflict',
      explicitness: 'implicit',
      question: 'Are raw events deleted after thirty days, or kept long enough for a year-on-year comparison? Nadia agreed the rollups are enough and then named a requirement that needs thirteen months of history; nobody resolved it.',
      quotes: [
        Q('I want to drop raw events after thirty days'),
        Q('the year-on-year comparison Dana keeps promising people needs thirteen months of history to be a comparison at all'),
      ],
    },
    {
      label_id: 'T4-Q04',
      kind: 'unanswered',
      question: 'How long may the three-step guided setup take before the customer sees any data? Wei asked directly and the meeting ended without an answer.',
      quotes: [
        Q('If the three steps take a minute, is that a minute before they see anything?'),
      ],
    },
  ],
  expected_unsettled_positions: [
    {
      label_id: 'T4-U01',
      for_conflict: 'T4-Q01',
      subject: 'inviting users',
      position: 'A customer admin can invite their own users by email.',
      stakeholder: 'Tom (Sales)',
      quotes: [Q('A customer admin needs to be able to invite their own people')],
    },
    {
      label_id: 'T4-U02',
      for_conflict: 'T4-Q01',
      subject: 'inviting users',
      position: "Users are provisioned only from the customer's directory; ForgeSight does not own identity.",
      stakeholder: 'Priya (Eng Lead)',
      quotes: [Q("Users come from the customer's directory")],
    },
    {
      label_id: 'T4-U03',
      for_conflict: 'T4-Q02',
      subject: 'what a new customer sees first',
      position: 'A new customer is taken through a three-step guided setup before reaching a dashboard.',
      stakeholder: 'Wei (Design)',
      quotes: [Q('So the first screen should walk them through picking a data source and a template, three steps')],
    },
    {
      label_id: 'T4-U04',
      for_conflict: 'T4-Q02',
      subject: 'what a new customer sees first',
      position: 'A new customer sees their own data immediately, with no steps in between.',
      stakeholder: 'Tom (Sales)',
      quotes: [Q('The moment they land they should be looking at their own numbers, not answering questions about them')],
    },
    {
      label_id: 'T4-U05',
      for_conflict: 'T4-Q03',
      subject: 'raw event retention',
      position: 'Raw events are deleted after thirty days to save storage.',
      stakeholder: 'Priya (Eng Lead)',
      quotes: [Q('I want to drop raw events after thirty days')],
    },
    {
      label_id: 'T4-U06',
      for_conflict: 'T4-Q03',
      subject: 'raw event retention',
      position: 'Thirteen months of history are kept so a year-on-year comparison is possible.',
      stakeholder: 'Nadia (Analytics)',
      quotes: [Q('needs thirteen months of history to be a comparison at all')],
    },
  ],
  notes: [
    'WRITTEN FOR E3-S6, AND THE DECOY WAS WRITTEN FIRST. T3-Q03 went wrong because a passage',
    'written to be adversarial read, to a PM, as settled. So the SSO exchange (T4-R02) was',
    'drafted before any conflict: it is the most heated passage in the document, Tom pushes',
    'three times, and it is a DECISION. Marcus decides, Tom registers a dissent after the',
    'decision, and the meeting moves on. Flagging it as a conflict is a false positive, and',
    'C4 scores it as one.',
    '',
    'THREE CONFLICTS, ONE EXPLICIT AND TWO IMPLICIT.',
    '  T4-Q01 explicit — "It\'s not being decided in this meeting." The control.',
    '  T4-Q02 implicit — Tom AGREES ("Yeah, totally") and in the same breath states the',
    '    opposite requirement. Nobody notices. This is the shape T3 lost when T3-Q03 was',
    '    withdrawn, and the reason this fixture exists.',
    '  T4-Q03 implicit — Nadia says "I\'m sure that\'s fine", then names a requirement that',
    '    contradicts what she just accepted, then softens it with "we can probably do both".',
    '    Priya answers "Probably." Nothing is resolved and nothing sounds like an argument.',
    '',
    'T4-R04 IS DELIBERATELY BOTH a requirement and one side of T4-Q03. Priya states it as a',
    'decision ("I want to drop raw events after thirty days") and Marcus assents ("Rollups are',
    'enough"), so it is extractable as a requirement — and Nadia then contradicts it without',
    'anyone withdrawing either. **A system that emits T4-R04 as a requirement is not wrong; a',
    'system that emits it and misses T4-Q03 has missed the disagreement.** C4 must be able to',
    'say which happened, which is why the two outputs are scored separately.',
    '',
    'T4-R03 and T4-R04 also conflict on their face — twelve months for identifiable data,',
    'thirty days for raw events. They do NOT conflict in fact: rollups are retained, and the',
    'twelve-month rule is about customer-identifiable data. This is a second decoy, at the',
    'level of the requirement list rather than the argument: two requirements that look',
    'contradictory and are not.',
    '',
    'DANA IS ABSENT AND SAID SO MID-SENTENCE, deliberately: T1 and T3 both have someone',
    'joining late, and a fixture where every document has the same shape teaches the model the',
    'shape rather than the task. Nadia joins late instead, and the interruption about Dana is',
    'a tangent that carries no requirement.',
  ].join('\n'),
};

writeFileSync('evals/datasets/docs/T4.json', `${JSON.stringify(fixture, null, 2)}\n`);
writeFileSync('evals/datasets/labels/T4.labels.json', `${JSON.stringify(labels, null, 2)}\n`);

const qs = [
  ...labels.expected_requirements.flatMap((r) => r.quotes),
  ...labels.expected_open_questions.flatMap((q) => q.quotes),
  ...labels.expected_unsettled_positions.flatMap((p) => p.quotes),
];
console.log(`T4 written: ${raw.length} chars, ${raw.split('\n').length} lines`);
console.log(`  requirements: ${labels.expected_requirements.length} (1 decoy)`);
console.log(`  open questions: ${labels.expected_open_questions.length}`
  + ` (${labels.expected_open_questions.filter((q) => q.kind === 'conflict').length} conflicts,`
  + ` ${labels.expected_open_questions.filter((q) => q.explicitness === 'implicit').length} implicit)`);
console.log(`  unsettled positions: ${labels.expected_unsettled_positions.length}`);
console.log(`  quotes: ${qs.length}, all verified present verbatim`);
