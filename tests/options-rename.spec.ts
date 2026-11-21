import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { RandomSource } from '../src/core/entry-rules';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { AuthorNameService } from '../src/options/author-name-service';
import { OptionsComponent } from '../src/options/options.component';
import { createForeignNotes } from '../src/content/sync/foreign-notes';
import {
  OPTIONS_STRINGS,
  RENAME_OUTCOME_TEXT,
  renameOutcomeText,
} from '../src/options/text';
import { codeOnly } from './support/build-script-guards';
import type { PortCall } from './support/memory-storage-port';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
} from './support/memory-storage-port';

/**
 * The rename slice of task `t17-04` (rulings `A173`, `A174`).
 *
 * Everything runs against the in-memory port and an injected random source: the
 * options page owns no rule of its own, so the thing under test is the **wiring** —
 * `saveName` decides whether the warning is needed, `confirmRename` saves the name
 * first and deletes the previous name's notes second. The Angular component only
 * renders what those two answer, so the assertions are on the service, the port
 * snapshot and the port call log.
 *
 * AC10 (the wording lives in the options text module and nowhere else) is a
 * source-shape claim and is pinned here too, next to the strings it constrains.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';
const SLOT_A = entryStorageKey(PAGE_A);
const SLOT_B = entryStorageKey(PAGE_B);

const OLD_NAME = 'Аня';
const NEW_NAME = 'Боря';
const OTHER_NAME = 'Борис';
const NOW = '2026-03-04T05:06:07.008Z';

/** A wire anchor the server's boundary decodes: the stored `EntryAnchor` shape. */
const WIRE_ANCHOR = { text: 'x', prefix: '', suffix: '', fragmentCount: 1 };

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

function writeOrder(port: MemoryStoragePort): string[] {
  return writesOf(port).map((call: PortCall) => `${call.op}:${call.keys.join(',')}`);
}

function recordOf(id: string, pageKey: string, authorName: string): Record<string, unknown> {
  return storedEntry({ id, pageKey, authorName, createdAt: NOW, updatedAt: NOW });
}

/** A store with the old name configured and one note of it on each of two pages. */
function renameableStore(): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(SETTINGS_KEY, { name: OLD_NAME });
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_A, PAGE_B]));
  port.seed(entryStorageKey(PAGE_A), slotValue([recordOf('old-a', PAGE_A, OLD_NAME)]));
  port.seed(entryStorageKey(PAGE_B), slotValue([recordOf('old-b', PAGE_B, OLD_NAME)]));
  return port;
}

/** A store with the old name configured and no note of it anywhere. */
function emptyStore(): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(SETTINGS_KEY, { name: OLD_NAME });
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_A]));
  port.seed(entryStorageKey(PAGE_A), slotValue([recordOf('foreign-a', PAGE_A, OTHER_NAME)]));
  return port;
}

function storedJson(port: MemoryStoragePort): string {
  return JSON.stringify(port.snapshot());
}

describe('AC4 — the confirmation appears when a rename would delete at least one note', () => {
  it('asks before writing when the store holds a note of the stored name', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();
    const before = storedJson(port);

    const decision = await service.saveName(NEW_NAME);

    expect(decision.kind).toBe('confirm');
    expect(decision.view).toEqual({ name: OLD_NAME, message: null });
    // Nothing was written: the confirmation is asked before the save, not after it.
    expect(writesOf(port)).toEqual([]);
    expect(storedJson(port)).toBe(before);
  });

  it('asks when the note of the stored name is on another page than the first', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: OLD_NAME });
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_A, PAGE_B]));
    port.seed(entryStorageKey(PAGE_A), slotValue([recordOf('foreign-a', PAGE_A, OTHER_NAME)]));
    port.seed(entryStorageKey(PAGE_B), slotValue([recordOf('old-b', PAGE_B, OLD_NAME)]));
    const service = serviceFor(port);
    await service.open();

    expect((await service.saveName(NEW_NAME)).kind).toBe('confirm');
    expect(writesOf(port)).toEqual([]);
  });

  it('names the consequence in the options text module', () => {
    expect(OPTIONS_STRINGS.renameWarning).toBe(
      'Заметки с прежним именем будут удалены на этом устройстве',
    );
    expect(OPTIONS_STRINGS.renameCancel).toBe('Отмена');
    expect(OPTIONS_STRINGS.renameContinue).toBe('Продолжить');
  });
});

