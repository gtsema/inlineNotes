// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import { resolveAnchor } from '../src/core/anchor-resolve';
import { codePointLength } from '../src/core/entry-rules';
import { codePointOffsetAt } from '../src/core/text-normalize';
import {
  fragmentsForRange,
  isInsideSubtree,
  locateAnchor,
  locateAnchorInStream,
} from '../src/content/anchor/locate-anchor';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { TextStream } from '../src/content/anchor/text-stream';
import type { EntryAnchor } from '../src/core/entry';

/**
 * The second half of the anchor round trip: task `t2-02`, AC2 and AC3.
 *
 * `docs/specs/inline-comment-model.md` -> Rules / Semantics -> "Anchoring",
 * "Anchor search order", "Anchor domains", "Staleness".
 *
 * The search itself belongs to core: these cases prove the content layer only
 * maps the code-point range core returns onto DOM fragments, and that a range
 * that no longer has live nodes reports a code instead of throwing.
 */

function subtree(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

/**
 * Builds the anchor of `needle` in `stream` through the core builder, exactly the
 * way the capture site will: code-point offsets of the span in the same stream,
 * with the real fragment count as the stored hint.
 */
function anchorOf(stream: TextStream, needle: string, fragments = 1): EntryAnchor {
  const utf16At = stream.text.indexOf(needle);
  if (utf16At < 0) {
    throw new Error('fixture needle is not in the stream');
  }
  const start = codePointOffsetAt(stream.text, utf16At);
  const anchor = buildAnchor(stream.text, start, start + codePointLength(needle), {
    fragments,
  });
  if (anchor === null) {
    throw new Error('fixture anchor could not be built');
  }
  return anchor;
}

function textNodesOf(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function spanInFragment(fragment: { node: Text; start: number; end: number }): string {
  return fragment.node.data.slice(fragment.start, fragment.end);
}

describe('locateAnchor maps a resolved anchor onto fragments (AC2)', () => {
  it('returns one fragment for a match inside one text node', () => {
    const root = subtree('<p>The quick brown fox jumps.</p>');
    const stream = buildTextStream(root);
    const result = locateAnchor(root, anchorOf(stream, 'brown fox'));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(1);
    const fragment = result.fragments[0];
    expect(fragment.node).toBe(textNodesOf(root)[0]);
    expect(fragment.start).toBe(10);
    expect(fragment.end).toBe(19);
    expect(spanInFragment(fragment)).toBe('brown fox');
    expect(fragment.streamStart).toBe(10);
    expect(fragment.streamEnd).toBe(19);
  });

  it('returns several non-empty fragments for a match spanning inline tags', () => {
    const root = subtree('<p>one <em>two</em> three</p>');
    const stream = buildTextStream(root);
    const result = locateAnchor(root, anchorOf(stream, 'two three', 2));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(2);
    const [first, second] = result.fragments;
    expect(first.node).toBe(textNodesOf(root)[1]);
    expect(second.node).toBe(textNodesOf(root)[2]);
    expect(spanInFragment(first)).toBe('two');
    expect(spanInFragment(second)).toBe('three');
    expect(first.streamStart).toBe(4);
    expect(first.streamEnd).toBe(7);
    expect(second.streamStart).toBe(8);
    expect(second.streamEnd).toBe(13);
    expect(second.start).toBe(1);
    expect(second.end).toBe(6);
  });

  it('returns fragments in document order for a match spanning two blocks', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const result = locateAnchor(root, anchorOf(stream, 'beta gamma', 2));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(2);
    const [first, second] = result.fragments;
    expect(first.node).toBe(textNodesOf(root)[0]);
    expect(second.node).toBe(textNodesOf(root)[1]);
    expect(spanInFragment(first)).toBe('beta');
    expect(spanInFragment(second)).toBe('gamma');
    expect(first.streamStart).toBe(6);
    expect(first.streamEnd).toBe(10);
    expect(second.streamStart).toBe(11);
    expect(second.streamEnd).toBe(16);
  });

  it('returns one non-empty fragment per contributing node across four blocks, in document order (AC2)', () => {
    const root = subtree(
      '<h2>Red kite</h2><p>sails over the</p><ul><li>quiet harbor</li></ul><blockquote>at dusk</blockquote>',
    );
    const stream = buildTextStream(root);
    expect(stream.text).toBe('Red kite sails over the quiet harbor at dusk');

    const needle = 'kite sails over the quiet harbor at';
    const result = locateAnchor(root, anchorOf(stream, needle, 4));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const nodes = textNodesOf(root);
    expect(result.fragments).toHaveLength(4);
    expect(result.fragments.map((fragment) => fragment.node)).toEqual([nodes[0], nodes[1], nodes[2], nodes[3]]);
    for (const fragment of result.fragments) {
      expect(fragment.start).toBeLessThan(fragment.end);
      expect(fragment.streamStart).toBeLessThan(fragment.streamEnd);
      expect(spanInFragment(fragment)).not.toBe('');
    }
    expect(result.fragments.map(spanInFragment).join(' ')).toBe(needle);

    // The gaps between consecutive fragments are exactly the boundary spaces.
    for (let index = 1; index < result.fragments.length; index += 1) {
      expect(result.fragments[index].streamStart).toBe(result.fragments[index - 1].streamEnd + 1);
    }
  });

  it('clips mid-node at both ends of a match that spans three blocks (AC3)', () => {
    const root = subtree('<p>alpha beta gamma</p><p>delta epsilon</p><p>zeta eta theta</p>');
    const stream = buildTextStream(root);
    const needle = 'lpha beta gamma delta epsilon zeta et';
    const result = locateAnchor(root, anchorOf(stream, needle, 3));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const [first, middle, last] = result.fragments;
    const [firstNode, middleNode, lastNode] = textNodesOf(root);

    expect(first.node).toBe(firstNode);
    expect(first.start).toBe(firstNode.data.indexOf('lpha'));
    expect(first.end).toBe(firstNode.data.length);
    expect(spanInFragment(first)).toBe('lpha beta gamma');

    expect(middle.node).toBe(middleNode);
    expect(middle.start).toBe(0);
    expect(middle.end).toBe(middleNode.data.length);
    expect(spanInFragment(middle)).toBe('delta epsilon');

    expect(last.node).toBe(lastNode);
    expect(last.start).toBe(0);
    expect(last.end).toBe('zeta et'.length);
    expect(spanInFragment(last)).toBe('zeta et');

    expect(result.fragments.map(spanInFragment).join(' ')).toBe(needle);
  });

  it('lets core pick the copy: the contextual window wins over an earlier match', () => {
    const root = subtree('<p>Chapter one. The map is old.</p><p>Chapter two. The map is old.</p>');
    const stream = buildTextStream(root);
    const firstCopy = stream.text.indexOf('The map is old');
    const secondCopy = stream.text.indexOf('The map is old', firstCopy + 1);
    if (secondCopy < 0) {
      throw new Error('fixture has only one copy');
    }
    const start = codePointOffsetAt(stream.text, secondCopy);
    const built = buildAnchor(stream.text, start, start + codePointLength('The map is old'), {
      fragments: 1,
    });
    if (built === null) {
      throw new Error('fixture anchor could not be built');
    }
    expect(resolveAnchor(stream.text, built).ok).toBe(true);

    const result = locateAnchor(root, built);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0].node).toBe(textNodesOf(root)[1]);
    expect(spanInFragment(result.fragments[0])).toBe('The map is old');
  });

  it('falls back to the bare text step, because the search is core\'s', () => {
    const root = subtree('<p>Intro sentence. The map is old.</p><p>Other sentence.</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'The map is old');

    // The site rewrote the context, so the window no longer matches; core step 2
    // still finds the text, and the fragments follow the new node content.
    const paragraph = textNodesOf(root)[0];
    paragraph.data = 'Changed intro. The map is old.';

    const result = locateAnchor(root, anchor);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(1);
    expect(spanInFragment(result.fragments[0])).toBe('The map is old');
    expect(result.fragments[0].start).toBe(15);
    expect(result.fragments[0].end).toBe(29);
    expect(result.fragments[0].streamStart).toBe(15);
    expect(result.fragments[0].streamEnd).toBe(29);
  });

  it('counts code points in the stream and UTF-16 units inside the node', () => {
    const root = subtree('<p>😀 and the target phrase</p>');
    const stream = buildTextStream(root);
    const result = locateAnchor(root, anchorOf(stream, 'the target'));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const fragment = result.fragments[0];
    expect(spanInFragment(fragment)).toBe('the target');
    // Stream domain: the emoji is one code point. Node domain: it is two units.
    expect(fragment.streamStart).toBe(6);
    expect(fragment.streamEnd).toBe(16);
    expect(fragment.start).toBe(7);
    expect(fragment.end).toBe(17);
  });

  it('clips a match that starts or ends mid-node (AC3)', () => {
    const root = subtree('<p>alpha beta gamma</p><p>delta</p>');
    const stream = buildTextStream(root);
    const result = locateAnchor(root, anchorOf(stream, 'pha beta gamma delta', 2));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(2);
    const [first, second] = result.fragments;
    expect(first.start).toBe(2);
    expect(first.end).toBe(16);
    expect(second.start).toBe(0);
    expect(second.end).toBe(5);
    expect(spanInFragment(first)).toBe('pha beta gamma');
    expect(spanInFragment(second)).toBe('delta');
    expect(first.streamStart).toBe(2);
    expect(first.streamEnd).toBe(16);
    expect(second.streamStart).toBe(17);
    expect(second.streamEnd).toBe(22);
  });

  it('clips a match that starts and ends inside one node', () => {
    const root = subtree('<p>alpha beta gamma</p>');
    const stream = buildTextStream(root);
    const result = locateAnchor(root, anchorOf(stream, 'pha beta g'));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0].start).toBe(2);
    expect(result.fragments[0].end).toBe(12);
    expect(spanInFragment(result.fragments[0])).toBe('pha beta g');
  });
});

