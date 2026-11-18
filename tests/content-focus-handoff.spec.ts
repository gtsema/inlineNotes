// @vitest-environment jsdom
/**
 * The focus handover module of the overlay, driven directly (task `t5-04` AC3, AC4).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Terms / Aliases -> `focus on open`
 * and `focus restore`, Rules / Semantics -> the `focus on open` bullet, and AC17
 * (ruling `A97`, which overturns `A74`; the shape and the `Assumption:` half come from
 * ruling `A105`; ruling `A111` narrowed `A97` to the `editor` alone; ruling `A112` added
 * the typing door, which opens this handover for the `selection card` at the keystroke).
 *
 * Since ruling `A111` the `editor` is the widget that takes the caret **at its open**, and
 * since ruling `A112` a `selection card` the reader typed into takes it **at the
 * keystroke**. `tests/content-editor-controller.spec.ts` pins the rule **at the editor
 * call site**: the editor really moves the caret.
 * `tests/content-create-card-controller.spec.ts` and `tests/content-card-events.spec.ts`
 * pin both halves on the card path — no focus call at the open, and the caret in the
 * field plus a handover that every close hands back after a typing entry — all of it
 * observable through this same recorder. This file pins what those call sites cannot see
 * without a fake, and what the ruling says about the halves no call site can state:
 *
 * - **`preventScroll: true` is one shape, owned once** (`FIELD_FOCUS_OPTIONS`): jsdom
 *   has no scrolling widget to refuse, so the promise is pinned as the argument the
 *   focus method receives — see `tests/support/focus-calls.ts`;
 * - **the deep record**: the document answers the overlay host for a focus inside that
 *   host's shadow tree, and the host is an unfocusable `div`. A handover that recorded
 *   the answer would restore nothing when one widget opens over another;
 * - **nothing is forced** when the recorded element is gone or when the document had
 *   only its own default element: `body` and `documentElement` are never handed focus,
 *   and the recorder proves that `restore` made no call at all.
 *
 * Every case focuses its page control **before** the recorder starts, so a recorded call
 * is a call the module made and the counts mean what they say.
 *
 * No entry, no storage, no paint: the module touches no entry, so the fixture is one
 * shadow host, one wrapper with a note field, and one page control.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { CARD_INPUT_CLASS, WIDGET_ROOT_CLASS } from '../src/content/overlay/card-style';
import { createFocusHandoff, FIELD_FOCUS_OPTIONS } from '../src/content/overlay/focus-handoff';
import type { FocusHandoff } from '../src/content/overlay/focus-handoff';
import type { OverlayHost } from '../src/content/overlay/host';
import { ensureOverlayHost, OVERLAY_HOST_ID, setOverlayHostHidden } from '../src/content/overlay/host';
import type { FocusCallRecorder } from './support/focus-calls';
import { recordFocusCalls } from './support/focus-calls';

const PAGE = '<article id="art"><p id="p1">Some article text that is long enough to select.</p></article>';

let overlay: OverlayHost;

beforeEach(() => {
  document.body.innerHTML = PAGE;
  document.getElementById(OVERLAY_HOST_ID)?.remove();
  const created = ensureOverlayHost();
  if (created === null) {
    throw new Error('the test frame is not the top frame, so the host is not created');
  }
  setOverlayHostHidden(created, false);
  overlay = created;
});

/** A page control the reader had focused before the widget opened. */
function pageControl(id = 'page-cta'): HTMLElement {
  const article = document.getElementById('art');
  if (article === null) {
    throw new Error('the fixture article is missing');
  }
  const control = document.createElement('button');
  control.id = id;
  control.textContent = 'Read more';
  article.append(control);
  control.focus();
  return control;
}

/** A mounted widget: the wrapper the controller renders into, with its note field. */
function mountedWidget(): { wrapper: HTMLElement; field: HTMLTextAreaElement } {
  const wrapper = document.createElement('div');
  wrapper.className = WIDGET_ROOT_CLASS;
  const field = document.createElement('textarea');
  field.className = CARD_INPUT_CLASS;
  field.value = 'draft';
  wrapper.append(field);
  overlay.root.append(wrapper);
  return { wrapper, field };
}

/** A widget that rendered no note field at all — the wrapper of a failed mount. */
function wrapperWithoutField(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = WIDGET_ROOT_CLASS;
  overlay.root.append(wrapper);
  return wrapper;
}

/**
 * Runs one case with the focus method recorded, and puts the real method back
 * whatever the assertions do: the repo runs no global `restoreMocks`.
 */
function withFocusCalls(pageFocused: boolean, body: (recorder: FocusCallRecorder) => void): void {
  if (pageFocused) {
    pageControl();
  }
  const recorder: FocusCallRecorder = recordFocusCalls();
  try {
    body(recorder);
  } finally {
    recorder.restore();
  }
}

