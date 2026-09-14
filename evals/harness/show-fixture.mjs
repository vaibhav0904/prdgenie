// Print a fixture's raw text, ready to paste into the ingest form.
//
// Exists because the demo says "paste T2 into the form" and T2 lives inside a JSON file with
// its text as an escaped string. Opening a JSON file and hand-unescaping a transcript is not a
// thing anyone should do while recording (BUG-069).
//
//   .\run.cmd evals\harness\show-fixture.mjs           list them
//   .\run.cmd evals\harness\show-fixture.mjs T2        the text, and what to put in the form
//   .\run.cmd evals\harness\show-fixture.mjs T2 --raw  the text and nothing else, for a pipe

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'evals/datasets/docs';
const id = process.argv[2];
const raw = process.argv.includes('--raw');

const ids = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));

if (!id) {
  console.log('Fixtures in evals/datasets/docs:\n');
  for (const f of ids) {
    const d = JSON.parse(readFileSync(join(DIR, `${f}.json`), 'utf8'));
    console.log(`  ${f.padEnd(4)} ${String(d.doc_type).padEnd(14)} ${d.title ?? ''}`);
  }
  console.log('\n  .\\run.cmd evals\\harness\\show-fixture.mjs T2');
  process.exit(0);
}

if (!ids.includes(id)) {
  console.error(`No fixture "${id}". There are ${ids.length}: ${ids.join(', ')}`);
  process.exit(1);
}

const d = JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));

if (raw) {
  process.stdout.write(d.raw_text);
  process.exit(0);
}

console.log('');
console.log(`  ${id} — ${d.title ?? '(no title)'}`);
console.log('');
console.log(`  Into the n8n form at ${new URL(process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest').origin}/form/prdgenie-ingest-form :`);
console.log(`      Product         forgesight`);
console.log(`      Document type   ${d.doc_type}`);
console.log(`      Who wrote this? third_party`);
console.log(`      Update an existing PRD   PRD-forgesight   (leave EMPTY for a first draft)`);
console.log('      Text            everything below the line');
console.log('');
console.log('─'.repeat(74));
console.log(d.raw_text);
console.log('─'.repeat(74));
console.log(`  ${d.raw_text.length} characters. Select from the line above to the line below.`);
console.log('');
