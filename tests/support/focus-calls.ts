/**
 * A spy over the browser's focus method, so the **call shape** of an overlay focus is
 * observable (task `t5-04` AC3).
 *
 * The overlay's promise is that a focus never scrolls the page: the host is
 * `position: fixed`, so a scrolling caret would move the article out from under the
 * widget the reader is looking at. No test DOM shows a scroll, so the promise is pinned
 * where it can be seen — the argument each `focus` call receives — exactly as the
 * `settle delay` and the `url poll interval` are pinned as constants rather than as
 * timers.
 *
 * The spy replaces `HTMLElement.prototype.focus` for one test and calls through to the
 * real method, so the assertions about `document.activeElement` keep working underneath
 * it. `restore()` must be called at the end of the case: the repo runs no global
 * `restoreMocks`, and a leaked spy would hand the next case a focus method that is not
 * the browser's.
 */

import { vi } from 'vitest';

/** One recorded focus call: which element was asked, and with what argument. */
export interface FocusCall {
  readonly element: HTMLElement;
  readonly options: FocusOptions | undefined;
}

/** The recorder, and the only way to put the real method back. */
export interface FocusCallRecorder {
  /** The calls in order, each with the element `focus` was asked on. */
  calls(): FocusCall[];
  /** The calls made on one element (identity, not a description of it). */
  callsOn(element: Element): FocusCall[];
  /** Puts `HTMLElement.prototype.focus` back. */
  restore(): void;
}

/** Starts recording. Every case that calls it must call `restore()`. */
export function recordFocusCalls(): FocusCallRecorder {
  const seen: FocusCall[] = [];
  const original = HTMLElement.prototype.focus;
  const spy = vi.spyOn(HTMLElement.prototype, 'focus');
  spy.mockImplementation(function (this: HTMLElement, options?: FocusOptions): void {
    seen.push({ element: this, options });
    original.call(this, options);
  });
  return {
    calls: (): FocusCall[] => [...seen],
    callsOn: (element: Element): FocusCall[] =>
      seen.filter((call: FocusCall): boolean => call.element === element),
    restore: (): void => {
      spy.mockRestore();
    },
  };
}