describe('AC5 — Cancel writes nothing', () => {
  it('leaves the stored name and every note byte-identical when the reader cancels', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();
    const before = storedJson(port);

    const decision = await service.saveName(NEW_NAME);
    expect(decision.kind).toBe('confirm');

    // `Отмена` is the component's own signal: it clears the warning and writes nothing,
    // so the service's state and the store are both untouched.
    expect(writesOf(port)).toEqual([]);
    expect(storedJson(port)).toBe(before);
    expect((await service.open()).name).toBe(OLD_NAME);
  });
});

describe('AC6 — Continue saves the name and deletes the notes, in that order', () => {
  it('writes the settings key before the first page slot is touched', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();

    const view = await service.confirmRename(NEW_NAME);

    expect(view).toEqual({ name: NEW_NAME, outcome: 'saved', refusal: null });
    const order = writeOrder(port);
    // The save precedes every deletion: the settings write comes first, the slot
    // removals after it. `A174` — a failed name save must delete nothing.
    expect(order[0]).toBe(`set:${SETTINGS_KEY}`);
    expect(order.slice(1)).toEqual([`remove:${SLOT_A}`, `set:${PAGE_INDEX_KEY}`, `remove:${SLOT_B}`, `set:${PAGE_INDEX_KEY}`]);
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
    expect(port.snapshot()[SLOT_A]).toBeUndefined();
    expect(port.snapshot()[SLOT_B]).toBeUndefined();
  });

  it('deletes every note of the previous name on every page and keeps the other authors', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: OLD_NAME });
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_A, PAGE_B]));
    const foreignA = recordOf('foreign-a', PAGE_A, OTHER_NAME);
    port.seed(entryStorageKey(PAGE_A), slotValue([recordOf('old-a', PAGE_A, OLD_NAME), foreignA]));
    port.seed(entryStorageKey(PAGE_B), slotValue([recordOf('old-b', PAGE_B, OLD_NAME)]));
    const service = serviceFor(port);
    await service.open();

    const view = await service.confirmRename(NEW_NAME);

    expect(view.outcome).toBe('saved');
    expect(port.snapshot()[SLOT_A]).toEqual(slotValue([foreignA]));
    expect(port.snapshot()[SLOT_B]).toBeUndefined();
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
  });

  it('keeps the stored sync half of the settings record across the rename', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, {
      name: OLD_NAME,
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
    });
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_A]));
    port.seed(entryStorageKey(PAGE_A), slotValue([recordOf('old-a', PAGE_A, OLD_NAME)]));
    const service = serviceFor(port);
    await service.open();

    await service.confirmRename(NEW_NAME);

    expect(port.snapshot()[SETTINGS_KEY]).toEqual({
      name: NEW_NAME,
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
    });
  });
});

describe('AC7 — no confirmation when the store holds no note of the stored name', () => {
  it('saves without asking when the store holds no note of the stored name', async () => {
    const port = emptyStore();
    const service = serviceFor(port);
    await service.open();
    const foreignBefore = port.snapshot()[entryStorageKey(PAGE_A)];

    const decision = await service.saveName(NEW_NAME);

    expect(decision.kind).toBe('saved');
    expect(decision.view).toEqual({ name: NEW_NAME, message: 'saved' });
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
    // The other author's note did not move.
    expect(port.snapshot()[entryStorageKey(PAGE_A)]).toBe(foreignBefore);
  });

  it('saves without asking when the typed name is the stored name', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();

    const decision = await service.saveName(OLD_NAME);

    expect(decision.kind).toBe('saved');
    expect(decision.view).toEqual({ name: OLD_NAME, message: 'saved' });
    // Only the settings write: no note of the stored name was deleted.
    expect(writeOrder(port)).toEqual([`set:${SETTINGS_KEY}`]);
    expect(port.snapshot()[SLOT_A]).toBeDefined();
    expect(port.snapshot()[SLOT_B]).toBeDefined();
  });

  it('saves without asking when the index lists no page at all', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, { name: OLD_NAME });
    const service = serviceFor(port);
    await service.open();

    expect((await service.saveName(NEW_NAME)).kind).toBe('saved');
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
  });
});

