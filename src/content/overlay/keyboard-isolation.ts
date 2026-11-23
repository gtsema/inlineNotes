/**
 * Keyboard isolation of the overlay host (ruling `A193`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md`
 * (Rules / Semantics -> "Keyboard isolation of the overlay host").
 *
 * The defect the reader measured on YouTrack: the host page runs global keyboard
 * shortcuts from document-level listeners, and a keystroke typed into the note
 * field is a keystroke the page saw — the field swallowed the character and the
 * page fired its shortcut too. The overlay's own widgets (the card and the editor)
 * handle `Esc`, `Ctrl/Cmd+Enter` and every field behaviour **inside** the shadow
 * root, so the only thing a keystroke from the overlay needs is to die before it
 * reaches the page.
 *
 * The mechanism is one listener per keyboard event **on the host, in the bubble
 * phase**: by the time the event bubbles out of the shadow root, every shadow
 * handler has already run, and `stopPropagation()` keeps it from reaching the
 * document and the window — the page's listeners never fire. The capture phase is
 * deliberately untouched: a page that listens in the capture phase sees the
 * keystroke first, and blocking there would mean stopping the event *before* the
 * shadow handlers — which would kill the card's and the editor's own keys. The
 * doc-level `A112` typing door is untouched too: its question is about a caret
 * standing on the page, and those keystrokes never pass through the host.
 *
 * The listeners are never torn down in a content script — the same rule the url
 * watch states (`A59`); the teardown they return exists for tests only.
 *
 * Purity: the only collaborator is the host element the overlay owns.
 */

/** The keyboard events a note field produces and a page shortcut listens for. */
const KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress'] as const;

/**
 * Stops every keyboard event that came from inside the overlay host at the host's
 * own bubble boundary, so the page — document and window, bubble or its own
 * re-routes — never sees it.
 */
export function attachKeyboardIsolation(host: HTMLElement): () => void {
  const stop = (event: Event): void => {
    // The listener sits on the host itself, so an event from inside the shadow
    // root is retargeted to the host; an event aimed at the host element directly
    // is ours too. Nothing else arrives at this listener.
    event.stopPropagation();
  };
  for (const type of KEYBOARD_EVENTS) {
    host.addEventListener(type, stop);
  }
  return (): void => {
    for (const type of KEYBOARD_EVENTS) {
      host.removeEventListener(type, stop);
    }
  };
}
