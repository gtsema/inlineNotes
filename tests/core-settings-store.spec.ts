import { describe, expect, it } from 'vitest';

import { MAX_AUTHOR_NAME_CODE_POINTS, validateAuthorName } from '../src/core/entry-rules';
import {
  loadSettings,
  saveSettings,
  settingsFromStorageValue,
  settingsValueOf,
} from '../src/core/settings-store';
import { SETTINGS_KEY } from '../src/core/storage-keys';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
  type PortCall,
} from './support/memory-storage-port';

/**
 * Reading and writing `settings:v1` through the seam: task `t3-01` (AC1, AC2).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Settings record". Everything runs against the hand-written in-memory port:
 * no jsdom, no `chrome` stub, no new dependency.
 */

const PAGE_A = 'https://example.com/a';

/** A name one code point over the author-name cap. */
function overLongName(): string {
  return 'a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1);
}

/** JSON of what is stored under `settings:v1`, `undefined` when the key is absent. */
function storedSettingsJson(port: MemoryStoragePort): string | undefined {
  const value = port.snapshot()[SETTINGS_KEY];
  return value === undefined ? undefined : JSON.stringify(value);
}

/**
 * Every `set`/`remove` the port saw. An empty list is the only proof that an
 * operation changed nothing: a snapshot comparison alone cannot tell "did not
 * write" from "wrote the same bytes back".
 */
function writesOf(port: MemoryStoragePort): PortCall[] {
  return port.calls.filter((call: PortCall) => call.op !== 'get');
}

/** Port seeded with a whole store, so a settings write can be proven local. */
function seededStore(settingsValue: unknown): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed('pages:v1', indexValue([PAGE_A]));
  port.seed(`notes:v1:https:__example.com_a`, slotValue([storedEntry()]));
  if (settingsValue !== undefined) {
    port.seed(SETTINGS_KEY, settingsValue);
  }
  return port;
}

