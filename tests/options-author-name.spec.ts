import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { RandomSource } from '../src/core/entry-rules';
import {
  GENERATED_AUTHOR_NAME_LENGTH,
  MAX_AUTHOR_NAME_CODE_POINTS,
  validateAuthorName,
} from '../src/core/entry-rules';
import { SETTINGS_KEY } from '../src/core/storage-keys';
import { loadSettings } from '../src/core/settings-store';
import { AuthorNameService } from '../src/options/author-name-service';
import { OPTIONS_MESSAGE_TEXT, OPTIONS_STRINGS, nameCounterText } from '../src/options/text';
import type { PortCall } from './support/memory-storage-port';
import { MemoryStoragePort } from './support/memory-storage-port';

/**
 * The options author-name slice (`t4-02-options-name`).
 *
 * Everything here runs against the in-memory port and an injected random source,
 * because the page owns no rule of its own: `AuthorNameService` is the wiring of
 * `loadSettings` / `saveSettings` / `generateAuthorName`, and these tests are what
 * make AC1-AC4 of `docs/state/t4-02-options-name.md` observable. The Angular
 * component holds no branch, so it is not the thing under test.
 *
 * AC5 (one reader/writer of `settings:v1`) is a source-shape claim and lives in
 * `tests/toolchain-contract.spec.ts`, next to the greps it extends.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** The name `sequenceRng([0.5])` generates: `floor(0.5 * 36)` = 18 = `'i'`. */
const GENERATED_NAME = 'iiiiiiii';

/** An astral name of `count` code points: `count * 2` UTF-16 units. */
const ASTRAL_NAME_40 = '\u{1F600}'.repeat(MAX_AUTHOR_NAME_CODE_POINTS);
const ASTRAL_NAME_41 = '\u{1F600}'.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1);

function sequenceRng(values: readonly number[]): RandomSource {
  let index = 0;
  return (): number => values[index % values.length] ?? 0.5;
}

function serviceFor(port: MemoryStoragePort, rng: RandomSource = sequenceRng([0.5])): AuthorNameService {
  return new AuthorNameService({ port, rng });
}

/** Every `set` / `remove` the port saw: the proof that a refusal performed no write. */
function writesOf(port: MemoryStoragePort): PortCall[] {
  return port.calls.filter((call: PortCall) => call.op !== 'get');
}

function storedSettingsValue(port: MemoryStoragePort): unknown {
  return port.snapshot()[SETTINGS_KEY];
}

function storedJson(port: MemoryStoragePort): string {
  return JSON.stringify(port.snapshot());
}

describe('AC1 — the field shows the name core read, never the stored bytes', () => {
  it('reads the name through the core settings read and shows it trimmed', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: '  Анна  ' });

    const view = await serviceFor(port).open();

    expect(view).toEqual({ name: 'Анна', message: null });
    // One core read, and the page asked for no other key of its own.
    expect(port.calls).toEqual([{ op: 'get', keys: [SETTINGS_KEY] }]);
  });

  it('never renders the raw stored bytes of a damaged record', async () => {
    const damaged: readonly unknown[] = [
      'plain-string-instead-of-a-record',
      42,
      null,
      ['Anya'],
      { name: 7 },
      { name: null },
      { name: ['Anya'] },
      { name: { nested: 'record' } },
      { name: true },
    ];

    for (const shape of damaged) {
      const port = new MemoryStoragePort();
      port.seed(SETTINGS_KEY, shape);

      const view = await serviceFor(port).open();

      expect(view.name, `shape ${JSON.stringify(shape)}`).toBe(GENERATED_NAME);
      expect(validateAuthorName(view.name).ok, `shape ${JSON.stringify(shape)}`).toBe(true);
    }
  });

  it('shows an empty field plus its own message when the store cannot be read', async () => {
    const port = new MemoryStoragePort();
    port.failNextRead('unavailable');

    const view = await serviceFor(port).open();

    expect(view.name).toBe('');
    expect(view.message).toBe('storage_unavailable');
    expect(OPTIONS_MESSAGE_TEXT[view.message ?? 'saved']).toBe('Хранилище недоступно');
    // A54 generates only over a record it could read: an unreadable area is written to
    // never, because a fresh identity would decide the author of every stored entry.
    expect(writesOf(port)).toEqual([]);
    expect(port.storedKeys()).not.toContain(SETTINGS_KEY);
  });
});

