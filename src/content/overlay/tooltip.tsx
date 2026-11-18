/**
 * The hover tooltip: the small card that names the author of a painted note and shows
 * its comment (task `t3-02` AC3, AC4; the click of task `t5-03` AC1-AC3).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 3-4, Rules /
 * Semantics -> "Own entries and foreign entries are visually distinguished only in
 * the tooltip header (the reader's own word against the author name); the highlight
 * style is identical", "Tooltip opacity: **1.0** from the first hover", "Tooltip
 * lifetime".
 *
 * This component is presentation only. It is handed strings that were read from an
 * entry record, and it renders them:
 *
 * - **the content comes from the record, never from the page** (task `t3-02` AC3). A
 *   custom highlight has no element to hang a `data-…` attribute on, and the paint
 *   pass never writes an attribute to the host page (AC2, ruling `A41`), so there is
 *   nothing on the page to read a comment from. Rendering the stored `comment` is the
 *   only possible answer, and that is why it is a prop rather than a lookup;
 * - **the header is the only place own and foreign entries differ** (the spec rule
 *   above). The class `is-foreign` changes the typography of the header only; the
 *   highlight itself is one shared style (`paint-style.ts`);
 * - **there is no edit affordance rendered here.** No comment field, no save button,
 *   no cancel button, no delete control (the three Russian labels of this layer are in
 *   `src/content/text.ts`, and none of them belongs to a tooltip): the whole of what
 *   the click does is decided by `tooltip-controller.tsx`, which hands the painted
 *   entry to the editor controller (ruling `A96`, Flow 4). A foreign entry gets no
 *   editor from that click and no hint of one here (`A25`);
 * - **opacity is not a state of this component.** `tooltip-style.ts` carries one
 *   opacity declaration for one class, and this component writes no opacity and no
 *   click class: a hovered tooltip is opaque from the first hover (ruling `A96`, task
 *   `t5-03` AC7).
 *
 * An entry the reader did not write is read-only in the editor too
 * (`inline-comment-model.md` -> edit rights), and `visible` is not part of that rule
 * (ruling `A1`), so nothing in this component depends on visibility: a hidden entry is
 * not painted and therefore has nothing to hover.
 */

import { CONTENT_STRINGS } from '../text';
import {
  TOOLTIP_CLASS,
  TOOLTIP_COMMENT_CLASS,
  TOOLTIP_FOREIGN_CLASS,
  TOOLTIP_HEADER_CLASS,
} from './tooltip-style';

export interface TooltipProps {
  /** The reader's own word, or the stored author name — `ownershipHeaderOf` decides. */
  readonly header: string;
  /** `false` prints the foreign header (model AC7/AC8, the UI half). */
  readonly isOwnEntry: boolean;
  /** The stored comment of the entry, verbatim. */
  readonly comment: string;
}

/** The tooltip element tree, rendered into the shadow root by the controller. */
export function Tooltip(props: TooltipProps) {
  return (
    <div
      class={TOOLTIP_CLASS}
      role="tooltip"
      aria-label={CONTENT_STRINGS.tooltipLabel}
    >
      <span
        class={classes(TOOLTIP_HEADER_CLASS, props.isOwnEntry ? null : TOOLTIP_FOREIGN_CLASS)}
      >
        {props.header}
      </span>
      <p class={TOOLTIP_COMMENT_CLASS}>{props.comment}</p>
    </div>
  );
}

/** One class attribute from a name and one optional modifier. */
function classes(base: string, modifier: string | null): string {
  return modifier === null ? base : `${base} ${modifier}`;
}
