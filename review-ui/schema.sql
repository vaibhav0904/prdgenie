-- PRD Genie schema.
--
-- This file is the reviewed home of the PRDVersion state machine (ADR 0006).
-- Any change to the state table in docs/contracts.md §3 arrives with a matching
-- trigger change here, or it is not a change — it is a divergence.
--
-- Tables that later epics write are created now. A migration mid-epic is more
-- disruptive than a few unused tables (E1-S1 technical notes).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Schema version. Bumped by hand when this file changes shape; reported by /api/health
-- so a running service can be compared against the file it was created from.
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1')
  ON CONFLICT(key) DO NOTHING;

-- Control plane -------------------------------------------------------------
-- Written by setup, read by everything at runtime. Variation between products comes
-- only from here; nothing branches on a product's identity (docs/architecture.md).

CREATE TABLE IF NOT EXISTS products (
  product_id  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- baseline_status drives the computed caveat line in every report (docs/metrics.md).
-- While it is 'none', efficiency figures render as illustrative — automatically, so
-- nobody has to remember to write the caveat as prose.
INSERT INTO schema_meta (key, value) VALUES ('baseline_status', 'none')
  ON CONFLICT(key) DO NOTHING;

-- Data plane ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS source_documents (
  doc_id         TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES products(product_id),
  trace_id       TEXT NOT NULL,
  doc_type       TEXT NOT NULL CHECK (doc_type IN ('transcript','notes','email','feature_brief')),
  title          TEXT NOT NULL,
  received_at    TEXT,
  -- Recorded for the operator, never branched on downstream (docs/architecture.md).
  source_channel TEXT NOT NULL CHECK (source_channel IN ('form','webhook')),
  -- WHO WROTE IT (E4-S6). 'first_party' means the PM wrote this document themselves, so a
  -- requirement extracted from it is the PM being quoted back to themselves -- not
  -- corroboration. Set AT THE DOOR and nowhere else, defaulting to third_party: defaulting
  -- the other way would silently weaken every claim this system makes.
  --
  -- Nothing downstream of WF1 branches on this. It is a recorded fact the UI and the metrics
  -- read, exactly like source_channel.
  authorship     TEXT NOT NULL DEFAULT 'third_party'
                 CHECK (authorship IN ('first_party','third_party')),
  -- Post-redaction and immutable from insert onward: every span offset in the system
  -- refers to this exact string forever (ADR 0003). Enforced by a trigger below.
  raw_text       TEXT NOT NULL,
  segments       TEXT NOT NULL DEFAULT '[]',   -- JSON, advisory only
  pii_redactions TEXT NOT NULL DEFAULT '[]',   -- JSON
  target_prd_id  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_docs_trace ON source_documents(trace_id);

-- raw_text is immutable after insert. Without this, every stored citation offset rots
-- silently and the grounding claim quietly stops being true.
--
-- BEFORE UPDATE only, and correct: immutability is a rule about change, and the insert is
-- where the first value arrives. A `state` would need the other direction too (BUG-049).
CREATE TRIGGER IF NOT EXISTS source_documents_raw_text_immutable
BEFORE UPDATE OF raw_text ON source_documents
BEGIN
  SELECT RAISE(ABORT, 'raw_text is immutable after insert (ADR 0003): every citation offset depends on it');
END;

CREATE TABLE IF NOT EXISTS prds (
  prd_id     TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(product_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PRDVersions are immutable once written (ADR 0005). A rejection produces a new draft;
-- a correction produces a new version. Never an in-place content edit.
CREATE TABLE IF NOT EXISTS prd_versions (
  prd_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  prd_id         TEXT NOT NULL REFERENCES prds(prd_id),
  version_no     INTEGER NOT NULL,
  trace_id       TEXT NOT NULL,
  state          TEXT NOT NULL CHECK (state IN ('draft','in_review','approved','superseded')),
  content        TEXT NOT NULL,             -- JSON, the assembled document
  park_reason    TEXT,                      -- set when a run parked instead of drafting
  degraded       INTEGER NOT NULL DEFAULT 0,-- feeds the computed caveat line
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at    TEXT,
  UNIQUE (prd_id, version_no)
);
CREATE INDEX IF NOT EXISTS ix_versions_trace ON prd_versions(trace_id);
CREATE INDEX IF NOT EXISTS ix_versions_state ON prd_versions(state);

-- The sign-off marker (ADR 0006, as amended 2026-09-01).
--
-- A marker names ONE prd_version_id. The trigger below authorizes an approval only for
-- the version its marker names, so a marker that survives connection reuse can authorize
-- nothing except a version that is already approved. The connection-reuse question is
-- designed away rather than tested for.
--
-- Written and deleted inside the sign-off transaction, by the sign-off endpoint alone.
CREATE TABLE IF NOT EXISTS signoff_marker (
  prd_version_id INTEGER PRIMARY KEY REFERENCES prd_versions(prd_version_id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requirements (
  req_id         TEXT PRIMARY KEY,
  prd_version_id INTEGER REFERENCES prd_versions(prd_version_id),
  doc_id         TEXT NOT NULL REFERENCES source_documents(doc_id),
  trace_id       TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('functional','nonfunctional','constraint')),
  statement      TEXT NOT NULL,
  -- What this requirement constrains, in a short noun phrase, as the extractor named it.
  -- Required by the extraction schema since E1-S4 and discarded until BUG-027: the model is
  -- asked to name the subject before writing a statement, and BUG-016's last unfixed wording
  -- defect is a statement with no subject in it. Storing it is what makes that testable.
  subject        TEXT,
  stakeholder    TEXT,
  confidence     TEXT CHECK (confidence IN ('high','medium','low')),
  -- Set ONLY by /internal/grounding-check. A model-supplied value is a schema violation,
  -- rejected at the boundary, not stored (docs/contracts.md §1b).
  grounded       INTEGER,
  -- Set when a PM edits the statement: their words are not a claim about the source,
  -- so an edited requirement is excluded from the grounding rate (M1).
  pm_authored    INTEGER NOT NULL DEFAULT 0,
  -- THE REQUIREMENT'S IDENTITY ACROSS VERSIONS (E6-S2).
  --
  -- `req_id` is "<prd_version_id>-REQ-nnn": globally unique and inherently version-scoped, and
  -- PRDVersions are immutable (ADR 0005), so a requirement carried into the next version is a
  -- NEW ROW with a NEW req_id. That is what breaks the link a review decision made against the
  -- old one — `review_actions.item_id` holds a req_id — and it would make every carried-over
  -- item look new to M2 next cycle.
  --
  -- So identity lives here instead: the req_id of the FIRST row in this requirement's line.
  -- A requirement that has never been carried is its own origin, which is why existing rows
  -- backfill to their own req_id rather than to NULL.
  origin_req_id  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_reqs_version ON requirements(prd_version_id);
CREATE INDEX IF NOT EXISTS ix_reqs_trace   ON requirements(trace_id);

CREATE TABLE IF NOT EXISTS citations (
  citation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  req_id      TEXT NOT NULL REFERENCES requirements(req_id),
  doc_id      TEXT NOT NULL REFERENCES source_documents(doc_id),
  quote       TEXT NOT NULL,
  -- Offsets as REWRITTEN by the grounding check to where the quote was actually found.
  -- The model's originals are hints and are not what gets rendered (ADR 0003).
  start_char  INTEGER,
  end_char    INTEGER,
  -- exact | whitespace_normalized | not_found. Not a boolean: the slide from exact to
  -- normalized is the early warning that precedes ungrounded (docs/traceability.md).
  match_kind  TEXT CHECK (match_kind IN ('exact','whitespace_normalized','not_found'))
);
CREATE INDEX IF NOT EXISTS ix_citations_req ON citations(req_id);

CREATE TABLE IF NOT EXISTS open_questions (
  question_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  prd_version_id INTEGER REFERENCES prd_versions(prd_version_id),
  trace_id       TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('conflict','unanswered','missing_nfr')),
  question       TEXT NOT NULL,
  citations      TEXT NOT NULL DEFAULT '[]'  -- JSON; missing_nfr legitimately cites nothing
);

CREATE TABLE IF NOT EXISTS epics (
  epic_id        TEXT PRIMARY KEY,
  prd_version_id INTEGER NOT NULL REFERENCES prd_versions(prd_version_id),
  title          TEXT NOT NULL,
  summary        TEXT
);

CREATE TABLE IF NOT EXISTS features (
  feature_id     TEXT PRIMARY KEY,
  epic_id        TEXT NOT NULL REFERENCES epics(epic_id),
  prd_version_id INTEGER NOT NULL REFERENCES prd_versions(prd_version_id),
  title          TEXT NOT NULL,
  req_ids        TEXT NOT NULL DEFAULT '[]', -- JSON
  -- Computed by /internal/score and by nothing else. C3 recomputes RICE from the stored
  -- factors and diffs; a mismatch is the signature of another writer.
  priority_score REAL
);

CREATE TABLE IF NOT EXISTS priority_factors (
  feature_id TEXT PRIMARY KEY REFERENCES features(feature_id),
  reach      REAL NOT NULL,
  impact     REAL NOT NULL,
  confidence REAL NOT NULL,
  effort     REAL NOT NULL,
  rationale  TEXT,
  citations  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS stories (
  story_id            TEXT PRIMARY KEY,
  feature_id          TEXT NOT NULL REFERENCES features(feature_id),
  prd_version_id      INTEGER NOT NULL REFERENCES prd_versions(prd_version_id),
  as_a                TEXT,
  i_want              TEXT,
  so_that             TEXT,
  acceptance_criteria TEXT NOT NULL DEFAULT '[]'  -- JSON, each entry tied to a req_id
);

-- The changelog. One row per change a delta made, written when the delta is applied and never
-- recomputed: a diff produced later describes today's parser, and this row describes what was
-- decided (E6-S3).
--
-- `removed` was missing from this CHECK for the whole of E6 while `delta.mjs` emitted it and
-- `docs/contracts.md` §10 named it — so a document saying "we are dropping the CSV export" took
-- the entire apply down with it, inside the transaction, with no version minted (BUG-062).
-- Nothing noticed because no delta had ever produced a removal.
--
-- `doc_id` is the source that caused the change. Without it the changelog says what happened
-- and cannot say what said so, which is half of a traceable record.
CREATE TABLE IF NOT EXISTS prd_changes (
  change_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  prd_version_id INTEGER NOT NULL REFERENCES prd_versions(prd_version_id),
  kind           TEXT NOT NULL CHECK (kind IN ('added','modified','contradicted','removed','new_open_question')),
  req_id         TEXT,
  old_text       TEXT,
  new_text       TEXT,
  citations      TEXT NOT NULL DEFAULT '[]',
  doc_id         TEXT
);

CREATE TABLE IF NOT EXISTS review_sessions (
  session_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  prd_version_id INTEGER NOT NULL REFERENCES prd_versions(prd_version_id),
  -- No authentication exists; every action is attributed to one hardcoded reviewer.
  -- This is the biggest known gap (docs/assumptions.md) and is stored honestly rather
  -- than simulated: an unattributed signature that looks attributed is worse.
  reviewer       TEXT NOT NULL DEFAULT 'local-operator',
  opened_at      TEXT NOT NULL DEFAULT (datetime('now')),
  signed_off_at  TEXT
);

CREATE TABLE IF NOT EXISTS review_actions (
  action_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES review_sessions(session_id),
  item_type  TEXT NOT NULL CHECK (item_type IN ('requirement','story','feature','open_question')),
  item_id    TEXT NOT NULL,
  -- approve_ungrounded is its own kind so overrides can be counted rather than blending
  -- into approvals (docs/reporting.md).
  decision   TEXT NOT NULL CHECK (decision IN ('approve','reject','edit','approve_ungrounded')),
  reason     TEXT,
  before_text TEXT,
  after_text  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_actions_session ON review_actions(session_id);

-- A reason is required on everything except a plain approve. Enforced here, not only in
-- the form: a rule enforced by the browser is a convention, and docs/reporting.md rule 4
-- says the reason travels on every channel that accepts a decision.
CREATE TRIGGER IF NOT EXISTS review_actions_require_reason
BEFORE INSERT ON review_actions
BEGIN
  SELECT CASE
    WHEN NEW.decision IN ('reject','edit','approve_ungrounded')
     AND (NEW.reason IS NULL OR trim(NEW.reason) = '')
    THEN RAISE(ABORT, 'a reason is required on reject, edit and approve_ungrounded')
  END;
END;

-- Telemetry -----------------------------------------------------------------
-- Written on parallel, continue-on-failure paths. A failed insert here must never stop
-- a run (docs/traceability.md); the drill that proves it is E8-S4.

CREATE TABLE IF NOT EXISTS events (
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id   TEXT NOT NULL,
  name       TEXT NOT NULL,   -- ingested | draft_created | in_review | approved | parked
  component  TEXT,
  detail     TEXT,
  ts         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_events_trace ON events(trace_id);
CREATE INDEX IF NOT EXISTS ix_events_name  ON events(name);

CREATE TABLE IF NOT EXISTS llm_calls (
  call_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id       TEXT NOT NULL,
  component      TEXT NOT NULL,
  prompt_name    TEXT NOT NULL,
  -- git short hash of the prompt file: the variable most likely to change behaviour
  -- without the code changing. Without it, drift is unattributable.
  prompt_version TEXT,
  model          TEXT NOT NULL,
  prompt_tokens  INTEGER,
  completion_tokens INTEGER,
  latency_ms     INTEGER,
  cost_usd       REAL,
  -- provider_reported | estimated. Estimated rows are labeled so a correction can sit
  -- beside them later instead of overwriting them.
  usage_source   TEXT NOT NULL DEFAULT 'provider_reported'
                 CHECK (usage_source IN ('provider_reported','estimated')),
  attempt        INTEGER NOT NULL DEFAULT 1,
  outcome        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_llm_trace ON llm_calls(trace_id);

-- THE SWEEP (E7-S5). One row per attempt to get a second opinion, whether or not one
-- arrived.
--
-- The row is written BEFORE the judge is called and closed afterwards, which is what makes
-- two overlapping sweeps impossible: opening is the lock. A sweep that never got an answer
-- closes as 'skipped' with a reason -- a sweep that vanished would be indistinguishable from
-- one that was never asked for.
--
-- `trigger_source` is here because a manual sweep is SELF-SELECTED. Reporting one as a random
-- sample would be the same lie as tuning a label: the number would be real and the claim
-- about it false.
CREATE TABLE IF NOT EXISTS judge_sweeps (
  sweep_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_source  TEXT NOT NULL CHECK (trigger_source IN ('cron','manual')),
  status          TEXT NOT NULL CHECK (status IN ('in_flight','complete','skipped')),
  judge_model     TEXT NOT NULL,
  -- Filled at close from the prompt_version the model was actually sent, never typed.
  rubric_version  TEXT,
  sample_size     INTEGER NOT NULL DEFAULT 0,
  versions_sampled     INTEGER NOT NULL DEFAULT 0,
  requirements_sampled INTEGER NOT NULL DEFAULT 0,
  scored          INTEGER NOT NULL DEFAULT 0,
  -- Why no opinion arrived. From the same closed set a park uses, so an outage reads the
  -- same here as it does anywhere else in this system.
  skipped_reason  TEXT,
  -- WHAT ACTUALLY HAPPENED, in the provider's own words, bounded. A failure with a code and
  -- no detail is a notification, not a record (E7-S3, the dead-letter envelope).
  skipped_detail  TEXT,
  -- Set when a sweep was produced by something other than the real judge -- a drill, a
  -- rehearsal. Rendered wherever the sweep is, because an opinion nobody held must not be
  -- readable as one.
  note            TEXT,
  -- The disagreement arithmetic, stored rather than recomputed on read: the labels can be
  -- re-resolved later, and a sweep's verdict must stay what it was when the rule fired.
  comparable      INTEGER,
  disagreements   INTEGER,
  bug_rule        TEXT,      -- which rule fired: over_40_percent | three_consecutive
  bug_card        TEXT,      -- the card it opened, or the existing one it deferred to
  -- Which strata could not fill their quota, as wanted/got (E7-S6). Stored rather than
  -- printed: a sweep that reached only two of the four ungrounded rows it wanted made a
  -- weaker coverage claim than one that reached four, and next week nobody has the console.
  shortfalls      TEXT,
  opened_at       TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at       TEXT
);

-- WHICH ROW CAME FROM WHICH STRATUM (E7-S6), written when the sample is drawn.
--
-- It lives in its own table rather than on judge_scores alone because the stratum is a fact
-- about our sampler, and it has to survive a row that never came back with a score: a sweep
-- that asked about four ungrounded rows and got two answers has a coverage story that the
-- scores table alone cannot tell.
CREATE TABLE IF NOT EXISTS judge_sample (
  sample_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  -- CASCADE because the sample IS part of the sweep: a sample row whose sweep no longer
  -- exists describes a draw nobody can look up, which is worse than not having it.
  sweep_id   INTEGER NOT NULL REFERENCES judge_sweeps(sweep_id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  stratum    TEXT NOT NULL,
  UNIQUE (sweep_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS judge_scores (
  score_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id       TEXT,
  prd_version_id INTEGER REFERENCES prd_versions(prd_version_id),
  item_type      TEXT,
  item_id        TEXT,
  rubric_version TEXT,
  faithfulness   REAL,
  completeness   REAL,
  clarity        REAL,
  -- The stratum this row was drawn from (E7-S6). A score whose stratum is unknown reads as
  -- 'unlisted' — never blank, because a row with no provenance is exactly the row somebody
  -- would later assume was random.
  stratum        TEXT,
  comment        TEXT,
  swept_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The needs-attention queue (E7-S3). A run that died is a queue entry, not a document that
-- never arrived.
--
-- `trace_id` and `doc_id` are NULLABLE and that is deliberate: a workflow can fail before it
-- knows either, and refusing the row to keep a column tidy would lose the failure itself.
-- The queue shows such a row as "unjoinable" rather than hiding it.
--
-- `envelope` carries what makes the row actionable WITHOUT a log: the workflow, the node, the
-- message and the execution id. A dead letter with a stack trace and no trace_id is a log
-- line; a dead letter with a trace_id and no detail is a notification.
CREATE TABLE IF NOT EXISTS dead_letters (
  dead_letter_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id        TEXT,
  doc_id          TEXT,
  component       TEXT,
  reason          TEXT NOT NULL,
  envelope        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT,
  -- Resolving ADDS to the record. Nothing above is ever rewritten.
  resolution_note TEXT
);

-- The gate ------------------------------------------------------------------
-- ADR 0006. This trigger is the reason "human-in-the-loop" is a property of this system
-- rather than a description of its UI. There is no path around it: not from n8n, not from
-- a Code node, not from sqlite3 by hand.
--
-- It refuses every transition not in the state table in docs/contracts.md §3, and refuses
-- any approval that is not authorized by a marker naming THAT version.

CREATE TRIGGER IF NOT EXISTS prd_versions_state_machine
BEFORE UPDATE OF state ON prd_versions
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE
    -- The human gate. Checked first so its message is the one a person sees.
    WHEN NEW.state = 'approved'
     AND NOT EXISTS (SELECT 1 FROM signoff_marker m WHERE m.prd_version_id = OLD.prd_version_id)
    THEN RAISE(ABORT, 'approval requires the review UI sign-off endpoint (ADR 0006): no other path may set state=approved')

    WHEN NOT (
         (OLD.state = 'draft'     AND NEW.state = 'in_review')
      OR (OLD.state = 'in_review' AND NEW.state = 'draft')
      OR (OLD.state = 'in_review' AND NEW.state = 'approved')
      OR (OLD.state = 'approved'  AND NEW.state = 'superseded')
    )
    THEN RAISE(ABORT, 'illegal PRDVersion transition (docs/contracts.md §3)')
  END;
END;

-- A VERSION IS BORN UNREVIEWED (BUG-049).
--
-- The state machine above guards every TRANSITION. A row's first state is not a transition —
-- nothing is being moved — so the trigger never sees it, and for the life of this project
-- `INSERT INTO prd_versions (..., state) VALUES (..., 'approved')` walked straight past the
-- human gate. `UPDATE` was refused; `INSERT` was not.
--
-- Nothing in the codebase writes that statement, and a census on the day this was found put
-- 53 of 53 approved versions through a sign-off endpoint with an event and a session to show
-- for it. That is not what makes the guarantee true. **A rule that holds because no caller
-- happens to break it is a convention**, and the trigger exists precisely so that the sentence
-- in CLAUDE.md — *not from n8n, not SQL* — is enforced rather than intended.
--
-- Both legitimate writers insert `draft` (assembly, and a park) or `in_review` (applyDelta);
-- `superseded` is somewhere a version is moved to, never somewhere it starts.
CREATE TRIGGER IF NOT EXISTS prd_versions_born_unreviewed
BEFORE INSERT ON prd_versions
WHEN NEW.state NOT IN ('draft', 'in_review')
BEGIN
  SELECT RAISE(ABORT, 'a PRDVersion is born draft or in_review (ADR 0006): approval is the review UI sign-off endpoint, and superseded is a transition');
END;

-- PRDVersion content is immutable once written (ADR 0005). Rejection produces a new
-- draft; a correction produces a new version. Never an edit in place.
--
-- BEFORE UPDATE only, and that is CORRECT — unlike the state machine above. Immutability is a
-- rule about CHANGE, and an INSERT is where the first value legitimately arrives. The question
-- was asked of every guard in this file when BUG-049 was fixed; `verify-gate` records the
-- answers rather than leaving them to be re-derived.
CREATE TRIGGER IF NOT EXISTS prd_versions_content_immutable
BEFORE UPDATE OF content ON prd_versions
BEGIN
  SELECT RAISE(ABORT, 'PRDVersion content is immutable (ADR 0005): mint a new version instead');
END;