describe('the focus shape of the overlay (t5-04 AC3)', () => {
  it('exports one shape, and it says only `preventScroll: true`', () => {
    // The host is `position: fixed`: a caret that scrolls moves the article out from
    // under the widget. The option is the whole promise, so it is pinned as a value and
    // not as an outcome no test DOM can show.
    expect(FIELD_FOCUS_OPTIONS).toEqual({ preventScroll: true });
    expect(Object.keys(FIELD_FOCUS_OPTIONS)).toEqual(['preventScroll']);
  });

  it('asks for the note field with that shape, and the page answers the host', () => {
    withFocusCalls(true, (recorder) => {
      const held = document.getElementById('page-cta');
      const widget = mountedWidget();
      const handoff: FocusHandoff = createFocusHandoff(document, overlay);
      handoff.open(widget.wrapper);

      const fieldCalls = recorder.callsOn(widget.field);
      expect(fieldCalls).toHaveLength(1);
      expect(fieldCalls[0]?.options).toEqual({ preventScroll: true });
      expect(overlay.root.activeElement).toBe(widget.field);
      // Shadow retargeting: the page sees the one host, never the field inside it.
      expect(document.activeElement).toBe(overlay.host);
      expect(document.activeElement).not.toBe(held);
    });
  });

  it('takes no caret when the widget rendered no note field', () => {
    withFocusCalls(true, (recorder) => {
      const held = document.getElementById('page-cta');
      createFocusHandoff(document, overlay).open(wrapperWithoutField());

      expect(recorder.calls()).toEqual([]);
      expect(document.activeElement).toBe(held);
    });
  });
});

describe('the handover back to the page (t5-04 AC4)', () => {
  it('hands the caret back to the element the page had, with the same shape', () => {
    withFocusCalls(true, (recorder) => {
      const held = document.getElementById('page-cta');
      if (held === null) {
        throw new Error('the fixture control is missing');
      }
      const handoff: FocusHandoff = createFocusHandoff(document, overlay);
      const widget = mountedWidget();

      handoff.open(widget.wrapper);
      expect(overlay.root.activeElement).toBe(widget.field);

      handoff.restore();
      expect(recorder.calls()).toHaveLength(2);
      const heldCalls = recorder.callsOn(held);
      expect(heldCalls).toHaveLength(1);
      expect(heldCalls[0]?.options).toEqual({ preventScroll: true });
      expect(document.activeElement).toBe(held);
      expect(overlay.root.activeElement).toBeNull();
    });
  });

  it('records the element inside the shadow tree, not the host the document answers', () => {
    // One widget open over another: the document answers the host for the first
    // widget's caret, and the host is an unfocusable `div`. A handover that recorded the
    // answer would restore nothing, and the reader would lose the caret.
    pageControl();
    const first = mountedWidget();
    first.field.focus();
    expect(document.activeElement).toBe(overlay.host);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      const second = mountedWidget();
      const handoff: FocusHandoff = createFocusHandoff(document, overlay);
      handoff.open(second.wrapper);
      expect(overlay.root.activeElement).toBe(second.field);

      handoff.restore();
      expect(overlay.root.activeElement).toBe(first.field);
      expect(recorder.calls()).toHaveLength(2);
      expect(recorder.callsOn(overlay.host)).toEqual([]);
      expect(recorder.callsOn(first.field)).toHaveLength(1);
    } finally {
      recorder.restore();
    }
  });

  it('forces nothing when the element the page had is gone', () => {
    withFocusCalls(true, (recorder) => {
      const held = document.getElementById('page-cta');
      if (held === null) {
        throw new Error('the fixture control is missing');
      }
      const handoff: FocusHandoff = createFocusHandoff(document, overlay);
      const widget = mountedWidget();

      handoff.open(widget.wrapper);
      expect(overlay.root.activeElement).toBe(widget.field);

      // The page removed the control while the widget stood, and the close unmounted the
      // widget itself — the shipped order of one close path.
      widget.wrapper.remove();
      held.remove();
      handoff.restore();

      // `restore` made no call of any kind, and no substitute appeared: the focus stays
      // where the browser left it, which is neither the removed control nor the host nor
      // the root element.
      expect(recorder.calls()).toHaveLength(1);
      expect(recorder.calls()[0]?.element).toBe(widget.field);
      expect(overlay.root.activeElement).toBeNull();
      expect(document.activeElement).not.toBe(held);
      expect(document.activeElement).not.toBe(widget.field);
      expect(document.activeElement).not.toBe(overlay.host);
      expect(document.activeElement).not.toBe(document.documentElement);
    });
  });

  it('records nothing when the page had only its default element, and restores nothing', () => {
    // No page control was focused: `document.activeElement` answers `body`, which is the
    // document's default answer and not a control the reader had focused. A handover that
    // recorded it would invent a focus the ruling forbids.
    expect(document.activeElement).toBe(document.body);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      const handoff: FocusHandoff = createFocusHandoff(document, overlay);
      const widget = mountedWidget();
      handoff.open(widget.wrapper);
      expect(overlay.root.activeElement).toBe(widget.field);

      handoff.restore();
      expect(recorder.calls()).toHaveLength(1);
      expect(recorder.calls()[0]?.element).toBe(widget.field);
      expect(recorder.callsOn(document.body)).toEqual([]);
      expect(recorder.callsOn(document.documentElement)).toEqual([]);
    } finally {
      recorder.restore();
    }
  });

  it('keeps one record per handover: the last open is what the close restores', () => {
    pageControl();
    const first = mountedWidget();
    const second = mountedWidget();
    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      const handoff: FocusHandoff = createFocusHandoff(document, overlay);
      handoff.open(first.wrapper);
      handoff.open(second.wrapper);
      expect(overlay.root.activeElement).toBe(second.field);

      // The second open recorded the field of the first widget, so that is what the close
      // hands back: the page's control was recorded at the first open only.
      handoff.restore();
      expect(overlay.root.activeElement).toBe(first.field);
      // Two opens asked for two fields, and the one restore asked for one more.
      expect(recorder.calls()).toHaveLength(3);

      // A second restore has no record left, so it cannot call anything.
      handoff.restore();
      expect(recorder.calls()).toHaveLength(3);
    } finally {
      recorder.restore();
    }
  });
});
