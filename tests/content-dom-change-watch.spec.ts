// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachDomChangeWatch,
  DOM_CHANGE_SETTLE_MS,
} from '../src/content/refresh/dom-change-watch';

/**
 * The DOM change watch (ruling `A195`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md`
 * (Rules / Semantics -> "Late content: the DOM change watch").
 *
 * The defect: an SPA (measured on YouTrack) renders its article after
 * `document_idle`, the boot paint pass resolved no anchors, and nothing re-ran it.
 * The pin is behavioural: a mutation observed after the attach schedules exactly
 * one debounced reaction per burst, the reaction is the caller's callback (never a
 * second paint path), and the teardown disconnects.
 */

describe('the DOM change watch (A195)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the 400ms debounce the spec row states', () => {
    expect(DOM_CHANGE_SETTLE_MS).toBe(400);
  });

  it('a mutation after the attach schedules one debounced reaction', async () => {
    const calls: number[] = [];
    const detach = attachDomChangeWatch(document, {
      onDomChange: (): void => {
        calls.push(calls.length);
      },
    });

    document.body.appendChild(document.createElement('p'));
    await Promise.resolve();
    expect(calls).toHaveLength(0);

    vi.advanceTimersByTime(DOM_CHANGE_SETTLE_MS);
    expect(calls).toHaveLength(1);
    detach();
  });

  it('a burst of mutations is one reaction, not one per record', async () => {
    const calls: number[] = [];
    const detach = attachDomChangeWatch(document, { onDomChange: (): void => void calls.push(0) });

    for (let i = 0; i < 10; i += 1) {
      document.body.appendChild(document.createElement('span'));
    }
    await Promise.resolve();
    vi.advanceTimersByTime(DOM_CHANGE_SETTLE_MS);
    expect(calls).toHaveLength(1);
    detach();
  });

  it('mutations inside the grace coalesce, and a second burst after the first fires again', async () => {
    const calls: number[] = [];
    const detach = attachDomChangeWatch(document, { onDomChange: (): void => void calls.push(0) });

    document.body.appendChild(document.createElement('p'));
    await Promise.resolve();
    vi.advanceTimersByTime(DOM_CHANGE_SETTLE_MS);
    document.body.appendChild(document.createElement('p'));
    await Promise.resolve();
    vi.advanceTimersByTime(DOM_CHANGE_SETTLE_MS);
    expect(calls).toHaveLength(2);
    detach();
  });

  it('the teardown disconnects: no reaction after it', async () => {
    const calls: number[] = [];
    const detach = attachDomChangeWatch(document, { onDomChange: (): void => void calls.push(0) });
    detach();

    document.body.appendChild(document.createElement('p'));
    await Promise.resolve();
    vi.advanceTimersByTime(DOM_CHANGE_SETTLE_MS * 2);
    expect(calls).toHaveLength(0);
  });
});