describe('AC8 — a failed name save leaves every note in place and reports the failure', () => {
  it('deletes nothing when the settings write fails, and reports the code', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();
    const notesBefore = {
      a: port.snapshot()[SLOT_A],
      b: port.snapshot()[SLOT_B],
      index: port.snapshot()[PAGE_INDEX_KEY],
    };
    port.failNextWrite('quota');

    const view = await service.confirmRename(NEW_NAME);

    expect(view).toEqual({ name: OLD_NAME, outcome: null, refusal: 'quota' });
    // The name was not saved, so nothing was deleted and nothing moved.
    expect(port.snapshot()[SLOT_A]).toBe(notesBefore.a);
    expect(port.snapshot()[SLOT_B]).toBe(notesBefore.b);
    expect(port.snapshot()[PAGE_INDEX_KEY]).toBe(notesBefore.index);
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: OLD_NAME });
  });

  it('refuses an empty name before the sweep and deletes nothing', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();
    const before = storedJson(port);

    const view = await service.confirmRename('   ');

    expect(view).toEqual({ name: OLD_NAME, outcome: null, refusal: 'name_required' });
    expect(writesOf(port)).toEqual([]);
    expect(storedJson(port)).toBe(before);
  });

  it('reports the partial deletion when the name saved but a page could not be cleaned', async () => {
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();
    port.failWriteOn(SLOT_A, 'quota');

    const view = await service.confirmRename(NEW_NAME);

    // The name stays saved: undoing it would be a second write the reader did not ask for.
    expect(view).toEqual({ name: NEW_NAME, outcome: 'sweep_failed', refusal: null });
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
    // The page whose write failed kept its note; the sweep continued to the other page.
    expect(port.snapshot()[SLOT_A]).toEqual(slotValue([recordOf('old-a', PAGE_A, OLD_NAME)]));
    expect(port.snapshot()[SLOT_B]).toBeUndefined();
    expect(RENAME_OUTCOME_TEXT.sweep_failed).toBe(
      'Имя сохранено, но часть заметок с прежним именем удалить не удалось',
    );
    expect(renameOutcomeText('sweep_failed')).toBe(RENAME_OUTCOME_TEXT.sweep_failed);
  });
});

describe('AC9 — the page’s memory-held foreign notes are dropped on a rename', () => {
  it('drops the settings name so the next settings read rebuilds the foreign list', async () => {
    // The page's foreign notes are memory only and are rebuilt from the settings read
    // on the next load (`A163`): a rename writes the settings key, and the storage
    // watch repaints the page from the new name. This service therefore holds no
    // memory of its own — the proof is that a rename leaves nothing behind: the
    // settings read after the rename answers the new name.
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();

    await service.confirmRename(NEW_NAME);

    const reopened = serviceFor(port);
    expect(await reopened.open()).toEqual({ name: NEW_NAME, message: null });
    // The sweep removed every note of the old name, so the next settings read cannot
    // present an old-name note as foreign: there is none left to present.
    expect(port.snapshot()[SLOT_A]).toBeUndefined();
    expect(port.snapshot()[SLOT_B]).toBeUndefined();
  });

  it('writes the settings key, which is the storage change the page reacts to', async () => {
    // The page's memory is not reachable from here: it is a closure in the content
    // script (`src/content/sync/foreign-notes.ts`, `A163`). What the options page owes
    // the page is the storage change, and `A60` makes the settings key the trigger the
    // page's storage watch repaints on. So the rename's first write is the settings key,
    // and the page's next pass rebuilds its foreign list from the new name.
    const port = renameableStore();
    const service = serviceFor(port);
    await service.open();

    await service.confirmRename(NEW_NAME);

    expect(writeOrder(port)[0]).toBe(`set:${SETTINGS_KEY}`);
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
  });

  it('rebuilds the page memory from the new name, so no old-name note is presentable', async () => {
    // The memory's own rebuild is `replace(rows, currentName)`: the reader's own rows are
    // dropped and the rest are kept. Run it the way the page runs it after the settings
    // change, with the name the store now holds, and the old-name note cannot survive.
    const memory = createForeignNotes();
    memory.replace(
      [
        { id: 'old-a', page_id: PAGE_A, author_id: OLD_NAME, text: 'x', comment: 'c', anchor: WIRE_ANCHOR, created_at: NOW, updated_at: NOW },
        { id: 'other', page_id: PAGE_A, author_id: OTHER_NAME, text: 'y', comment: 'd', anchor: WIRE_ANCHOR, created_at: NOW, updated_at: NOW },
      ],
      OLD_NAME,
    );
    expect(memory.all().map((note) => note.entry.id)).toEqual(['other']);

    memory.replace([], NEW_NAME);
    expect(memory.all()).toEqual([]);
  });
});

