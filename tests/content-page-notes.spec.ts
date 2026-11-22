import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NOTES_QUERY_MESSAGE, PAGE_NOTES_UPDATED_MESSAGE } from '../src/core/page-notes-query';
import type { PageNotesUpdate } from '../src/core/page-notes-query';
import { createForeignNotes } from '../src/content/sync/foreign-notes';
import type { ForeignLoadOutcome, ForeignNotes } from '../src/content/sync/foreign-notes';
import { attachPageNotesChannel } from '../src/content/sync/page-notes-channel';
import { codeOnly } from './support/build-script-guards';
import type { ExtraEntry } from '../src/content/paint/paint-plan';
import type { RemoteNote } from '../src/core/sync-client';
import type { StoragePort } from '../src/core/storage-port';
import { SYNC_OFF_KEY } from '../src/core/storage-keys';
import { MemoryStoragePort } from './support/memory-storage-port';

/**
 * The page's answer to the popup (Stage 17, `t17-02` AC2-AC7; rulings `A167`, `A168`,
 * `A169`, with `A163` and `A166` unchanged; `t17-06` AC11 for the two `A183` cases at the
 * end).
 *
 * What this file pins, and each in its own words:
 *
 * - **the answer** (`A167`): the popup's question arrives, the page runs its load once,
 *   and the answer is the memory's rows plus the load's outcome — one row per author, in
 *   first-appearance order, and never the notes themselves.
 * - **the answer does not wait for the load** (`A183`, `t17-06`): the same question is
 *   answered from the memory in the same turn, and the load that lands afterwards is
 *   **announced** to whoever is open. The load still runs once per document, and a second
 *   question joins it instead of starting a second request.
 * - **the aggregate switch** (`A168`): one operation message flips every note of one
 *   author in this document's memory. No port exists in this module's wiring, so the
 *   absence of a storage write is structural — the assertion below is on the API and on
 *   the paint input the pass receives.
 * - **the local dismissal** (`A168`): one operation message drops that author's notes
 *   from the view, the pass is asked for one more pass, and the server is never called
 *   (the transport is a recorder that would count a call).
 * - **the remembered failure** (`A169`): the outcome of the load is answered to the next
 *   question, and a successful load clears it.
 * - **the silence** (`A166`): a question that is not this module's message is answered
 *   with nothing at all — no `respond` call and no `true` return.
 *
 * The load seam is a recorder here: this file is about the **channel**, and the request
 * itself is `tests/content-sync-notes.spec.ts`'s subject.
 */

// The default (Node) environment on purpose: this module owns no DOM. It answers a
// message, reads a memory and asks the pass for one more pass, and the pass is the
// recorder below — the paint itself is `tests/content-page-painter.spec.ts`'s subject.
const projectRoot = process.cwd();

function remote(overrides: Partial<RemoteNote> = {}): RemoteNote {
  return {
    id: 'their001',
    page_id: 'https://example.com/a',
    author_id: 'Вася',
    text: 'selected text',
    comment: 'their note',
    anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    created_at: '2026-01-02T03:04:05.006Z',
    updated_at: '2026-01-02T03:04:05.006Z',
    ...overrides,
  };
}

/** A painter stub that records what the pass was handed and how often it ran. */
function painterStub(): {
  painter: {
    setExtraEntries(entries: readonly ExtraEntry[] | null): void;
    refresh(): Promise<unknown>;
  };
  handed: (readonly ExtraEntry[] | null)[];
  refreshes: () => number;
} {
  const handed: (readonly ExtraEntry[] | null)[] = [];
  let refreshes = 0;
  return {
    painter: {
      setExtraEntries(entries): void {
        handed.push(entries);
      },
      refresh(): Promise<unknown> {
        refreshes += 1;
        return Promise.resolve();
      },
    },
    handed,
    refreshes: (): number => refreshes,
  };
}

