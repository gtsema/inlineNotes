import { describe, expect, it } from 'vitest';

import { createEntry } from '../src/core/entry';
import type { Entry, EntryAnchor } from '../src/core/entry';
import {
  EMPTY_PAGE_NOTES_QUERY_RESULT,
  NOTES_QUERY_MESSAGE,
  pageNotesQueryResultOf,
} from '../src/core/page-notes-query';
import type { ForeignNotesSnapshot } from '../src/core/page-notes-query';

/**
 * The wire of the popup's question to the page (Stage 17, `t17-02` AC2, AC3; rulings
 * `A167`, `A169`).
 *
 * Three claims, and each is the whole of what crosses the message boundary:
 *
 * - **the answer is a view, not the notes.** One row per foreign author with a count and
 *   an aggregate flag, and a failure boolean. A comment, a text and an anchor never
 *   appear in it, so the popup cannot render a foreign note as if it were the reader's
 *   and cannot send one anywhere: the payload it can build out of an answer has no field
 *   a note could travel in.
 * - **the grouping is the one the page already performs** (`A95`, `A108`): one row per
 *   author, first appearance wins, `allVisible` is the conjunction of that author's
 *   flags — so a page holding one switched-off note of «Вася» answers an unchecked row.
 * - **the failure flag is a boolean and nothing else** (`A169`): the popup renders one
 *   sentence, so a code would be a second vocabulary at the boundary and neither
 *   `sync_off` nor a success may reach it as `true`.
 */

const ANCHOR: EntryAnchor = { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 };

function note(authorName: string, visible = true, id = 'their00001'): {
  entry: Entry;
  visible: boolean;
} {
  return {
    entry: createEntry({
      id,
      pageKey: 'https://example.com/a',
      authorName,
      text: 'selected text',
      comment: `note of ${authorName}`,
      anchor: ANCHOR,
      createdAt: '2026-01-02T03:04:05.006Z',
      updatedAt: '2026-01-02T03:04:05.006Z',
    }),
    visible,
  };
}

/** A memory with no behaviour beyond `all()`, which is the whole seam this module reads. */
function memoryOf(notes: readonly { entry: Entry; visible: boolean }[]): ForeignNotesSnapshot {
  return { all: () => notes };
}

describe('AC2 the answer carries one row per foreign author and nothing else (A167)', () => {
  it('groups by author in first-appearance order, with the aggregate flag', () => {
    const result = pageNotesQueryResultOf(
      memoryOf([
        note('Вася', true, 'a1'),
        note('Петя', true, 'b2'),
        note('Вася', true, 'a3'),
      ]),
      false,
    );

    expect(result.rows).toEqual([
      { authorName: 'Вася', count: 2, allVisible: true },
      { authorName: 'Петя', count: 1, allVisible: true },
    ]);
    expect(result.syncFailed).toBe(false);
  });

  it('reads a row as unchecked the moment one of that author\'s notes is switched off (A108)', () => {
    const result = pageNotesQueryResultOf(
      memoryOf([note('Вася', true, 'a1'), note('Вася', false, 'a2')]),
      false,
    );

    expect(result.rows).toEqual([{ authorName: 'Вася', count: 2, allVisible: false }]);
  });

  it('answers no rows at all for a page that holds nothing, which is the `A166` state', () => {
    const empty = pageNotesQueryResultOf(memoryOf([]), false);

    expect(empty).toEqual({ rows: [], syncFailed: false });
    expect(EMPTY_PAGE_NOTES_QUERY_RESULT).toEqual({ rows: [], syncFailed: false });
  });

  it('carries no field a note could travel in: no comment, no text, no anchor, no id', () => {
    // The claim is structural and that is the point: the popup builds its whole payload
    // from an answer, so an answer with nowhere to hide a note is an answer that cannot
    // leak one back to the server (`A163`, `A161`) or into storage.
    const result = pageNotesQueryResultOf(memoryOf([note('Вася')]), false);

    expect(Object.keys(result).sort()).toEqual(['rows', 'syncFailed']);
    expect(Object.keys(result.rows[0] ?? {}).sort()).toEqual([
      'allVisible',
      'authorName',
      'count',
    ]);
    const rendered = JSON.stringify(result);
    for (const forbidden of ['note of Вася', 'selected text', 'anchor', 'fragmentCount', 'their00001']) {
      expect(rendered, forbidden).not.toContain(forbidden);
    }
  });

  it('keeps two rows apart when two authors are compared, never by substring', () => {
    // The projection groups by the **exact** stored name, because the message is the
    // page's own list: `contains` here would merge «Вася» and «Вася и Петя».
    const result = pageNotesQueryResultOf(
      memoryOf([note('Вася', true, 'a1'), note('Вася и Петя', true, 'b2')]),
      false,
    );
    expect(result.rows.map((row) => row.authorName)).toEqual(['Вася', 'Вася и Петя']);
  });
});

describe('AC5 the failure flag is the one thing the popup renders the notice from (A169)', () => {
  it('is a boolean of the load, and it never arrives as a code', () => {
    expect(pageNotesQueryResultOf(memoryOf([]), true).syncFailed).toBe(true);
    expect(pageNotesQueryResultOf(memoryOf([note('Вася')]), true)).toEqual({
      rows: [{ authorName: 'Вася', count: 1, allVisible: true }],
      syncFailed: true,
    });
    // The flag is not a code: the shipped answer has no field a `sync_off`, a `network`
    // or an `http` could be read out of, because the popup owns one sentence for all of
    // them (`A164`).
    expect(Object.keys(pageNotesQueryResultOf(memoryOf([]), true)).sort()).toEqual([
      'rows',
      'syncFailed',
    ]);
  });

  it('names the message once, so the two bundles cannot drift apart', () => {
    expect(NOTES_QUERY_MESSAGE).toBe('inlinenotes:page-notes');
    expect(typeof NOTES_QUERY_MESSAGE).toBe('string');
  });
});
