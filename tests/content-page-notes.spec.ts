import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NOTES_QUERY_MESSAGE } from '../src/core/page-notes-query';
import { createForeignNotes } from '../src/content/sync/foreign-notes';
import type { ForeignNotes } from '../src/content/sync/foreign-notes';
import { attachPageNotesChannel } from '../src/content/sync/page-notes-channel';
import { codeOnly } from './support/build-script-guards';
import type { ExtraEntry } from '../src/content/paint/paint-plan';
import type { RemoteNote } from '../src/core/sync-client';

/**
 * The page's answer to the popup (Stage 17, `t17-02` AC2-AC7; rulings `A167`, `A168`,
 * `A169`, with `A163` and `A166` unchanged).
 *
 * What this file pins, and each in its own words:
 *
 * - **the answer** (`A167`): the popup's question arrives, the page runs its load once,
 *   and the answer is the memory's rows plus the load's outcome — one row per author, in
 *   first-appearance order, and never the notes themselves.
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

/** One attachment: the memory, the recorder and a load that answers what the test says. */
function attach(options: {
  notes?: readonly RemoteNote[];
  outcome?: { ok: true; added: number } | { ok: false; code: string };
} = {}): {
  memory: ForeignNotes;
  channel: ReturnType<typeof attachPageNotesChannel>;
  handed: (readonly ExtraEntry[] | null)[];
  refreshes: () => number;
  loads: () => number;
  answerOf: (message: unknown) => Promise<{ responded: boolean; value: unknown }>;
} {
  const memory = createForeignNotes();
  if (options.notes !== undefined) {
    memory.replace(options.notes, 'reader-one');
  }
  const stub = painterStub();
  let loads = 0;
  const channel = attachPageNotesChannel({
    foreign: memory,
    painter: stub.painter,
    load: async (): Promise<never> => {
      loads += 1;
      // The shape `loadIntoMemory` answers with; the cast is the seam's own, and the
      // outcomes used below are the two the loader really produces.
      return (options.outcome ?? { ok: false, code: 'network' }) as never;
    },
  });

  return {
    memory,
    channel,
    handed: stub.handed,
    refreshes: stub.refreshes,
    loads: (): number => loads,
    answerOf: async (message: unknown): Promise<{ responded: boolean; value: unknown }> => {
      let responded = false;
      let value: unknown = null;
      const returned = channel.onMessage(message, {}, (answer: unknown): void => {
        responded = true;
        value = answer;
      });
      // The listener answers asynchronously through the callback, which is what Chrome
      // requires; the `true` return value is the promise of that answer.
      expect(returned === true || returned === undefined).toBe(true);
      // One microtask turn is not enough: the load is `await`ed inside the handler.
      await new Promise<void>((resolveTurn) => {
        setTimeout(resolveTurn, 0);
      });
      return { responded, value };
    },
  };
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

  it('runs the page\'s own load once per question and answers with its outcome (A169)', async () => {
    const failed = attach({ outcome: { ok: false, code: 'network' } });

    const first = await failed.answerOf({ type: NOTES_QUERY_MESSAGE });
    expect(failed.loads()).toBe(1);
    expect((first.value as { syncFailed: boolean }).syncFailed).toBe(true);
    expect(failed.channel.loadCode()).toBe('network');

    // The failure stands until an answer that succeeds: the second question asks the page
    // to try again (`A164` says the reader's retry is the press).
    const ok = attach({ notes: [remote()], outcome: { ok: true, added: 1 } });
    const second = await ok.answerOf({ type: NOTES_QUERY_MESSAGE });
    expect((second.value as { syncFailed: boolean }).syncFailed).toBe(false);
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

  it('offers no handle for a storage write: the module holds no port at all', () => {
    const source = codeOnly(
      readFileSync(join(projectRoot, 'src', 'content', 'sync', 'page-notes-channel.ts'), 'utf8'),
    );
    // The structural proof of `A163` for this path: no port in the wiring means no write
    // can be made, and no storage key or storage API is named here either. The scan reads
    // code, so the doc block above — which names the key the notes never reach — is prose.
    expect(source).not.toMatch(/StoragePort/);
    expect(source).not.toContain('chrome.storage');
    expect(source).not.toContain('entry-store-write');
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

describe('the message name is one constant on both sides of the channel', () => {
  it('is imported by the popup\'s half and by the page\'s half, and spelled nowhere else', () => {
    // `A167` is one contract between two bundles: the two halves must import the name
    // rather than repeat it, or a rename in one of them becomes a silent no-answer.
    for (const path of ['src/content/sync/page-notes-channel.ts', 'src/popup/page-notes-channel.ts']) {
      const source = readFileSync(join(projectRoot, path), 'utf8');
      expect(source, path).toMatch(/NOTES_QUERY_MESSAGE/);
      expect(source, path).toMatch(/from '[^']*core\/page-notes-query'/);
      // The literal appears exactly once in the whole shipped source, in the module that
      // declares it: a second spelling is a second contract.
      expect(source, path).not.toContain("'inlinenotes:page-notes'");
    }
    const declarers = readFileSync(
      join(projectRoot, 'src', 'core', 'page-notes-query.ts'),
      'utf8',
    );
    expect(declarers).toContain("'inlinenotes:page-notes'");
  });
});
