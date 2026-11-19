import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  buildScriptEntryStatement,
  buildScriptEntryStatementFrom,
  buildScriptFunctionSourceFrom,
  buildScriptMainBody,
  buildScriptMainBodyFrom,
  buildScriptSource,
  codeOnly,
  loadBuildFail,
  loadBuildFailFromScript,
  loadBuildGuard,
  loadBuildGuardFromScript,
  normalizeLineEndings,
  runBuildScriptEntry,
  runBuildScriptEntryFromScript,
} from './support/build-script-guards';

/**
 * Toolchain contracts of task `t1-01`.
 *
 * These checks are the executable form of the layering rules in
 * `AGENTS.md` / `docs/project-profile.md`: Angular only in the extension UI,
 * Preact only in the page, permissions limited to `storage`, no network API in
 * shipped source. They run before `dist/` exists, so a violation fails the unit
 * gate and not only the manual load check.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

interface SourceFile {
  path: string;
  text: string;
}

interface ManifestShape {
  manifest_version?: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  action?: { default_popup?: string; default_icon?: unknown };
  /** Ruling `A118`: the settings surface is a Chrome window, not a tab. */
  options_ui?: { page?: string; open_in_tab?: boolean };
  /** Declared in this shape only so the `A118` absence pin compiles; Chrome rejects the pair. */
  options_page?: string;
  content_scripts?: { matches?: string[]; js?: string[]; css?: string[] }[];
  /** The reference check resolves these; `t9-02b` AC4 pins that this manifest names none. */
  icons?: Record<string, string>;
}

/**
 * The file types a shipped module can be written in (`t10-01` D4, closing `t9-02b` review
 * remark R4). The set used to be `ts`, `tsx`, `html`, `json`, so a future ES module under
 * `src/` — a helper a later task has every reason to add — was invisible to every negative
 * scan in this file while the spec said "scans the shipped source". The set is now every
 * type a shipped module or a shipped asset can be written in, and the case below pins that
 * nothing under `src/` sits outside it without being named.
 */
const SHIPPED_TEXT_EXTENSIONS =
  /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|html|json|css|scss|svg|txt|md|xml|yml|yaml|webmanifest)$/i;

/** Every file under a directory, repository-relative and slash-separated, whatever its type. */
function allFilesUnder(dir: string): string[] {
  const absoluteDir = join(projectRoot, dir);
  const files: string[] = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...allFilesUnder(join(dir, entry.name)));
      continue;
    }
    files.push(join(dir, entry.name).replaceAll('\\', '/'));
  }
  return files.sort();
}

function sourceFiles(dir: string): SourceFile[] {
  const absoluteDir = join(projectRoot, dir);
  const files: SourceFile[] = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...sourceFiles(join(dir, entry.name)));
      continue;
    }
    if (!SHIPPED_TEXT_EXTENSIONS.test(entry.name)) {
      continue;
    }
    files.push({
      path: join(dir, entry.name).replaceAll('\\', '/'),
      text: readFileSync(join(absoluteDir, entry.name), 'utf8'),
    });
  }
  return files;
}

