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
 *
 * The **failure half** of that chain is lifted out the same way (task `t10-01` D1, closing
 * `t9-02b` review remark R1). The guard no longer calls a hand-written stand-in for
 * `fail`: it calls the **shipped** `fail`, so a `fail` that logged instead of throwing
 * makes the guard cases fail. And `runBuildScriptEntry` executes the shipped
 * `main().catch(...)` statement against a stubbed `process`, so "a failed check becomes a
 * non-zero exit code" is a produced result and not a quoted substring.
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

/**
 * Strips comments, so a claim about shipped code is not satisfied by prose.
 *
 * This is the **one** comment-stripping helper in the repository (task `t10-01` D3,
 * closing `t9-02b` review remark R3). The two contract suites used to keep private copies
 * with different coverage — one of them blind to `<!-- -->` — and each copy could drift
 * without failing anything. `tests/toolchain-contract.spec.ts` pins the three forms this
 * helper removes, and names the private copies that are still out there.
 */
export function codeOnly(text: string): string {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/<!--[\s\S]*?-->/g, ' ')
    .replaceAll(/\/\/[^\n]*/g, ' ');
}

/**
 * The body of the script's `main()`, comments removed. The verification **order** exists
 * nowhere else: a guard that runs after the folder report would print a healthy-looking
 * `dist/` for a build that has to fail. The prose is removed for the same reason every
 * other shipped-code scan removes it (`t9-02b` review remark R2b): an order claim or an
 * error-handling claim satisfied by a comment is not a pin.
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
  return codeOnly(source.slice(open, close));
}

/** One top-level function of the shipped script, taken out **as text** by name. */
function buildScriptFunctionSource(name: string): string {
  const match = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(
    buildScriptSource(),
  );
  if (match === null) {
    throw new Error(`scripts/build-extension.mjs declares no top-level function ${name}`);
  }
  return match[0];
}

/**
 * The shipped `fail`, executed. `t9-02b` review remark R1: the guard pin injected its own
 * throwing `fail`, so the shipped one was never run and a `fail` that logged and returned
 * would have left every case green while the build emitted a broken `dist/` at exit 0.
 */
export function loadBuildFail(): (message: string) => never {
  const factory = new Function(
    `${buildScriptFunctionSource('fail')}\nreturn fail;`,
  ) as () => (message: string) => never;
  return factory();
}

/**
 * One guard function of the build script, ready to call.
 *
 * `fail` is the **shipped** one, so the failure half of the guard is the shipped failure
 * half; `runBuildScriptEntry` pins what the shipped script then makes of the throw.
 */
export function loadBuildGuard(name: string, stubs: GuardStubs): (...args: unknown[]) => void {
  const factory = new Function(
    'existsSync',
    'join',
    'distDir',
    'fail',
    'logStep',
    `${buildScriptFunctionSource(name)}\nreturn ${name};`,
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
    loadBuildFail(),
    stubs.logStep ?? (() => undefined),
  );
}

/** What one execution of the shipped entry statement left behind. */
export interface BuildScriptEntryRun {
  /** `process.exitCode` as the shipped handler set it; `undefined` means it never touched it. */
  exitCode: number | undefined;
  /** Everything the shipped handler wrote to the error log, in order. */
  logged: string[];
}

/** The shipped `main().catch(...)` statement, taken out as text. */
export function buildScriptEntryStatement(): string {
  const match = /\nmain\(\)\.catch\([\s\S]*?\n\}\);/.exec(buildScriptSource());
  if (match === null) {
    throw new Error('scripts/build-extension.mjs has no `main().catch(...)` statement');
  }
  return match[0];
}

/**
 * Runs the shipped `main().catch(...)` statement with only `main`, `console` and
 * `process` replaced. Everything the handler does — reading the error, logging it, giving
 * the process an exit code — is the shipped code, so the exit half of "a failed check
 * fails the build" is executed rather than quoted.
 *
 * `failingMain` stands where `main()` stands: whatever it throws is the rejection the
 * shipped handler receives. Pair it with `loadBuildGuard` to walk a real check all the way
 * to an exit code, and with a returning function to pin that a clean build sets none.
 */
export async function runBuildScriptEntry(failingMain: () => unknown): Promise<BuildScriptEntryRun> {
  const logged: string[] = [];
  const stubProcess: { exitCode?: number } = {};
  const run = new Function(
    'main',
    'console',
    'process',
    buildScriptEntryStatement(),
  ) as (
    main: () => Promise<unknown>,
    console: { error: (message?: unknown) => void },
    process: { exitCode?: number },
  ) => void;

  run(
    async () => {
      failingMain();
    },
    { error: (message) => logged.push(String(message)) },
    stubProcess,
  );

  // The shipped handler runs in a microtask after the rejection; a macrotask tick drains
  // it, so the assertion below reads a settled result instead of a race.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { exitCode: stubProcess.exitCode, logged };
}
