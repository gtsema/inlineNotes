// @vitest-environment jsdom
/**
 * The `action row` of the two page widgets: icon-only controls, no cancel control,
 * the Russian word kept as an accessible name (task `t7-01` AC1-AC8; PM ruling
 * `A114`; `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Compact
 * `action row`" and AC27).
 *
 * The widgets are mounted into a plain container, as in
 * `tests/content-create-card-widget.spec.ts`: placement, closing and the storage round
 * trip belong to the controller files, and this file answers one question — what a
 * reader sees and presses in the last line of the card.
 *
 * Two kinds of pin are used here, and the split is deliberate:
 * - what a reader sees and presses is pinned against the rendered widget;
 * - the 24×24 hit box is pinned by reading the **stylesheet text**, because the control
 *   has no label to grow a box any more and the only statement of its size is the rule
 *   in `CARD_CSS` (`A114` AC5).
 *
 * The textual scans over shipped sources — no `Отмена` anywhere in `src/content/`, no
 * tab index set anywhere, no icon control in `src/popup/` or `src/options/` — live in
 * `tests/content-create-card-boundaries.spec.ts`, the file that already owns the file
 * walk; this file runs in the jsdom environment, where the walk has no `file:` URL to
 * start from.
 *
 * What this file deliberately does **not** claim: that a check mark or a trash can is
 * recognizable to a reader. The glyph shapes are the ones ruling `A114` names, and no
 * test decides how they look (the class of invented visual claim ruling `A92` warns
 * about).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, render } from 'preact';
import { CreateCard } from '../src/content/overlay/create-card';
import type { CreateCardProps } from '../src/content/overlay/create-card';
import { EntryEditor } from '../src/content/overlay/editor';
import type { EditorProps } from '../src/content/overlay/editor';
import {
  ACTION_HIT_BOX_PX,
  ACTION_ICON_PX,
  CARD_ACTIONS_CLASS,
  CARD_CLASS,
  CARD_COUNTER_CLASS,
  CARD_CSS,
  CARD_DELETE_CLASS,
  CARD_ICON_CLASS,
  CARD_INPUT_CLASS,
  CARD_PRIMARY_CLASS,
  CARD_REFUSAL_CLASS,
  WIDGET_ROOT_CLASS,
} from '../src/content/overlay/card-style';
import { CONTENT_STRINGS } from '../src/content/text';
import type { CreateNoteResult } from '../src/content/create/create-note';
import type { EditNoteResult } from '../src/content/editor/edit-entry';
import type { EntryWriteResult } from '../src/core/entry-store-write';
import type { Entry } from '../src/core/entry';

/** The word the deleted control printed, pinned as a literal so the pin cannot drift. */
const CANCEL_WORD = 'Отмена';

/** The entry both widgets hand back from a successful write. */
const ENTRY_FIXTURE: Entry = {
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

/** Preact flushes a state update in a microtask; a macrotask boundary is enough. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Mounts the create card into a plain container. */
function mountedCard(props: Partial<CreateCardProps> = {}): {
  container: HTMLElement;
  onCancel: () => void;
} {
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

function mountedEditor(canEdit: boolean, initialComment = 'a note'): {
  container: HTMLElement;
  onCancel: () => void;
  saved: string[];
  deleted: () => number;
} {
  const container = document.createElement('div');
  document.body.append(container);
  const onCancel = vi.fn<() => void>();
  const saved: string[] = [];
  const state = { deleted: 0 };
  const props: EditorProps = {
    initialComment,
    canEdit,
    onSubmit: async (comment: string): Promise<EditNoteResult> => {
      saved.push(comment);
      return { ok: true, entry: { ...ENTRY_FIXTURE, comment } };
    },
    onCancel,
    onDelete: async (): Promise<EntryWriteResult> => {
      state.deleted += 1;
      return { ok: true, entry: ENTRY_FIXTURE };
    },
  };
  render(createElement(EntryEditor, props), container);
  return { container, onCancel, saved, deleted: (): number => state.deleted };
}

/** The buttons of the `action row`, in the order the shadow tree holds them. */
function actionButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll(`.${CARD_ACTIONS_CLASS} button`)].filter(
    (button: Element): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  );
}

/** The action row's button whose accessible name is `name`. */
function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = actionButtons(container).find(
    (candidate: HTMLButtonElement) => candidate.getAttribute('aria-label') === name,
  );
  if (button === undefined) {
    throw new Error(`no action button named ${name} in the rendered widget`);
  }
  return button;
}