/** One microtask turn is not enough: the load is `await`ed inside the handler. */
async function settle(): Promise<void> {
  await new Promise<void>((resolveTurn) => {
    setTimeout(resolveTurn, 0);
  });
}

/**
 * One attachment: the memory, the recorder and a load that answers what the test says.
 *
 * `loadOutcome` may be a function, so a case can make the load **slow** (a promise it
 * resolves by hand) — which is the state `A183` is about: the popup asked, the answer was
 * empty, and the list arrives later.
 */
function attach(options: {
  notes?: readonly RemoteNote[];
  outcome?: ForeignLoadOutcome | (() => Promise<ForeignLoadOutcome>);
  /** The page's key, read by the channel when a press writes the off list (`A187`). */
  pageKey?: () => string | null;
  /** The port the off list is written through; absent keeps the memory-only shape. */
  port?: StoragePort;
} = {}): {
  memory: ForeignNotes;
  channel: ReturnType<typeof attachPageNotesChannel>;
  handed: (readonly ExtraEntry[] | null)[];
  refreshes: () => number;
  loads: () => number;
  announced: PageNotesUpdate[];
  answerOf: (message: unknown) => Promise<{ responded: boolean; value: unknown; returned: boolean | undefined }>;
  askNow: (message: unknown) => { responded: boolean; value: unknown; returned: boolean | undefined };
} {
  const memory = createForeignNotes();
  if (options.notes !== undefined) {
    memory.replace(options.notes, 'reader-one');
  }
  const stub = painterStub();
  const announced: PageNotesUpdate[] = [];
  let loads = 0;
  const answer = options.outcome ?? { ok: false, code: 'network' };
  const channel = attachPageNotesChannel({
    foreign: memory,
    painter: stub.painter,
    load: async (): Promise<ForeignLoadOutcome> => {
      loads += 1;
      const outcome = typeof answer === 'function' ? await answer() : answer;
      // The memory is what a real `loadIntoMemory` would have replaced; the seam answers
      // the outcome only, so a case that cares about the rows writes them itself.
      return outcome;
    },
    announce: (update): void => {
      announced.push(update);
    },
    // `t17-14`: the off list is written through the port and filed under the page key. A
    // case that does not care passes neither, and the channel then persists nothing.
    ...(options.port === undefined ? {} : { port: options.port }),
    pageKey: options.pageKey ?? ((): string | null => null),
  });

  const askNow = (message: unknown): { responded: boolean; value: unknown; returned: boolean | undefined } => {
    let responded = false;
    let value: unknown = null;
    const returned = channel.onMessage(message, {}, (answerIn: unknown): void => {
      responded = true;
      value = answerIn;
    });
    return { responded, value, returned };
  };

  return {
    memory,
    channel,
    handed: stub.handed,
    refreshes: stub.refreshes,
    loads: (): number => loads,
    announced,
    askNow,
    answerOf: async (message: unknown) => {
      const first = askNow(message);
      await settle();
      return first;
    },
  };
}

