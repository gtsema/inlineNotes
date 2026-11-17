// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { codePointLength } from '../src/core/entry-rules';
import { isNormalizedText, normalizeText, sliceCodePoints } from '../src/core/text-normalize';
import {
  BLOCK_TAG_NAMES,
  EXCLUDED_TAG_NAMES,
  buildTextStream,
  nodeCodePointIndex,
} from '../src/content/anchor/text-stream';
import type { TextStream } from '../src/content/anchor/text-stream';

/**
 * The DOM side of the anchor stage: task `t2-02`, AC1 and AC4, hardened by task
 * `t3-04` (`A35` table cells, `N2` the stream claim).
 *
 * `docs/specs/inline-comment-model.md` -> Rules / Semantics -> "Normalized text
 * stream", "No raw-text equality", "Block boundary"; PM rulings `A20` (one space
 * per block boundary), `A35` (`td` / `th` join that list), `A21` (excluded
 * subtrees), `A2` (jsdom is a test-only environment) and `A29` (the stream is
 * rebuilt, never cached).
 *
 * `jsdom` is the Vitest environment of this file and nothing is shipped: the
 * module under test receives the subtree as an argument and never reads a global.
 */

/** Builds a detached subtree, so every fixture has an explicit root node. */
function subtree(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

function streamOf(html: string): TextStream {
  return buildTextStream(subtree(html));
}

function textOf(html: string): string {
  return streamOf(html).text;
}

/** A second `Document`, never the environment global: AC4 wants the root explicit. */
function isolatedDocument(bodyHtml: string, headHtml: string): Document {
  const doc = document.implementation.createHTMLDocument('isolated');
  doc.head.innerHTML = headHtml;
  doc.body.innerHTML = bodyHtml;
  return doc;
}

/** Text nodes of a subtree in document order, skipping the `A21` subtrees. */
function contributingTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    const text = current as Text;
    const excluded = text.parentElement !== null && text.parentElement.closest('script,style,noscript,template,head') !== null;
    if (!excluded && normalizeText(text.data).length > 0) {
      nodes.push(text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

const ARTICLE_FIXTURE = `
  <article>
    <h1>Quiet   Harbor</h1>
    <p>First\tparagraph\u00a0with\u00a0spaces.</p>
    <p>Second
       paragraph <em>with
       emphasis</em> inside.</p>
    <ul><li>alpha</li><li>beta</li></ul>
    <script>var junk = "must never appear";</script>
    <style>.x { content: "nor this"; }</style>
    <noscript>neither this</noscript>
    <template>nor this</template>
  </article>
`;

describe('normalized text stream (AC1)', () => {
  it('streams text nodes in document order with one space between blocks', () => {
    expect(textOf('<p>First paragraph.</p><p>Second one.</p>')).toBe('First paragraph. Second one.');
    expect(textOf('<p>one</p><p>two</p><p>three</p>')).toBe('one two three');
  });

  it('declares the A20 boundary list and contributes one space for each of them', () => {
    expect(BLOCK_TAG_NAMES).toEqual([
      'P',
      'DIV',
      'LI',
      'BR',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'BLOCKQUOTE',
      'TR',
      'TD',
      'TH',
      'SECTION',
      'ARTICLE',
    ]);

    const cases: readonly (readonly [string, string])[] = [
      ['<p>a</p><p>b</p>', 'a b'],
      ['<div>a</div><div>b</div>', 'a b'],
      ['<ul><li>a</li><li>b</li></ul>', 'a b'],
      ['a<br/>b', 'a b'],
      ['a<br />b', 'a b'],
      ['<h1>a</h1><h2>b</h2>', 'a b'],
      ['<blockquote>a</blockquote><p>b</p>', 'a b'],
      ['<table><tr><td>a</td></tr><tr><td>b</td></tr></table>', 'a b'],
      ['<table><tr><td>a</td><td>b</td></tr></table>', 'a b'],
      ['<table><tr><th>a</th><th>b</th></tr><tr><td>c</td><td>d</td></tr></table>', 'a b c d'],
      ['<table><tr><th>head</th></tr><tr><td>cell</td></tr></table>', 'head cell'],
      ['<section>a</section><article>b</article>', 'a b'],
    ];
    for (const [html, expected] of cases) {
      expect(textOf(html)).toBe(expected);
    }
  });

  it('never multiplies a boundary space, at the edges or when nested', () => {
    expect(textOf('<div><p>a</p></div>')).toBe('a');
    expect(textOf('<p><br/>a</p>')).toBe('a');
    expect(textOf('<p>a<br/></p>')).toBe('a');
    expect(textOf('<p>a</p><div><p>b</p></div>')).toBe('a b');
    expect(textOf('<p>a </p><p> b</p>')).toBe('a b');
    expect(textOf('<p>a</p>   <p>b</p>')).toBe('a b');
  });

  it('declares the A21 excluded list and keeps its text out of the stream', () => {
    expect(EXCLUDED_TAG_NAMES).toEqual(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);
    expect(textOf('<p>visible</p><script>var junk = "hidden";</script>')).toBe('visible');
    expect(textOf('<p>a</p><style>.x{content:"nope"}</style><p>b</p>')).toBe('a b');
    expect(textOf('<p>a</p><noscript>nope</noscript><p>b</p>')).toBe('a b');
    expect(textOf('<p>a</p><template>nope</template><p>b</p>')).toBe('a b');
  });

  it('excludes the head of an explicitly passed document and walks the body', () => {
    const doc = isolatedDocument('<p>Body text.</p>', '<title>Head title</title><style>b{color:red}</style>');
    const stream = buildTextStream(doc);
    expect(stream.text).toBe('Body text.');
    expect(stream.fragments).toHaveLength(1);
    expect(stream.fragments[0].node.data).toBe('Body text.');
  });

  it('normalizes whitespace runs, NBSP and newlines while streaming', () => {
    expect(textOf('<p>a\t\n  b\u00a0c</p>')).toBe('a b c');
    expect(textOf('<p>   </p>')).toBe('');
    expect(textOf('')).toBe('');
  });

  it('is normalized by construction, trimmed and single-spaced, and claims no raw-text equality (AC1, N2)', () => {
    const stream = streamOf(ARTICLE_FIXTURE);
    expect(isNormalizedText(stream.text)).toBe(true);
    expect(stream.text).toBe(
      'Quiet Harbor First paragraph with spaces. Second paragraph with emphasis inside. alpha beta',
    );

    // What "normalized by construction" claims, precisely: trimmed at both ends,
    // every separator exactly one U+0020, and one U+0020 per `A20` boundary.
    for (const html of ['<p>a</p><p>b</p>', '<div><span>a </span><span> b</span></div>', ARTICLE_FIXTURE]) {
      const text = textOf(html);
      expect(isNormalizedText(text)).toBe(true);
      expect(text.startsWith(' ')).toBe(false);
      expect(text.endsWith(' ')).toBe(false);
      expect(text).not.toContain('  ');
      expect(text.split('\n')).toHaveLength(1);
      expect(text.split('\t')).toHaveLength(1);
    }

    // The equality the module header and the spec used to state is false, so it is
    // not claimed anywhere and no fixture asserts it: `textContent` glues adjacent
    // elements with nothing between them, while the walk contributes a boundary
    // space, so the two strings differ in exactly that one code point.
    const glued = subtree('<div><p>a</p>tail</div>');
    expect(textOf('<div><p>a</p>tail</div>')).toBe('a tail');
    expect(normalizeText(glued.textContent ?? '')).toBe('atail');

    const adjacent = subtree('<div><b>foo</b><i>bar</i></div>');
    expect(textOf('<div><b>foo</b><i>bar</i></div>')).toBe('foobar');
    expect(normalizeText(adjacent.textContent ?? '')).toBe('foobar');
  });

  it('skips a whitespace-only text node but keeps its separating effect', () => {
    const html = '<span>a</span><span>   </span><span>b</span>';
    const stream = streamOf(html);
    expect(stream.text).toBe('a b');
    expect(stream.fragments).toHaveLength(2);
  });

  it('lets a comment contribute nothing and glue nothing', () => {
    expect(textOf('<p>a<!-- note -->b</p>')).toBe('ab');
    expect(textOf('<p>a <!-- note --> b</p>')).toBe('a b');
  });
});

describe('fragment contract (AC1)', () => {
  it('produces one fragment per contributing text node, in document order', () => {
    const root = subtree(ARTICLE_FIXTURE);
    const stream = buildTextStream(root);
    const nodes = contributingTextNodes(root);
    const fragmentNodes = stream.fragments.map((fragment) => fragment.node);

    expect(fragmentNodes).toHaveLength(nodes.length);
    expect(fragmentNodes.length).toBeGreaterThan(6);
    fragmentNodes.forEach((node, index) => {
      expect(node).toBe(nodes[index]);
    });
  });

  it('slicing the stream at a fragment boundary reproduces that node\'s own text', () => {
    const stream = streamOf(ARTICLE_FIXTURE);
    for (const fragment of stream.fragments) {
      const nodeOwnText = normalizeText(fragment.node.data);
      expect(sliceCodePoints(stream.text, fragment.streamStart, fragment.streamEnd)).toBe(nodeOwnText);
      expect(fragment.streamEnd - fragment.streamStart).toBe(codePointLength(nodeOwnText));
      expect(fragment.node.data.slice(fragment.start, fragment.end)).toBe(fragment.node.data.trim());
      expect(normalizeText(fragment.node.data.slice(fragment.start, fragment.end))).toBe(nodeOwnText);
    }
  });

  it('maps a fragment in both directions: stream slice -> node, node -> stream slice (AC1)', () => {
    const stream = streamOf(ARTICLE_FIXTURE);

    for (const fragment of stream.fragments) {
      // stream -> node: the recorded stream range is the node's own normalized text.
      const sliced = sliceCodePoints(stream.text, fragment.streamStart, fragment.streamEnd);
      expect(sliced).toBe(normalizeText(fragment.node.data));

      // node -> stream: the same node walked on its own yields the same node-local
      // offsets and the same number of code points, so the two domains agree from
      // either end and a fragment is position-independent inside the stream.
      const alone = buildTextStream(fragment.node);
      expect(alone.fragments).toHaveLength(1);
      expect(alone.text).toBe(sliced);
      expect(alone.fragments[0].start).toBe(fragment.start);
      expect(alone.fragments[0].end).toBe(fragment.end);
      expect(codePointLength(alone.text)).toBe(fragment.streamEnd - fragment.streamStart);

      // The node-local span lands back on the recorded stream range through the
      // node's own code-point map, with no gap and no overlap.
      const index = nodeCodePointIndex(fragment.node.data);
      const firstLocal = index.starts.indexOf(fragment.start);
      const lastLocal = index.ends.indexOf(fragment.end);
      expect(firstLocal).toBe(0);
      expect(lastLocal).toBe(fragment.streamEnd - fragment.streamStart - 1);
      expect(index.starts.length).toBe(fragment.streamEnd - fragment.streamStart);
    }
  });

  it('gives every stream offset to exactly one fragment', () => {
    const stream = streamOf(ARTICLE_FIXTURE);
    const total = codePointLength(stream.text);

    let cursor = 0;
    for (const fragment of stream.fragments) {
      expect(fragment.streamStart).toBeGreaterThanOrEqual(cursor);
      const gap = sliceCodePoints(stream.text, cursor, fragment.streamStart);
      if (gap !== '') {
        expect(gap).toBe(' ');
      }
      expect(fragment.streamEnd).toBeGreaterThan(fragment.streamStart);
      cursor = fragment.streamEnd;
    }
    expect(sliceCodePoints(stream.text, cursor, total)).toBe('');

    for (let offset = 0; offset < total; offset += 1) {
      const owners = stream.fragments.filter(
        (fragment) => offset >= fragment.streamStart && offset < fragment.streamEnd,
      );
      expect(owners.length).toBeLessThanOrEqual(1);
      if (sliceCodePoints(stream.text, offset, offset + 1) !== ' ') {
        expect(owners).toHaveLength(1);
      }
    }
  });

  it('keeps the two offset domains apart for an astral character', () => {
    const stream = streamOf('<p>a😀b mid</p>');
    expect(stream.text).toBe('a😀b mid');
    expect(stream.fragments).toHaveLength(1);

    const fragment = stream.fragments[0];
    expect(fragment.node.data).toBe('a😀b mid');
    // Code points: 7 (the emoji counts once). UTF-16 units: 8.
    expect(fragment.streamEnd - fragment.streamStart).toBe(7);
    expect(fragment.end - fragment.start).toBe(fragment.node.data.length);
    expect(fragment.end - fragment.start).toBe(8);
  });

  it('maps an internal whitespace run to one stream code point and several node units', () => {
    const stream = streamOf('<p>a\n\n b</p>');
    expect(stream.text).toBe('a b');
    expect(stream.fragments).toHaveLength(1);

    const fragment = stream.fragments[0];
    expect(fragment.streamEnd - fragment.streamStart).toBe(3);
    expect(fragment.start).toBe(0);
    expect(fragment.end).toBe(5);
    expect(fragment.node.data.slice(fragment.start, fragment.end)).toBe('a\n\n b');
  });

  it('trims the fragment ends to the node\'s visible span', () => {
    const stream = streamOf('<p>  padded  </p>');
    const fragment = stream.fragments[0];
    expect(fragment.node.data).toBe('  padded  ');
    expect(fragment.start).toBe(2);
    expect(fragment.end).toBe(8);
    expect(fragment.streamEnd - fragment.streamStart).toBe(6);
  });

  it('accepts a text node, a document fragment or an element as the root', () => {
    const paragraph = subtree('<p>deep <b>inner</b> text</p>').querySelector('p');
    if (paragraph === null) {
      throw new Error('fixture is missing its paragraph');
    }
    expect(buildTextStream(paragraph).text).toBe('deep inner text');

    const only = paragraph.firstChild as Text;
    expect(buildTextStream(only).text).toBe('deep');
    expect(buildTextStream(only).fragments).toHaveLength(1);

    const fragmentNode = document.createDocumentFragment();
    fragmentNode.append(document.createTextNode('frag one'), document.createTextNode('frag two'));
    expect(buildTextStream(fragmentNode).text).toBe('frag onefrag two');
  });
});

describe('node code point index', () => {
  it('spans a whitespace run and counts an astral character once', () => {
    const index = nodeCodePointIndex(' a😀  b');
    expect(index.starts).toEqual([1, 2, 4, 6]);
    expect(index.ends).toEqual([2, 4, 6, 7]);
    expect(index.leadingSeparator).toBe(true);
    expect(index.trailingSeparator).toBe(false);
    expect(index.starts.length).toBe(codePointLength(normalizeText(' a😀  b')));
  });

  it('reports an edge whitespace run as a separator, not as text', () => {
    const index = nodeCodePointIndex('a  ');
    expect(index.starts).toEqual([0]);
    expect(index.ends).toEqual([1]);
    expect(index.trailingSeparator).toBe(true);
    expect(nodeCodePointIndex('   ').starts).toEqual([]);
    expect(nodeCodePointIndex('').starts).toEqual([]);
  });
});

describe('the stream is rebuilt, never cached (A29)', () => {
  it('sees a node the page added and forgets a node the page removed', () => {
    const root = subtree('<p>first</p>');
    expect(buildTextStream(root).text).toBe('first');

    const added = root.appendChild(document.createElement('p'));
    added.append(document.createTextNode('second'));
    expect(buildTextStream(root).text).toBe('first second');

    root.removeChild(added);
    const stream = buildTextStream(root);
    expect(stream.text).toBe('first');
    expect(stream.fragments).toHaveLength(1);
  });

  it('returns fresh fragment objects on every call', () => {
    const root = subtree('<p>same</p>');
    const first = buildTextStream(root);
    const second = buildTextStream(root);
    expect(first.text).toBe(second.text);
    expect(first.fragments[0]).not.toBe(second.fragments[0]);
    expect(first.fragments[0].node).toBe(second.fragments[0].node);
  });
});
