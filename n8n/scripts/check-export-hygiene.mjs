// Can this repository be handed to a stranger?
//
// The release ships `n8n/workflows/*.json` to a stranger. Everything else in this project is
// recoverable from a mistake; a leaked credential is not. So this is a GATE and not a report:
// it exits non-zero on the first hit, `export-workflows.mjs` runs it before writing a byte,
// and the sweep runs it every time.
//
// WHAT IT LOOKS FOR, and why each one is here rather than "looks like a secret":
//
//   1. KNOWN KEY SHAPES        sk-…, AIza…, ghp_…, xox…, a JWT, a bearer literal, a PEM block.
//                              Vendor prefixes are the cheap half and they catch the paste.
//   2. EVERY VALUE IN .env     the expensive half, and the one that actually protects THIS
//                              repository — a secret nobody has a regex for is still in `.env`,
//                              and if a value from `.env` appears in an export it left the
//                              machine. Derived from the file, so a key added tomorrow is
//                              checked tomorrow with nobody editing this list.
//   3. CREDENTIAL REFERENCES   an n8n `credentials` block carries an id and a human name. Not a
//                              key, and not something a release has any reason to carry.
//   4. pinData                 THE ONE NOBODY LOOKS FOR. Pinning a node in the n8n editor
//                              embeds that run's data in the workflow JSON — real source
//                              documents, verbatim, inside a file that reads as configuration.
//   5. localhost/private hosts reported, not failed: the run-it-yourself README tells people to run
//                              locally, so `localhost` is correct here and a private LAN
//                              address is worth a look.
//
// A short or trivial `.env` value (a port, `true`, a path everyone has) is EXCLUDED with its
// reason printed — `3000` appears in every URL in the file and matching it would make this
// check a thing people disable. The exclusions are printed, so they are declarations rather
// than a filter nobody reads.
//
// Usage:  .\run.cmd n8n\scripts\check-export-hygiene.mjs
//         imported by export-workflows.mjs, which scans BEFORE it writes

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.EXPORT_DIR ?? 'n8n/workflows';

export const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, 'an OpenAI-shaped key (sk-…)'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, 'a Google-shaped key (AIza…)'],
  [/\bghp_[A-Za-z0-9]{30,}/g, 'a GitHub token (ghp_…)'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, 'a Slack token (xox…)'],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'a JWT'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'a PEM private key block'],
  [/"(?:authorization|x-api-key)"\s*:\s*"(?!=\{\{)[^"{}]{12,}"/gi, 'a literal auth header'],
];

/** Values from `.env` worth matching, and the ones deliberately not — each with its reason. */
export function envValues(path = '.env') {
  const kept = [];
  const skipped = [];
  if (!existsSync(path)) return { kept, skipped, present: false };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (!value) { skipped.push([key, 'empty']); continue; }
    if (value.length < 12) { skipped.push([key, `too short to be distinctive ("${value}")`]); continue; }
    // A URL an export legitimately contains. The HOST is not a secret; a key inside one would
    // still be caught by its own shape, and by the query-string rule below.
    if (/^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?\/?$/.test(value)) {
      skipped.push([key, `a local service URL the workflows must contain ("${value}")`]);
      continue;
    }
    if (/^\.{0,2}\//.test(value) && !/[?&=]/.test(value)) {
      skipped.push([key, `a file path, not a credential ("${value}")`]);
      continue;
    }
    kept.push([key, value]);
  }
  return { kept, skipped, present: true };
}

/**
 * The credential ids THIS PROJECT creates, read out of the scripts that create them.
 *
 * "Strip every credential reference" is the obvious rule and it is wrong: n8n binds a node to a
 * credential by id, and `provision-internal-credential.mjs` deliberately creates its credential
 * with a FIXED id (`prdgenieInternalKey`) precisely so the committed workflows can name it and
 * still import on a stranger's machine. Removing that reference would break the documented
 * run-it-yourself flow in the name of protecting a string this repository publishes on purpose.
 *
 * What must not ship is an id n8n GENERATED on one instance — `Xk7QpL2mNb9RtVwZ` is a handle
 * into Vaibhav's n8n and points at nothing anywhere else. `bind-provider-credential.mjs` exists
 * to write the local ones in, which is why removing them costs nothing.
 *
 * DERIVED, NOT TYPED: the allow-list is scraped from the provisioning scripts, so a credential
 * this project starts creating tomorrow is allowed tomorrow, and one it stops creating stops
 * being allowed — without anyone editing this file.
 */
export function projectCredentialIds(dir = 'n8n/scripts') {
  const ids = new Map();
  if (!existsSync(dir)) return ids;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    // Credentials this project provisions with a fixed id.
    for (const m of text.matchAll(/\bCRED_ID\s*=\s*['"]([^'"]+)['"]/g)) ids.set(m[1], `${f} (fixed id)`);
    // And the PLACEHOLDERS the binding script exists to replace. Scraped from its own
    // `CRED_TYPES` list, so a third provider added tomorrow gets its placeholder allowed
    // tomorrow — and a provider removed stops being allowed the same day.
    const block = /const CRED_TYPES\s*=\s*\[([\s\S]*?)\];/.exec(text);
    if (block) {
      for (const m of block[1].matchAll(/type:\s*'([^']+)'/g)) {
        ids.set(`${PLACEHOLDER_PREFIX}${m[1]}`, `${f} (placeholder, replaced at bind time)`);
      }
    }
  }
  return ids;
}

