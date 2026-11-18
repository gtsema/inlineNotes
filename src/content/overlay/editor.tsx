/**
 * The editor of an existing entry: the same widget as the create card, opened with
 * the stored comment and one extra control.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 4-5, Rules /
 * Semantics -> "Counter rules", "The card and the editor must be reachable by
 * keyboard", "The `editor widget` is opened by a click on the `tooltip`, never by a page
 * `selection`" (ruling `A96`), "Refusal message map"; task `t3-03` AC1, AC3, AC4, AC5;
 * model AC7 and AC8.
 *
 * Why this is a second component over the same classes rather than one component with
 * a mode flag: the two flows ask different questions of their state. The create card
 * starts empty and cannot save an empty value; the editor starts with a stored comment
 * and can save that same comment (an explicit save of an unchanged comment is a
 * legitimate `updatedAt` write). A flag would push both rules into one component and
 * make the difference invisible. What they share is the stylesheet, the class names,
 * the counter rule and the cap rule — all of which are imported, not copied.
 *
 * What this component owns, and nothing else:
 * - the draft: the stored comment becomes the initial value, every typed value is cut
 *   at `MAX_COMMENT_CODE_POINTS` code points by the same core cap the store applies,
 *   and the counter reads code points, never UTF-16 units;
 * - the two actions of Flow 5 — save, delete — in that rendered order, each of them an
 *   icon-only button of the `action row` (ruling `A114`: an inline `<svg>` glyph, no
 *   text node, the Russian word carried as `aria-label` and `title`), and no cancel
 *   control at all, with no `tabindex` anywhere (overlay AC17 for the card, the same
 *   rule here);
 * - the `refusal line`: a code from the write is shown through `refusalText`, and the
 *   draft survives it, because a reader refused with the `overlap` sentence has to be
 *   able to re-select and press the save button again (task `t3-03` AC5);
 * - the authorship half of model AC8: the save and delete buttons are not rendered at
 *   all
 *   when `canEdit` is `false`. The controller never opens this widget for a foreign
 *   entry (`A25`), so the flag is the second line of the same rule rather than the
 *   only one: a foreign record that reached this component by any route still exposes
 *   no write and no delete.
 *
 * What it does not own: where it sits, when it closes, what a save or a delete means,
 * and any storage or `chrome.*` call at all.
 */

import { useState } from 'preact/hooks';
import type { TargetedInputEvent, TargetedKeyboardEvent } from 'preact';
import { validateComment } from '../../core/entry-rules';
import type { EntryWriteResult } from '../../core/entry-store-write';
import type { EditNoteResult } from '../editor/edit-entry';
import { CONTENT_STRINGS, cardCounterText, refusalText } from '../text';
import type { ContentRefusalCode } from '../text';
import { COUNTER_WARNING_CODE_POINTS, cutToCodePointCap } from './create-card';
import { DeleteActionIcon, SaveActionIcon } from './action-icons';
import {
  CARD_ACTIONS_CLASS,
  CARD_CLASS,
  CARD_COUNTER_CLASS,
  CARD_DELETE_CLASS,
  CARD_INPUT_CLASS,
  CARD_PRIMARY_CLASS,
  CARD_REFUSAL_CLASS,
  CARD_WARNING_CLASS,
} from './card-style';

export interface EditorProps {
  /** The stored comment of the entry being edited, as the initial draft. */
  initialComment: string;
  /** `true` when the current name is the entry's author; core `canEdit` decides it. */
  canEdit: boolean;
  /** Hands the draft to the edit path and reports its outcome. */
  onSubmit: (comment: string) => Promise<EditNoteResult>;
  /**
   * `Esc`, a pointer press outside the overlay host, a page scroll: close, write
   * nothing. Ruling `A114` removed the cancel button that used to call this from
   * inside the widget, so the close path is reached from outside only.
   */
  onCancel: () => void;
  /** Delete: removes the entry at once — no confirmation step exists (ruling `A44`). */
  onDelete: () => Promise<EntryWriteResult>;
}

/** The editor element tree, rendered into the shadow root by the controller. */
export function EntryEditor(props: EditorProps) {
  const [comment, setComment] = useState(props.initialComment);
  const [refusal, setRefusal] = useState<ContentRefusalCode | null>(null);
  const [busy, setBusy] = useState(false);

  const counted = validateComment(comment);
  const canSave = counted.codePointLength > 0 && !busy && props.canEdit;

  const submit = async (): Promise<void> => {
    if (!canSave) {
      return;
    }
    setBusy(true);
    const result = await props.onSubmit(comment);
    setBusy(false);
    if (!result.ok) {
      setRefusal(result.code);
    }
  };

  const remove = async (): Promise<void> => {
    if (!props.canEdit || busy) {
      return;
    }
    setBusy(true);
    const result = await props.onDelete();
    setBusy(false);
    if (!result.ok) {
      setRefusal(result.code);
    }
  };

  const typed = (event: TargetedInputEvent<HTMLTextAreaElement>): void => {
    setComment(cutToCodePointCap(event.currentTarget.value));
    setRefusal(null);
  };

  const keyDown = (event: TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div class={CARD_CLASS} onKeyDown={keyDown}>
      <textarea
        class={CARD_INPUT_CLASS}
        value={comment}
        aria-label={CONTENT_STRINGS.commentInput}
        placeholder={CONTENT_STRINGS.commentInput}
        onInput={typed}
      />
      <span
        class={
          counted.codePointLength >= COUNTER_WARNING_CODE_POINTS
            ? `${CARD_COUNTER_CLASS} ${CARD_WARNING_CLASS}`
            : CARD_COUNTER_CLASS
        }
      >
        {cardCounterText(counted.codePointLength)}
      </span>
      {refusal === null ? null : <p class={CARD_REFUSAL_CLASS}>{refusalText(refusal)}</p>}
      <div class={CARD_ACTIONS_CLASS}>
        {/* Icon-only under ruling `A114`: the child of each button is its glyph, and the
            Russian word each one used to print is now its accessible name and its
            tooltip. A foreign entry still renders no write and no delete node at all. */}
        {props.canEdit ? (
          <button
            class={CARD_PRIMARY_CLASS}
            type="button"
            disabled={!canSave}
            aria-label={CONTENT_STRINGS.save}
            title={CONTENT_STRINGS.save}
            onClick={() => void submit()}
          >
            <SaveActionIcon />
          </button>
        ) : null}
        {props.canEdit ? (
          <button
            class={CARD_DELETE_CLASS}
            type="button"
            aria-label={CONTENT_STRINGS.delete}
            title={CONTENT_STRINGS.delete}
            onClick={() => void remove()}
          >
            <DeleteActionIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
