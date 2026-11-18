/**
 * The create card: the widget that appears next to a new selection.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 1-2, Rules /
 * Semantics -> "Counter rules", "The card and the editor must be reachable by
 * keyboard", "Refusal message map"; task `t3-01` AC1, AC3, AC5.
 *
 * What this component owns, and nothing else:
 * - the typed text and the live counter, counted in Unicode **code points**
 *   (`MAX_COMMENT_CODE_POINTS` is core's cap, and `codePointLength` is core's
 *   count, so a `😀` is one character here exactly as it is in the store rule);
 * - the cap: an input longer than the cap cannot be produced, because every
 *   incoming value is cut at the cap before it reaches state — the counter can
 *   therefore never read `257/256`, and the disabled state is the second half of
 *   the same rule rather than a separate guess (`validateComment` is the rule the
 *   store applies, so the button and the store never disagree);
 * - the refusal line: a code from the write is shown through `refusalText`, the
 *   one map in `src/content/text.ts`, and the typed text survives it, because a
 *   user who was refused has to be able to fix the selection or the wording;
 * - the `action row` of ruling `A114`: **one** icon-only button — an inline `<svg>`
 *   check mark and no text node — whose Russian string reaches the reader as
 *   `aria-label` and `title` instead of as visible text, and **no** cancel control, so
 *   `Esc` and a `pointerdown` outside the overlay host are the only ways out.
 *
 * What it does not own: where the card sits (`card-placement.ts`), when it closes
 * (`create-card-controller.tsx`, ruling `A32`), what a create means (`create-note.ts`),
 * and any storage or `chrome.*` call at all.
 */

import { useState } from 'preact/hooks';
import type { TargetedInputEvent, TargetedKeyboardEvent } from 'preact';
import { MAX_COMMENT_CODE_POINTS, validateComment } from '../../core/entry-rules';
import type { CreateNoteResult } from '../create/create-note';
import { CONTENT_STRINGS, cardCounterText, refusalText } from '../text';
import type { ContentRefusalCode } from '../text';
import { SaveActionIcon } from './action-icons';
import {
  CARD_ACTIONS_CLASS,
  CARD_CLASS,
  CARD_COUNTER_CLASS,
  CARD_INPUT_CLASS,
  CARD_PRIMARY_CLASS,
  CARD_REFUSAL_CLASS,
  CARD_WARNING_CLASS,
} from './card-style';

/** Counter value from which the number turns to the warning color (spec: "≥240"). */
export const COUNTER_WARNING_CODE_POINTS = 240;

export interface CreateCardProps {
  /** Hands the typed comment to the create path and reports its outcome. */
  onSubmit: (comment: string) => Promise<CreateNoteResult>;
  /**
   * `Esc`: close and write nothing. Ruling `A114` left no cancel button to call this
   * from inside the widget — the same close path is reached from outside by a
   * `pointerdown` the event seam of `card-events.ts` reports.
   */
  onCancel: () => void;
}

/** The card element tree, rendered into the shadow root by the controller. */
export function CreateCard(props: CreateCardProps) {
  const [comment, setComment] = useState('');
  const [refusal, setRefusal] = useState<ContentRefusalCode | null>(null);
  const [busy, setBusy] = useState(false);

  const counted = validateComment(comment);
  const canSave = counted.codePointLength > 0 && !busy;

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

  const typed = (event: TargetedInputEvent<HTMLTextAreaElement>): void => {
    // The cap is applied to the *value*, not to the key strokes: a pasted block of
    // 4000 characters becomes 256 code points, and the counter stays truthful.
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
        {/* Icon-only under ruling `A114`: the child is the glyph, and the Russian word
            the button used to print is now its accessible name and its tooltip. */}
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
      </div>
    </div>
  );
}

/** The typed value, cut at `MAX_COMMENT_CODE_POINTS` code points. */
export function cutToCodePointCap(value: string): string {
  const characters = Array.from(value);
  return characters.length <= MAX_COMMENT_CODE_POINTS
    ? value
    : characters.slice(0, MAX_COMMENT_CODE_POINTS).join('');
}
