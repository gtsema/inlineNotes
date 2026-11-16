import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EntryAnchor } from '../src/core/entry';
import { buildAnchor } from '../src/core/anchor-build';
import { resolveAnchor } from '../src/core/anchor-resolve';
import { codePointLength } from '../src/core/entry-rules';
import { loadEntries } from '../src/core/entry-store-read';
import { deleteEntry } from '../src/core/entry-store-write';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * Resolving an anchor in the normalized page text stream of task `t2-01`
 * (AC3, AC4).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Anchoring", "Anchor search order", "Staleness"; Edge Cases -> "Same text
 * repeated on the page". The search is pure string work, so the whole contract —
 * the two steps, the tie-break, the staleness promise — is observable here without
 * a DOM: the DOM mapping is `t2-02` and sits on top of these offsets.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** A stream with an astral character before the match, so the unit is checked. */
const ASTRAL = 'a😀b TARGET c';

/** A stream whose sentence appears twice, with distinguishable context. */
const REPEATED = 'alpha TARGET beta and gamma TARGET delta';

const NEEDLE = 'TARGET';

const PAGE_URL = 'https://example.com/article';
const STALE_ID = 'staleentry0001';

function anchorOf(
  text: string,
  prefix: string = '',
  suffix: string = '',
  fragmentCount: number = 1,
): EntryAnchor {
  return { text, prefix, suffix, fragmentCount };
}

/** Code-point offset where the `occurrence`-th copy of `needle` begins. */
function offsetOf(stream: string, needle: string, occurrence: number = 0): number {
  let utf16 = -1;
  for (let seen = 0; seen <= occurrence; seen += 1) {
    utf16 = stream.indexOf(needle, utf16 + 1);
    if (utf16 < 0) {
      throw new Error(`no occurrence ${seen} of "${needle}"`);
    }
  }
  return codePointOffsetAt(stream, utf16);
}

/** Range of the `occurrence`-th copy of `needle`, in the shape `resolveAnchor` gives. */
function rangeOf(
  stream: string,
  needle: string,
  occurrence: number = 0,
): { ok: true; start: number; end: number } {
  const start = offsetOf(stream, needle, occurrence);
  return { ok: true, start, end: start + codePointLength(needle) };
}

/** A fresh copy of the same stream, as a reload would hand it over. */
function reloadedStream(): string {
  return ['alpha', 'TARGET', 'beta and gamma', 'TARGET', 'delta'].join(' ');
}

describe('resolveAnchor returns the position of the anchor (AC3)', () => {
  it('returns the half-open code-point range of the selection text', () => {
    expect(resolveAnchor(ASTRAL, anchorOf(NEEDLE, 'b ', ' c'))).toEqual({ ok: true, start: 4, end: 10 });
  });

  it('takes the contextual match even when the bare text appears earlier', () => {
    expect(resolveAnchor(REPEATED, anchorOf(NEEDLE, 'and gamma ', ' delta'))).toEqual(
      rangeOf(REPEATED, NEEDLE, 1),
    );
  });

  it('falls back to the bare text when the window no longer matches', () => {
    const staleWindow = anchorOf(NEEDLE, 'a sentence the site rewrote ', ' delta');

    expect(resolveAnchor(REPEATED, staleWindow)).toEqual(rangeOf(REPEATED, NEEDLE, 0));
  });

  it('a window that matches nowhere still anchors on the text', () => {
    const stream = 'один TARGET два';

    expect(resolveAnchor(stream, anchorOf(NEEDLE, 'несуществующий ', ' контекст'))).toEqual(
      rangeOf(stream, NEEDLE, 0),
    );
  });

  it('an anchor at the very start or end of the stream resolves', () => {
    expect(resolveAnchor(NEEDLE, anchorOf(NEEDLE))).toEqual({ ok: true, start: 0, end: 6 });
    expect(resolveAnchor('префикс TARGET', anchorOf(NEEDLE, 'префикс '))).toEqual(
      rangeOf('префикс TARGET', NEEDLE, 0),
    );
  });
});

