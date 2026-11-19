/**
 * The verification guards of `scripts/build-extension.mjs`, executed here as functions.
 *
 * The build script is a script: importing it would run `ng build` twice and delete the
 * `dist/` that later cases read. So a guard is lifted out of the shipped script **as
 * text** and run with `existsSync`, `join`, `distDir`, `fail` and `logStep` injected.
 * The pin is then the guard's **behavior** — an absent file answers with the failure, a
 * shipped file answers with nothing — and not the wording around it. That is the close
 * `t9-01` review remark R2 and `t9-02` review remark R2 asked for (task `t9-02b` AC3):
 * "a missing `dist/options/index.html` fails the build" and "a `dist/` without the
 * copied mascot fails the build" stop resting on an engineer's one-off mutation run.
 *
 * The extraction names the function, so renaming or inlining a guard is a failing test
 * rather than a passing scan.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** What a guard is allowed to touch: the built folder, the filesystem, the log. */
export interface GuardStubs {
  /** The folder the guard resolves its references against. */
  distDir: string;
  /** The filesystem the guard sees — real, or one that hides a file on purpose. */
  existsSync: (path: string) => boolean;
  /** Build log, discarded by default: a log line is not an assertion. */
  logStep?: (message: string) => void;
}

/** The shipped build script, with its line endings normalized for line-anchored scans. */
export function buildScriptSource(): string {
  const raw = readFileSync(join(projectRoot, 'scripts', 'build-extension.mjs'), 'utf8');
  return raw.replaceAll('\r\n', '\n');
}

/** Strips comments, so a claim about shipped code is not satisfied by prose. */
export function codeOnly(text: string): string {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/\/\/[^\n]*/g, ' ');
}

/**
 * The body of the script's `main()`. The verification **order** exists nowhere else:
 * a guard that runs after the folder report would print a healthy-looking `dist/` for a
 * build that has to fail.
 */
export function buildScriptMainBody(): string {
  const source = buildScriptSource();
  const open = source.indexOf('async function main() {');
  if (open < 0) {
    throw new Error('scripts/build-extension.mjs has no `async function main()`');
  }
  const close = source.indexOf('\n}', open);
  if (close < 0) {
    throw new Error('the build script main() is not closed at column 0');
  }
  return source.slice(open, close);
}

/**
 * One guard function of the build script, ready to call.
 *
 * `fail` is replaced by a throw: inside the script it throws, and `main().catch` turns
 * that throw into `process.exitCode = 1`, which the caller pins separately.
 */
export function loadBuildGuard(name: string, stubs: GuardStubs): (...args: unknown[]) => void {
  const match = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(
    buildScriptSource(),
  );
  if (match === null) {
    throw new Error(`scripts/build-extension.mjs declares no top-level function ${name}`);
  }
  const factory = new Function(
    'existsSync',
    'join',
    'distDir',
    'fail',
    'logStep',
    `${match[0]}\nreturn ${name};`,
  ) as (
    existsSync: (path: string) => boolean,
    join: (...parts: string[]) => string,
    distDir: string,
    fail: (message: string) => never,
    logStep: (message: string) => void,
  ) => (...args: unknown[]) => void;

  return factory(
    (path) => stubs.existsSync(path),
    (...parts) => join(...parts),
    stubs.distDir,
    (message): never => {
      throw new Error(`build-extension: ${message}`);
    },
    stubs.logStep ?? (() => undefined),
  );
}
