# t18-02b — A186 amendments after the reader's first build (ruling A186)

User feedback on the first `t18-02` build:
1. The settings window gained a scrollbar (two reserved slots + unchanged spacing).
2. The gap between the sync checkbox and the save button grew too large; the reader
   asked for the reserve under the button only.

Fixes:

- The server-address refusal left its own slot: `message()` reads it first and
  `messageClass()` wears the refusal role, so it answers through the single bottom
  slot. `serverMessageClass()` is gone; one `<p class="message">` node again.
- `.message` / `.rename` min-height 40 → 38; slot margin bottom released.
- The `A186` reclaim pays for the reserve in existing spacing: `.toggle-line` keeps
  12px top, releases its 12px bottom; `.counter` releases its 12px bottom; `.header`
  margin 8 → 4; both `.label-line`s 4 → 2; `.sync-line` 4 → 0; `:host` padding
  16 → 12px 16px. `.options` keeps its pinned `padding: 16px`.
- Tests: window-look pins updated (header 4px, label-line 2px, toggle-line 12px 0 0,
  split gap {12, 0}, slot 38px, message nodes back to 1); rename spec stub answers
  `serverMessage: () => null`.
- Spec: the `A185` bullet rewritten as amended by `A186`.

Gates: `npm test` 1293 green, `npm run typecheck` green, `npm run build` green,
`check-agent-config` 0 errors.