describe('AC2 — Сохранить calls the core save and nothing else', () => {
  it('writes exactly { name } under the settings key through the core save', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Аня' });
    const service = serviceFor(port);
    await service.open();

    const view = await service.save('Боря');

    expect(view).toEqual({ name: 'Боря', message: 'saved' });
    // Stage 17 (`A160`): the core save reads the record first, because the two sync
    // fields the name does not mention keep what the store holds. The write itself is
    // still exactly one `set` of the one settings key.
    expect(port.calls).toEqual([
      { op: 'get', keys: [SETTINGS_KEY] },
      { op: 'get', keys: [SETTINGS_KEY] },
      { op: 'set', keys: [SETTINGS_KEY] },
    ]);
    expect(storedSettingsValue(port)).toEqual({ name: 'Боря' });
    expect(Object.keys(storedSettingsValue(port) as Record<string, unknown>)).toEqual(['name']);
  });

  it('stores the trimmed value, so the field and the store agree', async () => {
    const port = new MemoryStoragePort();
    const service = serviceFor(port);
    await service.open();

    await service.save('   Иван   ');

    expect(storedSettingsValue(port)).toEqual({ name: 'Иван' });
    expect((await loadSettings(port)).name).toBe('Иван');
  });

  it('refuses an empty name with the pinned sentence and performs no port call', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Аня' });
    const service = serviceFor(port);
    await service.open();
    const before = storedJson(port);

    const view = await service.save('   ');

    expect(view.message).toBe('name_required');
    expect(OPTIONS_MESSAGE_TEXT[view.message ?? 'saved']).toBe('Имя обязательно');
    expect(writesOf(port)).toEqual([]);
    expect(storedJson(port)).toBe(before);
    // A failed save puts back the name the store actually holds.
    expect(view.name).toBe('Аня');
  });

  it('reports a quota failure with the pinned quota sentence and re-shows the stored name', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Аня' });
    const service = serviceFor(port);
    await service.open();
    const before = storedJson(port);
    port.failNextWrite('quota');

    const view = await service.save('Боря');

    expect(view).toEqual({ name: 'Аня', message: 'quota' });
    expect(OPTIONS_MESSAGE_TEXT[view.message ?? 'saved']).toBe('Хранилище переполнено');
    expect(storedJson(port)).toBe(before);
  });

  it('reports a serialization or unavailable failure with one save sentence', async () => {
    for (const code of ['serialization', 'unavailable'] as const) {
      const port = new MemoryStoragePort();
      port.seed(SETTINGS_KEY, { name: 'Аня' });
      const service = serviceFor(port);
      await service.open();
      const before = storedJson(port);
      port.failNextWrite(code);

      const view = await service.save('Боря');

      expect(view, code).toEqual({ name: 'Аня', message: code });
      expect(OPTIONS_MESSAGE_TEXT[view.message ?? 'saved'], code).toBe('Не удалось сохранить имя');
      expect(storedJson(port), code).toBe(before);
    }
  });

  it('keeps its message map total over every code the settings API answers with', () => {
    expect(Object.keys(OPTIONS_MESSAGE_TEXT).sort()).toEqual([
      'name_required',
      'quota',
      'saved',
      'serialization',
      'storage_unavailable',
      'unavailable',
    ]);
    for (const [code, text] of Object.entries(OPTIONS_MESSAGE_TEXT)) {
      expect(text, code).not.toBe('');
    }
    expect(OPTIONS_MESSAGE_TEXT.saved).toBe(OPTIONS_STRINGS.saved);
  });

  it('keeps every sentence in the spec that fixes it', () => {
    // Same discipline as the content-layer refusal map: a wording may only change
    // together with the spec line that owns it (`content-overlay-ui.md` ->
    // "Options message map").
    const spec = readFileSync(
      join(projectRoot, 'docs', 'specs', 'content-overlay-ui.md'),
      'utf8',
    );
    expect(spec).toContain('- Options message map');
    for (const [code, text] of Object.entries(OPTIONS_MESSAGE_TEXT)) {
      expect(spec.includes(text), `${code}: ${text}`).toBe(true);
    }
  });
});

describe('AC3 — first run generates the name (A54)', () => {
  it('generates the name on a fresh install, stores it through core, and reads it back', async () => {
    const port = new MemoryStoragePort();

    const view = await serviceFor(port).open();

    expect(view).toEqual({ name: GENERATED_NAME, message: null });
    expect(view.name).toMatch(/^[0-9a-z]+$/);
    expect([...view.name]).toHaveLength(GENERATED_AUTHOR_NAME_LENGTH);
    // One read, then the core save — which reads the carried sync fields and writes once.
    expect(port.calls).toEqual([
      { op: 'get', keys: [SETTINGS_KEY] },
      { op: 'get', keys: [SETTINGS_KEY] },
      { op: 'set', keys: [SETTINGS_KEY] },
    ]);
    expect(storedSettingsValue(port)).toEqual({ name: GENERATED_NAME });

    const reread = await loadSettings(port);
    expect(reread.name).toBe(view.name);
    expect(reread.codes).toEqual([]);
  });

  it('replaces a damaged record with the generated name and drops foreign fields', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 42, note: 'written by hand' });

    const view = await serviceFor(port).open();

    expect(view.name).toBe(GENERATED_NAME);
    expect(storedSettingsValue(port)).toEqual({ name: GENERATED_NAME });
    expect((await loadSettings(port)).codes).toEqual([]);
  });

  it('replaces an empty-after-trim and an over-cap stored name with the generated one', async () => {
    for (const shape of [{ name: '   ' }, { name: ASTRAL_NAME_41 }] as const) {
      const port = new MemoryStoragePort();
      port.seed(SETTINGS_KEY, shape);

      const view = await serviceFor(port).open();

      expect(validateAuthorName(view.name).ok, JSON.stringify(shape)).toBe(true);
      expect(storedSettingsValue(port)).toEqual({ name: GENERATED_NAME });
    }
  });

  it('leaves an empty field plus a refusal when the first-run save itself fails', async () => {
    const port = new MemoryStoragePort();
    port.failNextWrite('serialization');

    const view = await serviceFor(port).open();

    expect(view).toEqual({ name: '', message: 'serialization' });
    expect(validateAuthorName(view.name).ok).toBe(false);
    expect(writesOf(port)).toHaveLength(1);
  });
});

