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
 *
 * **Every extraction in this module reads the script with its comments removed, and
 * anchors its pattern to a line start** (task `t10-01b` AC8 item 2, closing blocking
 * finding 2 of `t10-01`). The extractor used to search the script text as shipped and take
 * the leftmost match, so a block-commented copy of `fail` placed above a live
 * log-and-continue `fail` — or a commented copy of the `main().catch(...)` statement
 * placed above a live handler that swallows the rejection — was the dead text the pins
 * executed, while the real build logged and exited 0 and the whole suite stayed green.
 * `tests/toolchain-contract.spec.ts` ships exactly that decoy as a case, and pins that the
 * shipped-source entry points below delegate to the same script-text extractors the decoy
 * cases drive.
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
 * The body of `main()` of a **given** build-script source text, comments removed and the
 * search itself comment-free.
 *
 * The verification **order** exists nowhere else: a guard that runs after the folder
 * report would print a healthy-looking `dist/` for a build that has to fail. The prose is
 * removed for the same reason every other shipped-code scan removes it (`t9-02b` review
 * remark R2b), and the *anchor* is comment-free for the reason `t10-01` blocking finding 2
 * names: a commented copy of `main()` above the live one used to be the text whose order
 * this returned.
 */
export function buildScriptMainBodyFrom(source: string): string {
  const code = codeOnly(source);
  const open = code.indexOf('async function main() {');
  if (open < 0) {
    throw new Error('the build script has no `async function main()` outside a comment');
  }
  const close = code.indexOf('\n}', open);
  if (close < 0) {
    throw new Error('the build script main() is not closed at column 0');
  }
  return code.slice(open, close);
}

/** The body of the shipped script's `main()`, comments removed. */
export function buildScriptMainBody(): string {
  return buildScriptMainBodyFrom(buildScriptSource());
}

/**
 * One top-level function of a **given** build-script source text, taken out as text by
 * name.
 *
 * Two properties make the extraction honest (`t10-01b` AC8 item 2): the search runs on
 * `codeOnly(source)`, so a commented copy can never be the leftmost match, and the pattern
 * is anchored to a line start, so a function named inside a string or a line of prose is
 * not a declaration either. A function that exists **only** in a comment makes this throw
 * rather than hand back dead text.
 */
export function buildScriptFunctionSourceFrom(source: string, name: string): string {
  const match = new RegExp(`^[ \\t]*function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm').exec(
    codeOnly(source),
  );
  if (match === null) {
    throw new Error(`the build script declares no top-level function ${name} outside a comment`);
  }
  return match[0];
}

/**
 * The `fail` of a **given** build-script source text, executed.
 *
 * The return type is `unknown` here on purpose: for a script whose live `fail` logs and
 * returns, this answers with a function that does exactly that, which is the condition the
 * guard pins turn red on. The shipped wrapper below narrows it to `never`, because the
 * shipped `fail` throws and every guard case depends on that.
 */
export function loadBuildFailFromScript(source: string): (message: string) => unknown {
  const factory = new Function(
    `${buildScriptFunctionSourceFrom(source, 'fail')}\nreturn fail;`,
  ) as () => (message: string) => unknown;
  return factory();
}

/**
 * The shipped `fail`, executed. `t9-02b` review remark R1: the guard pin injected its own
 * throwing `fail`, so the shipped one was never run and a `fail` that logged and returned
 * would have left every case green while the build emitted a broken `dist/` at exit 0.
 */
export function loadBuildFail(): (message: string) => never {
  return loadBuildFailFromScript(buildScriptSource()) as (message: string) => never;
}

/**
 * One guard function of a **given** build-script source text, ready to call.
 *
 * `fail` comes from the **same text** as the guard, so the failure half of the guard is the
 * failure half that script ships; `runBuildScriptEntryFromScript` pins what that script
 * then makes of the throw. A script whose live `fail` logs instead of throwing therefore
 * produces a guard that answers an absent file with **nothing**, which is precisely how the
 * pins at `tests/toolchain-contract.spec.ts` and `tests/options-window-look.spec.ts` go red.
 */
export function loadBuildGuardFromScript(
  name: string,
  stubs: GuardStubs,
  source: string,
): (...args: unknown[]) => void {
  const factory = new Function(
    'existsSync',
    'join',
    'distDir',
    'fail',
    'logStep',
    `${buildScriptFunctionSourceFrom(source, name)}\nreturn ${name};`,
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
    loadBuildFailFromScript(source) as (message: string) => never,
    stubs.logStep ?? (() => undefined),
  );
}

/**
 * One guard function of the shipped build script, ready to call.
 *
 * This is the shipped-source entry point the D1 pins use; it delegates to
 * `loadBuildGuardFromScript` with `buildScriptSource()`, so the decoy cases in
 * `tests/toolchain-contract.spec.ts` exercise the same code the shipped pins run.
 */
export function loadBuildGuard(name: string, stubs: GuardStubs): (...args: unknown[]) => void {
  return loadBuildGuardFromScript(name, stubs, buildScriptSource());
}

/** What one execution of the shipped entry statement left behind. */
export interface BuildScriptEntryRun {
  /** `process.exitCode` as the shipped handler set it; `undefined` means it never touched it. */
  exitCode: number | undefined;
  /** Everything the shipped handler wrote to the error log, in order. */
  logged: string[];
}

/**
 * The `main().catch(...)` statement of a **given** build-script source text, taken out as
 * text. Comment-free search, line-anchored pattern (`t10-01b` AC8 item 2): a commented
 * copy of the shipped handler above a live handler that swallows the rejection used to be
 * the leftmost match, so the pins executed dead text while the live script exited 0.
 */
export function buildScriptEntryStatementFrom(source: string): string {
  const match = /^[ \t]*main\(\)\.catch\([\s\S]*?\n\}\);/m.exec(codeOnly(source));
  if (match === null) {
    throw new Error('the build script has no `main().catch(...)` statement outside a comment');
  }
  return match[0];
}

/** The shipped `main().catch(...)` statement, taken out as text. */
export function buildScriptEntryStatement(): string {
  return buildScriptEntryStatementFrom(buildScriptSource());
}

/**
 * Runs the `main().catch(...)` statement of a **given** build-script source text with only
 * `main`, `console` and `process` replaced. Everything the handler does — reading the
 * error, logging it, giving the process an exit code — is that script's own code, so the
 * exit half of "a failed check fails the build" is executed rather than quoted.
 *
 * `failingMain` stands where `main()` stands: whatever it throws is the rejection the
 * handler receives. Pair it with `loadBuildGuardFromScript` to walk a real check all the
 * way to an exit code, and with a returning function to pin that a clean build sets none.
 */
export async function runBuildScriptEntryFromScript(
  source: string,
  failingMain: () => unknown,
): Promise<BuildScriptEntryRun> {
  const logged: string[] = [];
  const stubProcess: { exitCode?: number } = {};
  const run = new Function(
    'main',
    'console',
    'process',
    buildScriptEntryStatementFrom(source),
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

  // The handler runs in a microtask after the rejection; a macrotask tick drains it, so
  // the assertion below reads a settled result instead of a race.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { exitCode: stubProcess.exitCode, logged };
}

/**
 * Runs the **shipped** `main().catch(...)` statement with only `main`, `console` and
 * `process` replaced. Everything the handler does — reading the error, logging it, giving
 * the process an exit code — is the shipped code, so the exit half of "a failed check
 * fails the build" is executed rather than quoted.
 */
export async function runBuildScriptEntry(failingMain: () => unknown): Promise<BuildScriptEntryRun> {
  return runBuildScriptEntryFromScript(buildScriptSource(), failingMain);
}
