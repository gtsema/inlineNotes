import { describe, expect, it } from 'vitest';

import { createEntry, type Entry, type EntryAnchor, type EntryDraft } from '../src/core/entry';

/**
 * Entry model of task `t1-04` (AC1): the stored shape and its one default.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Flow 4 and the `visible`
 * rule added by PM ruling `A1`.
 */

const PAGE_KEY = 'https://example.com/a';

const ANCHOR: EntryAnchor = {
  text: 'selected text',
  prefix: 'before ',
  suffix: ' after',
  fragmentCount: 2,
};

const CREATED_AT = '2026-01-05T10:00:00.000Z';
const UPDATED_AT = '2026-01-05T10:00:00.000Z';

function draftWith(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    id: 'a1b2c3d4e5f6',
    pageKey: PAGE_KEY,
    authorName: 'Читатель',
    text: 'selected text',
    comment: 'моя заметка',
    anchor: { ...ANCHOR },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe('entry model', () => {
  it('has exactly the nine specified fields (AC1)', () => {
    const entry: Entry = createEntry(draftWith());

    expect(Object.keys(entry).sort()).toEqual([
      'anchor',
      'authorName',
      'comment',
      'createdAt',
      'id',
      'pageKey',
      'text',
      'updatedAt',
      'visible',
    ]);
    expect(entry.id).toBe('a1b2c3d4e5f6');
    expect(entry.pageKey).toBe(PAGE_KEY);
    expect(entry.authorName).toBe('Читатель');
    expect(entry.text).toBe('selected text');
    expect(entry.comment).toBe('моя заметка');
    expect(entry.createdAt).toBe(CREATED_AT);
    expect(entry.updatedAt).toBe(UPDATED_AT);
  });

  it('defaults visible to true and keeps an explicit false (AC1, ruling A1)', () => {
    expect(createEntry(draftWith()).visible).toBe(true);
    expect(createEntry(draftWith({ visible: false })).visible).toBe(false);
    expect(createEntry(draftWith({ visible: true })).visible).toBe(true);
  });

  it('carries the anchor shape { text, prefix, suffix, fragmentCount } (AC1)', () => {
    const entry = createEntry(draftWith());

    expect(Object.keys(entry.anchor).sort()).toEqual(['fragmentCount', 'prefix', 'suffix', 'text']);
    expect(entry.anchor).toEqual(ANCHOR);
    expect(entry.anchor.fragmentCount).toBe(2);
  });

  it('copies the anchor so the caller cannot mutate a stored entry afterwards', () => {
    const draft = draftWith();
    const entry = createEntry(draft);

    draft.anchor.text = 'changed by the caller';
    draft.anchor.fragmentCount = 9;

    expect(entry.anchor.text).toBe('selected text');
    expect(entry.anchor.fragmentCount).toBe(2);
    expect(entry.anchor).not.toBe(draft.anchor);
  });

  it('is structural: it neither validates nor trims its input', () => {
    const entry = createEntry(draftWith({ comment: '  spaced comment  ', authorName: '  Анна  ' }));

    expect(entry.comment).toBe('  spaced comment  ');
    expect(entry.authorName).toBe('  Анна  ');
  });
});
