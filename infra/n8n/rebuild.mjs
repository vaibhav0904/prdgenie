// Rebuild the n8n runtime from nothing, in one command.
//
// Written on 2026-09-02, after a Docker Desktop 4.80.0 upgrade recreated its data disk and
// took every container, image and volume with it. Recovery that day took about twenty
// minutes of remembering which script came next. It should take two.
//
// This deliberately does NOT restore credentials. Provider keys live only in n8n's
// encrypted store (ADR 0004), so the OpenAI key is re-entered by hand — the one step that
// needs a human, and the price of not having the key in a file. Everything else is code.
//
// Usage:  .\run.cmd infra/n8n/rebuild.mjs

import { execFileSync } from 'node:child_process';

const COMPOSE = 'infra/n8n/docker-compose.yml';
const VOLUME = 'n8n_local_data';
const CONTAINER = 'n8n-local';
const N8N = (process.env.N8N_API_URL ?? 'http://localhost:5678').replace(/\/$/, '');

const sh = (cmd, args, { allowFail = false } = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (allowFail) return `${err.stdout ?? ''}${err.stderr ?? ''}`;
    console.error(`\nFAILED: ${cmd} ${args.join(' ')}`);
    console.error(`${err.stdout ?? ''}${err.stderr ?? ''}`);
    process.exit(1);
  }
};

const node = (args) => execFileSync(process.execPath, ['--env-file-if-exists=.env', ...args],
  { encoding: 'utf8' });

const step = (n, what) => console.log(`\n[${n}/5] ${what}`);

async function waitForN8n(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    try {
      const res = await fetch(`${N8N}/healthz`, { signal: ac.signal });
      if (res.ok) return true;
    } catch { /* not up yet */ } finally { clearTimeout(t); }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

console.log('Rebuilding the n8n runtime from the repo.');

// 1. The volume is external and created by hand, so compose cannot own it — and so no
//    application teardown can remove it. Creating it is idempotent.
step(1, `ensuring volume ${VOLUME} exists`);
const volumes = sh('docker', ['volume', 'ls', '--format', '{{.Name}}']);
if (volumes.split('\n').map((s) => s.trim()).includes(VOLUME)) {
  console.log(`      already exists — its contents are left untouched`);
} else {
  sh('docker', ['volume', 'create', VOLUME]);
  console.log(`      created (empty: this is a from-scratch rebuild)`);
}

step(2, 'starting n8n');
sh('docker', ['compose', '-f', COMPOSE, 'up', '-d']);
if (!await waitForN8n()) {
  console.error(`      n8n did not answer on ${N8N} within two minutes.`);
  console.error(`      docker logs ${CONTAINER} --tail 50`);
  process.exit(1);
}
console.log(`      answering on ${N8N}`);

step(3, 'provisioning the internal service credential');
process.stdout.write(node(['n8n/scripts/provision-internal-credential.mjs', CONTAINER])
  .split('\n').filter(Boolean).map((l) => `      ${l}`).join('\n') + '\n');

step(4, 'importing the workflows from the repo');
process.stdout.write(node(['n8n/scripts/import-workflows.mjs'])
  .split('\n').filter((l) => /^(OK|FAIL)|imported/.test(l)).map((l) => `      ${l}`).join('\n') + '\n');

step(5, 'restarting so activation and webhooks take effect');
sh('docker', ['restart', CONTAINER]);
if (!await waitForN8n()) {
  console.error('      n8n did not come back after the restart.');
  process.exit(1);
}
console.log('      back up');

console.log(`
Rebuilt. What is restored:
  - the n8n runtime, on ${N8N}
  - all workflows tagged prdgenie, from n8n/workflows/*.json
  - the internal service credential, from .env

What is NOT, by design (ADR 0004):
  - the OpenAI API key. It exists only inside n8n's encrypted store, never in .env and
    never in this repo, so a lost volume means re-entering it. Two minutes, once:

      1. open ${N8N}
      2. Credentials -> Add credential -> "OpenAI" -> paste the key -> Save
      3. .\\run.cmd n8n/scripts/bind-provider-credential.mjs
      4. .\\run.cmd n8n/scripts/import-workflows.mjs
      5. docker restart ${CONTAINER}

Then check everything:  .\\run.cmd`);
