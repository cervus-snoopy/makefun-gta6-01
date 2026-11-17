// main.ts — hands the PORT MERCER entry in: copies game/ + screenshots/ from
// this repository to the output directory and writes /output/dossier.json
// with buildDossier from ./vendor/makefun-game.ts. Node 22, stdlib only.
// Run: MAKEFUN_OUTPUT_DIR=out node main.ts   (default output dir: /output)
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Empty the output directory's CONTENTS, never the directory itself: the
// grader runs as an unprivileged user (65534) that cannot delete /output
// itself (its parent is not writable by it), so rmSync(outDir) throws
// EACCES and the run fails. mkdir first (no-op when it exists), then
// remove each entry inside it.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, caps);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