describe('repeated text is resolved by document order (AC3)', () => {
  it('takes the first match when the window cannot disambiguate', () => {
    expect(resolveAnchor(REPEATED, anchorOf(NEEDLE))).toEqual(rangeOf(REPEATED, NEEDLE, 0));
  });

  it('the same anchor on two identical streams gives the same positions', () => {
    const anchor = anchorOf(NEEDLE, 'and gamma ', ' delta');

    for (let round = 0; round < 5; round += 1) {
      const first = resolveAnchor(reloadedStream(), anchor);
      const second = resolveAnchor(reloadedStream(), anchor);
      expect(second).toEqual(first);
      expect(second).toEqual(rangeOf(REPEATED, NEEDLE, 1));
    }
  });

  it('a window built on the second occurrence resolves to the second occurrence', () => {
    const range = rangeOf(REPEATED, NEEDLE, 1);
    const anchor = buildAnchor(REPEATED, range.start, range.end, { fragments: 2 });
    if (anchor === null) {
      throw new Error('buildAnchor refused a range the stream contains');
    }

    const reloaded = resolveAnchor(REPEATED, anchor);
    expect(reloaded).toEqual(range);
    expect(resolveAnchor(REPEATED, anchor)).toEqual(reloaded);
  });

  it('document order wins every time, so the choice never moves', () => {
    const stream = 'TARGET TARGET TARGET';
    const anchor = anchorOf(NEEDLE);

    expect(resolveAnchor(stream, anchor)).toEqual({ ok: true, start: 0, end: 6 });
    expect(resolveAnchor(stream, anchor)).toEqual({ ok: true, start: 0, end: 6 });
  });

  it('a shorter window that matches nowhere falls back, and the first copy wins', () => {
    const anchor = anchorOf(NEEDLE, 'and gamma ', ' delta');
    const withoutThatContext = 'alpha TARGET beta and delta TARGET end';

    expect(resolveAnchor(withoutThatContext, anchor)).toEqual(rangeOf(withoutThatContext, NEEDLE, 0));
  });
});

describe('a non-resolving anchor reports a code (AC3, AC4)', () => {
  it('reports anchor_not_found for text the page no longer has', () => {
    expect(resolveAnchor('the article was rewritten completely', anchorOf(NEEDLE, 'and gamma '))).toEqual({
      ok: false,
      code: 'anchor_not_found',
    });
  });

  it('reports anchor_not_found for an empty selection text', () => {
    expect(resolveAnchor('TARGET anywhere', anchorOf(''))).toEqual({
      ok: false,
      code: 'anchor_not_found',
    });
  });

  it('reports anchor_not_found for a value that is not an anchor, and never throws', () => {
    const broken: unknown[] = [
      { text: 7, prefix: '', suffix: '', fragmentCount: 1 },
      { text: NEEDLE, prefix: null, suffix: '', fragmentCount: 1 },
      { text: NEEDLE },
      {},
      [],
      null,
      undefined,
      NEEDLE,
    ];

    for (const candidate of broken) {
      expect(resolveAnchor('anything TARGET here', candidate as unknown as EntryAnchor)).toEqual({
        ok: false,
        code: 'anchor_not_found',
      });
    }
  });

  it('the resolver has no ambiguity code, because document order settles it', () => {
    const code = readFileSync(join(projectRoot, 'src', 'core', 'anchor-resolve.ts'), 'utf8')
      .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
      .replaceAll(/\/\/[^\n]*/g, ' ');
    const spec = readFileSync(join(projectRoot, 'docs', 'specs', 'inline-comment-model.md'), 'utf8');

    expect(code).not.toContain('anchor_ambiguous');
    expect(spec).toContain('- Anchor search order:');
    expect(spec).toContain('first match in document order');
  });
});

describe('resolution never damages the anchor, the entry or the store (AC4)', () => {
  it('the anchor is unchanged after a hit and after a miss', () => {
    const hit = anchorOf(NEEDLE, 'and gamma ', ' delta');
    const miss = anchorOf(NEEDLE, 'gone ', ' gone');
    const hitCopy = { ...hit };
    const missCopy = { ...miss };

    resolveAnchor(REPEATED, Object.freeze(hit));
    resolveAnchor('nothing here at all', miss);

    expect(hit).toEqual(hitCopy);
    expect(miss).toEqual(missCopy);
  });

  it('a stale anchor keeps the entry listed and deletable, and writes nothing', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_URL]));
    port.seed(entryStorageKey(PAGE_URL), slotValue([storedEntry({ id: STALE_ID, pageKey: PAGE_URL })]));

    const read = await loadEntries(port, PAGE_URL);
    expect(read.entries).toHaveLength(1);
    expect(read.corruptCount).toBe(0);
    expect(read.codes).toEqual([]);
    expect(read.entries[0].id).toBe(STALE_ID);

    expect(resolveAnchor('the site replaced the paragraph', read.entries[0].anchor)).toEqual({
      ok: false,
      code: 'anchor_not_found',
    });
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);

    const listed = await loadEntries(port, PAGE_URL);
    expect(listed.entries.map((entry) => entry.id)).toEqual([STALE_ID]);

    const deleted = await deleteEntry(port, { url: PAGE_URL, id: STALE_ID });
    expect(deleted.ok).toBe(true);
    expect(port.snapshot()[entryStorageKey(PAGE_URL)]).toBeUndefined();
  });

  it('the resolved range is measured in the unit the anchor was built with', () => {
    const stream = 'хвост 😀 TARGET хво';
    const before = codePointLength(stream.slice(0, stream.indexOf(NEEDLE)));
    const anchor = buildAnchor(stream, before, before + codePointLength(NEEDLE), {
      fragments: 1,
      contextWindow: 3,
    });
    if (anchor === null) {
      throw new Error('buildAnchor refused a range the stream contains');
    }

    expect(resolveAnchor(stream, anchor)).toEqual({
      ok: true,
      start: before,
      end: before + codePointLength(NEEDLE),
    });
  });
});