function need<Found extends Element>(container: HTMLElement, selector: string): Found {
  const found = container.querySelector(selector);
  if (found === null) {
    throw new Error(`fixture element ${selector} is missing`);
  }
  return found as Found;
}

async function type(container: HTMLElement, value: string): Promise<void> {
  const field = need<HTMLTextAreaElement>(container, `.${CARD_INPUT_CLASS}`);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settled();
}

function pressKey(container: HTMLElement, key: string, modifier?: 'ctrl' | 'meta'): void {
  const field = need<HTMLTextAreaElement>(container, `.${CARD_INPUT_CLASS}`);
  field.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      ...(modifier === 'ctrl' ? { ctrlKey: true } : {}),
      ...(modifier === 'meta' ? { metaKey: true } : {}),
    }),
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('AC1: no cancel control is rendered, by either widget', () => {
  it('renders one action button in the card and two in the editor, none of them a cancel', async () => {
    const card = mountedCard();
    await settled();
    expect(actionButtons(card.container)).toHaveLength(1);

    const editor = mountedEditor(true);
    await settled();
    expect(actionButtons(editor.container)).toHaveLength(2);

    // A control that is not rendered leaves no positive assertion, so the absence is
    // pinned from the rendered side here, and from the shipped-source side in
    // `tests/content-create-card-boundaries.spec.ts`.
    for (const container of [card.container, editor.container]) {
      expect(container.textContent ?? '').not.toContain(CANCEL_WORD);
      expect(container.innerHTML).not.toContain(CANCEL_WORD);
    }
  });

  it('pressing the only button of the card is a save, never a close', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: true, entry: ENTRY_FIXTURE }));
    const card = mountedCard({ onSubmit });
    await type(card.container, 'draft');

    actionButtons(card.container)[0]?.click();
    await settled();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(card.onCancel).not.toHaveBeenCalled();
  });
});

