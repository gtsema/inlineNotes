import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { StoragePortSource } from '../src/core/storage-port-source';
import type { StoragePort } from '../src/core/storage-port';
import { codeOnly } from './support/build-script-guards';

/**
 * The one name of the storage seam (task `t17-02`).
 *
 * The popup and the options page each declare the same field — "the one port adapter,
 * never a storage API" — and Stage 17 added a second collaborator to the popup plus two
 * more seams in `t17-02`. This module is the name those fields share, and the pin below
 * is what keeps it a **seam**: a source of the UI layer (a module under `src/popup/` or
 * `src/options/`) that declares its own `port` field again is a source that can drift
 * from the contract the layers below it rely on.
 *
 * The second half of the same claim is the one `tests/toolchain-contract.spec.ts`
 * already owns for the shipped files: `chrome.storage` lives in exactly one adapter, and
 * the two UI layers reach storage through core. What is added here is the **shape**: one
 * required `StoragePort`, no optional, no second spelling.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Every shipped file under one directory, repo-relative and slash-separated. */
function filesUnder(dir: string): { path: string; text: string }[] {
  const absolute = join(projectRoot, dir);
  const files: { path: string; text: string }[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...filesUnder(join(dir, entry.name)));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) {
      continue;
    }
    files.push({
      path: join(dir, entry.name).replaceAll('\\', '/'),
      text: readFileSync(join(absolute, entry.name), 'utf8'),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

describe('the storage seam has one name (t17-02)', () => {
  it('is one required `StoragePort` field, and carries no value of its own', () => {
    const source = codeOnly(
      readFileSync(join(projectRoot, 'src', 'core', 'storage-port-source.ts'), 'utf8'),
    );

    // The shape: the interface, one member, typed by the core port, required.
    expect(source).toMatch(/export interface StoragePortSource\s*\{/);
    expect(source).toMatch(/readonly port:\s*StoragePort;/);
    // No optional marker on the field: "the port is absent" has no meaning for a reader
    // of storage, and an optional field is how a source silently ends up without one.
    expect(source).not.toMatch(/readonly port\?:/);
    // A type module and nothing more: nothing is exported here at runtime, so importing
    // it cannot touch the `chrome` global or build a port object.
    expect(source).not.toMatch(/export const/);
    expect(source).not.toMatch(/export function/);
    expect(source).not.toMatch(/createChromeLocalStoragePort/);
    expect(source).not.toMatch(/chrome\./);
    // It is a `src/core/` module like every other one: no DOM, no framework.
    expect(source).not.toContain('@angular/');
    expect(source).not.toContain('preact');
    expect(source).not.toMatch(/\bdocument\./);
  });

  it('is a type the compiler really checks against a port', () => {
    // The claim above is static; this is the executable half of it. A `StoragePortSource`
    // built from a real port is one, and a source whose `port` is something else is not.
    const port: StoragePort = {
      get: async () => ({}),
      set: async () => undefined,
      remove: async () => undefined,
    };
    const source: StoragePortSource = { port };

    expect(source.port).toBe(port);
    // `createChromeLocalStoragePort()`'s own return type is the same contract, which is
    // what makes one name enough for the shipped wiring and for a test fake.
    expect(typeof port.get).toBe('function');
  });

  it('leaves the two UI layers one spelling of the field, and no second declaration', () => {
    // The seam exists so a layer cannot invent its own: every `port` field declared in
    // the two UI layers is typed by the core contract (`StoragePort`) or by a source
    // interface that carries it — `SyncPressSource`, `PageEntriesSource` — and none of
    // them respells the field as optional or as a local interface.
    const ui = [...filesUnder('src/popup'), ...filesUnder('src/options')];
    expect(ui.length).toBeGreaterThan(0);

    const declared: string[] = [];
    for (const file of ui) {
      const code = codeOnly(file.text);
      for (const match of code.matchAll(/readonly port(\??):\s*([A-Za-z]+);/g)) {
        declared.push(`${file.path}:${match[1] ?? ''}:${match[2] as string}`);
      }
    }
    // One field per source, all required, all typed by the core contract. A source that
    // grows a second `port` or makes it optional appears here as a new line.
    expect(declared.sort()).toEqual([
      'src/options/author-name-service.ts::StoragePort',
      'src/popup/page-entries-service.ts::StoragePort',
      'src/popup/sync-button-service.ts::StoragePort',
    ]);
    // And no UI file redeclares the shape of the seam: the interface lives in `src/core/`
    // and nowhere else.
    const redeclared = ui
      .filter((file) => codeOnly(file.text).includes('interface StoragePortSource'))
      .map((file) => file.path);
    expect(redeclared).toEqual([]);
  });
});