describe('loadSettings reads the author name (AC1)', () => {
  it('reports an absent settings key as settings_malformed with an empty name', async () => {
    const port = new MemoryStoragePort();

    const result = await loadSettings(port);
    expect(result).toEqual({ name: '', codes: ['settings_malformed'] });
  });

  it('reports a stored value that is not an object the same way', async () => {
    for (const value of ['Anya', 42, true, ['Anya'], null]) {
      const port = new MemoryStoragePort();
      port.seed(SETTINGS_KEY, value);

      const result = await loadSettings(port);
      expect(result).toEqual({ name: '', codes: ['settings_malformed'] });
    }
  });

  it('reports a stored name that is not a string the same way', async () => {
    for (const value of [{}, { name: 42 }, { name: null }, { name: ['Anya'] }]) {
      const port = new MemoryStoragePort();
      port.seed(SETTINGS_KEY, value);

      const result = await loadSettings(port);
      expect(result).toEqual({ name: '', codes: ['settings_malformed'] });
    }
  });

  it('returns a valid stored name normalized by validateAuthorName', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: '  Anya Ivanova  ' });

    const result = await loadSettings(port);
    expect(result).toEqual({ name: 'Anya Ivanova', codes: [] });
    expect(result.name).toBe(validateAuthorName('  Anya Ivanova  ').normalized);
  });

  it('ignores unknown fields in the stored record', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya', theme: 'dark', version: 2 });

    expect(await loadSettings(port)).toEqual({ name: 'Anya', codes: [] });
  });

  it('accepts a name of exactly MAX_AUTHOR_NAME_CODE_POINTS code points', async () => {
    const name = 'a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS);
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name });

    expect(await loadSettings(port)).toEqual({ name, codes: [] });
  });

  it('measures the cap in code points, not UTF-16 units', async () => {
    const emojiName = '😀'.repeat(MAX_AUTHOR_NAME_CODE_POINTS);
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: emojiName });

    expect(await loadSettings(port)).toEqual({ name: emojiName, codes: [] });
  });

  it('reports a stored name above the cap with name_required and keeps the stored value', async () => {
    const stored = `  ${overLongName()}  `;
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: stored });
    const before = JSON.stringify(port.snapshot());

    const result = await loadSettings(port);
    expect(result.codes).toEqual(['name_required']);
    expect(result.name).toBe(overLongName());
    expect(result.name.length).toBeGreaterThan(MAX_AUTHOR_NAME_CODE_POINTS);
    expect(JSON.stringify(port.snapshot())).toBe(before);
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('reports an astral name above the cap with name_required', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: '😀'.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1) });

    const result = await loadSettings(port);
    expect(result.codes).toEqual(['name_required']);
    expect(Array.from(result.name).length).toBe(MAX_AUTHOR_NAME_CODE_POINTS + 1);
  });

  it('reports a stored name that is empty after the trim as name_required', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: ' \t ' });

    expect(await loadSettings(port)).toEqual({ name: '', codes: ['name_required'] });
  });

  it('turns a port read failure into storage_unavailable and never throws', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya' });
    port.failReadOn(SETTINGS_KEY, 'unavailable');

    expect(await loadSettings(port)).toEqual({ name: '', codes: ['storage_unavailable'] });
  });

  it('reads exactly the settings key and never a page key or the index', async () => {
    const port = seededStore({ name: 'Anya' });

    await loadSettings(port);
    expect(port.calls).toEqual([{ op: 'get', keys: [SETTINGS_KEY] }]);
  });

  it('never writes, so a damaged stored name survives the read verbatim', async () => {
    const damaged = { name: 42, note: 'written by something else' };
    const port = seededStore(damaged);
    const before = port.snapshot();

    const result = await loadSettings(port);
    expect(result.codes).toEqual(['settings_malformed']);
    expect(port.snapshot()).toEqual(before);
    expect(port.storedKeys()).toEqual(['pages:v1', `notes:v1:https:__example.com_a`, SETTINGS_KEY]);
    expect(writesOf(port)).toEqual([]);
    expect(port.calls).toEqual([{ op: 'get', keys: [SETTINGS_KEY] }]);
  });

  it('issues no set and no remove for any stored shape, so a read cannot repair or erase', async () => {
    const shapes: readonly { label: string; value: unknown }[] = [
      { label: 'absent settings key', value: undefined },
      { label: 'a string', value: 'Anya' },
      { label: 'a number', value: 42 },
      { label: 'a boolean', value: true },
      { label: 'null', value: null },
      { label: 'an array', value: ['Anya'] },
      { label: 'an empty object', value: {} },
      { label: 'a non-string name', value: { name: 42 } },
      { label: 'a null name', value: { name: null } },
      { label: 'a name that is empty after the trim', value: { name: ' \t ' } },
      { label: 'a valid name', value: { name: '  Anya  ' } },
      { label: 'a name above the cap', value: { name: overLongName() } },
    ];

    for (const shape of shapes) {
      const port = seededStore(shape.value);
      const before = JSON.stringify(port.snapshot());

      const result = await loadSettings(port);
      expect(writesOf(port), `writes for: ${shape.label}`).toEqual([]);
      expect(JSON.stringify(port.snapshot()), `stored bytes for: ${shape.label}`).toBe(before);
      // A read that hands back no name always explains itself with a code.
      expect(result.name !== '' || result.codes.length > 0, `code for: ${shape.label}`).toBe(true);
    }
  });

  it('issues no set and no remove when the read itself fails', async () => {
    const port = seededStore({ name: 'Anya' });
    const before = JSON.stringify(port.snapshot());
    port.failReadOn(SETTINGS_KEY, 'unavailable');

    expect(await loadSettings(port)).toEqual({ name: '', codes: ['storage_unavailable'] });
    expect(writesOf(port)).toEqual([]);
    expect(JSON.stringify(port.snapshot())).toBe(before);
  });
});

