// @vitest-environment jsdom
/**
 * The create card widget: counter, cap, Save state, refusal line (task `t3-01`
 * AC2, AC3; `docs/specs/content-overlay-ui.md` -> Flow / Sequence 1-2 and Rules /
 * Semantics -> "Counter rules", "Refusal message map", "The card and the editor
 * must be reachable by keyboard").
 *
 * The widget is mounted into a plain container here — placement, closing and the
 * storage round trip belong to the controller tests — so every assertion is about
 * what the user sees and can operate:
 *
 * - the counter is `<trimmed code points>/256`: the number is the one the store
 *   measures (`validateComment`), so a whitespace-only note reads `0/256` next to a
 *   disabled button instead of a number that contradicts it;
 * - the cap cannot be exceeded by typing **or** pasting: the value is cut at 256
 *   code points, and an astral character is one character, which a UTF-16 length
 *   check would get wrong by a factor of two;
 * - a refusal keeps the typed text and shows the sentence of the code, with
 *   `duplicate` and `overlap` visibly different (ruling `A47`);
 * - the affordances are real controls: a `<textarea>` and one `<button>`, so keyboard
 *   focus and Enter work without a mouse. Since ruling `A114` that button is the only
 *   one the row holds — it is icon-only, so its Russian word reaches the reader as
 *   `aria-label` and `title` and never as a text node — and the card has no cancel
 *   control to click.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, render } from 'preact';
import { CreateCard } from '../src/content/overlay/create-card';
import type { CreateCardProps } from '../src/content/overlay/create-card';
import {
  CARD_ACTIONS_CLASS,
  CARD_COUNTER_CLASS,
  CARD_INPUT_CLASS,
  CARD_REFUSAL_CLASS,
  CARD_WARNING_CLASS,
} from '../src/content/overlay/card-style';
import { CONTENT_STRINGS, REFUSAL_TEXT } from '../src/content/text';
import { MAX_COMMENT_CODE_POINTS, codePointLength } from '../src/core/entry-rules';
import type { CreateNoteResult } from '../src/content/create/create-note';

/** Preact flushes a state update in a microtask; a macrotask boundary is enough. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function need<Element extends HTMLElement>(container: HTMLElement, selector: string): Element {
  const found = container.querySelector(selector);
  if (found === null) {
    throw new Error(`fixture element ${selector} is missing`);
  }
  return found as Element;
}

function input(container: HTMLElement): HTMLTextAreaElement {
  return need<HTMLTextAreaElement>(container, `.${CARD_INPUT_CLASS}`);
}

function saveButton(container: HTMLElement): HTMLButtonElement {
  const buttons = container.querySelectorAll('button');
  const first = buttons[0];
  if (first === undefined) {
    throw new Error('fixture button is missing');
  }
  return first;
}

function counterText(container: HTMLElement): string {
  return need<HTMLElement>(container, `.${CARD_COUNTER_CLASS}`).textContent ?? '';
}

async function type(container: HTMLElement, value: string): Promise<void> {
  const field = input(container);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settled();
}

function mount(props: Partial<CreateCardProps> = {}): { container: HTMLElement; onCancel: () => void } {
  const container = document.createElement('div');
  document.body.append(container);
  const onCancel = vi.fn<() => void>();
  render(
    createElement(CreateCard, {
      onSubmit: async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }),
      onCancel,
      ...props,
    }),
    container,
  );
  return { container, onCancel };
}

const ENTRY_FIXTURE = {
  id: 'a'.repeat(12),
  pageKey: 'https://example.test/article',
  authorName: 'reader-one',
  text: 'quick brown',
  comment: 'a note',
  anchor: { text: 'quick brown', prefix: 'the ', suffix: ' fox', fragmentCount: 1 },
  createdAt: '2026-01-02T03:04:05.006Z',
  updatedAt: '2026-01-02T03:04:05.006Z',
  visible: true,
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('an empty card', () => {
  it('carries the Russian strings of the constants module as the accessible name of the button', () => {
    const { container } = mount();
    const field = input(container);
    expect(field.getAttribute('aria-label')).toBe(CONTENT_STRINGS.commentInput);
    // Ruling `A114`: the word did not leave the product, it left the visible text.
    const save = saveButton(container);
    expect(save.getAttribute('aria-label')).toBe(CONTENT_STRINGS.save);
    expect(save.getAttribute('title')).toBe(CONTENT_STRINGS.save);
    expect(save.textContent).toBe('');
    // No button of the row prints a word, and the string `Отмена` is nowhere in the
    // card: the cancel control is gone, not merely unlabeled.
    for (const button of [...container.querySelectorAll('button')]) {
      expect(button.textContent).toBe('');
    }
    expect(container.textContent ?? '').not.toContain('Отмена');
  });

  it('counts zero and disables Save', () => {
    const { container } = mount();
    expect(counterText(container)).toBe('0/256');
    expect(saveButton(container).disabled).toBe(true);
  });

  it('treats a whitespace-only note as empty', async () => {
    const { container } = mount();
    await type(container, '   ');
    expect(counterText(container)).toBe('0/256');
    expect(saveButton(container).disabled).toBe(true);
  });

  it('is built from real controls, so the keyboard reaches it', () => {
    const { container } = mount();
    expect(input(container).tagName).toBe('TEXTAREA');
    const buttons = container.querySelectorAll('button');
    // One action button, not two: ruling `A114` took the cancel control away.
    expect(buttons.length).toBe(1);
    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.disabled ? button.getAttribute('aria-disabled') : null).toBeNull();
    }
  });
});

describe('the live counter', () => {
  it('counts the trimmed comment in code points', async () => {
    const { container } = mount();
    await type(container, '  hello  ');
    expect(counterText(container)).toBe('5/256');
    expect(saveButton(container).disabled).toBe(false);
  });

  it('counts one astral character as one character', async () => {
    const { container } = mount();
    await type(container, '\u{1F600}\u{1F600}\u{1F600}');
    expect(counterText(container)).toBe('3/256');
  });

  it('turns to the warning color at 240 and stays readable at the cap', async () => {
    const { container } = mount();
    await type(container, 'a'.repeat(240));
    const counter = need<HTMLElement>(container, `.${CARD_COUNTER_CLASS}`);
    expect(counter.className).toContain(CARD_WARNING_CLASS);
    expect(counterText(container)).toBe('240/256');
  });

  it('leaves the normal color below the warning value', async () => {
    const { container } = mount();
    await type(container, 'a'.repeat(239));
    expect(need<HTMLElement>(container, `.${CARD_COUNTER_CLASS}`).className).not.toContain(
      CARD_WARNING_CLASS,
    );
  });
});

describe('the cap', () => {
  it('cuts typed text at the cap instead of letting the counter overflow', async () => {
    const { container } = mount();
    await type(container, 'a'.repeat(MAX_COMMENT_CODE_POINTS + 44));
    expect(input(container).value).toHaveLength(MAX_COMMENT_CODE_POINTS);
    expect(counterText(container)).toBe('256/256');
  });

  it('counts the cap in code points for a pasted astral run', async () => {
    const { container } = mount();
    await type(container, '\u{1F600}'.repeat(MAX_COMMENT_CODE_POINTS + 10));
    const value = input(container).value;
    expect(codePointLength(value)).toBe(MAX_COMMENT_CODE_POINTS);
    expect(counterText(container)).toBe('256/256');
  });
});

describe('a refused create', () => {
  async function refuse(code: 'overlap' | 'duplicate' | 'page_limit' | 'name_required' | 'selection_lost' | 'entry_invalid'): Promise<HTMLElement> {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: false, code }));
    const { container } = mount({ onSubmit });
    await type(container, 'my note');
    saveButton(container).click();
    await settled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    return container;
  }

  it('shows the sentence of the code and keeps the typed text', async () => {
    const container = await refuse('overlap');
    expect(need<HTMLElement>(container, `.${CARD_REFUSAL_CLASS}`).textContent).toBe(
      REFUSAL_TEXT.overlap,
    );
    expect(input(container).value).toBe('my note');
  });

  it('says something different for a duplicate than for an overlap (A47)', async () => {
    const container = await refuse('duplicate');
    const line = need<HTMLElement>(container, `.${CARD_REFUSAL_CLASS}`).textContent ?? '';
    expect(line).toBe(REFUSAL_TEXT.duplicate);
    expect(line).not.toBe(REFUSAL_TEXT.overlap);
  });

  it('answers every code with a sentence, including the one the card reports itself', async () => {
    const container = await refuse('selection_lost');
    expect(need<HTMLElement>(container, `.${CARD_REFUSAL_CLASS}`).textContent).toBe(
      REFUSAL_TEXT.selection_lost,
    );
  });

  it('shows the limit sentence built from the core cap', async () => {
    const container = await refuse('page_limit');
    expect(need<HTMLElement>(container, `.${CARD_REFUSAL_CLASS}`).textContent).toBe(
      REFUSAL_TEXT.page_limit,
    );
  });

  it('maps a bug-level code to a sentence instead of staying silent', async () => {
    const container = await refuse('entry_invalid');
    expect(need<HTMLElement>(container, `.${CARD_REFUSAL_CLASS}`).textContent).toBe(
      REFUSAL_TEXT.entry_invalid,
    );
  });

  it('stays silent after a successful create', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const { container } = mount({ onSubmit });
    await type(container, 'my note');
    saveButton(container).click();
    await settled();
    expect(container.querySelector(`.${CARD_REFUSAL_CLASS}`)).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('clears the sentence as soon as the user edits the note', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: false, code: 'overlap' }));
    const { container } = mount({ onSubmit });
    await type(container, 'my note');
    saveButton(container).click();
    await settled();
    expect(container.querySelector(`.${CARD_REFUSAL_CLASS}`)).not.toBeNull();
    await type(container, 'my other note');
    expect(container.querySelector(`.${CARD_REFUSAL_CLASS}`)).toBeNull();
  });

  it('does not send the same comment twice while the write is running', async () => {
    // A property holder rather than a `let`: the resolver arrives inside the promise
    // executor, and a `let` whose only visible assignment is its `null` initializer
    // is narrowed to `never` at the call site.
    const pending: { release: ((result: CreateNoteResult) => void) | null } = {
      release: null,
    };
    const onSubmit = vi.fn(
      () =>
        new Promise<CreateNoteResult>((resolve) => {
          pending.release = resolve;
        }),
    );
    const { container } = mount({ onSubmit });
    await type(container, 'my note');
    saveButton(container).click();
    await settled();
    saveButton(container).click();
    saveButton(container).click();
    await settled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const release = pending.release;
    if (release === null) {
      throw new Error('fixture write never received a resolver');
    }
    release({ ok: true, entry: ENTRY_FIXTURE });
    await settled();
  });
});

describe('the keyboard affordances of the card', () => {
  it('cancels on Escape', async () => {
    const { container, onCancel } = mount();
    await type(container, 'draft');
    input(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('saves on Ctrl+Enter and does not cancel', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const { container, onCancel } = mount({ onSubmit });
    await type(container, 'draft');
    input(container).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    await settled();
    expect(onSubmit).toHaveBeenCalledWith('draft');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('saves on Cmd+Enter as well', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const { container } = mount({ onSubmit });
    await type(container, 'draft');
    input(container).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
    );
    await settled();
    expect(onSubmit).toHaveBeenCalledWith('draft');
  });

  it('does not save on a plain Enter, because the note is multi-line', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const { container } = mount({ onSubmit });
    await type(container, 'draft');
    input(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('holds no cancel control, so no button press closes the card (A114)', async () => {
    // The pin that pressed `Отмена` keeps its outcome and changes its driver: the row
    // now holds exactly one button, and pressing it is a save, never a close. `Esc`
    // above is the surviving way out of this widget.
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const { container, onCancel } = mount({ onSubmit });
    await type(container, 'draft');
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    saveButton(container).click();
    await settled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('sends nothing when Save is clicked while disabled', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const { container } = mount({ onSubmit });
    await type(container, '   ');
    saveButton(container).click();
    await settled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector(`.${CARD_ACTIONS_CLASS}`)).not.toBeNull();
  });
});
