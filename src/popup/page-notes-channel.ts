/**
 * The popup's half of the page question (Stage 17, rulings `A167`, `A168`, `A169`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "The foreign
 * notes in the popup", "Hiding and deleting a foreign row".
 *
 * The popup reads `chrome.storage.local` for the reader's own rows and cannot read the
 * content script's memory (`A163` keeps foreign notes out of storage), so the page is
 * **asked**. This module is that request and nothing else:
 *
 * - `askPage` is the one question: "what foreign rows do you hold, and did your
 *   automatic load fail?" The answer is a view (`PageNotesQueryResult`): author names,
 *   counts and the failure flag. No comment, no anchor and no note ever crosses.
 * - `switchPageAuthor` and `dismissPageAuthor` are the two operations a foreign row
 *   performs (`A168`) — one aggregate in-memory switch of that author's highlights, and
 *   one local removal from this page's view. **Neither calls the server**, and neither
 *   writes storage: the message is a message.
 *
 * Why a message and not a second `fetch` (`A167`): the popup would then hold an
 * independent copy, request the same page twice per open, and show notes the page never
 * painted. One answerer — the page — is what keeps the row list and the highlights from
 * disagreeing.
 *
 * Why the two operations answer the whole fresh state instead of an acknowledgement:
 * the popup re-renders from what the page really holds, exactly as the stored rows
 * re-render from what the store answers after a write. A refused or lost message leaves
 * the popup with what it had, which is the honest state.
 *
 * No Russian string lives here: the notice the failure flag turns into is
 * `src/popup/text.ts`'s, and the row wording is the same module's.
 */

import type { ForeignAuthorView, PageNotesQueryResult } from '../core/page-notes-query';
import { EMPTY_PAGE_NOTES_QUERY_RESULT, NOTES_QUERY_MESSAGE } from '../core/page-notes-query';

/**
 * One runtime message: send a payload and get an answer, or `null` when nothing
 * answered.
 *
 * Declared structurally rather than taken from `@types/chrome`, because the popup's
 * sources are injected seams everywhere else (`PAGE_ENTRIES_SOURCE`,
 * `SYNC_PRESS_SOURCE`) and a test drives this module with a recorder.
 */
export type RuntimeMessageSenderLike = (message: unknown) => Promise<unknown>;

/** What the popup's channel talks to: the one send seam. */
export interface PageNotesChannelSource {
  /**
   * `chrome.runtime.sendMessage` in the shipped popup.
   *
   * It rejects when no listener answers — the popup is open on a page the content
   * script was never injected into, on a `chrome://` page, or on a page that has not
   * booted yet — and that rejection is one of the three states this module must answer
   * as data, not as a throw.
   */
  readonly sendMessage: RuntimeMessageSenderLike;
}

/**
 * `true` when the value really is an answer of this query.
 *
 * A page that answers something else — a stale content script of an older build, a
 * different extension's listener on the same name — is not read as rows: a shape check
 * at the boundary is what keeps `rows` from being `undefined.map`.
 */
function isQueryResult(value: unknown): value is PageNotesQueryResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record['rows']) && typeof record['syncFailed'] === 'boolean';
}

/** One row of an answer, checked the way the answer is. */
function isForeignRow(value: unknown): value is ForeignAuthorView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['authorName'] === 'string' &&
    typeof record['count'] === 'number' &&
    typeof record['allVisible'] === 'boolean'
  );
}

/** The answer of one send, or `null` when nothing usable came back. */
async function send(source: PageNotesChannelSource, message: unknown): Promise<PageNotesQueryResult | null> {
  let answer: unknown;
  try {
    answer = await source.sendMessage(message);
  } catch {
    // No listener on this tab (`chrome.runtime.sendMessage` rejects with "Could not
    // establish connection"), or a transport the browser refused. There is no page to
    // ask, so there are no foreign rows and nothing failed on the reader's behalf.
    return null;
  }
  if (!isQueryResult(answer)) {
    return null;
  }
  for (const row of answer.rows) {
    if (!isForeignRow(row)) {
      return null;
    }
  }
  return { rows: answer.rows, syncFailed: answer.syncFailed };
}

/**
 * The one question (ruling `A167`).
 *
 * A page that cannot be asked, or one that answers nothing this module can read, is
 * answered with the empty result: **no foreign rows and no failure notice**, which is
 * ruling `A166`'s observable state and the honest one — nothing was asked of the
 * server, so nothing failed.
 */
export async function askPage(source: PageNotesChannelSource): Promise<PageNotesQueryResult> {
  return (await send(source, { type: NOTES_QUERY_MESSAGE })) ?? EMPTY_PAGE_NOTES_QUERY_RESULT;
}

/**
 * The checkbox of a foreign row (`A168`): every highlight of that author, on this page,
 * for this tab. In memory only — the message is a message, the server is not called, and
 * nothing is written to `chrome.storage.local`.
 *
 * The answer is the page's fresh view, so the row reads what the page really holds. A
 * page that cannot be asked answers the empty result, and the popup renders no foreign
 * rows: it does not keep a row whose control did nothing.
 */
export async function switchPageAuthor(
  source: PageNotesChannelSource,
  authorName: string,
  visible: boolean,
): Promise<PageNotesQueryResult> {
  const answer = await send(source, {
    type: NOTES_QUERY_MESSAGE,
    op: 'switch',
    authorName,
    visible,
  });
  return answer ?? EMPTY_PAGE_NOTES_QUERY_RESULT;
}

/**
 * `Удалить` of a foreign row (`A168`): the author's notes leave this page's view for
 * this tab, and the server is not called. They are back on the next page load, which is
 * what "local-only" means in the spec's own words.
 */
export async function dismissPageAuthor(
  source: PageNotesChannelSource,
  authorName: string,
): Promise<PageNotesQueryResult> {
  const answer = await send(source, {
    type: NOTES_QUERY_MESSAGE,
    op: 'dismiss',
    authorName,
  });
  return answer ?? EMPTY_PAGE_NOTES_QUERY_RESULT;
}

/**
 * The shipped send: `chrome.runtime.sendMessage`, and nothing else. A function, not a
 * constant, so importing this file never touches the `chrome` global outside an
 * extension context.
 */
export function createChromeRuntimeMessageSender(): RuntimeMessageSenderLike {
  return async (message: unknown): Promise<unknown> => await chrome.runtime.sendMessage(message);
}

/** The shipped source of the popup's question. */
export function createPageNotesChannelSource(): PageNotesChannelSource {
  return { sendMessage: createChromeRuntimeMessageSender() };
}
