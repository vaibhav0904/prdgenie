// Provisions the n8n credential that lets workflows call the review service's
// /internal/* endpoints, without ever putting the secret in a committed file.
//
// What it does:
//   1. reads INTERNAL_API_KEY from .env (generates one and writes it back if absent)
//   2. writes a credential JSON to a temp path INSIDE the n8n container
//   3. imports it (n8n stores it encrypted), then deletes the temp file
//
// The workflow JSON references this credential by id and name only. That is what keeps
// `npm run export:n8n` shippable: there is no secret in the export to strip.
//
// Usage:  node n8n/scripts/provision-internal-credential.mjs [container-name]

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONTAINER = process.argv[2] ?? process.env.N8N_CONTAINER ?? 'n8n-local';
const CRED_ID = 'prdgenieInternalKey';
const CRED_NAME = 'PRDGenie Internal Service Key';
const ENV_PATH = '.env';
const REMOTE = '/tmp/prdgenie-internal-credential.json';

const docker = (args, opts = {}) =>
  execFileSync('docker', args, { encoding: 'utf8', ...opts });

function readOrCreateKey() {
  let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const m = env.match(/^INTERNAL_API_KEY=(.*)$/m);
  const current = m?.[1]?.trim();

  if (current && current !== 'change-me-any-random-string') {
    return { key: current, generated: false };
  }
  const key = randomBytes(24).toString('base64url');
  env = m
    ? env.replace(/^INTERNAL_API_KEY=.*$/m, `INTERNAL_API_KEY=${key}`)
    : `${env.trimEnd()}\nINTERNAL_API_KEY=${key}\n`;
  writeFileSync(ENV_PATH, env);
  return { key, generated: true };
}

const { key, generated } = readOrCreateKey();
console.log(generated
  ? 'Generated a new INTERNAL_API_KEY and wrote it to .env (gitignored).'
  : 'Using the existing INTERNAL_API_KEY from .env.');

// httpHeaderAuth: n8n sends { name: value } as a request header.
const credential = [{
  id: CRED_ID,
  name: CRED_NAME,
  type: 'httpHeaderAuth',
  data: { name: 'x-internal-key', value: key },
}];

// Written inside the container and removed immediately after import, so the plaintext
// never touches the repo or the host filesystem.
const json = JSON.stringify(credential).replace(/'/g, "'\\''");
docker(['exec', CONTAINER, 'sh', '-c', `printf '%s' '${json}' > ${REMOTE}`]);

try {
  const out = docker(['exec', CONTAINER, 'sh', '-c',
    `n8n import:credentials --input=${REMOTE} 2>&1 | tail -3`]);
  process.stdout.write(out);
} finally {
  docker(['exec', CONTAINER, 'sh', '-c', `rm -f ${REMOTE}`]);
  console.log('Temp credential file removed from the container.');
}

console.log(`\nCredential "${CRED_NAME}" (id ${CRED_ID}) is available to workflows.`);
console.log('Restart n8n if it was running when this ran:  docker restart ' + CONTAINER);