/** A promise the test resolves by hand, for the slow-load cases of `A183`. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('AC2 the page answers the popup with its rows and its load outcome (A167, A169)', () => {
  it('answers one row per author, in first-appearance order, with the aggregate flag', async () => {
    const a = attach({
      notes: [remote(), remote({ id: 'their002' }), remote({ id: 'petya001', author_id: 'Петя' })],
      outcome: { ok: true, added: 3 },
    });

    const answer = await a.answerOf({ type: NOTES_QUERY_MESSAGE });

    expect(answer.responded).toBe(true);
    expect(answer.value).toEqual({
      rows: [
        { authorName: 'Вася', count: 2, allVisible: true },
        { authorName: 'Петя', count: 1, allVisible: true },
      ],
      syncFailed: false,
    });
  });

  it('answers from the memory at once, and the load\'s outcome reaches the next question (A169, A183)', async () => {
    const failed = attach({ outcome: { ok: false, code: 'network' } });

    const first = await failed.answerOf({ type: NOTES_QUERY_MESSAGE });
    // `t17-06` / `A183`: the first answer is the memory as it stood, answered in the same
    // turn as the question — a popup must never wait for a server to learn it has no rows.
    expect(first.responded).toBe(true);
    expect((first.value as { syncFailed: boolean }).syncFailed).toBe(false);
    expect(failed.loads()).toBe(1);
    // The load ran, so its outcome is remembered and the **next** question states it.
    expect(failed.channel.loadCode()).toBe('network');

    const second = await failed.answerOf({ type: NOTES_QUERY_MESSAGE });
    expect((second.value as { syncFailed: boolean }).syncFailed).toBe(true);

    // The failure stands until an answer that succeeds: the third question asks the page
    // to try again (`A164` says the reader's retry is the press).
    const ok = attach({ notes: [remote()], outcome: { ok: true, added: 1 } });
    const third = await ok.answerOf({ type: NOTES_QUERY_MESSAGE });
    expect((third.value as { syncFailed: boolean }).syncFailed).toBe(false);
    expect(ok.channel.loadCode()).toBeNull();
  });

  it('answers the plain message name as the same question, so both spellings agree', async () => {
    const a = attach({ notes: [remote()], outcome: { ok: true, added: 1 } });

    const answer = await a.answerOf(NOTES_QUERY_MESSAGE);
    expect(answer.responded).toBe(true);
    expect((answer.value as { rows: { authorName: string }[] }).rows.map((row) => row.authorName)).toEqual([
      'Вася',
    ]);
  });

  it('carries none of the notes themselves into the answer', async () => {
    const a = attach({ notes: [remote()], outcome: { ok: true, added: 1 } });

    const answer = await a.answerOf({ type: NOTES_QUERY_MESSAGE });
    const rendered = JSON.stringify(answer.value);
    for (const forbidden of ['their note', 'selected text', 'anchor', 'their001']) {
      expect(rendered, forbidden).not.toContain(forbidden);
    }
  });
});

describe('AC3 the aggregate switch is one message and one memory write (A168)', () => {
  it('switches every note of that author and repaints once', async () => {
    const a = attach({
      notes: [remote(), remote({ id: 'their002' }), remote({ id: 'petya001', author_id: 'Петя' })],
      outcome: { ok: true, added: 3 },
    });
    a.handed.length = 0;

    const answer = await a.answerOf({
      type: NOTES_QUERY_MESSAGE,
      op: 'switch',
      authorName: 'Вася',
      visible: false,
    });

    expect(answer.responded).toBe(true);
    expect(a.memory.visibilityOf('their001')).toBe(false);
    expect(a.memory.visibilityOf('their002')).toBe(false);
    // The other author is untouched: the operation is addressed by name (`A99`).
    expect(a.memory.visibilityOf('petya001')).toBe(true);
    // One more pass over the current list, exactly as a successful load paints.
    expect(a.refreshes()).toBe(1);
    expect(a.handed).toEqual([a.memory.paintInput()]);
    expect(answer.value).toEqual({
      rows: [
        { authorName: 'Вася', count: 2, allVisible: false },
        { authorName: 'Петя', count: 1, allVisible: true },
      ],
      syncFailed: false,
    });
  });

  it('switches back on in one message, with no storage write and no request', async () => {
    const a = attach({ notes: [remote()] });
    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false });
    a.handed.length = 0;

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: true });

    expect(a.memory.visibilityOf('their001')).toBe(true);
    expect(a.handed).toEqual([a.memory.paintInput()]);
    // The load is the only thing that would touch a server, and a switch does not run it.
    expect(a.loads()).toBe(0);
  });

  it('reaches no storage API and writes no note: the record is the off list, not a note (A163, A187)', () => {
    const source = codeOnly(
      readFileSync(join(projectRoot, 'src', 'content', 'sync', 'page-notes-channel.ts'), 'utf8'),
    );
    // The structural proof of `A163` for this path: no storage API, no storage key and no
    // entry-write name is reachable from here. The channel holds a port since `t17-14`,
    // and what it writes through that port is core's **off list** — author names per page
    // (`A187`), a decision about a name and never a foreign note. So the pin narrowed to
    // the two things `A163` really protects: no `chrome.storage` call is made in this
    // module, and no write of a note is importable from it. The key name appears in prose
    // only, and the scan reads code.
    expect(source).not.toContain('chrome.storage');
    expect(source).not.toContain('entry-store-write');
    for (const noteWrite of ['createEntry', 'updateEntryComment', 'deleteEntry', 'setVisible(\n']) {
      expect(source, noteWrite).not.toContain(noteWrite);
    }
  });
});

describe('AC4 the dismissal is local and repaints through the pass (A168)', () => {
  it('drops that author\'s notes from the view and answers the state that is left', async () => {
    const a = attach({ notes: [remote(), remote({ id: 'their002' }), remote({ id: 'petya001', author_id: 'Петя' })] });
    a.handed.length = 0;

    const answer = await a.answerOf({
      type: NOTES_QUERY_MESSAGE,
      op: 'dismiss',
      authorName: 'Вася',
    });

    expect(a.memory.all().map((note) => note.entry.authorName)).toEqual(['Петя']);
    expect(a.refreshes()).toBe(1);
    expect(a.handed).toEqual([a.memory.paintInput()]);
    expect(answer.value).toEqual({
      rows: [{ authorName: 'Петя', count: 1, allVisible: true }],
      syncFailed: false,
    });
    // Nothing was asked of a server: the dismissal is a local removal (answer 5).
    expect(a.loads()).toBe(0);
  });

  it('hands the pass `null` when the last foreign author goes, so the page forgets it', async () => {
    const a = attach({ notes: [remote()] });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'dismiss', authorName: 'Вася' });

    // The same call `sync-notes.ts` makes when the server has no notes left for a page.
    expect(a.handed).toEqual([null]);
    expect(a.memory.all()).toEqual([]);
  });
});

describe('AC7 a question this page does not own is answered with nothing (A166)', () => {
  it('ignores every other message, with no response and no `true` return', () => {
    const a = attach({ notes: [remote()] });
    const answered: unknown[] = [];

    for (const message of [
      'another:message',
      undefined,
      null,
      42,
      { type: 'another:message' },
      { type: NOTES_QUERY_MESSAGE, op: 'unknown-op', authorName: 'Вася' },
      { type: NOTES_QUERY_MESSAGE, op: 'dismiss' },
      { type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: '' },
      // The popup's own announcement name is not a question this page answers: the two
      // directions of the channel are distinct, and a page that answered its sibling's
      // notice would be a second answerer for nothing (`A183`).
      { type: PAGE_NOTES_UPDATED_MESSAGE, rows: [] },
      PAGE_NOTES_UPDATED_MESSAGE,
    ]) {
      const returned = a.channel.onMessage(message, {}, (answer: unknown): void => {
        answered.push(answer);
      });
      // No response promise is taken and no answer is produced: the page cannot become a
      // second answerer for a message that is not its own.
      expect(returned, JSON.stringify(message) ?? 'undefined').toBeUndefined();
    }

    expect(answered).toEqual([]);
    // And no message was treated as an operation: the memory is exactly as it was.
    expect(a.memory.all()).toHaveLength(1);
    expect(a.loads()).toBe(0);
    expect(a.refreshes()).toBe(0);
  });

  it('answers no rows and no failure for a page that holds nothing and never loaded', () => {
    const a = attach();

    expect(a.channel.result()).toEqual({ rows: [], syncFailed: false });
    expect(a.channel.loadCode()).toBeNull();
  });
});

describe('AC11 a late list still reaches a popup that is already open (A183, t17-06)', () => {
  it('answers the question without waiting for the load, and the load still runs once', async () => {
    const slow = deferred<ForeignLoadOutcome>();
    const a = attach({ outcome: async () => await slow.promise });

    const asked = a.askNow({ type: NOTES_QUERY_MESSAGE });

    // The question is answered **in the same turn**: no `true`, no callback taken, and the
    // rows are the memory's rows — empty here, because the load has not landed.
    expect(asked.returned).toBeUndefined();
    expect(asked.responded).toBe(true);
    expect(asked.value).toEqual({ rows: [], syncFailed: false });
    expect(a.loads()).toBe(1);

    slow.resolve({ ok: true, added: 0 });
    await settle();
    // One load, and **nothing announced**: the answer did not move, and a message saying
    // what the popup already holds is the one that closes the loop (`t17-08`). The popup
    // still learns about a load that really changed the rows — the case above pins that.
    expect(a.loads()).toBe(1);
    expect(a.announced).toEqual([]);
  });

  it('joins the load already in flight instead of asking the server twice', async () => {
    const slow = deferred<ForeignLoadOutcome>();
    const a = attach({ outcome: async () => await slow.promise });

    a.askNow({ type: NOTES_QUERY_MESSAGE });
    a.askNow({ type: NOTES_QUERY_MESSAGE });
    a.askNow({ type: NOTES_QUERY_MESSAGE });

    expect(a.loads()).toBe(1);
    slow.resolve({ ok: true, added: 0 });
    await settle();
    expect(a.loads()).toBe(1);
    // **No** announcement: the load changed nothing, and an announcement that repeats what
    // the popup already holds is the message that made the two halves loop (`t17-08`). What
    // this case is about is the join — three questions, one request — and that is above.
    expect(a.announced).toHaveLength(0);

    // A question after the load answered starts **no** new request (`t17-08`): the answer
    // is valid for the life of the document, and re-asking on every question is what made
    // the popup and the page feed each other. The retry belongs to the reader and goes
    // through `reload()`, which nothing on the question path calls.
    a.askNow({ type: NOTES_QUERY_MESSAGE });
    expect(a.loads()).toBe(1);
  });

  it('announces the rows the load left, in the shape the answer uses', async () => {
    // The memory must change **during** the load, the way `loadIntoMemory` changes it, or
    // there is nothing to announce (`t17-08`: an announcement that says what the popup
    // already holds is the message that made the two halves feed each other).
    let memory: ForeignNotes | null = null;
    const a = attach({
      outcome: (): Promise<ForeignLoadOutcome> => {
        memory?.replace([remote()], 'reader-one');
        return Promise.resolve({ ok: true, added: 1 });
      },
    });
    memory = a.memory;

    a.askNow({ type: NOTES_QUERY_MESSAGE });
    await settle();

    expect(a.announced).toEqual([{ rows: [{ authorName: 'Вася', count: 1, allVisible: true }] }]);
    // And the announcement carries no note: an author name, a count and a flag (`A167`).
    expect(JSON.stringify(a.announced)).not.toContain('their note');
  });

  it('announces a failed load too, so the popup\'s notice line is not left out', async () => {
    const a = attach({ outcome: { ok: false, code: 'http' } });

    a.askNow({ type: NOTES_QUERY_MESSAGE });
    await settle();

    expect(a.announced).toEqual([{ rows: [] }]);
    expect(a.channel.loadCode()).toBe('http');
    // The next question states the failure (the popup asks again when it hears this).
    const second = await a.answerOf({ type: NOTES_QUERY_MESSAGE });
    expect((second.value as { syncFailed: boolean }).syncFailed).toBe(true);
  });

  it('survives a load seam that rejects, because the page has no failure to show there', async () => {
    const a = attach({
      outcome: async () => {
        throw new Error('a seam that breaks its contract');
      },
    });

    expect((): unknown => a.askNow({ type: NOTES_QUERY_MESSAGE })).not.toThrow();
    await settle();
    // The page keeps answering, and nothing was announced for a load that never finished.
    expect(a.announced).toEqual([]);
    expect(a.channel.result()).toEqual({ rows: [], syncFailed: false });
  });
});

describe('the message names are one constant on both sides of the channel', () => {
  it('is imported by the popup\'s half and by the page\'s half, and spelled nowhere else', () => {
    // `A167` is one contract between two bundles: the two halves must import the name
    // rather than repeat it, or a rename in one of them becomes a silent no-answer. `A183`
    // adds the announcement, and it is held to the same rule.
    for (const path of ['src/content/sync/page-notes-channel.ts', 'src/popup/page-notes-channel.ts']) {
      const source = readFileSync(join(projectRoot, path), 'utf8');
      expect(source, path).toMatch(/NOTES_QUERY_MESSAGE/);
      expect(source, path).toMatch(/from '[^']*core\/page-notes-query'/);
      // The literal appears exactly once in the whole shipped source, in the module that
      // declares it: a second spelling is a second contract.
      expect(source, path).not.toContain("'inlinenotes:page-notes'");
    }
    // The announcement's name is spelled in `src/content/main.ts` (the page's send) and in
    // the popup's half (its ear), and neither spells the literal.
    for (const path of ['src/content/main.ts', 'src/popup/page-notes-channel.ts']) {
      const source = readFileSync(join(projectRoot, path), 'utf8');
      expect(source, path).toMatch(/PAGE_NOTES_UPDATED_MESSAGE/);
      expect(source, path).not.toContain("'inlinenotes:page-notes-updated'");
    }
    const declarers = readFileSync(
      join(projectRoot, 'src', 'core', 'page-notes-query.ts'),
      'utf8',
    );
    expect(declarers).toContain("'inlinenotes:page-notes'");
    expect(declarers).toContain("'inlinenotes:page-notes-updated'");
  });
});
/**
 * The off list the press writes (task `t17-14`, rulings `A187`-`A189`).
 *
 * What is asserted here, and each in the reader's terms:
 *
 * - a press of a foreign row leaves the author in `sync-off:v1` under the page's key, a
 *   press back on removes them, and an empty list removes the page's entry (`A187`);
 * - a **delete** removes the author from the record, so the next load shows them again —
 *   the reader's `1a` (`A188`);
 * - the record holds an author name and no note (`A163` unchanged);
 * - the memory is not re-read on a press, and it moves before the record does (`A189`).
 */