/** The one string shared by the binding script and this check. Named once (E7-S5). */
export const PLACEHOLDER_PREFIX = 'BIND_ME_';

/** Every hit in one file's text. Exported so the export tool scans what it is ABOUT to write. */
export function scan(file, text) {
  const lines = text.split('\n');
  const hits = [];
  const at = (index) => text.slice(0, index).split('\n').length;
  const excerpt = (line) => {
    const s = (lines[line - 1] ?? '').trim();
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  };

  for (const [re, what] of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const line = at(m.index);
      hits.push({ file, line, what, excerpt: excerpt(line) });
    }
  }
  const { kept } = envValues();
  for (const [key, value] of kept) {
    let i = text.indexOf(value);
    while (i !== -1) {
      const line = at(i);
      hits.push({ file, line, what: `the value of ${key} from .env`, excerpt: excerpt(line) });
      i = text.indexOf(value, i + value.length);
    }
  }
  // PINNED RUN DATA. Structural, and the one nobody looks for: pinning a node in the n8n editor
  // embeds that run's data in the workflow JSON — real source documents, verbatim, inside a file
  // that reads as configuration.
  for (const m of text.matchAll(/"pinData"\s*:\s*\{[^}]/g)) {
    const line = at(m.index);
    hits.push({ file, line, what: 'PINNED RUN DATA — real document text inside a config file', excerpt: excerpt(line) });
  }

  // Credential references: every `"id": "…"` sitting inside a credentials block, minus the ones
  // this project creates itself with a fixed id.
  const mine = projectCredentialIds();
  for (const m of text.matchAll(/"credentials"\s*:\s*\{([\s\S]{0,400}?)\n\s{6}\}/g)) {
    for (const idm of m[1].matchAll(/"id"\s*:\s*"([^"]+)"/g)) {
      if (mine.has(idm[1])) continue;      // ours, on purpose, and declared in the listing
      const line = at(m.index + idm.index);
      hits.push({
        file, line,
        what: `an instance-generated credential id (${idm[1]}) — a handle into one n8n`,
        excerpt: excerpt(line),
      });
    }
    for (const nm of m[1].matchAll(/"name"\s*:\s*"([^"]+)"/g)) {
      const line = at(m.index + nm.index);
      // A name is not a key. It is also a person's account label, and a release has no
      // reason to carry one.
      if (/^PRDGenie /.test(nm[1])) continue;
      hits.push({
        file, line, what: `a credential's human name ("${nm[1]}") — someone's account label`,
        excerpt: excerpt(line),
      });
    }
  }
  return hits;
}

// --- run as a check ------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('check-export-hygiene.mjs')) {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
  const env = envValues();

  console.log(`Scanning ${files.length} export(s) in ${DIR}`);
  console.log(`  ${SECRET_PATTERNS.length} key shapes`);
  if (!env.present) {
    // NOT a pass. An absent `.env` means the expensive half of this check did nothing, and a
    // check that quietly does less is the failure this repository has filed six cards about.
    console.log('  0 values from .env — THE FILE IS ABSENT');
  } else {
    console.log(`  ${env.kept.length} value(s) from .env: ${env.kept.map(([k]) => k).join(', ') || '(none)'}`);
    for (const [k, why] of env.skipped) console.log(`      not matched: ${k} — ${why}`);
  }
  // The allow-list, printed. A credential this project creates on purpose is a declaration, and
  // a declaration nobody can read is a filter.
  const mine = projectCredentialIds();
  console.log(`  ${mine.size} credential id(s) this project creates itself, and therefore ships:`);
  for (const [id, from] of mine) console.log(`      ${id}  — created by ${from} with a FIXED id, so a stranger's import binds`);
  console.log('');

  if (!files.length) {
    console.log('FAIL  no exports found. An empty directory is a broken path, not a clean bill');
    console.log('      of health (BUG-003/019).');
    process.exit(1);
  }
  if (!env.present) {
    console.log('FAIL  .env is absent, so this check only ran its cheap half. Copy .env.example');
    console.log('      to .env — the point of the expensive half is the secret nobody has a');
    console.log('      regex for.');
    process.exit(1);
  }

  const all = files.flatMap((f) => scan(f, readFileSync(join(DIR, f), 'utf8')));

  // Reported, never failed: people run this locally, so a localhost URL is correct.
  const local = files.flatMap((f) => {
    const text = readFileSync(join(DIR, f), 'utf8');
    return [...text.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|host\.docker\.internal|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)[:\d/]*/g)]
      .map((m) => `${f}: ${m[0]}`);
  });
  const hosts = [...new Set(local.map((s) => s.split(': ')[1]))];
  console.log(`local addresses (reported, not failed): ${hosts.join(', ') || 'none'}`);
  console.log('  The README tells a stranger to run this on their own machine, so these are');
  console.log('  correct. A LAN address would not be.');
  console.log('');

  if (!all.length) {
    console.log(`PASS  ${files.length} export(s), 0 hits.`);
    console.log('Nothing in n8n/workflows can identify a credential or carry a document.');
    process.exit(0);
  }
  console.log(`FAIL  ${all.length} hit(s):\n`);
  for (const h of all) console.log(`  ${h.file}:${h.line}  ${h.what}\n      ${h.excerpt}\n`);
  console.log('A warning is not a gate. Fix the export, never this checker.');
  process.exit(1);
}