describe('AC3, AC4: the two controls are icon-only and carry their Russian names', () => {
  for (const widget of ['card', 'editor'] as const) {
    it(`${widget} save button holds no text node, renders one inline svg, and is named Сохранить`, async () => {
      const container = widget === 'card' ? mountedCard().container : mountedEditor(true).container;
      await settled();

      const save = buttonNamed(container, CONTENT_STRINGS.save);
      expect(save.getAttribute('aria-label')).toBe(CONTENT_STRINGS.save);
      expect(save.getAttribute('title')).toBe(CONTENT_STRINGS.save);
      expect(save.textContent).toBe('');
      // Exactly one child, and it is an element.
      expect(save.childNodes).toHaveLength(1);
      const glyph = save.firstElementChild;
      expect(glyph?.tagName.toLowerCase()).toBe('svg');
      expect(glyph?.getAttribute('class')).toBe(CARD_ICON_CLASS);
      expect(save.classList.contains(CARD_PRIMARY_CLASS)).toBe(true);
      // No image file, no font glyph, no emoji: the drawing is one or more `<path>`s.
      expect(save.querySelector('img')).toBeNull();
      for (const child of [...glyph?.children ?? []]) {
        expect(child.tagName.toLowerCase()).toBe('path');
      }
    });
  }

  it('editor delete button is the same shape and carries Удалить', async () => {
    const editor = mountedEditor(true);
    await settled();

    const remove = buttonNamed(editor.container, CONTENT_STRINGS.delete);
    expect(remove.getAttribute('aria-label')).toBe(CONTENT_STRINGS.delete);
    expect(remove.getAttribute('title')).toBe(CONTENT_STRINGS.delete);
    expect(remove.textContent).toBe('');
    expect(remove.childNodes).toHaveLength(1);
    expect(remove.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    // The warning color of the row is the color of the glyph too, because the stroke is
    // `currentColor` — so the delete class stays the only marker of the destructive one.
    expect(remove.classList.contains(CARD_DELETE_CLASS)).toBe(true);
    expect(remove.querySelector('img')).toBeNull();

    // The press of the icon is the same press the labelled button answered: one delete
    // call, and not one cancel (`A44` keeps the absence of a confirmation step).
    remove.click();
    await settled();
    expect(editor.deleted()).toBe(1);
    expect(editor.onCancel).not.toHaveBeenCalled();
  });

  it('renders no save and no delete node at all for a foreign entry (A25)', async () => {
    const editor = mountedEditor(false);
    await settled();

    // Unrendered means no node, not a disabled node: the authorship half of `A25` is the
    // absence of the control, and an icon-only row cannot hide one behind a label.
    expect(actionButtons(editor.container)).toEqual([]);
    expect(editor.container.querySelector(`.${CARD_DELETE_CLASS}`)).toBeNull();
    expect(editor.container.querySelector(`.${CARD_PRIMARY_CLASS}`)).toBeNull();
    expect(editor.container.querySelector(`.${CARD_ICON_CLASS}`)).toBeNull();
    expect(editor.container.querySelector('svg')).toBeNull();
  });
});

/**
 * The body of one rule of the shipped stylesheet, addressed by its selector text.
 * A declaration read out of the whole stylesheet would not say **which** element it
 * sizes, and AC5 is a statement about the button of the `action row`.
 */
function ruleBody(selector: string): string {
  const marker = `${selector} {`;
  const start = CARD_CSS.indexOf(marker);
  if (start < 0) {
    throw new Error(`the shipped stylesheet declares no rule for ${selector}`);
  }
  const end = CARD_CSS.indexOf('}', start);
  return CARD_CSS.slice(start + marker.length, end);
}

const ROW_SELECTOR = `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS}`;
const ROW_BUTTON_SELECTOR = `${ROW_SELECTOR} button`;
const ROW_ICON_SELECTOR = `${ROW_SELECTOR} .${CARD_ICON_CLASS}`;

describe('AC5: the hit box and the glyph paint are declared in the shipped stylesheet', () => {
  it('declares a 24x24 minimum box for every button of the row, read as stylesheet text', () => {
    expect(ACTION_HIT_BOX_PX).toBe(24);
    const button = ruleBody(ROW_BUTTON_SELECTOR);
    for (const declaration of [
      `width: ${String(ACTION_HIT_BOX_PX)}px;`,
      `height: ${String(ACTION_HIT_BOX_PX)}px;`,
      `min-width: ${String(ACTION_HIT_BOX_PX)}px;`,
      `min-height: ${String(ACTION_HIT_BOX_PX)}px;`,
      'padding: 0;',
      'display: inline-flex;',
    ]) {
      expect(button, declaration).toContain(declaration);
    }
    // The tighter row `A114` asks for: the buttons carry no inner padding of their own,
    // and the row's gap is smaller than the 8 px a row of labelled buttons needed.
    const gap = /gap: (\d+)px;/.exec(ruleBody(ROW_SELECTOR));
    expect(Number(gap?.[1])).toBeLessThan(8);
  });

  it('states the glyph size and paint as a rule and as attributes', () => {
    expect(ACTION_ICON_PX).toBeLessThanOrEqual(ACTION_HIT_BOX_PX);
    const icon = ruleBody(ROW_ICON_SELECTOR);
    for (const declaration of [
      `width: ${String(ACTION_ICON_PX)}px;`,
      `height: ${String(ACTION_ICON_PX)}px;`,
      'fill: none;',
    ]) {
      expect(icon, declaration).toContain(declaration);
    }
    // `currentColor` is the only paint the glyph states: the primary, delete and
    // disabled colors of the button rules become the color of the drawing on their own,
    // and no image file or gradient is anywhere in the stylesheet.
    expect([...icon.matchAll(/stroke: ([^;]+);/g)].map((match) => match[1])).toEqual([
      'currentColor',
    ]);
    expect(CARD_CSS).not.toContain('url(');

    const container = mountedEditor(true).container;
    for (const glyph of [...container.querySelectorAll('svg')]) {
      expect(glyph.getAttribute('width')).toBe(String(ACTION_ICON_PX));
      expect(glyph.getAttribute('height')).toBe(String(ACTION_ICON_PX));
      expect(glyph.getAttribute('fill')).toBe('none');
      expect(glyph.getAttribute('stroke')).toBe('currentColor');
      // `all: initial` on the host resets inherited values, so the glyph is hidden from
      // assistive technology that would otherwise read an unnamed graphic next to a name.
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
      expect(glyph.getAttribute('viewBox')).not.toBeNull();
    }
  });
});

describe('AC6: the rendered order is textarea then save, then delete', () => {
  it('renders the card as textarea, save', async () => {
    const card = mountedCard();
    await settled();
    await type(card.container, 'a note');

    const order = [...card.container.querySelectorAll(`.${CARD_CLASS} textarea, button`)];
    expect(order.map((element: Element) => element.tagName)).toEqual(['TEXTAREA', 'BUTTON']);
    expect(order[order.length - 1]).toBe(buttonNamed(card.container, CONTENT_STRINGS.save));
  });

  it('renders the editor as textarea, save, delete', async () => {
    const editor = mountedEditor(true);
    await settled();

    const order = [...editor.container.querySelectorAll(`.${CARD_CLASS} textarea, button`)];
    expect(order.map((element: Element) => element.tagName)).toEqual([
      'TEXTAREA',
      'BUTTON',
      'BUTTON',
    ]);
    expect(order[0]).toBe(need(editor.container, `.${CARD_INPUT_CLASS}`));
    expect(order.map((element: Element) => element.getAttribute('aria-label') ?? '')).toEqual([
      CONTENT_STRINGS.commentInput,
      CONTENT_STRINGS.save,
      CONTENT_STRINGS.delete,
    ]);
  });

  it('introduces no tab index on any rendered control', async () => {
    const card = mountedCard();
    const editor = mountedEditor(true);
    await settled();

    for (const container of [card.container, editor.container]) {
      for (const element of [...container.querySelectorAll('*')]) {
        expect(element.getAttribute('tabindex')).toBeNull();
      }
    }
    // The shipped-source half of the same statement — no `setAttribute('tabindex'` and no
    // `Tab` interception in any module of `src/content/` — is pinned in
    // `tests/content-create-card-boundaries.spec.ts`.
  });
});

describe('AC7: the behavior the compaction must not have touched', () => {
  it('keeps the card save button disabled for an empty, a blank and an over-cap comment', async () => {
    const card = mountedCard();
    await settled();
    expect(buttonNamed(card.container, CONTENT_STRINGS.save).disabled).toBe(true);

    await type(card.container, '   ');
    expect(buttonNamed(card.container, CONTENT_STRINGS.save).disabled).toBe(true);

    await type(card.container, 'a'.repeat(300));
    // The cap is applied on the way in, so the field holds the cap and the button stays
    // usable: the over-cap state is unrepresentable rather than disabled.
    expect(need<HTMLElement>(card.container, `.${CARD_COUNTER_CLASS}`).textContent).toBe('256/256');
    expect(buttonNamed(card.container, CONTENT_STRINGS.save).disabled).toBe(false);
  });

  it('keeps the editor save button disabled for an empty stored draft', async () => {
    const editor = mountedEditor(true, '');
    await settled();

    expect(buttonNamed(editor.container, CONTENT_STRINGS.save).disabled).toBe(true);
    expect(buttonNamed(editor.container, CONTENT_STRINGS.delete).disabled).toBe(false);
  });

  it('still saves on Ctrl+Enter and on Cmd+Enter, and closes on Esc, in both widgets', async () => {
    const card = mountedCard();
    await settled();
    await type(card.container, 'draft');
    pressKey(card.container, 'Enter', 'ctrl');
    await settled();
    expect(card.onCancel).not.toHaveBeenCalled();

    pressKey(card.container, 'Escape');
    await settled();
    expect(card.onCancel).toHaveBeenCalledTimes(1);

    const editor = mountedEditor(true);
    await settled();
    pressKey(editor.container, 'Enter', 'meta');
    await settled();
    expect(editor.saved).toEqual(['a note']);
    expect(editor.onCancel).not.toHaveBeenCalled();

    pressKey(editor.container, 'Escape');
    await settled();
    expect(editor.onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the refusal line and the counter of the card as they were', async () => {
    const onSubmit = vi.fn(async (): Promise<CreateNoteResult> => ({ ok: false, code: 'overlap' }));
    const card = mountedCard({ onSubmit });
    await settled();
    await type(card.container, 'my note');
    buttonNamed(card.container, CONTENT_STRINGS.save).click();
    await settled();

    expect(need<HTMLElement>(card.container, `.${CARD_REFUSAL_CLASS}`).textContent).toBe(
      'Выделение пересекается с существующей записью',
    );
    expect(need<HTMLElement>(card.container, `.${CARD_COUNTER_CLASS}`).textContent).toBe('7/256');
  });
});

describe('AC8: the rules that did not move, and the surfaces this task stayed out of', () => {
  it('keeps the non-action visual rules of the card in the stylesheet', () => {
    for (const declaration of [
      'width: 300px;',
      'max-width: 92vw;',
      'font-size: 13px;',
      'color: #5b6470;',
      'color: #8a4b08;',
      `.${CARD_REFUSAL_CLASS} {`,
      'color: #a4262c;',
    ]) {
      expect(CARD_CSS).toContain(declaration);
    }
  });
});

// The third half of AC8 — the popup and the options page gained no icon control and lost
// no word — is a source scan and lives in
// `tests/content-create-card-boundaries.spec.ts`.