describe('AC10 — the Russian wording lives in the options text module and nowhere else', () => {
  it('keeps the three rename strings in src/options/text.ts and out of the component', () => {
    const text = readFileSync(join(projectRoot, 'src', 'options', 'text.ts'), 'utf8');
    expect(text).toContain(OPTIONS_STRINGS.renameWarning);
    expect(text).toContain(OPTIONS_STRINGS.renameCancel);
    expect(text).toContain(OPTIONS_STRINGS.renameContinue);

    // Comments may name the buttons; a string literal may not. The code-only text is
    // what the shipped literal scan reads, and the template reaches the strings through
    // the module's own bindings.
    const component = codeOnly(
      readFileSync(join(projectRoot, 'src', 'options', 'options.component.ts'), 'utf8'),
    );
    expect(component).not.toContain(OPTIONS_STRINGS.renameWarning);
    expect(component).not.toContain(OPTIONS_STRINGS.renameCancel);
    expect(component).not.toContain(OPTIONS_STRINGS.renameContinue);
    // The component renders the strings through the module's own bindings.
    expect(component).toMatch(/OPTIONS_STRINGS\.renameWarning/);
    expect(component).toMatch(/OPTIONS_STRINGS\.renameCancel/);
    expect(component).toMatch(/OPTIONS_STRINGS\.renameContinue/);
  });

  it('keeps the outcome sentence in the text module and nowhere else', () => {
    const text = readFileSync(join(projectRoot, 'src', 'options', 'text.ts'), 'utf8');
    expect(text).toContain(RENAME_OUTCOME_TEXT.sweep_failed);
    const component = codeOnly(
      readFileSync(join(projectRoot, 'src', 'options', 'options.component.ts'), 'utf8'),
    );
    expect(component).not.toContain(RENAME_OUTCOME_TEXT.sweep_failed);
  });

  it('keeps the rename outcome map total over its two states', () => {
    expect(Object.keys(RENAME_OUTCOME_TEXT).sort()).toEqual(['saved', 'sweep_failed']);
    for (const [code, sentence] of Object.entries(RENAME_OUTCOME_TEXT)) {
      expect(sentence, code).not.toBe('');
      expect(sentence, code).toMatch(/[А-Яа-я]/);
    }
    expect(RENAME_OUTCOME_TEXT.saved).toBe(OPTIONS_STRINGS.saved);
  });
});

/**
 * The component half of the rename rule, driven through its real handlers.
 *
 * The component's field initializers call `inject`, so the smallest honest handle on it
 * is the prototype plus the fields the handlers read — the same idiom
 * `tests/options-window-look.spec.ts` uses for `messageClass`. The service is the real
 * one over the in-memory port, so the handlers run the shipped save/confirm wiring and
 * the assertions are on the port snapshot and the port call log, not on a stub.
 */
