import { describe, expect, it } from 'vitest';

import type { RandomSource } from '../src/core/entry-rules';
import { loadSettings } from '../src/core/settings-store';
import { SETTINGS_KEY } from '../src/core/storage-keys';
import { AuthorNameService } from '../src/options/author-name-service';
import { OPTIONS_STRINGS, SERVER_ADDRESS_TEXT, serverAddressText } from '../src/options/text';
import type { PortCall } from './support/memory-storage-port';
import { MemoryStoragePort } from './support/memory-storage-port';

/**
 * The sync half of the options page (Stage 17, `t17-01` AC2 and AC3).
 *
 * Everything runs against the in-memory port: the page owns no rule, so the thing
 * under test is the **wiring** — that a typed address goes through the core rule
 * before it is stored, that a refused one is not stored at all, and that the switch
 * and the address live in the one `settings:v1` record beside the name.
 */

function sequenceRng(values: readonly number[]): RandomSource {
  let index = 0;
  return (): number => values[index % values.length] ?? 0.5;
}

function serviceFor(port: MemoryStoragePort): AuthorNameService {
  return new AuthorNameService({ port, rng: sequenceRng([0.5]) });
}

function writesOf(port: MemoryStoragePort): PortCall[] {
  return port.calls.filter((call: PortCall) => call.op !== 'get');
}

function storedSettings(port: MemoryStoragePort): Record<string, unknown> {
  return port.snapshot()[SETTINGS_KEY] as Record<string, unknown>;
}

/** A page with a stored name and a stored sync configuration. */
function seeded(overrides: Record<string, unknown> = {}): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(SETTINGS_KEY, { name: 'Аня', ...overrides });
  return port;
}

describe('AC2 the page reads the sync half from the settings record', () => {
  it('shows the stored address and switch, and reports no refusal on open', async () => {
    const port = seeded({ serverUrl: 'http://localhost:8080', syncEnabled: true });
    const service = serviceFor(port);

    await service.open();
    expect(service.syncView()).toEqual({
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
      serverRefusal: null,
    });
  });

  it('reads an old record written before Stage 17 as "off", with no address and the name kept', async () => {
    const port = seeded({ name: '  Аня  ' });
    const service = serviceFor(port);

    expect(await service.open()).toEqual({ name: 'Аня', message: null });
    expect(service.syncView()).toEqual({ serverUrl: '', syncEnabled: false, serverRefusal: null });
  });
});

describe('AC2 the switch is written the moment it is pressed, and keeps the address', () => {
  it('stores `syncEnabled: true` beside the name and the address', async () => {
    const port = seeded({ serverUrl: 'http://localhost:8080' });
    const service = serviceFor(port);
    await service.open();

    const view = await service.setSyncEnabled(true);

    expect(view).toEqual({
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
      serverRefusal: null,
    });
    expect(storedSettings(port)).toEqual({
      name: 'Аня',
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
    });
  });

  it('turning it off stores the record without the flag, because off is the default', async () => {
    const port = seeded({ serverUrl: 'http://localhost:8080', syncEnabled: true });
    const service = serviceFor(port);
    await service.open();

    const view = await service.setSyncEnabled(false);
    expect(view.syncEnabled).toBe(false);
    expect(storedSettings(port)).toEqual({ name: 'Аня', serverUrl: 'http://localhost:8080' });
  });

  it('keeps the name: the switch never rewrites who the author is', async () => {
    const port = seeded();
    const service = serviceFor(port);
    await service.open();

    await service.setSyncEnabled(true);
    expect((await loadSettings(port)).name).toBe('Аня');
  });
});