/** The `import ... from '...'` clauses of one source file, comments removed. */
function importClauses(text: string): string[] {
  return [...codeOnly(text).matchAll(/\bimport\b[^;]*\bfrom\s*'[^']*'/g)].map((match) => match[0]);
}

/** Shipped modules that import the identifier `name` from another module. */
function importersOf(name: string): string[] {
  const mention = new RegExp(`\\b${name}\\b`);
  return sourceFiles('src')
    .filter((file) => importClauses(file.text).some((clause) => mention.test(clause)))
    .map((file) => file.path);
}

/** Shipped modules whose code, not comments, contains a quoted string literal. */
function modulesHoldingLiteral(literal: string): string[] {
  return sourceFiles('src')
    .filter((file) => codeOnly(file.text).includes(`'${literal}'`))
    .map((file) => file.path);
}

function readManifest(): ManifestShape {
  const raw = readFileSync(join(projectRoot, 'src', 'manifest.json'), 'utf8');
  return JSON.parse(raw) as ManifestShape;
}

describe('manifest contract', () => {
  it('is an MV3 manifest with popup, an options window and a content script', () => {
    const manifest = readManifest();
    expect(manifest.manifest_version).toBe(3);
    expect(typeof manifest.action?.default_popup).toBe('string');
    // Ruling `A118`: the settings surface is a Chrome **window**, not a tab. The shape is
    // pinned all three ways: the key that sizes it is `open_in_tab: false`, the page it
    // renders is the options build, and the key Chrome rejects beside `options_ui` —
    // `options_page` — is absent, so the pair can never come back.
    expect(manifest.options_ui?.page).toBe('options/index.html');
    expect(manifest.options_ui?.open_in_tab).toBe(false);
    expect(manifest.options_page).toBeUndefined();
    expect(manifest.content_scripts?.[0]?.js).toContain('content.js');
  });

  it('resolves the options window in the dist/ reference check, not an options tab (ruling A118)', () => {
    // The build script's reference check is the only mechanical proof that every file the
    // manifest points at really ships. Reading only `manifest.options_page` would make it
    // check nothing the moment the manifest moved to `options_ui`, so the check itself is
    // pinned: it reads the key the manifest really declares, and it still reads the popup,
    // the content script and the background worker.
    const script = codeOnly(
      readFileSync(join(projectRoot, 'scripts', 'build-extension.mjs'), 'utf8'),
    );
    expect(script).toMatch(/manifest\.options_ui\?\.page/);
    expect(script).not.toMatch(/manifest\.options_page/);
    expect(script).toMatch(/manifest\.action\?\.default_popup/);
    expect(script).toMatch(/entry\.js/);
    expect(script).toMatch(/entry\.css/);
    expect(script).toMatch(/manifest\.background\?\.service_worker/);
    expect(script).toMatch(/manifest\.icons/);
  });

  it('registers the content script for http and https only', () => {
    const manifest = readManifest();
    expect(manifest.content_scripts?.[0]?.matches).toEqual(['http://*/*', 'https://*/*']);

    // The scheme decision must live in the spec, in the same commit as the code.
    const spec = readFileSync(
      join(projectRoot, 'docs', 'specs', 'content-overlay-ui.md'),
      'utf8',
    );
    expect(spec).toContain('- Registered schemes:');
    expect(spec).toContain('`http://*/*`');
    expect(spec).toContain('`https://*/*`');
  });

  it('declares no host_permissions and no permission beyond storage and tabs (ruling A49)', () => {
    const manifest = readManifest();
    // The set is pinned exactly, so no later task can widen it silently: `tabs` is
    // here because ruling `A49` chose the active-tab read over a service-worker
    // mapping, and it is the only permission beyond `storage` this extension asks
    // for. The pair must also be stated in the spec, in the same commit as the code.
    expect(manifest.permissions ?? []).toEqual(['storage', 'tabs']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();

    const spec = readFileSync(
      join(projectRoot, 'docs', 'specs', 'content-overlay-ui.md'),
      'utf8',
    );
    expect(spec).toContain('- Permissions:');
    expect(spec).toContain('`storage` and `tabs`');
  });
});

describe('the dist/ reference check fails a manifest reference that does not ship (t9-01 AC3; t9-01 R2 + t9-02 R2, closed by t9-02b AC3)', () => {
  /**
   * The check is run **as behavior** here. The pin that stands next to the manifest
   * contract matches substrings of `scripts/build-extension.mjs`, so it proves the
   * script *names* the check, not that the check fails the build; the only evidence for
   * "a missing `dist/options/index.html` fails the build" was then an engineer's one-off
   * mutation quoted in a commit message.
   */
  const distDir = resolve(projectRoot, 'dist');

  /** The shipped manifest's shape, with its options reference replaced per case. */
  const manifestOf = (optionsPage: string): Record<string, unknown> => ({
    manifest_version: 3,
    content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'] }],
    action: { default_popup: 'popup/index.html' },
    options_ui: { page: optionsPage, open_in_tab: false },
  });

  it('fails the build when dist/options/index.html is absent', () => {
    const verify = loadBuildGuard('verifyManifestReferences', {
      distDir,
      existsSync: (path) => !path.endsWith(join(distDir, 'options', 'index.html')),
    });
    expect(() => verify(manifestOf('options/index.html'))).toThrow(
      /manifest reference "options\/index\.html" does not exist inside dist\//,
    );
  });

  it('refuses a reference that leaves dist/ before it asks the filesystem', () => {
    const verify = loadBuildGuard('verifyManifestReferences', { distDir, existsSync: () => true });
    expect(() => verify(manifestOf('/options/index.html'))).toThrow(/is not relative to dist\//);
    expect(() => verify(manifestOf('../outside/index.html'))).toThrow(/is not relative to dist\//);
  });

  it('accepts the manifest the shipped build really produced', () => {
    // `npm run build` runs before `npm test` (ruling `A62`), so `dist/manifest.json`
    // exists here: a reference check that trips on the real folder is a red gate, never
    // a skipped case.
    const verify = loadBuildGuard('verifyManifestReferences', { distDir, existsSync });
    const shipped: unknown = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
    expect(() => verify(shipped)).not.toThrow();
  });

  it('existence-checks every collected reference, verifies before reporting, and exits non-zero', () => {
    const script = codeOnly(buildScriptSource());
    expect(script).toMatch(/for \(const reference of references\)/);
    expect(script).toMatch(/if \(!existsSync\(join\(distDir, reference\)\)\)/);
    expect(script).toMatch(/manifest reference "\$\{reference\}" does not exist inside dist\//);

    // The order lives nowhere but in `main()`, and a check after the folder report would
    // print a healthy-looking `dist/` for a build that has to fail.
    const body = buildScriptMainBody();
    for (const call of [
      'verifyManifestReferences(manifest);',
      'verifyContentBundleHasNoAngular();',
      'verifyOptionsAssetShips();',
      'report();',
    ]) {
      expect(body.indexOf(call), call).toBeGreaterThanOrEqual(0);
    }
    expect(body.indexOf('verifyManifestReferences(manifest);')).toBeLessThan(
      body.indexOf('report();'),
    );
    expect(body.indexOf('verifyOptionsAssetShips();')).toBeLessThan(body.indexOf('report();'));

    // A verification failure is an exit code, not a log line.
    expect(script).toMatch(/main\(\)\.catch\(/);
    expect(script).toMatch(/process\.exitCode = 1/);
  });
});

describe('a failed build check becomes a non-zero exit, through the shipped code (t9-02b R1, closed by t10-01 D1)', () => {
  /**
   * The link the guard pin stopped short of (`t9-02b` review remark R1): the shipped
   * `fail` was never executed — the support module injected its own throwing stand-in —
   * and "a failed check becomes `process.exitCode = 1`, not a log line" was pinned by two
   * substrings. A `fail` that logged and returned, or a handler that swallowed the
   * rejection, left the whole suite green while the build shipped a broken `dist/` at
   * exit 0.
   *
   * Below, both halves are **run**: the shipped `fail`, and the shipped
   * `main().catch(...)` statement with only `main`, `console` and `process` replaced.
   */
  const distDir = resolve(projectRoot, 'dist');

  const manifestOf = (optionsPage: string): Record<string, unknown> => ({
    manifest_version: 3,
    content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'] }],
    action: { default_popup: 'popup/index.html' },
    options_ui: { page: optionsPage, open_in_tab: false },
  });

  it('throws the shipped failure, so a check that only logs is a failing test', () => {
    const fail = loadBuildFail();
    expect(() => fail('the check failed')).toThrow(/^build-extension: the check failed$/);
  });

  it('answers an absent reference with the shipped failure, not with an injected one', () => {
    const verify = loadBuildGuard('verifyManifestReferences', {
      distDir,
      existsSync: (path) => !path.endsWith(join(distDir, 'options', 'index.html')),
    });
    expect(() => verify(manifestOf('options/index.html'))).toThrow(
      /^build-extension: manifest reference "options\/index\.html" does not exist inside dist\/$/,
    );
  });

  it('turns a thrown check failure into exit code 1 in the shipped handler', async () => {
    const run = await runBuildScriptEntry(() => {
      loadBuildFail()('dist/options/index.html is missing');
    });
    expect(run.logged).toEqual(['build-extension: dist/options/index.html is missing']);
    expect(run.exitCode).toBe(1);
  });

  it('carries a real reference check all the way to the exit code', async () => {
    const verify = loadBuildGuard('verifyManifestReferences', {
      distDir,
      existsSync: (path) => !path.endsWith(join(distDir, 'options', 'index.html')),
    });
    const run = await runBuildScriptEntry(() => {
      verify(manifestOf('options/index.html'));
    });
    expect(run.exitCode).toBe(1);
    expect(run.logged).toHaveLength(1);
    expect(run.logged[0]).toContain(
      'manifest reference "options/index.html" does not exist inside dist/',
    );
  });

  it('leaves no exit code for a build whose checks pass, and lets main() swallow nothing', async () => {
    // The exit code is a consequence of a failure, not an unconditional assignment: a
    // `main()` that finished sets nothing.
    const clean = await runBuildScriptEntry(() => undefined);
    expect(clean.exitCode).toBeUndefined();
    expect(clean.logged).toEqual([]);

    // And the chain above only means something if a throw inside the real `main()` reaches
    // the shipped handler, so `main()` owns no error handling of its own. With comments
    // already stripped from the body, naming a `catch` in prose does not clear this.
    const body = buildScriptMainBody();
    expect(body).not.toMatch(/\btry\b/);
    expect(body).not.toMatch(/\bcatch\b/);
    expect(body).not.toMatch(/\bfinally\b/);
    expect(body).not.toMatch(/allSettled/);

    // The handler is attached to the shipped `main`, and there is exactly **one** live
    // handler for the extraction to attach it to.
    //
    // This pin used to match the extractor's own return value against the statement shape
    // the extractor requires before it returns anything: it was tautological, and no change
    // to the shipped script could make it fail (`t10-01` review answer 7, closed by
    // `t10-01b` AC8 item 3). What can fail is the number of live handlers the extraction has
    // to choose between, and what the handler it chose really does.
    const liveHandlers = codeOnly(buildScriptSource()).match(/^[ \t]*main\(\)\.catch\(/gm) ?? [];
    expect(liveHandlers, 'the shipped script ships exactly one live entry handler').toHaveLength(
      1,
    );
    expect(buildScriptEntryStatement()).toContain('process.exitCode = 1;');
  });
});

describe('the extraction runs live code, never a comment copy (t10-01 review blocking finding 2, closed by t10-01b AC8 item 2)', () => {
  /**
   * The one silent failure mode the D1 chain kept (`t10-01` review blocking finding 2): the
   * extractors searched the script **as shipped** and took the leftmost match, so a
   * block-commented copy of `fail` — or of the `main().catch(...)` statement, or of
   * `main()` itself — placed above the live one was the text the pins executed. A build that
   * logged its failures and exited 0 kept every pin green, because the pins were running a
   * comment.
   *
   * Below, each decoy is built out of the **shipped script text** with one declaration
   * replaced, so the fixture is the real script plus a lie in a comment. Each case then
   * states the red signal: the assertion the shipped pin makes stops holding, which is what
   * a shipped decoy does to that pin now.
   */
  const distDir = resolve(projectRoot, 'dist');
  const shippedScript = buildScriptSource();

  const manifestOf = (optionsPage: string): Record<string, unknown> => ({
    manifest_version: 3,
    content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'] }],
    action: { default_popup: 'popup/index.html' },
    options_ui: { page: optionsPage, open_in_tab: false },
  });

  /** The shipped script with a commented throwing `fail` above a live log-and-continue one. */
  const logAndContinueScript = shippedScript.replace(
    buildScriptFunctionSourceFrom(shippedScript, 'fail'),
    () =>
      [
        '/*',
        'function fail(message) {',
        "  throw new Error('build-extension: ' + message);",
        '}',
        '*/',
        'function fail(message) {',
        '  console.error(message);',
        '}',
      ].join('\n'),
  );

  /** The shipped script with a commented exit-setting handler above a live swallowing one. */
  const swallowingEntryScript = shippedScript.replace(
    buildScriptEntryStatementFrom(shippedScript),
    () =>
      [
        '/*',
        'main().catch((error) => {',
        '  console.error(error instanceof Error ? error.message : String(error));',
        '  process.exitCode = 1;',
        '});',
        '*/',
        'main().catch(() => {',
        '  void 0;',
        '});',
      ].join('\n'),
  );

  /**
   * The shipped script with a **well-ordered** commented `main()` above a live `main()` that
   * reports the folder before it verifies it. The live half is what the build really runs,
   * and it is the half the order pins have to read.
   */
  const swappedOrderScript = shippedScript
    .replace('  verifyOptionsAssetShips();\n  report();', () =>
      '  report();\n  verifyOptionsAssetShips();',
    )
    .replace('async function main() {', () =>
      [
        '/*',
        'async function main() {',
        '  verifyOptionsAssetShips();',
        '  report();',
        '}',
        '*/',
        'async function main() {',
      ].join('\n'),
    );

  /**
   * Every commented copy here sits at a **line start** inside its comment, so line anchoring
   * alone would not have been enough: it is the comment-stripped search that makes the live
   * declaration the leftmost one. Each case therefore starts by showing where the old,
   * unstripped, leftmost pattern landed.
   */

  it('takes the live `fail` when a throwing copy sits in a comment above it', () => {
    // The decoy really does bite: the pattern this module used before — unstripped text,
    // leftmost match — lands on the comment copy, so the pins executed a `fail` that threw
    // while the script shipped one that only logged.
    const leftmostBefore = /function fail\([^)]*\) \{[\s\S]*?\n\}/.exec(logAndContinueScript);
    expect(leftmostBefore?.[0]).toContain('throw new Error(');

    const lifted = buildScriptFunctionSourceFrom(logAndContinueScript, 'fail');
    expect(lifted).not.toContain('throw');
    expect(lifted).toContain('console.error(message);');
  });

  it('makes the guard pin red for a `fail` that only logs, instead of running a comment', async () => {
    const verify = loadBuildGuardFromScript(
      'verifyManifestReferences',
      { distDir, existsSync: () => false },
      logAndContinueScript,
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      // The shipped pin is `expect(() => verify(manifest)).toThrow(...)`. Against this script
      // the guard answers an absent reference with **nothing**, so that pin fails — which is
      // the outcome the decoy used to hide.
      expect(() => verify(manifestOf('options/index.html'))).not.toThrow();

      // And the chain does not reach an exit code either: the shipped handler is the shipped
      // one, but nothing throws into it any more. The build logs its failures and walks away
      // with a broken `dist/` at exit 0 — the symptom `t9-02b` review remark R1 named.
      const run = await runBuildScriptEntryFromScript(logAndContinueScript, () => {
        verify(manifestOf('options/index.html'));
      });
      expect(run.exitCode).toBeUndefined();
      expect(errors.mock.calls.length, 'the decoy script logs the failure').toBeGreaterThan(0);
    } finally {
      errors.mockRestore();
    }
  });

  it('takes the live entry statement when a commented handler sits above it', async () => {
    // Same bite on the entry half: the commented handler is the leftmost match, and a live
    // handler that swallows the rejection sits below it.
    const leftmostBefore = /\nmain\(\)\.catch\([\s\S]*?\n\}\);/.exec(swallowingEntryScript);
    expect(leftmostBefore?.[0]).toContain('process.exitCode = 1;');

    const lifted = buildScriptEntryStatementFrom(swallowingEntryScript);
    expect(lifted).toContain('main().catch(() => {');
    expect(lifted).not.toContain('process.exitCode');

    // The shipped pins are `expect(run.exitCode).toBe(1)` and `expect(run.logged).toEqual(
    // [...])`. Against this script a thrown failure leaves no exit code and no log line, so
    // both fail — the loud end a live handler that swallows deserves.
    const run = await runBuildScriptEntryFromScript(swallowingEntryScript, () => {
      throw new Error('build-extension: dist/manifest.json is missing');
    });
    expect(run.exitCode).toBeUndefined();
    expect(run.logged).toEqual([]);
  });

  it('takes the live main() when a well-ordered copy sits in a comment above it', () => {
    // The commented copy verifies before it reports; the live one reports first. The order
    // pins read the live one now, so they go red on a script that really reports a broken
    // `dist/` before it verifies it — where the unstripped `indexOf` used to land on the
    // copy in the comment and stay green.
    const leftmostBefore = /async function main\(\) \{[\s\S]*?\n\}/.exec(swappedOrderScript);
    expect(leftmostBefore?.[0]).toContain('verifyOptionsAssetShips();\n  report();');

    const body = buildScriptMainBodyFrom(swappedOrderScript);
    expect(body).toContain('report();');
    expect(body.indexOf('report();')).toBeLessThan(body.indexOf('verifyOptionsAssetShips();'));
  });

  it('refuses to run a function that exists only inside a comment', () => {
    // The alternative to a red pin is a throw: an extraction that finds nothing cannot
    // quietly execute prose.
    expect(() =>
      buildScriptFunctionSourceFrom(
        '/* function fail(message) {\n  throw new Error(message);\n} */',
        'fail',
      ),
    ).toThrow(/declares no top-level function fail outside a comment/);
    expect(() =>
      buildScriptEntryStatementFrom('/* main().catch(() => {\n  process.exitCode = 1;\n}); */'),
    ).toThrow(/has no `main\(\)\.catch\(\.\.\.\)` statement outside a comment/);
    expect(() =>
      buildScriptMainBodyFrom('/* async function main() {\n  report();\n} */'),
    ).toThrow(/has no `async function main\(\)` outside a comment/);
  });

  it('takes the live main() body when a string literal spells the header above it', () => {
    /**
     * The last unanchored search in the support module was this one (`t10-02` AC5, closing
     * debt row `S10-6`): `codeOnly` had already made a commented copy unable to win, but
     * `code.indexOf('async function main() {')` still landed on **any** occurrence — inside a
     * string literal, after an assignment, anywhere mid-line — and the "body" it returned
     * started in the middle of that line and ran to the next `\n}`.
     */
    const stringLiteralMainScript = shippedScript.replace(
      "const distDir = join(projectRoot, 'dist');",
      () =>
        "const mainProse = 'async function main() {';\nconst distDir = join(projectRoot, 'dist');",
    );
    expect(stringLiteralMainScript, 'the fixture really edits the shipped script').not.toBe(
      shippedScript,
    );

    // The old search really does bite: what sits before the match on its own line is an
    // assignment, not indentation, so the leftmost occurrence is not a declaration.
    const code = codeOnly(stringLiteralMainScript);
    const unanchored = code.indexOf('async function main() {');
    const lineStart = code.lastIndexOf('\n', unanchored) + 1;
    expect(code.slice(lineStart, unanchored), 'the old search landed mid-line').toBe(
      "const mainProse = '",
    );

    // The line-anchored extraction reads the declaration instead, and the verification order
    // the pins depend on survives: under the old search the body started in that string and
    // named neither check, so both order assertions inverted.
    const body = buildScriptMainBodyFrom(stringLiteralMainScript);
    expect(body.startsWith('async function main() {')).toBe(true);
    expect(body).not.toContain('const mainProse =');
    expect(body.indexOf('verifyOptionsAssetShips();'), 'verify before report').toBeGreaterThanOrEqual(
      0,
    );
    expect(body.indexOf('verifyOptionsAssetShips();')).toBeLessThan(body.indexOf('report();'));
  });

  /**
   * One **live** declaration per extracted name (`t10-02` AC4, closing debt row `S10-5`).
   * Line anchoring and comment stripping make the leftmost match the first *live*
   * declaration, but the extraction still takes the leftmost one: two live
   * `function fail (…)` declarations make the real build call the **later** one, because
   * function declarations are hoisted, while the pins run the **first**. `t10-01b` AC8 item 3
   * pinned the entry half of that (exactly one live `main().catch(...)`); nothing pinned the
   * declaration half until here.
   */
  /**
   * Every guard name the harness **could** lift out of the shipped script by name
   * (`t10-02` AC4, closing debt row `S10-5`; relabelled by `t10-02` AC9e, closing row
   * `S10-16`). Line anchoring and comment stripping make the leftmost match the first *live*
   * declaration, but the extraction still takes the leftmost one: two live
   * `function fail (…)` declarations make the real build call the **later** one, because
   * function declarations are hoisted, while the pins run the **first**. `t10-01b` AC8 item 3
   * pinned the entry half of that (exactly one live `main().catch(...)`); nothing pinned the
   * declaration half until here.
   *
   * The label used to be “extracted”, and one name did not earn it:
   * `verifyContentBundleHasNoAngular` is declared by the shipped script and counted below, but
   * no case lifts it through `loadBuildGuard*`, because its body calls `readFileSync` and the
   * guard factory injects no filesystem reader — widening that stub surface is a decision this
   * task does not take. So the list says **could**, and the case below runs that claim instead
   * of leaving it as a comment: every name here is reached by one of the two extractors over
   * the shipped script, and a name the script does not declare is refused. A list that can be
   * run cannot rot into prose.
   */
  const BUILD_SCRIPT_LIFTABLE_NAMES = [
    'fail',
    'main',
    'verifyManifestReferences',
    'verifyOptionsAssetShips',
    'verifyContentBundleHasNoAngular',
  ];

  /** Every top-level `function` declaration of a stripped script text, in shipped order. */
  function liveFunctionNames(code: string): string[] {
    return [
      ...code.matchAll(/^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/gm),
    ].map((match) => match[1] as string);
  }

  /** How many **live** declarations of one name a stripped script text carries. */
  function liveDeclarationsOf(code: string, name: string): string[] {
    return (
      code.match(new RegExp(`^[ \\t]*(?:async[ \\t]+)?function[ \\t]+${name}[ \\t]*\\(`, 'gm')) ??
      []
    );
  }

  it('declares one live fail, one live main and one live copy of every liftable guard', () => {
    const code = codeOnly(buildScriptSource());

    for (const name of BUILD_SCRIPT_LIFTABLE_NAMES) {
      expect(liveDeclarationsOf(code, name), `${name} has more than one live declaration`).toHaveLength(
        1,
      );
    }

    // The whole top-level set is named, so neither a new declaration the extraction could
    // land on nor a rename escapes into an uncounted name. The pattern accepts indentation,
    // so a **nested** duplicate of `fail` or `main` is counted here as well.
    expect(liveFunctionNames(code).sort()).toEqual(
      [
        'buildContentBundle',
        'cleanDist',
        'copyManifest',
        'fail',
        'listDistFiles',
        'logStep',
        'main',
        'readDistManifest',
        'report',
        'runAngularBuild',
        'verifyContentBundleHasNoAngular',
        'verifyManifestReferences',
        'verifyOptionsAssetShips',
      ].sort(),
    );
  });

  /** Which harness extractor reaches one name in the shipped script. `main` needs the body
   *  extractor, because its declaration is `async function main()`; every guard is reached by
   *  the plain function extractor. */
  function liftByName(source: string, name: string): string {
    return name === 'main'
      ? buildScriptMainBodyFrom(source)
      : buildScriptFunctionSourceFrom(source, name);
  }

  it('lifts every name on the could-lift list by name, and refuses a name the script lacks', () => {
    // The list above is labelled **could lift**, so the label is run rather than asserted
    // (`t10-02` AC9e, closing debt row `S10-16`): every name it carries is reachable in the
    // shipped script by one of the two extractors, and a name the script does not declare is
    // refused. That is what keeps a relabelled list honest: it cannot drift into naming a
    // renamed guard, a fixture-only helper, or prose.
    for (const name of BUILD_SCRIPT_LIFTABLE_NAMES) {
      expect(liftByName(shippedScript, name), name).toContain(`function ${name}(`);
    }
    expect(() => buildScriptFunctionSourceFrom(shippedScript, 'verifyNoSuchCheck')).toThrow(
      /declares no top-level function verifyNoSuchCheck outside a comment/,
    );
  });

  it('drives the shipped pins through the same extraction the decoy cases drive', () => {
    // Without this, the decoy cases above could exercise a helper the shipped pins never
    // call. The two comparisons this case used to open with — `buildScriptEntryStatement()`
    // against `buildScriptEntryStatementFrom(shippedScript)`, and the same pair for
    // `buildScriptMainBody` — are **gone** (`t10-02` AC1, closing debt row `S10-1`): each
    // compared a wrapper with the exact call the wrapper is *defined as*, on the same
    // argument, so no edit to the shipped script or to the support module could turn either
    // red — the tautology class `t10-01b` AC8 item 3 had already removed once. What
    // delegation means is pinned where it is written, by the case below; what the extraction
    // **does** is pinned by the assertions that stay here.
    expect(buildScriptFunctionSourceFrom(shippedScript, 'verifyOptionsAssetShips')).toMatch(
      /^function verifyOptionsAssetShips\(\) \{/,
    );

    const shipped = loadBuildFail();
    const fromScript = loadBuildFailFromScript(shippedScript);
    expect(() => shipped('the same message')).toThrow(/^build-extension: the same message$/);
    expect(() => fromScript('the same message')).toThrow(/^build-extension: the same message$/);

    const viaShipped = loadBuildGuard('verifyManifestReferences', {
      distDir,
      existsSync: (path) => !path.endsWith(join(distDir, 'options', 'index.html')),
    });
    const viaScript = loadBuildGuardFromScript(
      'verifyManifestReferences',
      { distDir, existsSync: (path) => !path.endsWith(join(distDir, 'options', 'index.html')) },
      shippedScript,
    );
    for (const [label, verify] of [
      ['loadBuildGuard', viaShipped],
      ['loadBuildGuardFromScript', viaScript],
    ] as const) {
      expect(
        () => verify(manifestOf('options/index.html')),
        label,
      ).toThrow(/^build-extension: manifest reference "options\/index\.html" does not exist inside dist\/$/);
    }
  });

  /**
   * The delegation itself, pinned **where it is written** (`t10-02` AC1, closing debt row
   * `S10-1`). The case above cannot carry that claim: comparing a shipped-source wrapper with
   * the script-text extractor it delegates to compares a function with its own definition, so
   * neither the shipped script nor the support module could ever turn it red. Instead the
   * support module is read as text — comments stripped, pattern line-anchored, the same two
   * rules the module applies to the build script — and every shipped-source entry point is
   * pinned to be **one delegate call and nothing else**.
   *
   * The mutation this exists for, and the one named in the report: give a wrapper its own copy
   * of the extraction. In `tests/support/build-script-guards.ts`, replace the body of
   * `buildScriptEntryStatement()` with
   * `return /^[ \t]*main\(\)\.catch\([\s\S]*?\n\}\);/m.exec(buildScriptSource())![0];`.
   * The returned text is the same text, so every other pin in both suites stays green, and
   * this case goes red — the wrapper stopped going through the one comment-stripped extractor
   * the decoy cases drive, which is the finding 2 defect class arriving in the wrapper.
   */
  const SUPPORT_MODULE = 'tests/support/build-script-guards.ts';

  /**
   * The support module as text, in the one line-ending shape every line-anchored scan here
   * assumes (`t10-02` AC9d, closing debt row `S10-15`). The read used to hand `codeOnly` a file
   * with whatever endings the checkout happened to produce, while the module's own
   * `buildScriptSource()` normalizes the script it scans: one harness scanned in two shapes,
   * and a pattern written against `\n}` resolves differently against `\r\n}`. Both reads answer
   * through the module's exported `normalizeLineEndings`, so the shape pin below points at one
   * function rather than at two private `replaceAll`s — the same reason the repository keeps
   * exactly one `codeOnly` (`t10-01` D3, debt row `S10-10`).
   */
  function supportModuleSource(): string {
    return normalizeLineEndings(readFileSync(join(projectRoot, SUPPORT_MODULE), 'utf8'));
  }

  /**
   * A wrapper body that reads, strips, anchors or evaluates the script **itself** instead of
   * delegating. Named once, so the wrapper pin and the smuggled-wrapper decoy below cannot
   * disagree about what the red is (`t10-02` AC1, widened by AC9c; rows `S10-1`, `S10-13`).
   */
  const PRIVATE_EXTRACTION_SHAPES =
    /readFileSync|require|codeOnly|new RegExp|new Function|\.exec\(|\.indexOf\(|\.search\(/;

  /**
   * `[shipped-source wrapper, script-text extractor, the whole body the wrapper is allowed
   * to be]` — whitespace collapsed, so re-indenting a delegate is not a red, while giving it
   * a second statement, a second source or a private copy of the pattern is.
   */
  const SHIPPED_ENTRY_DELEGATES: [string, string, string][] = [
    [
      'buildScriptMainBody',
      'buildScriptMainBodyFrom',
      'return buildScriptMainBodyFrom(buildScriptSource());',
    ],
    [
      'buildScriptEntryStatement',
      'buildScriptEntryStatementFrom',
      'return buildScriptEntryStatementFrom(buildScriptSource());',
    ],
    [
      'loadBuildFail',
      'loadBuildFailFromScript',
      'return loadBuildFailFromScript(buildScriptSource()) as (message: string) => never;',
    ],
    [
      'loadBuildGuard',
      'loadBuildGuardFromScript',
      'return loadBuildGuardFromScript(name, stubs, buildScriptSource());',
    ],
    [
      'runBuildScriptEntry',
      'runBuildScriptEntryFromScript',
      'return runBuildScriptEntryFromScript(buildScriptSource(), failingMain);',
    ],
  ];

  /** One top-level `export function` body of a module text, comments removed, line-anchored. */
  function moduleFunctionBody(moduleText: string, name: string): string {
    const match = new RegExp(
      `^[ \\t]*export (?:async[ \\t]+)?function ${name}\\b[^\\n{]*\\{([\\s\\S]*?)\\n\\}`,
      'm',
    ).exec(moduleText);
    if (match === null) {
      throw new Error(`the support module declares no top-level ${name} outside a comment`);
    }
    return (match[1] as string).trim().replaceAll(/\s+/g, ' ');
  }

  /** Every `export function` name the support module declares, in shipped order: the sibling
   *  of `liveFunctionNames` above, applied to the module the harness itself ships
   *  (`t10-02` AC9c, closing debt row `S10-13`). */
  function liveExportedFunctionNames(moduleText: string): string[] {
    return [
      ...moduleText.matchAll(/^[ \t]*export (?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)/gm),
    ].map((match) => match[1] as string);
  }

  /** The complete exported-function set of the support module, sorted: every one is named. */
  const SUPPORT_MODULE_EXPORTED_NAMES = [
    'buildScriptEntryStatement',
    'buildScriptEntryStatementFrom',
    'buildScriptFunctionSourceFrom',
    'buildScriptMainBody',
    'buildScriptMainBodyFrom',
    'buildScriptSource',
    'codeOnly',
    'loadBuildFail',
    'loadBuildFailFromScript',
    'loadBuildGuard',
    'loadBuildGuardFromScript',
    'normalizeLineEndings',
    'runBuildScriptEntry',
    'runBuildScriptEntryFromScript',
  ].sort();

  it('names every exported function of the support module, so an unread wrapper is red', () => {
    // `SHIPPED_ENTRY_DELEGATES` is hand-maintained, and that was the hole (`t10-02` AC9c,
    // closing debt row `S10-13`): a sixth exported wrapper in this module that re-implemented the
    // extraction, pointed at by a shipped pin, was text no case read. What is pinned here is the
    // module's **exported-function set**: no name can leave the module without appearing on the
    // list beside this case, so an exported helper cannot sit in the harness unread — the first
    // red it produces is the set assertion below, and naming it there is a reviewable line in
    // this file rather than a new unread one. The shipped build script already carried the
    // symmetric answer (the whole-name-set case above); the module did not.
    const exported = liveExportedFunctionNames(codeOnly(supportModuleSource()));
    expect(exported.sort()).toEqual(SUPPORT_MODULE_EXPORTED_NAMES);
    for (const [wrapper] of SHIPPED_ENTRY_DELEGATES) {
      expect(exported, wrapper).toContain(wrapper);
    }

    // The decoy is the wrapper the review named, appended to the module's own text: the set pin
    // names it the day it ships, the set it produces is no longer the pinned one, and its body
    // is exactly what the wrapper case below fails on — a body that matches
    // `PRIVATE_EXTRACTION_SHAPES` is a wrapper that stopped delegating.
    const smuggled = [
      codeOnly(supportModuleSource()),
      'export function buildScriptEntryStatementCopy(source: string): string {',
      '  const pattern = /^main\\(\\)\\.catch\\([\\s\\S]*?\\n\\}\\);$/m;',
      '  return pattern.exec(source)![0];',
      '}',
    ].join('\n');
    expect(liveExportedFunctionNames(smuggled)).toContain('buildScriptEntryStatementCopy');
    expect(liveExportedFunctionNames(smuggled).sort()).not.toEqual(SUPPORT_MODULE_EXPORTED_NAMES);
    expect(moduleFunctionBody(smuggled, 'buildScriptEntryStatementCopy')).toMatch(
      PRIVATE_EXTRACTION_SHAPES,
    );
  });

  it('scans the support module and the build script in one line-ending shape', () => {
    // The claim is that no scan in this harness reads a mixed file (`t10-02` AC9d, closing debt
    // row `S10-15`), and it is pinned on the text the pins consume rather than on the reader:
    // the script read, the module read and an extracted wrapper body — the text the delegation
    // pin compares statement by statement — each carry no carriage return. Take the
    // the normalization away from either reader on a CRLF checkout and this case is red: the
    // script read, the module read and every body sliced out of them answer with a carriage
    // return, because a body keeps each interior line ending it took.
    expect(normalizeLineEndings('a\r\nb\r\nc')).toBe('a\nb\nc');
    expect(buildScriptSource()).not.toContain('\r');
    const moduleText = codeOnly(supportModuleSource());
    expect(moduleText).not.toContain('\r');
    for (const [wrapper] of SHIPPED_ENTRY_DELEGATES) {
      expect(moduleFunctionBody(moduleText, wrapper), wrapper).not.toContain('\r');
    }
    // One normalizer rather than two private `replaceAll`s: the script read delegates to the
    // exported function the module read uses, so the two cannot drift apart.
    expect(moduleFunctionBody(moduleText, 'buildScriptSource')).toContain('normalizeLineEndings(');
  });

  it('keeps every shipped-source entry point one delegate call to the script-text extractor', () => {
    const moduleText = codeOnly(supportModuleSource());

    for (const [wrapper, delegate, body] of SHIPPED_ENTRY_DELEGATES) {
      const actual = moduleFunctionBody(moduleText, wrapper);

      // One statement, and it is the call the decoy cases already exercise.
      expect(actual, wrapper).toBe(body);
      expect(actual, `${wrapper} delegates to ${delegate}`).toContain(`${delegate}(`);

      // The wrapper's only source is `buildScriptSource()`: it reads, strips, anchors or
      // evaluates nothing of its own, so the shipped pins and the fixtures go through one
      // extraction rather than two that can drift apart.
      expect(
        actual,
        `${wrapper} re-implements the extraction instead of delegating`,
      ).not.toMatch(PRIVATE_EXTRACTION_SHAPES);
    }
  });
});

describe('the contract scans read every shipped text file through one comment-stripping helper (t10-01 D3, D4)', () => {
  /** The only file under `src/` no scan can read as text, named so a second one is a decision. */
  const UNREADABLE_SHIPPED_FILES = ['src/options/assets/cat-mascot.png'];

  it('reads every file under src/ as text, or names the one it cannot read', () => {
    // A file type outside the scanned set is the quiet way a negative scan stops seeing
    // shipped code: the scan reports `[]` and looks green. Naming the one binary asset is
    // what keeps that from happening to a future `src/` module.
    const unread = allFilesUnder('src').filter(
      (path) => !SHIPPED_TEXT_EXTENSIONS.test(path),
    );
    expect(unread).toEqual(UNREADABLE_SHIPPED_FILES);
  });

  it('strips block, line and HTML comments, and keeps the code between them', () => {
    const stripped = codeOnly(
      ['callOne(); /* block prose */', 'callTwo(); // line prose', '<!-- html prose -->callThree();'].join(
        '\n',
      ),
    );
    for (const prose of ['block prose', 'line prose', 'html prose']) {
      expect(stripped, prose).not.toContain(prose);
    }
    for (const call of ['callOne();', 'callTwo();', 'callThree();']) {
      expect(stripped, call).toContain(call);
    }
  });

  /**
   * The suites that still keep a private copy of the comment-stripping helper. The
   * `t9-02b` review counted three (the support module plus the two contract suites, which
   * `t10-01` D3 consolidates); measuring the repository from the inside counts these eight
   * more. They are named here so the debt is a measured list rather than a guess, and so a
   * ninth copy is a failing test instead of another quiet variant.
   */
  const LEGACY_CODE_ONLY_COPIES = [
    'tests/content-anchor-boundaries.spec.ts',
    'tests/content-create-card-boundaries.spec.ts',
    'tests/content-overlay-host.spec.ts',
    'tests/content-spa-refresh.spec.ts',
    'tests/core-storage-keys.spec.ts',
    'tests/core-storage-port.spec.ts',
    'tests/entry-rules.spec.ts',
    'tests/page-key.spec.ts',
  ].sort();

  it('imports the shared helper in the two contract suites instead of keeping a copy', () => {
    for (const path of ['tests/toolchain-contract.spec.ts', 'tests/options-window-look.spec.ts']) {
      const text = codeOnly(readFileSync(join(projectRoot, path), 'utf8'));
      expect(
        /\b(?:function|const)\s+codeOnly\b/.test(text),
        `${path} declares a private copy of the comment-stripping helper`,
      ).toBe(false);
      expect(
        text,
        `${path} does not import the one helper from tests/support`,
      ).toMatch(/\bcodeOnly\b[^;]*from\s*'\.\/support\/build-script-guards'/);
    }
  });

  it('names the remaining private copies, so the set cannot grow', () => {
    const declarers = allFilesUnder('tests')
      .filter((path) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i.test(path))
      .filter((path) =>
        /\b(?:function|const)\s+codeOnly\b/.test(
          codeOnly(readFileSync(join(projectRoot, path), 'utf8')),
        ),
      )
      .sort();
    expect(declarers).toEqual([LEGACY_CODE_ONLY_COPIES, 'tests/support/build-script-guards.ts'].flat());
  });
});

describe('the settings window stays Chrome-owned, and the manifest names no unused reference (t9-01 AC1, AC2; t9-02b AC4)', () => {
  /**
   * The two negatives the `t9-01` review answered "true in the tree, unpinned" (remark
   * R3). `t9-02b` AC4 chooses the pin over the narrowing, and pins the vacuous half of
   * the same remark as the **absence** it is, so the narrowed spec sentence cannot rot.
   *
   * `t10-01` D4 widens what "the shipped source" means to those two negatives: the scan
   * now reads every shipped text file type, and the shapes below catch the same call
   * written without a dotted name.
   */
  it('ships no code that resizes or closes the settings window', () => {
    const offenders = sourceFiles('src')
      .filter((file) => {
        const code = codeOnly(file.text);
        return /\bwindow\s*\.\s*close\s*\(/.test(code) || /\bresizeTo\s*\(/.test(code);
      })
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  /**
   * The name-shaped negatives above are only as wide as their spelling (`t9-02b` review
   * remark R4): `window\s*\.\s*close\s*\(` does not see the same call reached through a
   * computed member, a string name, or a saved reference. These are the shapes that call
   * comes back in, and each one is a failing test here.
   */
  const INDIRECT_WINDOW_CALL_SHAPES: [string, RegExp][] = [
    ['a computed access on a window-like object', /\b(?:window|globalThis|self|top|parent|frames|defaultView)\s*\[/],
    ['a bracket access that names the method as a string', /\[\s*['"`](?:close|resizeTo|resizeBy|moveTo|moveBy|open|openOptionsPage)['"`]\s*\]/],
    ['a call through a computed member', /\]\s*\(/],
    ['an alias of the method, taken without calling it', /=\s*[\w$.]*\b(?:close|resizeTo|resizeBy|moveTo|moveBy)\s*;/],
  ];

  it('reaches the window or the options page through no computed member, bracket name or alias', () => {
    for (const file of sourceFiles('src')) {
      const code = codeOnly(file.text);
      for (const [shape, pattern] of INDIRECT_WINDOW_CALL_SHAPES) {
        expect(pattern.test(code), `${file.path}: ${shape}`).toBe(false);
      }
    }
  });

  it('names the settings surface in no content-layer module, and in exactly one shipped control', () => {
    const pageOffenders = sourceFiles('src/content')
      .filter((file) =>
        /\bopenOptionsPage\b|\boptions_ui\b|\boptions_page\b/.test(codeOnly(file.text)),
      )
      .map((file) => file.path);
    expect(pageOffenders).toEqual([]);

    // Ruling `A122`: the popup's name-required notice keeps the one call site, and it is
    // the only one anywhere in the shipped source.
    const callers = sourceFiles('src')
      .filter((file) => /\bopenOptionsPage\b/.test(codeOnly(file.text)))
      .map((file) => file.path);
    expect(callers).toEqual(['src/popup/popup.component.ts']);
  });

  it('declares no icons, no action.default_icon and no content-script css', () => {
    // The reference check resolves all three and this manifest uses none of them; the
    // spec says so in those words, and this absence is what keeps that sentence honest
    // instead of vacuously true.
    const manifest = readManifest();
    expect(manifest.icons).toBeUndefined();
    expect(manifest.action?.default_icon).toBeUndefined();
    expect(manifest.content_scripts?.[0]?.css).toBeUndefined();
  });
});

describe('layer boundaries', () => {
  it('content layer imports no Angular', () => {
    const offenders = sourceFiles('src/content')
      .filter((file) => codeOnly(file.text).includes('@angular/'))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('popup and options boot real Angular standalone applications', () => {
    for (const entry of ['src/popup/main.ts', 'src/options/main.ts']) {
      const text = readFileSync(join(projectRoot, entry), 'utf8');
      expect(text).toContain('bootstrapApplication');
    }
    const components = sourceFiles('src/popup')
      .concat(sourceFiles('src/options'))
      .filter((file) => file.text.includes('ChangeDetectionStrategy'));
    expect(components.length).toBeGreaterThan(1);
  });

  it('core layer is framework-free and DOM-free', () => {
    for (const file of sourceFiles('src/core')) {
      const code = codeOnly(file.text);
      expect(code).not.toContain('chrome.');
      expect(code).not.toContain('document.');
      expect(code).not.toContain('window.');
      expect(code).not.toContain('@angular/');
      expect(code).not.toContain('preact');
    }
  });

  it('reaches chrome.storage through exactly one shipped adapter (review remark R3)', () => {
    // The spec pins the seam: `src/core/` owns the contract and only one content
    // adapter may touch `chrome.storage`, so popup and options must go through the
    // core API instead of ad hoc storage keys.
    const users = sourceFiles('src')
      .filter((file) => codeOnly(file.text).includes('chrome.storage'))
      .map((file) => file.path);
    expect(users).toEqual(['src/content/store/chrome-storage-port.ts']);
  });

  it('reads and writes the settings key in exactly one shipped module (t3-01 review remark 2)', () => {
    // `inline-comment-model.md` -> "Storage layout" says exactly one core module
    // reads and writes `settings:v1`. The `chrome.storage` half of that claim is
    // pinned by the test above; this is the key half: one importer of
    // `SETTINGS_KEY`, one holder of the literal key itself.
    expect(importersOf('SETTINGS_KEY')).toEqual(['src/core/settings-store.ts']);
    expect(modulesHoldingLiteral('settings:v1')).toEqual(['src/core/storage-keys.ts']);
  });

  it('imports no internal settings helper anywhere (ruling A57)', () => {
    // `settingsValueOf` and `settingsFromStorageValue` build and decode the stored
    // record for `saveSettings` and `loadSettings` only. A UI half that composed
    // them by hand would be a second reader of `settings:v1`, which is the same
    // reason `assertCreatable` is not imported outside `create-entry.ts` under
    // ruling `A52`. The rule needs a grep test, not a comment.
    for (const internal of ['settingsValueOf', 'settingsFromStorageValue']) {
      expect(importersOf(internal)).toEqual([]);
    }
  });

  describe('the options page is the only writer of the settings record (t4-02 AC5)', () => {
    const optionsFiles = (): SourceFile[] => sourceFiles('src/options');
    const optionsCode = (): string => optionsFiles().map((file) => codeOnly(file.text)).join('\n');

    it('names no storage key and calls no storage API of its own', () => {
      const directStorage = optionsFiles()
        .filter((file) => codeOnly(file.text).includes('chrome.storage'))
        .map((file) => file.path);
      expect(directStorage).toEqual([]);

      const keyImporters = optionsFiles()
        .filter((file) => importClauses(file.text).some((clause) => /\bSETTINGS_KEY\b/.test(clause)))
        .map((file) => file.path);
      expect(keyImporters).toEqual([]);

      const keyLiterals = modulesHoldingLiteral('settings:v1');
      expect(keyLiterals).toEqual(['src/core/storage-keys.ts']);
    });

    it('reaches chrome.storage.local only through the one port adapter factory', () => {
      const factories = optionsFiles()
        .filter((file) => codeOnly(file.text).includes('createChromeLocalStoragePort'))
        .map((file) => file.path);
      expect(factories).toEqual(['src/options/options.component.ts']);
    });

    it('is the only shipped caller of the settings save and of name generation (spec ":75")', () => {
      // `inline-comment-model.md` -> "Author name": `t4-02-options-name` is the only
      // shipped caller of the settings save and the only place a first-run name is
      // wired. The claim needs a grep, not a comment: a second `generateAuthorName`
      // call site would hand the reader two different authors.
      expect(importersOf('saveSettings')).toEqual(['src/options/author-name-service.ts']);
      expect(importersOf('generateAuthorName')).toEqual(['src/options/author-name-service.ts']);
    });

    it('measures the author cap in code points, never in UTF-16 units (ruling A55)', () => {
      const code = optionsCode();
      expect(code).toMatch(/\bsliceCodePoints\b/);
      expect(code).toMatch(/\bcodePointLength\b/);
      // The `t1-01` stub's `maxlength="40"` counted UTF-16 units and is gone: the
      // input itself refuses the code point past the cap.
      expect(code).not.toMatch(/maxlength/i);
      expect(code).not.toMatch(/\.length\s*[<>]/);
    });

    it('holds one name-refusal wording on this surface and no third variant', () => {
      const strings = readFileSync(join(projectRoot, 'src', 'options', 'text.ts'), 'utf8');
      expect(strings).toContain("'Имя обязательно'");
      // `Укажите имя в настройках` belongs to the card and the popup; a third
      // sentence for the same state is the hand-over this task must not repeat.
      // Comments may name the other surface; a string literal may not.
      expect(codeOnly(strings)).not.toContain('Укажите имя');
      expect(codeOnly(strings)).not.toContain('Задайте имя');
      expect(codeOnly(strings)).not.toContain('Введите имя');
    });

    it('keeps the component a facade with no core rule of its own', () => {
      const component = codeOnly(readFileSync(join(projectRoot, 'src', 'options', 'options.component.ts'), 'utf8'));
      for (const rule of [
        'loadSettings',
        'saveSettings',
        'generateAuthorName',
        'validateAuthorName',
        'MAX_AUTHOR_NAME_CODE_POINTS',
      ]) {
        expect(component).not.toMatch(new RegExp(`\\b${rule}\\b`));
      }
    });
  });

  it('every UI layer keeps its strings in one constants module', () => {
    for (const constants of ['src/content/text.ts', 'src/popup/text.ts', 'src/options/text.ts']) {
      expect(sourceFiles('src').map((file) => file.path)).toContain(constants);
    }
  });

  describe('the popup is a facade over the core entry API (t4-01 AC1, AC3, AC5)', () => {
    const popupFiles = (): SourceFile[] => sourceFiles('src/popup');
    const popupCode = (): string => popupFiles().map((file) => codeOnly(file.text)).join('\n');
    const componentCode = (): string =>
      codeOnly(readFileSync(join(projectRoot, 'src', 'popup', 'popup.component.ts'), 'utf8'));
    const holderPaths = (literal: string): string[] =>
      modulesHoldingLiteral(literal).sort();

    it('names no storage API and no storage key of its own (t4-01 AC1)', () => {
      // AC1 of `t4-01` is this scan: the popup reaches storage only through the core
      // port adapter and writes only through core functions. `src/core/` owns the key
      // layout, so a popup that imports a key name would be a second store.
      const directStorage = popupFiles()
        .filter((file) => codeOnly(file.text).includes('chrome.storage'))
        .map((file) => file.path);
      expect(directStorage).toEqual([]);

      const keyMentions = popupFiles()
        .filter((file) =>
          importClauses(file.text).some((clause) =>
            /\b(SETTINGS_KEY|PAGE_INDEX_KEY|ENTRY_KEY_PREFIX|entryStorageKey|slotKeyFor|storage-keys)\b/.test(
              clause,
            ),
          ),
        )
        .map((file) => file.path);
      expect(keyMentions).toEqual([]);
    });

    it('reads the active tab in exactly one shipped module (ruling A49)', () => {
      const tabUsers = popupFiles()
        .filter((file) => codeOnly(file.text).includes('chrome.tabs'))
        .map((file) => file.path);
      expect(tabUsers).toEqual(['src/popup/active-tab.ts']);

      const address = codeOnly(
        readFileSync(join(projectRoot, 'src', 'popup', 'active-tab.ts'), 'utf8'),
      );
      expect(address).toMatch(/chrome\.tabs\.query/);
      expect(address).toMatch(/active:\s*true/);
      expect(address).toMatch(/currentWindow:\s*true/);
    });

    it('reaches chrome.storage.local only through the one port adapter factory', () => {
      const factories = popupFiles()
        .filter((file) => codeOnly(file.text).includes('createChromeLocalStoragePort'))
        .map((file) => file.path);
      expect(factories).toEqual(['src/popup/popup.component.ts']);
    });

    it('sends no message to the page from the checkbox (ruling A50)', () => {
      // The checkbox writes storage; the page repaints from the `storage watch` of
      // `t4-03`, whose subscription lives in the one storage adapter. A second,
      // popup-initiated channel would be a third moving part and the pair would
      // disagree about which one repaints.
      expect(popupCode()).not.toMatch(/\bsendMessage\b/);
      expect(popupCode()).not.toMatch(/\bconnect(\s*\(|\.Port)/);
      expect(popupCode()).not.toMatch(/\bchrome\.storage\.onChanged\b/);
    });

    it('keeps the repaint channel on the page side: one `onChanged` subscriber in `src` (t4-03 AC2, A50)', () => {
      // The popup is allowed no subscriber of its own only if the page really has
      // exactly one. This is the pairing half of ruling `A50`: the write is the
      // message, and one listener in the page turns it into a repaint.
      const subscribers = sourceFiles('src')
        .filter((file) => codeOnly(file.text).includes('chrome.storage.onChanged'))
        .map((file) => file.path);
      expect(subscribers).toEqual(['src/content/store/chrome-storage-port.ts']);
    });

    it('keeps the component a facade with no core rule of its own', () => {
      const component = componentCode();
      for (const rule of [
        'loadEntries',
        'loadSettings',
        'setVisible',
        'deleteEntry',
        'sortByCreatedAtAsc',
        'canEdit',
        'validateAuthorName',
        'pageKeyFromUrl',
        'isInjectableUrl',
      ]) {
        expect(component).not.toMatch(new RegExp(`\\b${rule}\\b`));
      }
    });

    it('holds no comment write and no page clear, so the popup offers no edit path (AC3, A25)', () => {
      // The popup contract fixes the row: label + checkbox + `Удалить`. A foreign row is
      // read-only because this surface has no edit affordance for any row, own or
      // foreign, while the delete stays ungated by authorship.
      for (const write of ['updateEntryComment', 'createEntryOnPage', 'clearPage']) {
        expect(popupCode()).not.toMatch(new RegExp(`\\b${write}\\b`));
      }
    });

    it('writes a row through the two aggregate author operations and never through a per-entry write (ruling A108; t5-06 AC3, AC5, AC8, AC9)', () => {
      // The trap `t5-06` names is a popup that loops `setVisible` / `deleteEntry` over the
      // entries of a row: N calls answer N `pages:v1` rewrites, and an interrupted loop
      // leaves half of an author's notes with no control left to finish the job. The shape
      // that makes that unreachable is the import list: the per-entry writes do not exist
      // in this layer, so no handler can reach them.
      const service = codeOnly(
        readFileSync(join(projectRoot, 'src', 'popup', 'page-entries-service.ts'), 'utf8'),
      );
      const clause =
        /import\s*\{([^}]*)\}\s*from\s*'\.\.\/core\/entry-store-write';/.exec(service);
      if (clause === null) {
        throw new Error('the popup service imports nothing from the core write module');
      }
      const named = clause[1]
        .split(',')
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0)
        .sort();
      expect(named).toEqual(['deleteEntriesOfAuthor', 'setVisibleForAuthor']);

      // The per-entry names are absent from the whole layer, and they are not smuggled in
      // behind the aggregate ones: `\b` is what tells `setVisible` from
      // `setVisibleForAuthor`.
      for (const write of ['setVisible', 'deleteEntry']) {
        expect(popupCode()).not.toMatch(new RegExp(`\\b${write}\\b`));
      }
      expect(popupCode()).toMatch(/\bsetVisibleForAuthor\b/);
      expect(popupCode()).toMatch(/\bdeleteEntriesOfAuthor\b/);
    });

    it('renders the row contract: label, checkbox, `Удалить`, and no editor control', () => {
      const template = componentCode();
      expect(template).toMatch(/type="checkbox"/);
      expect(template).toMatch(/\[checked\]="row\.allVisible"/);
      expect(template).toMatch(/onToggle\(row\.authorName,\s*\$event\)/);
      expect(template).toMatch(/onRemove\(row\.authorName\)/);
      expect(template).toMatch(/\[class\]="rowClassOf\(row\)"/);
      // The label of a row is the one format entry of `src/popup/text.ts` (`A108`), and
      // the template names no entry anywhere: there is no handle here for a per-entry
      // write, and no disclosure control that could expand the group (`A95`).
      expect(template).toMatch(/\{\{ labelOf\(row\) \}\}/);
      expect(template).not.toMatch(/row\.id/);
      // Exactly two loops exist on this surface: the notices and the rows. A third one
      // would be the expansion `A95` forbids — a list of the group's own notes.
      expect(componentCode().split('@for (').length - 1).toBe(2);
      // The name-required notice is a real control, reachable by keyboard (A83).
      expect(template).toMatch(/<button[^>]*\(click\)="openSettings\(\)"/);

      expect(template).not.toMatch(/<textarea/);
      expect(template).not.toMatch(/Сохранить/);
      expect(template).not.toMatch(/onSave/);
    });

    /**
     * The popup template, taken out of the component metadata so the render contract
     * of ruling `A83` can be pinned as a **document order and nesting** fact instead of
     * as a wording grep (task `t4-03` CF1).
     */
    const popupTemplate = (): string => {
      const raw = codeOnly(
        readFileSync(join(projectRoot, 'src', 'popup', 'popup.component.ts'), 'utf8'),
      );
      const template = /template:\s*`([\s\S]*?)`/.exec(raw)?.[1];
      if (template === undefined) {
        throw new Error('the popup component has no inline template to scan');
      }
      return template;
    };

    /** Reads the balanced `(...)` that starts at `open`, and returns its content. */
    function conditionAt(template: string, open: number): string {
      let depth = 0;
      for (let i = open; i < template.length; i += 1) {
        if (template[i] === '(') {
          depth += 1;
        } else if (template[i] === ')') {
          depth -= 1;
          if (depth === 0) {
            return template.slice(open + 1, i);
          }
        }
      }
      throw new Error('unbalanced control-flow condition in the popup template');
    }

    /**
     * The control-flow blocks that enclose `needle`, outermost first, each named by its
     * keyword and condition (`@if (…)` / `@for (…)` / `@else`). Interpolations are
     * removed first: `{{ x }}` is braces, not a block.
     */
    function blocksAround(needle: string): string[] {
      const template = popupTemplate().replaceAll(/\{\{[^}]*\}\}/g, ' ');
      const at = template.indexOf(needle);
      if (at < 0) {
        throw new Error(`the popup template holds no ${needle}`);
      }
      const stack: string[] = [];
      let pending: string | null = null;
      let i = 0;
      while (i < at) {
        const ifAt = template.startsWith('@if (', i);
        const forAt = template.startsWith('@for (', i);
        if (ifAt || forAt) {
          const head = ifAt ? '@if (' : '@for (';
          const condition = conditionAt(template, i + head.length - 1);
          pending = `${head}${condition})`;
          i += head.length + condition.length + 1;
          continue;
        }
        if (template.startsWith('@else', i)) {
          pending = '@else';
          i += '@else'.length;
          continue;
        }
        const character = template[i];
        if (character === '{') {
          stack.push(pending ?? 'block');
          pending = null;
        } else if (character === '}') {
          stack.pop();
        }
        i += 1;
      }
      return stack;
    }

    it('renders both notice lines above the list, in document order (A81, A83; t4-03 CF1)', () => {
      const template = popupTemplate();
      const listAt = template.indexOf('class="rows"');
      const nameNoticeAt = template.indexOf('class="notice notice--name"');
      const restrictedNoticeAt = template.indexOf('class="notice notice--not-injectable"');
      expect(listAt).toBeGreaterThan(-1);
      expect(nameNoticeAt).toBeGreaterThan(-1);
      expect(restrictedNoticeAt).toBeGreaterThan(-1);

      // Ruling `A83`, in the shape that broke: a notice that replaced the list instead
      // of standing above it. Document order is the whole criterion.
      expect(nameNoticeAt).toBeLessThan(listAt);
      expect(restrictedNoticeAt).toBeLessThan(listAt);

      // Both codes the service can answer have a branch of their own, so a notice can
      // never disappear because a case is missing, and neither branch is nested in the
      // other: they are the `@if` / `@else` pair of one loop.
      expect(blocksAround('class="notice notice--name"')).toEqual([
        '@for (notice of view().notices; track notice)',
        "@if (notice === 'name_required')",
      ]);
      expect(blocksAround('class="notice notice--not-injectable"')).toEqual([
        '@for (notice of view().notices; track notice)',
        '@else',
      ]);
    });

    it('renders the list, the checkbox and `Удалить` outside every notice and outside any ownership condition (A25, A83; t4-03 CF1)', () => {
      // The list block is the `@else` half of the empty check and nothing else: no
      // notice, no name gate and no ownership gate stands between the page and its
      // rows, because stored entries the reader cannot see are still entries the reader
      // has to be able to delete.
      expect(blocksAround('class="rows"')).toEqual(['@else']);
      const rowChain = blocksAround('class="delete"');
      expect(rowChain).toEqual([
        '@else',
        '@for (row of view().rows; track row.authorName)',
      ]);
      expect(blocksAround('type="checkbox"')).toEqual(rowChain);
      expect(rowChain.filter((frame) => /own|name_required|not_injectable/i.test(frame))).toEqual(
        [],
      );

      // And the ownership marker is a class on the row (ruling `A82`), never a block
      // that could wrap the delete button away.
      expect(popupTemplate()).not.toMatch(/@if \([^)]*own/i);
    });

    it('renders the empty state as the only alternative to the list (t4-03 CF1)', () => {
      const template = popupTemplate();
      expect(template).toMatch(/<p class="empty">\{\{ emptyState \}\}<\/p>/);
      // Its only gate is the empty check itself, so the paragraph is what a page with
      // no rows shows at once — the state `tests/popup-entry-list.spec.ts` pins as the
      // answer of the service after `Удалить` took the last row.
      expect(blocksAround('class="empty"')).toEqual(['@if (view().rows.length === 0)']);

      // The wording is the one sentence of the one constants module, and the component
      // hands it over as a field rather than choosing it (facade rule).
      expect(componentCode()).toMatch(
        /readonly emptyState: string = POPUP_STRINGS\.emptyState;/,
      );
      const strings = codeOnly(readFileSync(join(projectRoot, 'src', 'popup', 'text.ts'), 'utf8'));
      expect(strings).toContain("'На этой странице нет записей'");
    });

    it('holds one wording per popup state, and no second variant of the ownership marker (A81, A82)', () => {
      expect(holderPaths('На этой странице подсветка недоступна')).toEqual(['src/popup/text.ts']);
      // `Укажите имя в настройках` is the one sentence for the settings-gate state on
      // the two surfaces that name it: the page card and the popup. The options page
      // keeps its own `Имя обязательно`, and a third variant is forbidden.
      expect(holderPaths('Укажите имя в настройках')).toEqual([
        'src/content/text.ts',
        'src/popup/text.ts',
      ]);

      const strings = codeOnly(readFileSync(join(projectRoot, 'src', 'popup', 'text.ts'), 'utf8'));
      // A82: a foreign row is marked by the header word plus a class, never by a new
      // Russian sentence naming the author.
      expect(strings).not.toMatch(/Не: /);
      expect(strings).not.toMatch(/Чужая|Чужой/);
      expect(strings).toContain("'Вы'");
      expect(strings).toContain("'Удалить'");
    });
  });
});

describe('the capture module crosses the offset domain only through core helpers (t3-01b finding 1)', () => {
  /**
   * `trimStreamRange` holds **stream code-point** offsets and has to look at
   * characters, which live at UTF-16 indices. The shipped code probed
   * `streamText.charAt(offset)` directly and clamped those offsets with
   * `streamText.length`: the same class of mistake the `t2-02` hand-over warns about
   * in `fragment-rect.ts`, in the opposite direction, and invisible in the types
   * because every number in that module is `number`. One astral character anywhere
   * earlier in the stream answered "no separator here" where there was one, so the
   * stored note lost its first character, a short selection lost its range, and a
   * re-selection was refused as `overlap` instead of `duplicate`. The helpers that
   * make the crossing already exist in `src/core/text-normalize.ts`.
   */
  const source = codeOnly(
    readFileSync(join(projectRoot, 'src/content/capture/selection-span.ts'), 'utf8'),
  );

  it('converts the two boundary offsets with the core helpers', () => {
    expect(source).toMatch(/\butf16IndexAt\b/);
    expect(source).toMatch(/\bcodePointOffsetAt\b/);
    expect(source).toMatch(
      /from '\.\.\/\.\.\/core\/text-normalize'/,
    );
  });

  it('never probes the stream with an unconverted code-point offset', () => {
    // Every character probe of the stream addresses a `*Units` index, which is this
    // module's name for a value produced by `utf16IndexAt`.
    expect(source).not.toMatch(/streamText\.charAt\((?!beginUnits|finishUnits)/);
  });

  it('never measures a code-point offset against the UTF-16 length of the stream', () => {
    expect(source).not.toMatch(/streamText\.length/);
  });
});

describe('no network in shipped source', () => {
  it('src contains no fetch, XMLHttpRequest or WebSocket', () => {
    const pattern = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/;
    const offenders = sourceFiles('src')
      .filter((file) => pattern.test(codeOnly(file.text)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
