import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { OVERLAY_HOST_Z_INDEX, hostInlineStyle } from '../src/content/overlay/host-style';

/**
 * Hidden-state contract of the single shadow host (task `t1-02`, carried over
 * from the `t1-01` review).
 *
 * `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Overlay host" says
 * the page gets exactly one element and isolated styles. Nothing may be painted
 * before `t3-01`, so the host must really be hidden: `all: initial` resets
 * `display` and would defeat the user-agent `[hidden] { display: none }` rule.
 *
 * This file deliberately runs without a DOM: PM ruling `A2` admits `jsdom` as a
 * dev-only environment for the anchor and stream tests
 * (`tests/content-anchor-*.spec.ts`), and nothing else needs a document. The
 * proof here is the style string the host element receives plus a source check
 * that `ensureOverlayHost` applies it while the element is hidden.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

function hostSource(): string {
  return codeOnly(
    readFileSync(join(projectRoot, 'src', 'content', 'overlay', 'host.ts'), 'utf8'),
  );
}

describe('overlay host hidden state (AC6)', () => {
  it('declares display:none after all:initial while hidden', () => {
    const style = hostInlineStyle(true);
    const resetAt = style.indexOf('all: initial');
    const hiddenAt = style.indexOf('display: none');

    expect(resetAt).toBeGreaterThanOrEqual(0);
    expect(hiddenAt).toBeGreaterThan(resetAt);
    expect(style.match(/display:/g) ?? []).toHaveLength(1);
  });

  it('has exactly one display declaration in each state', () => {
    expect(hostInlineStyle(true)).not.toContain('display: block');
    expect(hostInlineStyle(false)).toContain('display: block');
    expect(hostInlineStyle(false).match(/display:/g) ?? []).toHaveLength(1);
  });

  it('keeps the isolated box of the overlay spec for the painted state', () => {
    const style = hostInlineStyle(false);
    expect(style).toContain('all: initial');
    expect(style).toContain('position: fixed');
    expect(style).toContain('pointer-events: none');
    expect(style).toContain(`z-index: ${String(OVERLAY_HOST_Z_INDEX)}`);
    expect(OVERLAY_HOST_Z_INDEX).toBe(2147483000);
  });

  it('creates the host hidden and applies the style through the helper', () => {
    const code = hostSource();
    expect(code).toContain('host.hidden = true');
    expect(code).toContain('hostInlineStyle(host.hidden)');
  });

  it('leaves no inline display rule that could defeat [hidden]', () => {
    const code = hostSource();
    expect(code).not.toContain('all: initial');
    expect(code).not.toContain('display:');
    expect(code).not.toMatch(/\bhost\.style\b/);
    expect(code).not.toContain('cssText');
  });

  it('adds exactly one element to the page', () => {
    const code = hostSource();
    expect(code).toContain("document.getElementById(OVERLAY_HOST_ID)");
    expect(code).toContain('document.documentElement.append(host)');
    expect(code.match(/document\.createElement\(/g) ?? []).toHaveLength(1);
  });
});
