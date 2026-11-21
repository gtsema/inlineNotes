/**
 * One name for one seam: "give me a `StoragePort`".
 *
 * Rule owner: `docs/project-profile.md` -> Stack (`chrome.storage.local` only) and
 * `docs/specs/inline-comment-model.md` -> "Storage seam": `src/core/` owns the storage
 * contract, `src/content/store/chrome-storage-port.ts` is the one shipped adapter, and
 * every other layer reaches storage through the core API.
 *
 * Why this type is a module of its own rather than a field declared beside each caller:
 * the popup gained a second collaborator in Stage 17 (`t17-01`'s `SyncPressSource`), the
 * popup's entry service and the options page already carried the same field, and task
 * `t17-02` adds two more (`PageNotesChannelSource` in `src/popup/`, `PageNotesWiring` in
 * `src/content/`). A seam spelled once is a seam that cannot drift: a later caller that
 * renames a field, adds one or makes the port optional changes **this** file
 * (`tests/core-storage-port-source.spec.ts` pins the shape), and the compiler shows every
 * other caller at once.
 *
 * Purity: a type and nothing else. No value is shipped from this module, no `chrome.*`
 * is named, and importing it touches nothing at runtime — `src/core/` stays free of DOM,
 * framework and browser globals (`tests/toolchain-contract.spec.ts` pins it).
 */

import type { StoragePort } from './storage-port';

/**
 * "This collaborator reads storage" — the one field every UI-layer source carries in
 * place of a storage API of its own.
 *
 * The shipped value is the single adapter, `createChromeLocalStoragePort()`
 * (`src/content/store/chrome-storage-port.ts`), and a test passes an in-memory port
 * instead. No shipped module may name a storage key or a storage API of its own: the
 * popup and the options page take the port through a source like this one, so a scan of
 * their files finds `chrome.storage` nowhere
 * (`tests/toolchain-contract.spec.ts` -> "names no storage API and no storage key of its
 * own"). The field is **required**, exactly as it is in the two sources that shipped
 * before this module: `t4-01` and `t4-02` made the port a collaborator and not an
 * optional one, and no shipped reader of storage has ever existed without one.
 */
export interface StoragePortSource {
  /** The one port adapter (`createChromeLocalStoragePort()`), never a storage API. */
  readonly port: StoragePort;
}
