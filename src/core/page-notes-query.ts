/**
 * The one question the popup may ask a page: "what foreign notes does this document
 * hold, and how did your automatic load end?" (Stage 17, rulings `A167`, `A168`,
 * `A169`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "The foreign
 * notes in the popup", "A failed load never blocks the page".
 *
 * Why this module exists at all: the popup and the content script are **two documents**
 * and two bundles of an MV3 extension, so the popup cannot read the content script's
 * memory. The memory is a closure in the page (`src/content/sync/foreign-notes.ts`,
 * `A163`), the notes are never written to `chrome.storage.local` (`A163`), and so the
 * only way the reader can see, hide or delete somebody else's note from the popup —
 * the user's answer 5 — is to **ask the page**. `A167` chooses that door over a second
 * `fetch` from the popup, because two independent copies would show the popup notes the
 * page never painted and would request the same page twice.
 *
 * What this module owns, and nothing else:
 *
 * - **the message name** (`NOTES_QUERY_MESSAGE`), so the two halves of the extension
 *   cannot drift apart by spelling it twice;
 * - **the answer shape** (`PageNotesQueryResult`), which is a *view*: one row per
 *   foreign author with the flag and the count the page really holds, and the failure
 *   code of the last automatic load. It is not the notes. A comment, an anchor and a
 *   text never cross this boundary, so the popup can neither render a foreign note as
 *   if it were the reader's nor send one anywhere;
 * - **`pageNotesQueryResultOf`**, the one place that projects a foreign-notes memory
 *   into that answer, so the page's half has no formatting rule of its own.
 *
 * The row shape is deliberately the one the popup already renders for the stored rows
 * (`AuthorRowView` minus the ownership answer, `A95`, `A108`): the page's own paint
 * grouping and the stored grouping are the same rule, and the popup renders the count
 * of the two lists with one format entry.
 *
 * Purity: no `chrome.*`, no DOM, no clock, no network, no Russian string. The message
 * name and the shape are the whole contract, and they are pure data — which is why the
 * popup's copy of the shape is this module and not a second declaration beside it.
 */

import type { Entry } from './entry';

/**
 * The `chrome.runtime` message the popup sends to learn what a page holds.
 *
 * A constant, not a literal at each call site: the two documents are separate bundles
 * and nothing but this module can keep the two spellings equal
 * (`tests/content-page-notes.spec.ts` reads the shipped popup send call and the shipped
 * page listener out of the source and compares them with this string).
 */
export const NOTES_QUERY_MESSAGE = 'inlinenotes:page-notes';

/**
 * The `chrome.runtime` message a page sends to the popup when its foreign list moved
 * (Stage 17, ruling `A183`, task `t17-06`).
 *
 * It is the **second direction** of the same channel and it carries nothing: the popup
 * reacts by asking the ordinary question above, so there is one answer shape and one
 * answerer. The word is `updated` rather than `changed` so the two constants cannot be
 * mistaken for each other in a grep, and it is declared here for the same reason
 * `NOTES_QUERY_MESSAGE` is: the two documents are separate bundles.
 *
 * Why a message and not a second question from the popup: a popup that asked twice
 * would be polling (`A183` forbids a timer, and forbids a second question too), and a
 * popup opened while the page was still loading would ask the same empty page twice.
 */
export const PAGE_NOTES_UPDATED_MESSAGE = 'inlinenotes:page-notes-updated';

/**
 * One foreign author of a page, as the popup needs it.
 *
 * `authorName` is the stored name **verbatim**, because that is the address of the one
 * operation a row performs (`A168`): the page drops the notes of exactly that author.
 * `count` and `allVisible` are aggregates of that author's notes in this document's
 * memory (`A95`, `A108`): `allVisible` is `true` only when every one of them is
 * painted with its fill, so a foreign row reads unchecked the moment one of them is
 * switched off on the page.
 *
 * The row carries **no entry id**, for the same reason the stored row carries none
 * (`A95`): a foreign note is not editable by this extension, and a row that held an id
 * would be a handle a future per-note write could be addressed with.
 */
export interface ForeignAuthorView {
  /** Stored `authorName` of the group, verbatim from the page's memory. */
  readonly authorName: string;
  /** How many of that author's notes this document holds. */
  readonly count: number;
  /** `true` only when every one of them is currently painted with its fill. */
  readonly allVisible: boolean;
}