function componentOver(port: MemoryStoragePort): {
  surface: {
    draft: () => { value: string };
    renameConfirm: () => boolean;
    renameOutcome: () => { outcome: string | null } | null;
    view: () => { name: string; message: string | null };
    onSave: () => void;
    onRenameCancel: () => void;
    onRenameContinue: () => void;
    setDraft: (value: string) => void;
  };
  service: AuthorNameService;
} {
  const service = serviceFor(port);
  const surface = Object.create(OptionsComponent.prototype) as Record<string, unknown>;
  const draft = { value: '' };
  let confirm = false;
  let outcome: { outcome: string | null } | null = null;
  let view: { name: string; message: string | null } = { name: '', message: null };
  const signals = {
    draft: Object.assign((): { value: string } => draft, {
      set: (next: { value: string }): void => {
        draft.value = next.value;
      },
    }),
    renameConfirm: Object.assign((): boolean => confirm, {
      set: (next: boolean): void => {
        confirm = next;
      },
    }),
    renameOutcome: Object.assign((): { outcome: string | null } | null => outcome, {
      set: (next: { outcome: string | null } | null): void => {
        outcome = next;
      },
    }),
    view: Object.assign((): { name: string; message: string | null } => view, {
      set: (next: { name: string; message: string | null }): void => {
        view = next;
      },
    }),
  };
  Object.assign(surface, { service, ...signals });
  return {
    surface: {
      draft: (): { value: string } => draft,
      renameConfirm: (): boolean => confirm,
      renameOutcome: (): { outcome: string | null } | null => outcome,
      view: (): { name: string; message: string | null } => view,
      onSave: (): void => {
        void (surface['saveDraft'] as () => Promise<void>).call(surface);
      },
      onRenameCancel: (): void => {
        (surface['onRenameCancel'] as () => void).call(surface);
      },
      onRenameContinue: (): void => {
        (surface['onRenameContinue'] as () => void).call(surface);
      },
      setDraft: (value: string): void => {
        draft.value = value;
      },
    },
    service,
  };
}

/** Waits for the handler's fire-and-forget promise to settle. */
async function settled(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('the component shows the warning and its two answers (t17-04 AC4, AC5, AC6)', () => {
  it('raises the warning on Сохранить and writes nothing until the reader answers', async () => {
    const port = renameableStore();
    const { surface, service } = componentOver(port);
    await service.open();
    surface.setDraft(NEW_NAME);
    const before = storedJson(port);

    surface.onSave();
    await settled();

    expect(surface.renameConfirm()).toBe(true);
    expect(writesOf(port)).toEqual([]);
    expect(storedJson(port)).toBe(before);
  });

  it('clears the warning on Отмена and leaves the store byte-identical', async () => {
    const port = renameableStore();
    const { surface, service } = componentOver(port);
    await service.open();
    surface.setDraft(NEW_NAME);
    const before = storedJson(port);

    surface.onSave();
    await settled();
    surface.onRenameCancel();

    expect(surface.renameConfirm()).toBe(false);
    expect(writesOf(port)).toEqual([]);
    expect(storedJson(port)).toBe(before);
    // The field keeps the typed value, so the reader can fix the name without retyping.
    expect(surface.draft().value).toBe(NEW_NAME);
  });

  it('saves the name and deletes the notes on Продолжить, in that order', async () => {
    const port = renameableStore();
    const { surface, service } = componentOver(port);
    await service.open();
    surface.setDraft(NEW_NAME);

    surface.onSave();
    await settled();
    surface.onRenameContinue();
    await settled();

    expect(surface.renameConfirm()).toBe(false);
    expect(surface.renameOutcome()?.outcome).toBe('saved');
    expect(surface.view()).toEqual({ name: NEW_NAME, message: 'saved' });
    const order = writeOrder(port);
    expect(order[0]).toBe(`set:${SETTINGS_KEY}`);
    expect(order.slice(1)).toEqual([`remove:${SLOT_A}`, `set:${PAGE_INDEX_KEY}`, `remove:${SLOT_B}`, `set:${PAGE_INDEX_KEY}`]);
    expect(port.snapshot()[SETTINGS_KEY]).toEqual({ name: NEW_NAME });
  });

  it('saves without a warning when the store holds no note of the stored name', async () => {
    const port = emptyStore();
    const { surface, service } = componentOver(port);
    await service.open();
    surface.setDraft(NEW_NAME);

    surface.onSave();
    await settled();

    expect(surface.renameConfirm()).toBe(false);
    expect(surface.view()).toEqual({ name: NEW_NAME, message: 'saved' });
    expect(writeOrder(port)).toEqual([`set:${SETTINGS_KEY}`]);
  });
});
