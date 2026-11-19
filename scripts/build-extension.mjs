/**
 * Assembles the loadable MV3 folder in `dist/`.
 *
 * Approved build wiring (assumption `A3`):
 *   1. Angular application builder for the popup and the options page.
 *   2. esbuild for the content script bundle (Preact, never Angular).
 *   3. this script copies `src/manifest.json` and verifies that the result is a
 *      self-contained extension folder.
 *
 * Failure of any verification step fails the build: a `dist/` that Chrome would
 * reject is never produced silently.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(projectRoot, 'dist');
const angularCli = join(projectRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

/** Angular applications built with the Angular application builder. */
const angularApps = [
  { project: 'popup', html: 'popup/index.html' },
  { project: 'options', html: 'options/index.html' },
];

function fail(message) {
  throw new Error(`build-extension: ${message}`);
}

function logStep(message) {
  console.log(`[build] ${message}`);
}

function cleanDist() {
  rmSync(distDir, { recursive: true, force: true });
  logStep(`cleaned ${relative(projectRoot, distDir)}/`);
}

/**
 * Copies a directory tree, creating the target directory and never a symlink.
 * The icon copy below is the only use: one file, but a recursive helper keeps the
 * "same shape as the options asset copy" honest if a second size ever ships.
 */
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target);
    } else {
      copyFileSync(source, target);
    }
  }
}

function runAngularBuild(project) {
  if (!existsSync(angularCli)) {
    fail(`Angular CLI is missing at ${relative(projectRoot, angularCli)}; run npm install first`);
  }
  const result = spawnSync(process.execPath, [angularCli, 'build', project], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(`ng build ${project} exited with status ${String(result.status)}`);
  }
}

async function buildContentBundle() {
  await build({
    absWorkingDir: projectRoot,
    entryPoints: ['src/content/main.ts'],
    outfile: 'dist/content.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  });
}

function copyManifest() {
  copyFileSync(join(projectRoot, 'src', 'manifest.json'), join(distDir, 'manifest.json'));
  logStep('copied src/manifest.json -> dist/manifest.json');
}

/**
 * The declared icon is a file of the extension, not an Angular application asset, so
 * it is copied the way the manifest is — straight from `src/` — and not through
 * `angular.json`. The manifest names it, so `verifyManifestReferences` would already
 * fail a build that left it out; this step is what makes that check pass, and it runs
 * before the check does.
 */
function copyIcons() {
  copyDir(join(projectRoot, 'src', 'icons'), join(distDir, 'icons'));
  logStep('copied src/icons -> dist/icons');
}

function readDistManifest() {
  const manifestPath = join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail('dist/manifest.json is missing');
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

/** Every file the manifest points at must exist inside dist/. */
function verifyManifestReferences(manifest) {
  if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3, got ${JSON.stringify(manifest.manifest_version)}`);
  }

  const references = [];
  for (const entry of manifest.content_scripts ?? []) {
    references.push(...(entry.js ?? []), ...(entry.css ?? []));
  }
  if (typeof manifest.action?.default_popup === 'string') {
    references.push(manifest.action.default_popup);
  }
  // Ruling `A118`: the settings surface is declared as `options_ui`, and Chrome rejects
  // the `options_page` + `options_ui` pair, so this is the only options key the check
  // resolves. `tests/toolchain-contract.spec.ts` pins the absence of `options_page`.
  if (typeof manifest.options_ui?.page === 'string') {
    references.push(manifest.options_ui.page);
  }
  if (typeof manifest.background?.service_worker === 'string') {
    references.push(manifest.background.service_worker);
  }
  for (const icon of Object.values(manifest.icons ?? {})) {
    references.push(icon);
  }
  for (const icon of Object.values(manifest.action?.default_icon ?? {})) {
    references.push(icon);
  }

  for (const reference of references) {
    if (reference.startsWith('/') || reference.includes('..')) {
      fail(`manifest reference "${reference}" is not relative to dist/`);
    }
    if (!existsSync(join(distDir, reference))) {
      fail(`manifest reference "${reference}" does not exist inside dist/`);
    }
  }

  logStep(`manifest references resolved: ${references.join(', ')}`);
}

/** The content bundle must stay Angular-free. */
function verifyContentBundleHasNoAngular() {
  const contentPath = join(distDir, 'content.js');
  if (!existsSync(contentPath)) {
    fail('dist/content.js is missing');
  }
  const code = readFileSync(contentPath, 'utf8');
  if (code.includes('@angular/')) {
    fail('dist/content.js contains an @angular/ reference; the content bundle must be Angular-free');
  }
  if (code.includes('bootstrapApplication')) {
    fail('dist/content.js contains bootstrapApplication; Angular must never boot in a page');
  }
}

/**
 * The options page's `settings mascot` ships as a real file, not as an inline data
 * URI (rulings `A123`, `A126`, task `t9-02`). The manifest never names it, so the
 * manifest reference check cannot notice its absence: this is the check that does.
 * A `dist/` whose options page would render a broken image fails the build.
 */
function verifyOptionsAssetShips() {
  const asset = 'options/assets/cat-mascot.png';
  if (!existsSync(join(distDir, asset))) {
    fail(
      `dist/${asset} is missing; angular.json must copy src/options/assets into dist/options/assets`,
    );
  }
  logStep(`options asset present: dist/${asset}`);
}

function listDistFiles(dir = distDir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listDistFiles(full));
    } else {
      files.push({ path: relative(distDir, full), bytes: statSync(full).size });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function report() {
  const files = listDistFiles();
  for (const file of files) {
    logStep(`dist/${file.path} (${String(file.bytes)} bytes)`);
  }
  logStep(`dist/ is a self-contained MV3 folder (${String(files.length)} files)`);
}

async function main() {
  cleanDist();
  for (const app of angularApps) {
    runAngularBuild(app.project);
  }
  await buildContentBundle();
  logStep('built dist/content.js with esbuild');
  copyManifest();
  copyIcons();
  const manifest = readDistManifest();
  verifyManifestReferences(manifest);
  verifyContentBundleHasNoAngular();
  verifyOptionsAssetShips();
  report();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