/**
 * What a page answers.
 *
 * `rows` is empty whenever the feature is absent: synchronization off, an empty
 * address, a page the content script is not registered for, or a frame that is not the
 * top one — every one of those states answers no rows **and** `syncFailed: false`,
 * which is ruling `A166` spelled as an observable answer rather than as a promise
 * (`tests/popup-foreign-rows.spec.ts` pins both).
 */
export interface PageNotesQueryResult {
  /** One row per foreign author this document holds, in first-appearance order. */
  readonly rows: readonly ForeignAuthorView[];
  /**
   * Whether the automatic load of this document ended without an answer from the server
   * (ruling `A169`).
   *
   * The content script owns the request, so it is the only half that can know; the
   * popup renders the `A164` notice «Не удалось связаться с сервером синхронизации»
   * from this flag and from nothing else. It is `false` for a page whose load succeeded,
   * `false` for a page that never asked (`A166`), and `true` from the first failed
   * answer until an answer that succeeds.
   */
  readonly syncFailed: boolean;
}

/**
 * What a page sends as its announcement (`A183`): the rows it holds right now.
 *
 * It is the answer shape **minus** the failure flag, because an announcement is a
 * statement about a list and not about a request. The popup that hears it asks the
 * ordinary question, so the flag the popup renders is still the one the page's own load
 * decided.
 */
export interface PageNotesUpdate {
  /** One row per foreign author this document holds, in first-appearance order. */
  readonly rows: readonly ForeignAuthorView[];
}

/**
 * The announcement a page sends when its foreign list moved (`A183`), built by the one
 * projection the answer uses.
 */
export function pageNotesUpdateOf(memory: ForeignNotesSnapshot): PageNotesUpdate {
  return { rows: foreignAuthorRowsOf(memory) };
}

/** The answer of a page that holds nothing: the state ruling `A166` describes. */
export const EMPTY_PAGE_NOTES_QUERY_RESULT: PageNotesQueryResult = { rows: [], syncFailed: false };

/**
 * The foreign notes of one document, as much of the memory as this answer needs.
 *
 * Structural rather than imported from the content layer: the popup bundle must not
 * reach into `src/content/` (`tests/content-create-card-boundaries.spec.ts` pins the
 * layer boundary and `tests/toolchain-contract.spec.ts` pins the Angular half), so the
 * projection below is written against the one operation it really calls.
 */
export interface ForeignNotesSnapshot {
  /** Every foreign note of this document, in the order the page holds them. */
  all(): readonly { readonly entry: Entry; readonly visible: boolean }[];
}

/**
 * The answer of one page, built once and mapped once at this boundary (ruling `A167`).
 *
 * The grouping is the whole of it: one row per author, in first-appearance order, with
 * the aggregate flag of that author's notes. It is deliberately the same grouping the
 * page already performs for the paint pass and the same shape the stored rows use, so
 * the popup renders two row lists with one rule and not two.
 *
 * A note whose author is an empty string gets a row of its own, exactly like the stored
 * `A110` record does: the page's memory refuses such a row as a note it cannot key
 * (the server's `author_id` is never empty for a decoded entry the page keeps), and the
 * projection invents no rule for a shape that cannot arrive.
 */
export function pageNotesQueryResultOf(
  memory: ForeignNotesSnapshot,
  syncFailed: boolean,
): PageNotesQueryResult {
  return { rows: foreignAuthorRowsOf(memory), syncFailed };
}

/**
 * The foreign rows of one document, grouped by author (`A95`, `A108`, `A167`).
 *
 * It is the projection above minus the failure flag, and it exists because the page has
 * a second reader of the same rows: the announcement a page sends when its memory moved
 * (`A183`) carries the rows and no load outcome, since a change of the list says nothing
 * about the last load. One grouping serves both, so the answer and the announcement can
 * never disagree about what a row is.
 */
export function foreignAuthorRowsOf(
  memory: ForeignNotesSnapshot,
): readonly ForeignAuthorView[] {
  const grouped: ForeignAuthorView[] = [];
  for (const note of memory.all()) {
    const at = grouped.findIndex(
      (candidate) => candidate.authorName === note.entry.authorName,
    );
    if (at < 0) {
      grouped.push({ authorName: note.entry.authorName, count: 1, allVisible: note.visible });
      continue;
    }
    const row = grouped[at] as ForeignAuthorView;
    grouped[at] = {
      authorName: row.authorName,
      count: row.count + 1,
      allVisible: row.allVisible && note.visible,
    };
  }
  return grouped;
}