describe('saveSettings writes the author name (AC2)', () => {
  it('stores the normalized name and nothing else', async () => {
    const port = new MemoryStoragePort();

    const result = await saveSettings(port, { name: '  Anya Ivanova  ' });
    expect(result).toEqual({ ok: true, name: 'Anya Ivanova' });
    expect(port.storedKeys()).toEqual([SETTINGS_KEY]);
    expect(storedSettingsJson(port)).toBe(JSON.stringify({ name: 'Anya Ivanova' }));
    expect(port.calls).toEqual([{ op: 'set', keys: [SETTINGS_KEY] }]);
  });

  it('leaves every other storage key byte-identical', async () => {
    const port = seededStore({ name: 'Anya' });
    const before = port.snapshot();

    await saveSettings(port, { name: 'Boris' });
    expect(port.snapshot()['pages:v1']).toEqual(before['pages:v1']);
    expect(port.snapshot()[`notes:v1:https:__example.com_a`]).toEqual(
      before[`notes:v1:https:__example.com_a`],
    );
  });

  it('refuses an empty name with name_required and writes nothing', async () => {
    const port = new MemoryStoragePort();

    expect(await saveSettings(port, { name: '' })).toEqual({ ok: false, code: 'name_required' });
    expect(port.calls).toEqual([]);
    expect(port.storedKeys()).toEqual([]);
  });

  it('refuses a whitespace-only name and leaves the stored value untouched', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya' });
    const before = JSON.stringify(port.snapshot());

    expect(await saveSettings(port, { name: ' \t\n ' })).toEqual({ ok: false, code: 'name_required' });
    expect(JSON.stringify(port.snapshot())).toBe(before);
    expect(port.calls).toEqual([]);
  });

  it('refuses a name above the cap with the same name_required code (ruling A11)', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya' });

    expect(await saveSettings(port, { name: overLongName() })).toEqual({
      ok: false,
      code: 'name_required',
    });
    expect(storedSettingsJson(port)).toBe(JSON.stringify({ name: 'Anya' }));
    expect(port.calls).toEqual([]);
  });

  it('writes exactly one field, dropping foreign fields another writer left', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya', theme: 'dark', version: 2 });

    expect(await saveSettings(port, { name: 'Boris' })).toEqual({ ok: true, name: 'Boris' });
    expect(storedSettingsJson(port)).toBe(JSON.stringify({ name: 'Boris' }));
  });

  it('refuses a whitespace-only name (no-break space, tab) without touching the index or a page slot', async () => {
    const port = seededStore({ name: 'Anya' });
    const before = JSON.stringify(port.snapshot());

    expect(await saveSettings(port, { name: '\u00A0 \t' })).toEqual({
      ok: false,
      code: 'name_required',
    });
    expect(port.calls).toEqual([]);
    expect(JSON.stringify(port.snapshot())).toBe(before);
  });

  it('reports an injected quota failure and leaves the stored value byte-identical', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya' });
    const before = JSON.stringify(port.snapshot());
    port.failNextWrite('quota');

    expect(await saveSettings(port, { name: 'Boris' })).toEqual({ ok: false, code: 'quota' });
    expect(JSON.stringify(port.snapshot())).toBe(before);
  });

  it('leaves the index and every page slot byte-identical when the port refuses the write', async () => {
    const port = seededStore({ name: 'Anya' });
    const before = JSON.stringify(port.snapshot());
    port.failNextWrite('quota');

    expect(await saveSettings(port, { name: 'Boris' })).toEqual({ ok: false, code: 'quota' });
    expect(JSON.stringify(port.snapshot())).toBe(before);
    expect(port.storedKeys()).toEqual(['pages:v1', `notes:v1:https:__example.com_a`, SETTINGS_KEY]);
    expect(writesOf(port)).toEqual([{ op: 'set', keys: [SETTINGS_KEY] }]);
  });

  it('reports an injected serialization failure and leaves the stored value byte-identical', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 'Anya' });
    const before = JSON.stringify(port.snapshot());
    port.failNextWrite('serialization');

    expect(await saveSettings(port, { name: 'Boris' })).toEqual({
      ok: false,
      code: 'serialization',
    });
    expect(JSON.stringify(port.snapshot())).toBe(before);
  });

  it('reports an unavailable port instead of throwing', async () => {
    const port = new MemoryStoragePort();
    port.failNextWrite('unavailable');

    expect(await saveSettings(port, { name: 'Boris' })).toEqual({ ok: false, code: 'unavailable' });
  });

  it('replaces an undecodable settings value, which is how a damaged record is repaired', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: 42 });

    expect(await saveSettings(port, { name: 'Anya' })).toEqual({ ok: true, name: 'Anya' });
    expect(storedSettingsJson(port)).toBe(JSON.stringify({ name: 'Anya' }));
  });

  it('round-trips: the name a save wrote is the name a read returns', async () => {
    const port = new MemoryStoragePort();

    const saved = await saveSettings(port, { name: '  Anya  ' });
    expect(saved.ok).toBe(true);
    expect(await loadSettings(port)).toEqual({ name: 'Anya', codes: [] });
  });
});

describe('the settings decode guard is pure (AC1)', () => {
  it('settingsFromStorageValue answers every unusable value without throwing', () => {
    expect(settingsFromStorageValue(undefined)).toEqual({ name: '', codes: ['settings_malformed'] });
    expect(settingsFromStorageValue(null)).toEqual({ name: '', codes: ['settings_malformed'] });
    expect(settingsFromStorageValue('Anya')).toEqual({ name: '', codes: ['settings_malformed'] });
    expect(settingsFromStorageValue([{ name: 'Anya' }])).toEqual({
      name: '',
      codes: ['settings_malformed'],
    });
    expect(settingsFromStorageValue({ name: 'Anya' })).toEqual({ name: 'Anya', codes: [] });
  });

  it('settingsValueOf produces exactly the stored shape', () => {
    expect(settingsValueOf('Anya')).toEqual({ name: 'Anya' });
    expect(Object.keys(settingsValueOf('Anya'))).toEqual(['name']);
  });

  it('the guard never mutates the value it was given', () => {
    const value = { name: '  Anya  ', extra: 1 };

    settingsFromStorageValue(value);
    expect(value).toEqual({ name: '  Anya  ', extra: 1 });
  });
});
