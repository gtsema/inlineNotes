// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { attachKeyboardIsolation } from '../src/content/overlay/keyboard-isolation';

/**
 * Keyboard isolation of the overlay host (ruling `A193`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md`
 * (Rules / Semantics -> "Keyboard isolation of the overlay host").
 *
 * The defect: a host page with document-level keyboard shortcuts (YouTrack) saw
 * every keystroke typed into the note field. The fix: one bubble-phase listener
 * per keyboard event on the host stops the event before it reaches the document,
 * after the shadow handlers have run.
 *
 * jsdom composes a real propagation path for shadow trees, so the pin is
 * behavioural: a keydown dispatched on a node inside the overlay host is stopped
 * at the host and never reaches `document`; a keydown dispatched on the page
 * outside the host is untouched; and the teardown removes the listeners.
 */

function hostWithShadow(): { host: HTMLElement; field: HTMLElement } {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const field = document.createElement('textarea');
  shadow.appendChild(field);
  document.body.appendChild(host);
  return { host, field };
}

function press(target: Element, key = 'a'): { document: boolean; window: boolean } {
  const seen = { document: false, window: false };
  document.addEventListener(
    'keydown',
    () => {
      seen.document = true;
    },
  );
  window.addEventListener(
    'keydown',
    () => {
      seen.window = true;
    },
  );
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
  return seen;
}

describe('keyboard isolation of the overlay host (A193)', () => {
  it('a keystroke from inside the overlay host never reaches the document or the window', () => {
    const { host, field } = hostWithShadow();
    attachKeyboardIsolation(host);

    const seen = press(field);

    expect(seen.document).toBe(false);
    expect(seen.window).toBe(false);
  });

  it('a keystroke aimed at the host element itself is stopped too', () => {
    const { host } = hostWithShadow();
    attachKeyboardIsolation(host);

    const seen = press(host, 'Escape');

    expect(seen.document).toBe(false);
  });

  it('a keystroke from the page outside the host is untouched', () => {
    const { host } = hostWithShadow();
    attachKeyboardIsolation(host);
    const page = document.createElement('input');
    document.body.appendChild(page);

    const seen = press(page, 'a');

    expect(seen.document).toBe(true);
    expect(seen.window).toBe(true);
  });

  it('every keyboard event type is stopped, so a page listening on keyup or keypress is covered', () => {
    const { host, field } = hostWithShadow();
    attachKeyboardIsolation(host);
    const seen: string[] = [];
    for (const type of ['keydown', 'keyup', 'keypress']) {
      document.addEventListener(type, () => {
        seen.push(type);
      });
      field.dispatchEvent(
        new KeyboardEvent(type, { key: 'a', bubbles: true, composed: true }),
      );
    }

    expect(seen).toEqual([]);
  });

  it('the teardown restores the page\'s keyboard', () => {
    const { host, field } = hostWithShadow();
    const teardown = attachKeyboardIsolation(host);
    teardown();

    const seen = press(field, 'a');

    expect(seen.document).toBe(true);
    expect(seen.window).toBe(true);
  });
});
