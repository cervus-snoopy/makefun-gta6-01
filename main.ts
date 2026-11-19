// PORT MERCER — Leon Bay: the entrypoint (Node 22+, standard library only).
//
// What a run does, in order:
//   1. Starts a throwaway X server on :99 so the headless GL renderer can
//      open a context (headless-gl needs a display even though nobody watches).
//   2. Renders the four dossier screenshots from real gameplay states with
//      game/src/three-headless.mjs (cover, street, mission, night), each a
//      deterministic frame: same seed, same ticks, same pixels every run.
//   3. Renames the fresh renders into output/ as 1-cover.jpg … 4-night.jpg.
//   4. Writes output/dossier.json: a manifest of the whole entry — the game
//      title, the fixed seed, the render stats per shot, the screenshots'
//      hashes, and the sha256 of every file that ships.
//   5. Prints one summary line and stops the X server.
//
// The output directory is always <repo>/output, next to this file, so a run
// is repeatable from any working directory. Run it with:
//   node main.ts
// and read the result in output/dossier.json. Deterministic: run it twice
// and the dossier bytes are identical (the only varying field is the
// renderer's own timing, which is never written into the dossier).

import { spawn } from 'node:child_process';
import {
  createHash,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const startedAt = Date.now();
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(ROOT, 'output');
const HEADLESS = join(ROOT, 'game', 'src', 'three-headless.mjs');
const SCREENSHOTS = join(ROOT, 'screenshots');
const DISPLAY = ':99';
const X_SOCKET = '/tmp/.X11-unix/X99';

const GAME_TITLE = 'PORT MERCER — Leon Bay';
const ENTRY_ID = 'gta6-01';
const RENDERER = 'three-r152';
const SEED = 20261118;
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 720;

// The four shots, in dossier order. `key` is the headless renderer's name;
// `file` is the name the shot ships under (the cover is first by name).
const SHOTS = [
  { key: 'cover', file: '1-cover.jpg' },
  { key: 'street', file: '2-street.jpg' },
  { key: 'mission', file: '3-mission.jpg' },
  { key: 'night', file: '4-night.jpg' },
];

// Files that never ship in the manifest: the build output itself, the git
// directory, the coordinator's handoff note, and the dev server script.
const SKIP_NAMES = new Set(['.git', 'output', 'HANDOFF.md', 'serve.ts']);

function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function toPosix(p) {
  return p.split(sep).join('/');
}

// Recursive walk of one directory, sorted, skipping the never-ship names.
// Returns paths relative to the repository root, POSIX-style.
function walkDir(dir, root) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (SKIP_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkDir(abs, root));
    else if (entry.isFile()) found.push(toPosix(relative(root, abs)));
  }
  return found;
}

// The manifest lists the entry in a fixed order: the playable game first,
// then the root files, then the screenshots, then the vendored libraries.
// (A plain alphabetical walk would interleave them; the dossier keeps the
// game first so the judge reads the entry in the order it plays.)
function listManifestFiles() {
  const listed = [];
  listed.push(...walkDir(join(ROOT, 'game'), ROOT));
  for (const name of ['LICENSE', 'main.ts', 'README.md']) {
    const abs = join(ROOT, name);
    if (existsSync(abs) && statSync(abs).isFile()) listed.push(name);
  }
  listed.push(...walkDir(SCREENSHOTS, ROOT));
  listed.push(...walkDir(join(ROOT, 'vendor'), ROOT));
  return listed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait until the X socket answers, so the renderer never races the server.
async function waitForXSocket(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(X_SOCKET)) return true;
    await sleep(100);
  }
  return existsSync(X_SOCKET);
}

// Run a command, capture stdout, and fail loudly on a non-zero exit.
function runCaptured(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${command} exited ${code}: ${err.trim()}`));
    });
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Clear any half-finished renders from an interrupted earlier run so a
  // stale frame can never pass as a fresh one.
  for (const shot of SHOTS) {
    for (const ext of ['jpg', 'png']) {
      const stale = join(OUT, `${shot.key}.${ext}`);
      if (existsSync(stale)) unlinkSync(stale);
    }
  }

  // The X server: reuse one that is already up (a previous run's, or the
  // machine's), otherwise start our own and stop it before we exit.
  let xvfb = null;
  if (!existsSync(X_SOCKET)) {
    xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x720x24', '-nolisten', 'tcp'], {
      stdio: 'ignore',
    });
    if (!(await waitForXSocket())) {
      throw new Error('Xvfb did not come up on :99');
    }
  }

  try {
    const shotArgs = SHOTS.map((s) => s.key).join(',');
    const raw = await runCaptured(
      process.execPath,
      [HEADLESS, '--out', OUT, '--shots', shotArgs],
      { ...process.env, DISPLAY },
    );
    const stats = JSON.parse(raw);
    if (stats.mode !== 'shots') throw new Error(`three-headless returned mode ${stats.mode}`);

    const shots = [];
    for (const shot of SHOTS) {
      const rendered = join(OUT, `${shot.key}.jpg`);
      const shipped = join(OUT, shot.file);
      renameSync(rendered, shipped);
      const png = join(OUT, `${shot.key}.png`);
      if (existsSync(png)) unlinkSync(png);
      const s = stats[shot.key];
      if (!s) throw new Error(`three-headless reported no stats for ${shot.key}`);
      shots.push({
        name: shot.file,
        width: SHOT_WIDTH,
        height: SHOT_HEIGHT,
        drawCalls: s.calls,
        triangles: s.tris,
        timeOfDay: s.timeOfDay,
      });
    }

    const screenshots = SHOTS.map((shot) => {
      const abs = join(SCREENSHOTS, shot.file);
      return { name: shot.file, bytes: statSync(abs).size, sha256: sha256File(abs) };
    });

    const files = listManifestFiles().map((rel) => {
      const abs = join(ROOT, rel);
      return { path: rel, bytes: statSync(abs).size, sha256: sha256File(abs) };
    });

    const dossier = {
      game: GAME_TITLE,
      entry: ENTRY_ID,
      renderer: RENDERER,
      seed: SEED,
      node: process.version,
      shots,
      screenshots,
      files,
    };
    const text = `${JSON.stringify(dossier, null, 2)}\n`;
    const dossierPath = join(OUT, 'dossier.json');
    writeFileSync(dossierPath, text);
    const bytes = statSync(dossierPath).size;
    const sha = sha256File(dossierPath);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`dossier.json: ${bytes} bytes, ${files.length} files, ${screenshots.length} screenshots, sha256 ${sha}`);
    console.log(`done in ${seconds}s`);
  } finally {
    if (xvfb) xvfb.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(`main.ts failed: ${err.message}`);
  process.exit(1);
});