describe('AC1, AC5 a foreign row\'s press writes the off list and its delete clears it (A187, A188)', () => {
  /** A port holding one page's off list, with its call log. */
  function offPort(authorNames: readonly string[] = []): MemoryStoragePort {
    const port = new MemoryStoragePort();
    if (authorNames.length > 0) {
      port.seed(SYNC_OFF_KEY, { version: 1, pages: { [PAGE_KEY]: [...authorNames] } });
    }
    return port;
  }

  const PAGE_KEY = 'https://example.com/a';

  it('records the author on the press off, and removes them on the press on', async () => {
    const port = offPort();
    const a = attach({ notes: [remote()], port, pageKey: () => PAGE_KEY });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false });
    await settle();
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual({ version: 1, pages: { [PAGE_KEY]: ['Вася'] } });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: true });
    await settle();
    // The last name leaves, so the page leaves the record, and then the key itself goes.
    expect(SYNC_OFF_KEY in port.snapshot()).toBe(false);
    // The memory followed the press both times (`A189`).
    expect(a.memory.visibilityOf('their001')).toBe(true);
  });

  it('writes author names only: the stored value carries no note (A163, A187)', async () => {
    const port = offPort();
    const a = attach({ notes: [remote()], port, pageKey: () => PAGE_KEY });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false });
    await settle();

    const stored = JSON.stringify(port.snapshot()[SYNC_OFF_KEY]);
    expect(stored).toBe(JSON.stringify({ version: 1, pages: { [PAGE_KEY]: ['Вася'] } }));
    for (const forbidden of ['their note', 'selected text', 'their001', 'anchor', 'comment']) {
      expect(stored, forbidden).not.toContain(forbidden);
    }
  });

  it('removes the author from the record on delete, so the next load shows them (1a)', async () => {
    const port = offPort(['Вася', 'Петя']);
    const a = attach({
      notes: [remote(), remote({ id: 'petya001', author_id: 'Петя' })],
      port,
      pageKey: () => PAGE_KEY,
    });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'dismiss', authorName: 'Вася' });
    await settle();

    // The row is gone from this document, and the record no longer names that author, so a
    // reload brings them back switched on.
    expect(a.memory.all().map((note) => note.entry.authorName)).toEqual(['Петя']);
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual({ version: 1, pages: { [PAGE_KEY]: ['Петя'] } });
    // Still local: the delete called no server (`A168`).
    expect(a.loads()).toBe(0);
  });

  it('writes nothing at all when the deleted author was not switched off', async () => {
    const port = offPort();
    const a = attach({ notes: [remote()], port, pageKey: () => PAGE_KEY });
    const before = port.calls.length;

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'dismiss', authorName: 'Вася' });
    await settle();

    // One `get` to learn the list, and no write: a delete that changes nothing stores nothing.
    expect(port.calls.slice(before).map((call) => call.op)).toEqual(['get']);
    expect(port.snapshot()[SYNC_OFF_KEY]).toBeUndefined();
  });

  it('keeps the memory as the truth: the press reads the record, it never re-reads the notes (A189)', async () => {
    const port = offPort();
    const a = attach({
      notes: [remote(), remote({ id: 'petya001', author_id: 'Петя' })],
      port,
      pageKey: () => PAGE_KEY,
    });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false });
    await settle();

    // The press moved the memory and the paint pass followed it, before the record was
    // touched: the pass saw the switched-off note, and no load ran (`A189`, `A168`).
    expect(a.memory.visibilityOf('their001')).toBe(false);
    expect(a.handed[0]).toEqual(a.memory.paintInput());
    expect(a.loads()).toBe(0);
    // And the stored list is filtered to the authors the page holds (`A188`): a name the
    // document does not carry cannot be kept alive by a press.
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual({ version: 1, pages: { [PAGE_KEY]: ['Вася'] } });
  });

  it('drops a stored name the page no longer holds when the reader presses another one', async () => {
    const port = offPort(['Ушедший']);
    const a = attach({
      notes: [remote(), remote({ id: 'petya001', author_id: 'Петя' })],
      port,
      pageKey: () => PAGE_KEY,
    });

    await a.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Петя', visible: false });
    await settle();

    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual({ version: 1, pages: { [PAGE_KEY]: ['Петя'] } });
  });

  it('persists nothing, and stays silent, without a port or a page key', async () => {
    // The port is absent: the module keeps the memory-only shape of `A163`.
    const noPort = attach({ notes: [remote()] });
    expect(() => noPort.askNow({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false })).not.toThrow();
    await settle();
    expect(noPort.memory.visibilityOf('their001')).toBe(false);

    // A port but no page key: a document that is not a page stores nothing either.
    const port = offPort();
    const noKey = attach({ notes: [remote()], port, pageKey: () => null });
    await noKey.answerOf({ type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false });
    await settle();
    expect(port.calls).toEqual([]);
  });

  it('answers the press even when the record cannot be written', async () => {
    const port = offPort();
    port.failNextWrite('quota');
    const a = attach({ notes: [remote()], port, pageKey: () => PAGE_KEY });

    const answer = await a.answerOf({
      type: NOTES_QUERY_MESSAGE,
      op: 'switch',
      authorName: 'Вася',
      visible: false,
    });

    // The row already moved in the memory, so the popup's answer says so; what the reader
    // loses is one reload's worth of the decision, never the note or the page.
    expect((answer.value as { rows: { allVisible: boolean }[] }).rows[0]?.allVisible).toBe(false);
    expect(SYNC_OFF_KEY in port.snapshot()).toBe(false);
  });
});
