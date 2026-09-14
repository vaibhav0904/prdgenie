// One mutator at a time (BUG-054).
//
// Some scripts in this project work on a copy and can run beside anything. Others rewrite
// `review-ui/server.js`, swap a prompt into a workflow, or restart n8n — and two of *those* at
// once do not fail cleanly. They interleave, and each one reports the other's cleanup as its
// own defect:
//
//   "the tree is unchanged afterwards — the plant was never written"   (it was, and undone)
//   "1 fixture quote(s) appear verbatim in a prompt"                   (somebody else's prompt)
//   "exit null"                                                        (a 600s timeout, not an
//                                                                       assertion)
//
// **Every one of those is a plausible story about the wrong thing**, and all three cost real
// time to diagnose — wrongly, first. A false red is worse than a false green in that one
// specific way: it teaches you to distrust the checks.
//
// So: a lock file, taken before the first mutation and released after the last.
//
// HOW A SWEEP AND ITS CHILDREN SHARE IT. `check-all` holds the lock for its whole run and puts
// its PID in the environment. A child that finds its own parent's lock proceeds without taking
// a second one — otherwise the suite would deadlock against itself the moment a mutating check
// came up, which is a lock that stops the thing it protects.
//
// WHAT IT IS NOT. It is a file in a working tree, so it is about one machine and one clock.
// Nothing here is shared across machines, and if that ever changes this is the wrong mechanism
// rather than a mechanism to extend.

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const LOCK = '.exclusive.lock';
const ENV_KEY = 'PRDGENIE_EXCLUSIVE_HELD_BY';

/** Is that process still there? `signal 0` asks without sending anything. */
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to somebody else — still alive, still holding.
    return err.code === 'EPERM';
  }
}

function readLock() {
  try { return JSON.parse(readFileSync(LOCK, 'utf8')); } catch { return null; }
}

/**
 * Take the lock, or refuse and exit.
 *
 * Returns a `release()` — call it when the mutations are done. It is also wired to `exit` and
 * to the signals a terminal sends, because a lock released only on the happy path is a lock
 * that will one day not be released.
 */
export function takeExclusive(who, { files = [] } = {}) {
  // Inside a sweep that already holds it: nothing to take, nothing to release.
  const heldByParent = process.env[ENV_KEY];
  if (heldByParent && alive(Number(heldByParent))) {
    return { held: false, release: () => {} };
  }

  const existing = readLock();
  if (existing) {
    if (alive(existing.pid)) {
      console.error(`Refused: ${existing.who} is holding the exclusive lock.`);
      console.error(`  started ${existing.started_at}, pid ${existing.pid}`);
      if (existing.files?.length) console.error(`  it may be rewriting: ${existing.files.join(', ')}`);
      console.error('');
      console.error('These scripts rewrite files the others read. Running two interleaves them,');
      console.error('and each reports the other\'s cleanup as its own defect (BUG-054). Wait for');
      console.error('it, or stop it — do not run both.');
      process.exit(1);
    }
    // A LOCK WITHOUT A HOLDER. Reported loudly and then cleared: refusing forever would make a
    // killed run a permanent outage. What the dead run may have left half-done is a different
    // question, and `check-deployed-prompts.mjs` is what answers it (BUG-053's breadcrumb).
    console.warn(`Note: a lock from ${existing.who} (pid ${existing.pid}, started ${existing.started_at})`);
    console.warn('      has no live process behind it. Clearing it and continuing.');
    console.warn('      If that run was killed mid-change, check-deployed-prompts.mjs will say so.');
    rmSync(LOCK, { force: true });
  }

  writeFileSync(LOCK, `${JSON.stringify({
    who, pid: process.pid, started_at: new Date().toISOString(), files,
  }, null, 2)}\n`);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // Only ever remove OUR lock. A slow release racing a later run's take would otherwise
    // delete a lock somebody else is relying on.
    const now = readLock();
    if (now?.pid === process.pid) rmSync(LOCK, { force: true });
  };

  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => { release(); process.exit(130); });
  }

  return { held: true, release };
}

/** The environment a sweep hands its children so they do not queue behind their own parent. */
export function exclusiveEnvFor(pid = process.pid) {
  return { [ENV_KEY]: String(pid) };
}

export const LOCK_FILE = LOCK;
export const LOCK_ENV_KEY = ENV_KEY;