describe('AC4 — the counter and the refusal measure code points (A55)', () => {
  it('accepts the cap and refuses the code point past it, at the boundary core enforces', async () => {
    const port = new MemoryStoragePort();
    const service = serviceFor(port);
    const atCap = 'a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS);
    const overCap = 'a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1);

    expect(service.draft(atCap)).toEqual({
      value: atCap,
      codePointCount: MAX_AUTHOR_NAME_CODE_POINTS,
      overCap: false,
      canSave: true,
    });

    const cut = service.draft(overCap);
    expect(cut.overCap).toBe(true);
    expect([...cut.value]).toHaveLength(MAX_AUTHOR_NAME_CODE_POINTS);
    expect(nameCounterText(cut.codePointCount)).toBe(
      `${String(MAX_AUTHOR_NAME_CODE_POINTS)}/${String(MAX_AUTHOR_NAME_CODE_POINTS)}`,
    );

    // The layer-level refusal is the same one core gives for the same value.
    const view = await service.save(overCap);
    expect(view.message).toBe('name_required');
    expect(writesOf(port)).toEqual([]);
  });

  it('counts a surrogate pair as one, in the counter and in the cap', () => {
    const port = new MemoryStoragePort();

    expect(ASTRAL_NAME_40.length).toBe(MAX_AUTHOR_NAME_CODE_POINTS * 2);
    expect(serviceFor(port).draft(ASTRAL_NAME_40)).toEqual({
      value: ASTRAL_NAME_40,
      codePointCount: MAX_AUTHOR_NAME_CODE_POINTS,
      overCap: false,
      canSave: true,
    });

    const over = serviceFor(port).draft(ASTRAL_NAME_41);
    expect(over.overCap).toBe(true);
    expect(over.codePointCount).toBe(MAX_AUTHOR_NAME_CODE_POINTS);
    expect(nameCounterText(over.codePointCount)).toBe('40/40');
  });

  it('saves a 40-code-point name through the core write, astral name included (R4)', async () => {
    // `content-overlay-ui.md` -> AC19 promises 40 code points are accepted **and
    // saved**. Acceptance and refusal were pinned; this is the storage half of the
    // sentence: the record under `settings:v1` holds the whole astral name, and the
    // author rule still accepts it when the value is read back.
    const port = new MemoryStoragePort();
    const service = serviceFor(port);
    const atCap = 'a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS);

    expect((await service.save(atCap)).message).toBe('saved');
    expect(storedSettingsValue(port)).toEqual({ name: atCap });

    const astral = await service.save(ASTRAL_NAME_40);
    expect(astral.message).toBe('saved');
    expect(writesOf(port)).toHaveLength(2);

    // The stored bytes are the whole 40 emoji — 80 UTF-16 units — under one field:
    // a UTF-16-cut value or an extra field would change this string.
    expect(storedJson(port)).toBe(JSON.stringify({ [SETTINGS_KEY]: { name: ASTRAL_NAME_40 } }));

    // And the stored value is a usable identity: the read returns it unchanged with
    // no code, and the author rule accepts it.
    const read = await loadSettings(port);
    expect(read.codes).toEqual([]);
    expect(read.name).toBe(ASTRAL_NAME_40);
    expect(read.name.length).toBe(MAX_AUTHOR_NAME_CODE_POINTS * 2);
    expect(validateAuthorName(read.name).ok).toBe(true);

    // A page opened later shows that name instead of generating over it: the stored
    // astral name is not one of the shapes `A54` repairs.
    const reopened = new MemoryStoragePort();
    reopened.seed(SETTINGS_KEY, { name: ASTRAL_NAME_40 });
    expect(await serviceFor(reopened).open()).toEqual({ name: ASTRAL_NAME_40, message: null });
    expect(writesOf(reopened)).toEqual([]);
  });

  it('prints the cap from the core constant, not from a number in the UI', () => {
    expect(nameCounterText(0)).toBe('0/40');
    expect(nameCounterText(MAX_AUTHOR_NAME_CODE_POINTS)).toBe(
      `${String(MAX_AUTHOR_NAME_CODE_POINTS)}/${String(MAX_AUTHOR_NAME_CODE_POINTS)}`,
    );
  });

  it('keeps an unchanged save on the core path and reports the saved state (A56)', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Аня' });
    const service = serviceFor(port);
    await service.open();

    const first = await service.save('Аня');
    const again = await service.save('Аня');

    expect(first.message).toBe('saved');
    expect(again.message).toBe('saved');
    expect(writesOf(port)).toHaveLength(2);
    expect(storedSettingsValue(port)).toEqual({ name: 'Аня' });
  });
});