describe('AC3 an invalid address is refused with a visible message and is not saved (A165)', () => {
  it('refuses every shape the rule rejects and leaves the record byte-identical', async () => {
    const cases: readonly { raw: string; code: keyof typeof SERVER_ADDRESS_TEXT }[] = [
      { raw: 'ftp://localhost:8080', code: 'server_scheme' },
      { raw: 'localhost:8080', code: 'server_scheme' },
      { raw: 'http://localhost:8080/notes', code: 'server_shape' },
      { raw: 'http://localhost:8080/?a=1', code: 'server_shape' },
      { raw: 'не ссылка', code: 'server_invalid' },
    ];

    for (const { raw, code } of cases) {
      const port = seeded({ serverUrl: 'http://localhost:8080', syncEnabled: true });
      const before = JSON.stringify(port.snapshot());
      const service = serviceFor(port);
      await service.open();

      const view = await service.saveServerUrl(raw);
      expect(view.serverRefusal, raw).toBe(code);
      // The refusal is a message, not a write: the stored record did not move and the
      // message has Russian wording of its own.
      expect(JSON.stringify(port.snapshot()), raw).toBe(before);
      expect(writesOf(port).filter((call) => call.op === 'set'), raw).toEqual([]);
      expect(serverAddressText(code)).toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('keeps the stored address on the view while a refused value stands in the field', async () => {
    const port = seeded({ serverUrl: 'http://localhost:8080' });
    const service = serviceFor(port);
    await service.open();

    const view = await service.saveServerUrl('ftp://localhost:8080');
    expect(view.serverUrl).toBe('http://localhost:8080');
    expect(view.serverRefusal).toBe('server_scheme');
  });

  it('stores an accepted address in its normalized form and clears the refusal', async () => {
    const port = seeded();
    const service = serviceFor(port);
    await service.open();

    const view = await service.saveServerUrl('  http://192.168.0.10:8080/  ');
    expect(view).toEqual({
      serverUrl: 'http://192.168.0.10:8080',
      syncEnabled: false,
      serverRefusal: null,
    });
    expect(storedSettings(port)).toEqual({ name: 'Аня', serverUrl: 'http://192.168.0.10:8080' });
  });

  it('clearing the field stores "not configured" and does not keep the old address', async () => {
    const port = seeded({ serverUrl: 'http://localhost:8080' });
    const service = serviceFor(port);
    await service.open();

    const view = await service.saveServerUrl('');
    expect(view.serverUrl).toBe('');
    expect(storedSettings(port)).toEqual({ name: 'Аня' });
  });

  it('keeps the switch when the address is saved, and the address when the switch moves', async () => {
    const port = seeded({ syncEnabled: true });
    const service = serviceFor(port);
    await service.open();

    await service.saveServerUrl('https://sync.example.com:8443');
    expect(storedSettings(port)).toEqual({
      name: 'Аня',
      serverUrl: 'https://sync.example.com:8443',
      syncEnabled: true,
    });
  });

  it('reports a refused write without losing the address the store holds', async () => {
    const port = seeded({ serverUrl: 'http://localhost:8080' });
    const service = serviceFor(port);
    await service.open();
    port.failNextWrite('quota');

    const view = await service.saveServerUrl('http://localhost:9090');
    expect(view.serverUrl).toBe('http://localhost:8080');
    expect(view.serverRefusal).toBeNull();
  });
});

describe('AC2 the four sync strings live in the options text module, in Russian', () => {
  it('is total over the three refusal codes and carries one sentence each', () => {
    expect(Object.keys(SERVER_ADDRESS_TEXT).sort()).toEqual([
      'server_invalid',
      'server_scheme',
      'server_shape',
    ]);
    for (const [code, text] of Object.entries(SERVER_ADDRESS_TEXT)) {
      expect(text, code).toMatch(/[А-Яа-яЁё]/);
    }
    // Four distinct sentences, so one refusal never wears another's wording.
    expect(new Set(Object.values(SERVER_ADDRESS_TEXT)).size).toBe(3);
  });

  it('labels the two controls with Russian words, and names no third variant', () => {
    for (const text of [OPTIONS_STRINGS.serverLabel, OPTIONS_STRINGS.serverHint, OPTIONS_STRINGS.syncLabel]) {
      expect(text).toMatch(/[А-Яа-яЁё]/);
    }
    expect(OPTIONS_STRINGS.syncLabel).toBe('Синхронизация');
  });
});