describe('degenerate and stale cases (AC3)', () => {
  it('reports not_found for an empty stream instead of throwing', () => {
    const stream = buildTextStream(subtree(''));
    expect(stream.text).toBe('');
    expect(stream.fragments).toEqual([]);

    const anchor: EntryAnchor = { text: 'anything', prefix: '', suffix: '', fragmentCount: 1 };
    for (const html of ['', '<div></div>', '<script>anything at all</script>']) {
      expect(locateAnchor(subtree(html), anchor)).toEqual({ ok: false, code: 'anchor_not_found' });
    }
    expect(locateAnchor(subtree('   '), anchor)).toEqual({ ok: false, code: 'anchor_not_found' });
  });

  it('reports not_found for an anchor with no text', () => {
    const root = subtree('<p>some text</p>');
    const anchor: EntryAnchor = { text: '', prefix: '', suffix: '', fragmentCount: 0 };
    expect(locateAnchor(root, anchor)).toEqual({ ok: false, code: 'anchor_not_found' });
  });

  it('reports not_found when the page removed the text', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'beta gamma', 2);

    root.replaceChildren();
    expect(buildTextStream(root).text).toBe('');
    expect(locateAnchor(root, anchor)).toEqual({ ok: false, code: 'anchor_not_found' });
  });

  it('reports anchor_stale when the resolved nodes left the subtree between build and locate', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'beta gamma', 2);
    const detached = textNodesOf(root)[0];
    expect(locateAnchorInStream(stream, root, anchor).ok).toBe(true);

    // The caller still holds the stream it built; the page has moved under it.
    root.replaceChildren();
    expect(isInsideSubtree(detached, root)).toBe(false);
    expect(locateAnchorInStream(stream, root, anchor)).toEqual({ ok: false, code: 'anchor_stale' });
  });

  it('reports anchor_stale, never a survivor, when one of two mapped nodes left the subtree (AC3, A36)', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'beta gamma', 2);
    const paragraphs = Array.from(root.querySelectorAll('p'));
    const survivor = textNodesOf(root)[0];
    expect(locateAnchorInStream(stream, root, anchor).ok).toBe(true);

    // One of the two nodes the range maps to is gone; the other one is still a
    // live descendant of `root`. Ruling `A36` refuses to paint half the span.
    root.removeChild(paragraphs[1]);
    expect(isInsideSubtree(survivor, root)).toBe(true);
    expect(locateAnchorInStream(stream, root, anchor)).toEqual({ ok: false, code: 'anchor_stale' });
    expect(() => locateAnchorInStream(stream, root, anchor)).not.toThrow();
  });

  it('reports anchor_stale, never a survivor, when one of two mapped nodes was rewritten (AC3, A36)', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'beta gamma', 2);
    expect(locateAnchorInStream(stream, root, anchor).ok).toBe(true);

    // The node is still inside the subtree, but it no longer accounts for the code
    // points the stream recorded, so the range is no longer supported in full.
    textNodesOf(root)[1].data = 'a second paragraph with quite a different length';
    expect(locateAnchorInStream(stream, root, anchor)).toEqual({ ok: false, code: 'anchor_stale' });
  });

  it('reports anchor_stale when a contributing node no longer matches the stream', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'pha bet', 1);

    textNodesOf(root)[0].data = 'a completely different sentence here';
    expect(locateAnchorInStream(stream, root, anchor)).toEqual({ ok: false, code: 'anchor_stale' });
  });

  it('reports anchor_stale without throwing for a range that falls in the boundary space (AC3)', () => {
    const root = subtree('<p>alpha</p><p>beta</p>');
    const stream = buildTextStream(root);
    const boundaryAnchor: EntryAnchor = { text: ' ', prefix: '', suffix: '', fragmentCount: 1 };

    // Core finds the single U+0020 between the two fragments; that code point
    // belongs to no text node, so there is nothing to paint.
    expect(stream.text).toBe('alpha beta');
    expect(resolveAnchor(stream.text, boundaryAnchor)).toEqual({ ok: true, start: 5, end: 6 });
    expect(() => locateAnchorInStream(stream, root, boundaryAnchor)).not.toThrow();
    expect(locateAnchorInStream(stream, root, boundaryAnchor)).toEqual({ ok: false, code: 'anchor_stale' });
    expect(root.innerHTML).toBe('<p>alpha</p><p>beta</p>');
  });

  it('throws nothing when the mapped nodes left the subtree or were rewritten (AC3)', () => {
    const removedRoot = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const removedStream = buildTextStream(removedRoot);
    const removedAnchor = anchorOf(removedStream, 'beta gamma', 2);
    removedRoot.replaceChildren();
    expect(() => locateAnchorInStream(removedStream, removedRoot, removedAnchor)).not.toThrow();
    expect(locateAnchorInStream(removedStream, removedRoot, removedAnchor)).toEqual({
      ok: false,
      code: 'anchor_stale',
    });

    const rewrittenRoot = subtree('<p>alpha beta</p>');
    const rewrittenStream = buildTextStream(rewrittenRoot);
    const rewrittenAnchor = anchorOf(rewrittenStream, 'pha bet');
    textNodesOf(rewrittenRoot)[0].data = 'a sentence with no match at all';
    expect(() => locateAnchorInStream(rewrittenStream, rewrittenRoot, rewrittenAnchor)).not.toThrow();
    expect(locateAnchorInStream(rewrittenStream, rewrittenRoot, rewrittenAnchor)).toEqual({
      ok: false,
      code: 'anchor_stale',
    });
  });

  it('throws nothing for a malformed anchor', () => {
    const root = subtree('<p>alpha beta</p>');
    const broken = { text: 1, prefix: null, suffix: undefined } as unknown as EntryAnchor;
    expect(() => locateAnchor(root, broken)).not.toThrow();
    expect(locateAnchor(root, broken)).toEqual({ ok: false, code: 'anchor_not_found' });
  });

  it('never mutates the anchor and never touches the page', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const anchor = anchorOf(stream, 'beta gamma', 2);
    const beforeAnchor = JSON.stringify(anchor);
    const beforeHtml = root.innerHTML;
    const beforeNodes = root.querySelectorAll('*').length;

    const result = locateAnchor(root, anchor);
    expect(result.ok).toBe(true);

    expect(JSON.stringify(anchor)).toBe(beforeAnchor);
    expect(root.innerHTML).toBe(beforeHtml);
    expect(root.querySelectorAll('*').length).toBe(beforeNodes);
  });
});

describe('fragmentsForRange is the mapping step core leaves to the page (AC2)', () => {
  it('drops a fragment the range only touches at one boundary', () => {
    const root = subtree('<p>alpha beta</p><p>gamma delta</p>');
    const stream = buildTextStream(root);
    const first = stream.fragments[0];
    const second = stream.fragments[1];

    expect(fragmentsForRange(stream, 10, 12).map((fragment) => fragment.node)).toEqual([second.node]);
    expect(fragmentsForRange(stream, 0, 10).map((fragment) => fragment.node)).toEqual([first.node]);
    expect(fragmentsForRange(stream, 10, 11)).toEqual([]);
    expect(fragmentsForRange(stream, 22, 30)).toEqual([]);
    expect(fragmentsForRange(stream, 0, 0)).toEqual([]);
  });

  it('returns the whole fragment when the range covers it', () => {
    const root = subtree('<p>alpha beta</p>');
    const stream = buildTextStream(root);
    expect(fragmentsForRange(stream, 0, 10)).toEqual([...stream.fragments]);
  });
});
