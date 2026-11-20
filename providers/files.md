# Provider: `files` — Files

The Files provider gives every dapp a **private folder** for its sensitive
data and access to one **shared pool** per profile that every dapp the user
allows can read. Both are file-shaped stores held by the host, opaque on
disk, encrypted at rest, and managed by the user in `freedom://files`.
Nothing in this provider leaves the device.

Everything not stated here is inherited from `SPEC.md` §7 and bound by
`SPEC.md` §11. Sizes in this document are binary (`SPEC.md` §4.5):
1 MB = 1 048 576 bytes, 1 GB = 1 024 MB.

## 1. Identity

| Field | Value |
|---|---|
| id | `files` |
| display name | Files |
| surface | `window.dapp` (`window.dapp.files.*`) |
| status | `stable` |
| since | core `specVersion` `1` |
| version | `1` |

## 2. Host dependencies

- **Subsystem.** The host's own file store under the profile directory and
  the two data keys derived from the identity vault (`SPEC.md` §8.1). No
  node, no network.
- **When absent.** The provider is never absent on a conforming host. If
  the store cannot be opened, every method rejects `4900` with
  `data.reason: "store_unavailable"` for an added dapp, and
  `dapp_getProviders` reports `status: "unavailable"` to it (`SPEC.md`
  §7.4). A site without a record still gets §8.2's defaults from
  `files_getQuota`: whether the user's store opens is the user's state
  (`SPEC.md` §6.2).
- **Identity vault.** Every call that names `root: "private"` in any
  position (`copy`'s `from` or `to` included) except `files_getQuota` needs
  the vault unlocked: the private key is not in memory while it is locked
  (`SPEC.md` §8.1), so `SPEC.md` §6.11 applies (from the fronted tab the
  call shows the unlock prompt and proceeds on unlock; `4100 locked` on
  dismiss or when the wait ends). While the vault is **sealed** (no unlock
  yet this session) the same holds for `root: "shared"`; once unsealed,
  shared calls are never gated. `files_unsubscribe` and `files_getQuota`
  are never gated. No Files capability needs the vault for signing.
- **Offline.** Everything works offline.
- **Other providers.** Any provider that publishes bytes may hold a
  **publication record** on a file (§8.6; the annotation pattern of
  `SPEC.md` §12.5). The record's shape, event and method are
  provider-agnostic; in this revision Swarm is the one writer
  (`providers/swarm.md` §9.4). Files needs none of them.

## 3. Capabilities

| id | tier | scope shape | always-allow | consent-sheet string |
|---|---|---|---|---|
| `files:private` | `consent` | none | not applicable | "Keep files on this device that only this dapp can open" |
| `files:read-shared` | `consent` | none | not applicable | "Read files in your shared folder" |
| `files:write-shared` | `consent` | none | not applicable | "Add files to your shared folder" |

- **`files:private`** unlocks every method on `root: "private"`: the dapp's
  own folder, readable and writable by it alone.
- **`files:read-shared`** unlocks reads (`list`, `read`, `stat`,
  `readJson`, `subscribe`) on `root: "shared"` of every author's files. The
  grant is broad and carries no scope; what bounds a dapp is the query: a
  shared listing or subscription MUST name the file types it wants (§4),
  so no dapp can enumerate the whole pool in one call, which only
  `freedom://files` does. The row MUST carry this disclosure, verbatim:
  *"Everything in your shared folder, including which dapp added each file,
  is visible to every dapp you allow to read it."*
- **`files:write-shared`** unlocks writes on `root: "shared"`: `write`,
  `writeJson`, `delete`, `rename`, `copy` into shared, `setPublication`, on
  files the dapp itself authored. It does not include reading other
  authors' files; a dapp that wants both requests both.

No Files capability is `per-call`: nothing leaves the device, so there is
no always-allow. Everything here needs no user gesture.

## 4. Methods

Every method takes `root: "private" | "shared"`. On `shared`, read methods
take an optional `author` (default: the calling dapp's own key) and every
result carries `author`. `name` follows the rules in §8.3. `entry` below
means:

```ts
{ name: string, author?: string, size: number, type: string, cid: string,
  mtime: number, location: "local" | "published",
  publications?: { [provider: string]: publication } }
```

A `publication` is `{ ref: string, at: number, verified: boolean }` (§8.6);
`location` is `"published"` when `publications` holds at least one entry.

| method | params | returns | requires | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `files_list` | `{ root, prefix?, suffix?, types?, author?, limit?, cursor? }` | `{ items: entry[], nextCursor? }` | private: `files:private`; shared: `files:read-shared` | no | §4.1 | 60 s |
| `files_read` | `{ root, author?, name }` | `{ bytes: Uint8Array, type, cid, size, mtime }` | as `list` | no | §4.1 | 60 s |
| `files_stat` | `{ root, author?, name }` | `entry` | as `list` | no | §4.1 | 60 s |
| `files_readJson` | `{ root, author?, name }` | `{ value, cid }` | as `list` | no | §4.1 | 60 s |
| `files_write` | `{ root, name, data, type, ifMatch?, ifNoneMatch? }` | `entry` | private: `files:private`; shared: `files:write-shared` | no | §4.1 | 300 s |
| `files_writeJson` | `{ root, name, value, ifMatch?, ifNoneMatch? }` | `entry` | as `write` | no | §4.1 | 60 s |
| `files_delete` | `{ root, name }` | `{}` | as `write` | no | §4.1 | 60 s |
| `files_rename` | `{ root, from, to }` | `entry` | as `write` | no | §4.1 | 60 s |
| `files_copy` | `{ from: { root, author?, name }, to: { root, name }, ifNoneMatch? }` | `entry` | read on `from.root`, write on `to.root` | no | §4.1 | 300 s |
| `files_setPublication` | `{ root, name, provider, ref }` | `entry` | as `write` | no | §4.1 | 60 s |
| `files_subscribe` | `{ root, prefix?, suffix?, types?, author? }` | `{ subscriptionId }` | as `list` | no | 60 per document | 60 s |
| `files_unsubscribe` | `{ subscriptionId }` | `{}` | as `list` | no | §4.1 | 60 s |
| `files_getQuota` | `{ root }` | §8.2 | `public` | no | §4.1 | 60 s |

Method rules:

- **`files_list`.** `types` is a list of MIME patterns, each an exact type
  (`image/png`) or a one-family wildcard (`image/*`); `*/*` is not a
  pattern. On `root: "shared"` `types` is **required and non-empty**
  (`types_required`) unless `author` is `"self"`: a dapp lists the pool by
  type, never whole, but lists its **own** shared files freely, since that
  reveals nothing about anyone else. On `private` `types` is optional.
  `prefix` matches the start of `name`. `author` applies to `shared` only
  and narrows further: a dapp key, `"user"`, `"agent"`, or `"self"`, which
  the host resolves to the calling dapp's key; omitted means every author.
  `limit` defaults to 200 and is at most 1 000; `cursor` follows
  `SPEC.md` §7.9. `suffix` matches the end of `name` (`".state"`), for
  files whose writer declared only a broad type; like `prefix` and `author`
  it narrows a query and never stands in for `types`. A filter that matches
  nothing returns an empty list.
- **`files_read`.** Returns the bytes by structured clone (`SPEC.md` §7.7).
  Sugar: `dapp.files.read()` resolves a `Blob` whose `type` is the stored
  MIME type; `dapp.files.readText()` decodes UTF-8.
- **`files_write`.** `data` is a string (UTF-8), `Uint8Array`,
  `ArrayBuffer` or `Blob`. `type` is required and verified by sniffing
  (§8.4). Writing an existing own `name` overwrites it. `ifMatch: <cid>`
  makes the write conditional on the current CID (`4409 conflict`);
  `ifNoneMatch: "*"` is create-only (`4409 exists`). On `shared`, another
  author's `name` is a different file; a dapp's writes can collide only with
  its own.
- **`files_readJson`.** Decodes the bytes as UTF-8 and parses them as
  JSON, whatever the stored `type`; bytes that do not parse reject
  `-32602 invalid_json`.
- **`files_writeJson`.** Serialises `value` as JSON with `type:
  "application/json"`; `ifMatch` and `ifNoneMatch` as `write`. The CID is
  the etag for optimistic concurrency; `files_readJson` returns it.
- **`files_delete`, `files_rename`.** Own files only (on `shared`, the
  caller is the author). `rename` keeps the CID and emits one
  `files:changed` with `kind: "renamed"`. Renaming over an existing own
  name fails `4409 exists`.
- **`files_copy`.** Copies any file the dapp may read (its own private
  files; any shared file, whichever author wrote it) to any root
  it may write (`private`; its own files on `shared`). Bytes never enter
  the page; the CID is preserved; the copy is attributed to the calling
  dapp whoever authored the source, which is no more than the read and the
  write its grants already allow. `ifNoneMatch: "*"` makes it
  create-only.
- **`files_setPublication`.** Records a publication by `provider` on the
  dapp's own file as dapp-reported (`verified: false`, §8.6). `provider`
  MUST be a provider whose document declares a publication record
  (`unknown_provider`) and `ref` MUST be valid for it
  (`invalid_reference`). The record is accepted whether or not that
  provider is available (`SPEC.md` §12.4): the dapp holds the reference.
- **`files_subscribe`.** Delivers `files:changed` (§5) for files matching
  the filters until `files_unsubscribe` or the document ends. On
  `root: "shared"` `types` is required and non-empty as for `list`, with
  the same `author: "self"` exemption (`types_required`), so change events
  are no listing by another route.
  At most 60 live subscriptions per document.

### 4.1 Rate limits

600 `files_*` calls per minute per dapp key across both roots, and 512 MB
read per minute per dapp key (`files_read`, `files_readJson`, `files_copy`
source bytes). Over budget rejects `-32005` with `data.retryAfterMs`.

## 5. Events

| event | payload | needs |
|---|---|---|
| `files:changed` | `{ root, author, name, kind, cid, from?, publication? }` | `files:private` for `root: "private"`; `files:read-shared` for `root: "shared"`, for files matching the subscription's `types` |

`kind` is one of `created`, `modified`, `deleted`, `renamed` (`from` is the
old name), `published` (`publication` is the new record with its
`provider` added, §8.6). Events are raised for changes made by another tab
of the same dapp, by the user in `freedom://files`, by another dapp or by
Freedom Agent (on `shared`), and by a provider writing a publication
record. **An Agent read raises nothing** (§9). A subscription survives the
identity vault's lock: nothing is delivered for a private root while
locked (nor for either root while sealed) and nothing is replayed on
unlock; a private folder the user deletes while locked raises no per-file
events, since its index is unreadable, and the dapp finds it empty after
unlock. Dapps refresh on `identityChanged` (`SPEC.md` §6.11).

## 6. Manifest block

`schemas/providers/files.schema.json`:

```json
{
  "$id": "https://freedom.example/schemas/providers/files.schema.json",
  "title": "capabilities.files",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "private": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    },
    "read-shared": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    },
    "write-shared": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    }
  }
}
```

Example:

```json
"files": {
  "private":      { "why": "Keeps your drafts on this device." },
  "read-shared":  { "why": "Imports images other dapps shared." },
  "write-shared": { "why": "Shares the pages you export." }
}
```

## 7. Errors

| code | reason | when |
|---|---|---|
| `4100` | `unauthorized` | no grant for the root the call names |
| `4100` | `locked` | a call naming `root: "private"` (any root while sealed) other than `files_getQuota`, while the identity vault is locked, after the unlock prompt was dismissed, its dismissal is cached, or the wait ended (`SPEC.md` §6.11) |
| `4300` | `dapp_quota` | the private 512 MB, or the dapp's shared allowance, would be exceeded (on `shared`, after the storage prompt of §8.8 was declined or could not be shown) |
| `4300` | `pool_quota` | the shared pool cap would be exceeded |
| `4300` | `file_too_large` | a single file over the per-file cap for its root |
| `4300` | `too_many_files` | the private count cap (1 000) would be exceeded |
| `4409` | `conflict` | `ifMatch` did not match the current CID |
| `4409` | `exists` | `ifNoneMatch: "*"` on an existing name, or `rename` onto one |
| `4900` | `store_unavailable` | the store could not be opened |
| `-32602` | `invalid_root` | `root` is not `private` or `shared` |
| `-32602` | `invalid_name` | `name` breaks §8.3 |
| `-32602` | `invalid_type` | `type` is not a MIME type |
| `-32602` | `type_mismatch` | declared `type` contradicts the magic bytes (§8.4) |
| `-32602` | `not_found` | no such file (own file on `private`; any file on `shared`) |
| `-32602` | `types_required` | `list` or `subscribe` on `shared` without a non-empty `types`, or with `*/*`, when `author` is not `"self"` |
| `-32602` | `unknown_provider` | `provider` in `setPublication` declares no publication record |
| `-32602` | `invalid_reference` | `ref` in `setPublication` is not valid for `provider` |
| `-32602` | `invalid_cursor`, `invalid_subscription` | bad `cursor` or `subscriptionId` |
| `-32602` | `too_many_subscriptions` | a 61st live subscription in one document (§4) |
| `-32602` | `invalid_json` | `files_readJson` on bytes that do not parse as JSON |
| `-32603` | `disk_full`, `io_error` | the operating system refused the write |

`data.limit` and `data.actual` accompany every `4300`. When one write
breaks more than one limit the host reports the first in this order:
`file_too_large`, `too_many_files`, `dapp_quota`, `pool_quota`. The dapp's
own limits come before the pool's because the dapp can act on them by
freeing its own files, while the pool cap needs the user (§8.8).
Conventions differing from `SPEC.md` §7: none.

## 8. Storage and quota

### 8.1 The two roots

| | `private` | `shared` |
|---|---|---|
| who reads | the owning dapp and the user | every dapp holding `files:read-shared`, by type-named queries; the user; Freedom Agent under its grant (§9) |
| who writes | the owning dapp and the user | each dapp holding `files:write-shared`, own files only; the user; Freedom Agent under its add grant |
| intended for | the dapp's **sensitive data only** | bulk data and anything meant for other dapps |
| quota | **512 MB per dapp, fixed** (not user-adjustable, not requestable) | **per-dapp allowance, default 1 GB**, set on the dapp's details page (presets 1 GB, 2 GB, 4 GB, 8 GB), inside a **pool cap, default 8 GB**, set in the Dapps pane (presets 4 GB, 8 GB, 16 GB, 32 GB); an allowance never exceeds the cap; neither is requestable by a dapp |
| per-file cap | 64 MB | 512 MB |
| count cap | 1 000 files | none beyond quota |
| attribution | implicit | every file carries its `author`: a dapp key, `user` or `agent` |
| addressing | `name` | `{ author, name }`; two authors may each have `config.json` |

There is one shared pool per profile. The development realm (`SPEC.md`
§3.6) has its own private folders and its own pool, fully walled off.

### 8.2 `files_getQuota`

`public` tier; reports the calling dapp's figures.

```ts
// root: "private"
{ used, limit: 536870912, free, count, countLimit: 1000, fileLimit: 67108864 }
// root: "shared"
{ used, limit /* this dapp's allowance */, free /* min(allowance free, pool free) */,
  fileLimit: 536870912, pool?: { used, limit, free } }
```

While the vault is locked or sealed the figures come from the plain
counters of §8.7, so `used`, `free` and `count` stay current.

The pool's size is an oracle on other dapps', the user's and the Agent's
adds and deletes (`SPEC.md` §11 N3), so `pool`, and the pool component of
`free`, are present only while the dapp holds `files:read-shared` or
`files:write-shared`; otherwise `free` is the allowance's free space alone.
A site without a grant record (`SPEC.md` §6.2) gets the host's defaults
only: `used` 0, `count` 0, `free` equal to `limit`, and no `pool`, even
while the store is unavailable (§2).

`dapp_getProviders` `limits` for this provider carries the fixed figures
only: `privateBytes` 536870912, `privateFileBytes` 67108864,
`privateCount` 1000, `sharedFileBytes` 536870912 (`FilesLimits` in
`types/dapp.d.ts`). The pool cap and the allowance are the user's figures
and appear only here, behind a shared row.

Files with author `user` or `agent` count against the pool only. Each
shared file is charged to its author.

### 8.3 Names

Both roots are **flat**: no folders. A `name` is 1–255 bytes of UTF-8 in
NFC, contains no `/`, `\`, NUL or other control character, and is not `.`
or `..`. It also contains none of the characters that change what a name
reads as in the explorer or in the OS save dialog on export: the bidi
controls (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069), the
zero-width space (U+200B), the byte-order mark (U+FEFF) and the line and
paragraph separators (U+2028, U+2029); and it is not whitespace only. The
joiners U+200C and U+200D stay allowed, since emoji sequences and several
scripts need them. Names are exact and case-sensitive: `A.txt` and `a.txt` are two
files. Dapps that want hierarchy encode it in names. On disk names are
hashed, so the operating system's case rules never apply.

### 8.4 Types

Every file carries a MIME `type` the writer declared. For types the host
recognises by magic bytes (images, audio, video, PDF, archives, fonts) a
declaration that contradicts the bytes is rejected with `type_mismatch`;
text and unrecognised types are stored as declared. The same recogniser
serves both roots, which is what makes a type-named shared listing
reliable against relabelling.

### 8.5 Content identifiers

On every write the host computes a **CIDv1** of the file's bytes
(raw-leaves, sha2-256, Kubo's default UnixFS chunking), equal to what
`ipfs add` would give the same file. It is the file's etag (`ifMatch`,
`readJson`), a stable identifier dapps may exchange, and the value a future
`ipfs` provider would return unchanged. Swarm references are different
hashes and are computed only on a Swarm publish.

### 8.6 Publication records

A file carries at most one **publication record** per provider, under
`publications.<provider id>`, each `{ ref, at, verified }`: the provider's
reference to the published bytes, when it was recorded, and who recorded
it. `location` is `"published"` while any record exists. This is the
annotation pattern of `SPEC.md` §12.5: Files owns the shape, the event and
the method; which providers write records, what a valid `ref` is and when
the host writes one are said in each provider's §9 (in this revision,
Swarm: `providers/swarm.md` §9.4).

- **Verified.** The host writes the record itself, in the provider's
  main-process publish path, when it can match the published bytes to a
  file of the same dapp (by CID, §8.5), in either root and authored by it.
  `verified: true`. One such check per publish; the provider's own API is
  untouched.
- **Dapp-reported.** The dapp calls `files_setPublication` on its own file
  (for a bundle whose single reference covers many files, say). The record
  carries `verified: false` and `freedom://files` labels it
  "dapp-reported".

Writing a record of either kind emits `files:changed` with
`kind: "published"` and the record as `publication` with its `provider`.
A record is replaced, never appended, by a later publication from the same
provider; `delete` removes the file with its records; `rename` and `copy`
keep them.

### 8.7 At rest

Each root is encrypted under its own key derived from the identity vault
(`SPEC.md` §8.1) with authenticated encryption and a per-file nonce, with
hashed on-disk names and a sidecar index per root, encrypted under the same
key, of names, CIDs, types, sizes, authors and `publications`. The private key
leaves memory when the vault locks, so private folders and their indexes are
unreadable until unlock; plain per-folder byte and file counters (keyed by
dapp key, figures only, never names) keep `files_getQuota` and the
explorer's usage figures working. The shared key
stays once derived; before the first unlock of a session neither key exists in
memory (`SPEC.md` §6.11, sealed). The data is **not** editable in the
operating system's file manager; the user's way in and out is
`freedom://files` (`SPEC.md` §10.5). *Informative:* under the profile
directory, `dapp-files/private/<sha256(dappKey)>/` and `dapp-files/shared/`
(`SPEC.md` Appendix A).

### 8.8 Accounting

The details page shows the dapp's private usage (of 512 MB) and its shared
usage (of its allowance), and sets the allowance; the Dapps pane sums
private totals, shows shared used of the pool cap, and sets the cap. The
host offers each as a preset chooser (allowance: 1 GB, 2 GB, 4 GB, 8 GB;
cap: 4 GB, 8 GB, 16 GB, 32 GB) and MAY accept a custom figure. Lowering a
figure below current usage is allowed and deletes nothing: writes fail
`4300` until usage falls under it. An allowance is clamped to the cap. A
write over both the allowance and the cap is `dapp_quota` (§7 gives the
order).

**The storage prompt.** A `shared` write that would exceed the dapp's
allowance does not fail at once when raising the allowance would let it
through. It applies to every call that adds bytes under the dapp's author
on `shared`: `write`, `writeJson` and `copy` to `shared`; `rename` and
`setPublication` add none and never prompt. When the allowance is below
the pool cap and the write fits the pool, the host shows a prompt in the
Dapps pane (`SPEC.md` §10.2), "<name> needs more storage", with the
allowance, the usage, the size of the write and the figures the user may
pick: the presets above the current allowance that are enough for the
write, and the cap itself when it is not a preset. When no figure under
the cap is enough there is no prompt, just `4300 dapp_quota`. One tap sets
the allowance and the write proceeds, returning its normal result; the
call waits as any prompting call does (`SPEC.md` §7.11, 300 s). The prompt
is bound to its tab like a sheet (`SPEC.md` §6.7): raised from a background
tab, or while the sidebar is closed, it waits, recallable from the `d`
indicator, until its tab is fronted and the sidebar open or the wait ends.
**Not now**, the end of the wait, or closing the sidebar while the prompt
is on screen rejects the write `4300 dapp_quota` exactly as if nothing had
been asked, and the decline is cached for the document like a consent
decline (`SPEC.md` §6.6): further over-allowance writes reject at once
until reload. No prompt when the write would also exceed the pool cap (the
cap is set in the pane), on `private`, under Freedom Agent custody
(`SPEC.md` §9.2), or on a call without a user gesture in the last 60 s.
While the identity vault is locked the prompt
is shown as usual and its accept raises a figure, so the unlock prompt
follows it (`SPEC.md` §6.11); a dismissed unlock is the same `4300
dapp_quota` as **Not now**. The dapp needs no new call: it wraps the write
and treats `4300` as "no room". The prompt is the user setting a figure,
not a grant: nothing is recorded beyond the new allowance.
### 8.9 On revoke

Revoking `files:private` or `files:read-shared` ends the dapp's
subscriptions on that root; revoking `files:write-shared` ends nothing
live. No file is deleted by revocation.

### 8.10 On remove

`SPEC.md` §8.4 applies. The confirm names the bytes in the private folder,
offers an **export** (a decrypted copy to a user-chosen location) first,
and asks whether to also remove every shared file the dapp authored,
showing their count and bytes, **keep** being the default because other
dapps may be reading them. On OK the private folder and its index entries
are unlinked. Shared files that are kept stay attributed to the removed
dapp key and remain deletable in `freedom://files`; shared files that are
removed raise `files:changed` deletions for their readers. A root the host
cannot read at that moment is wiped as `SPEC.md` §8.4 says: blobs removed
now, index entries dropped when that index next loads, no per-file events.

## 9. Surfaces

### 9.1 Consent sheet

Three rows, with the strings in §3. The `files:read-shared` row carries the
disclosure sentence of §3 beneath its words, verbatim: *"Everything in your
shared folder, including which dapp added each file, is visible to every dapp
you allow to read it."* The row has no scope to show: the grant is the whole
pool, and the host's wording MUST NOT suggest otherwise. The `why` sits
beneath as always. No Files row has an always-allow toggle.

### 9.2 Details page

Under **Info**: private usage of 512 MB; shared usage of the dapp's
allowance; counts of files in each root; a link into `freedom://files`
filtered to this dapp. Under **Settings**, in **Storage**: the allowance
control (1 GB, 2 GB, 4 GB, 8 GB, §8.8); in **Capabilities**: the three
rows with enabled and revoke.

### 9.3 `freedom://files`

The explorer is a core surface (`SPEC.md` §10.5). Files supplies what it
shows: the shared pool as the shared view and the private folders as the
private view, with the facts in `entry`, the Agent controls of §9.4 and
the Agent log. **Add files** adds with author `user` under §8.3, §8.4 and
the pool cap; **Export** writes a decrypted copy; **Delete** removes the
file with its publication records (§8.6) and raises `deleted` for its
readers (§5). Files fills none of the four provider slots: the
publication column reads the records of §8.6, which other providers write.

### 9.4 Freedom Agent

The user can give Freedom Agent access to the shared pool. Nothing here
touches a private folder.

- **Read.** A switch, **off by default**. While on, the Agent may list
  shared files by type and read them through the tools below, under the
  same type-named rule as a dapp (§4): only `freedom://files` lists the
  whole pool. The grant survives restarts until the user switches it off.
- **Add.** A separate switch, **off by default**. While on, the Agent may
  add files to the pool through the tool below; the Agent's approval
  barrier shows the file's name, type and size before the add happens.
  Files it adds carry author `agent` and count against the pool only. The
  Agent may overwrite only files with author `agent`; it has no delete
  tool, the user deletes in `freedom://files`.
- **Tools.** Three tools in the Agent's tool set, present only while the
  matching switch is on, each applied in the main process under the Agent's
  own grant record (never a dapp's):

  | tool | params | returns | needs |
  |---|---|---|---|
  | `dapp_files_list` | `{ prefix?, suffix?, types, author?, limit?, cursor? }` | as `files_list` on `shared`; `types` required and non-empty (`types_required` as a tool error) | read |
  | `dapp_files_read` | `{ author, name }` | `entry` plus `text` (UTF-8) for `text/*` and JSON types, else the bytes as an attachment in the Agent's attachment store (its per-file cap applies) | read |
  | `dapp_files_add` | `{ name, type, text? \| attachment? }` | `entry` | add |

  `dapp_files_add` takes UTF-8 `text` or the id of an `attachment` the Agent
  holds, never both; `name` follows §8.3; the write is create-only unless
  the existing file's author is `agent`, and a clash with another author's
  name rejects `exists`. The tools surface the Files errors of §7 to the
  Agent as tool errors.
- **Where.** Both switches live here beside the pool and in the Dapps
  pane's toggles, as one record.
- **Visibility.** An Agent read raises no `files:changed`, appears in no
  listing and moves no counter: dapps cannot detect it and are told to
  treat the shared pool as published. An Agent add is an ordinary change
  for readers whose subscription names its type.
- **Log.** Every Agent read and add is logged for the user in the Agent's
  own log (`SPEC.md` §6.12; shown in the explorer, `SPEC.md` §10.5) with
  file, time and the
  conversation it served. Dapps' activity logs never carry Agent entries.

## 10. Host implementation requirements

1. The host MUST derive the dapp key for every call in the main process and
   MUST apply it as the private folder's namespace and as `author` on every
   shared write.
2. The host MUST keep the private folder readable only by its own dapp key
   and the user, and MUST reject a shared `list` or `subscribe`, from a
   dapp or from Freedom Agent, that names no types and is not the dapp's
   own `author: "self"` query (`types_required`, §4)
   before anything leaves the main process.
3. The host MUST encrypt both roots at rest as `SPEC.md` §8.1 says, with
   hashed on-disk names, MUST derive both keys at the first unlock and
   gate every call while sealed, MUST drop the private key on lock and
   gate private-root calls as `SPEC.md` §6.11 says, and MUST NOT let a
   later lock affect any shared-root call or `files_getQuota`.
4. The host MUST enforce the quotas, per-file caps and count cap of §8.1 on
   every write and copy, and report them through `files_getQuota`.
5. The host MUST compute the CIDv1 of §8.5 on every write and keep it in
   the index, and MUST verify declared types by sniffing as §8.4 says.
6. The host MUST deliver `files:changed` for every change visible to a
   subscriber under its grant, including changes made by the user, other
   dapps and Freedom Agent, and MUST NOT deliver anything for an Agent
   read.
7. The host MUST keep publication records as §8.6 says: written with
   `verified: true` only from a provider's own main-process publish path
   on a CID match, with `verified: false` from `files_setPublication`,
   one per provider per file, each emitting `published`.
8. The host MUST log every write, delete, rename, copy and setPublication to
   the dapp's activity log, and every Agent read and add.
9. On a tab Freedom Agent holds, the host MUST prompt every Files write
   with its content and refuse a grant-answered write with
   `4100 agent_custody` (`SPEC.md` §9.2).
10. The host MUST reject every Files call while an update notice is
    pending for the dapp (`4100 update_pending`, `SPEC.md` §5.4), except
    `files_getQuota`.
11. The host SHOULD complete a 64 MB `files_read` in under one second on
    ordinary hardware; the single-transfer design (no streaming) assumes
    it.

*Informative.* In upstream Freedom this is a new `src/main/files/` service
behind the `dapp:request` dispatcher, `files-grants.json` for the grants,
a sidecar index per root, the two keys handed over by the vault service
(`SPEC.md` Appendix A), and the publication-record CID match in
`src/main/swarm/` where `swarm_publishData` already receives the bytes
(`providers/swarm.md` §10 item 5).

## 11. Security considerations and conformance checklist

- **Cross-dapp disclosure.** The shared pool is the one place a dapp learns
  of other dapps. The grant is broad and the consent row says so verbatim;
  authorship is always on. The type-named query rule (§4) is friction
  against indiscriminate scraping and a nudge towards relevance, not
  confidentiality: a dapp that holds the grant can enumerate types one by
  one and can read any shared file it knows by `{ author, name }`. Nothing
  a dapp wants kept from other dapps belongs in the pool. A dapp without
  `files:read-shared` learns nothing (N3).
- **Relabelling.** A dapp cannot keep a file out of another dapp's
  type-named listing by declaring a false type (§8.4).
- **Hostile writes.** No dapp can alter or delete another author's file:
  the write methods take no `author`, so every write addresses the
  caller's own bucket and another author's name is simply not there
  (`not_found`). The user can do anything from `freedom://files`.
- **Data at rest, and at the running browser.** A copied profile folder or
  a stolen disk yields ciphertext without the recovery phrase (§8.7). At a
  running browser, a locked vault leaves private folders unreadable, names
  included, while the shared pool stays readable by design (`SPEC.md`
  §6.11). The private folder is for sensitive data; the fixed 512 MB keeps
  it small.
- **Agent.** The Agent is a reader and adder of `shared` only under
  explicit off-by-default switches, never of a private folder, undetectably
  to dapps, and always logged (N3a).
- **Oracles.** `not_found` and an empty list are the only answers about
  what is absent (N4). No Files call can tell a dapp whether another dapp
  exists except through shared files.
- **Core rules bearing most:** N1, N3, N3a, N4, N8, N9, N11.

Conformance checklist (`examples/files/`):

- [ ] every method behaves as §4 for a dapp holding the matching grant;
- [ ] every method rejects `4100 unauthorized` without it, and
      `files_getQuota` works without any grant;
- [ ] a shared `list` or `subscribe` without `types`, with an empty list or
      with `*/*` is `types_required`, except with `author: "self"`, which
      lists the dapp's own shared files whole; `image/*` matches every
      image type;
      `author` narrows a type query; a shared `read` of any author's file
      by `{ author, name }` succeeds under the grant;
- [ ] `ifMatch` and `ifNoneMatch` produce `4409 conflict` and `4409 exists`;
- [ ] the storage presets appear in the Dapps pane (4/8/16/32 GB) and on the
      details page (1/2/4/8 GB) and take effect on the next write;
- [ ] the 512 MB / 64 MB / 1 000 private limits and the allowance, pool and
      512 MB shared limits produce the four `4300` reasons with
      `data.limit` and `data.actual`;
- [ ] a declared `image/jpeg` over PNG bytes is `type_mismatch`;
- [ ] `files_stat(...).cid` equals `ipfs add` of the same bytes;
- [ ] `rename` keeps the CID and emits one `renamed` event; `copy` across
      roots preserves the CID and attributes the copy to the caller;
- [ ] a provider's publish of a stored file's bytes sets
      `publications.<id>.verified: true` and emits `published` (Swarm:
      `providers/swarm.md` §11); `setPublication` sets `verified: false`,
      and an unknown `provider` is `unknown_provider`;
- [ ] a second author's `config.json` does not collide with the first's;
- [ ] a write naming another author's shared file is `not_found` (the
      write lands in the caller's own bucket or not at all);
- [ ] revocation ends subscriptions and deletes nothing; removal follows
      §8.10 including the shared-files question and export offer;
- [ ] the three consent strings and the disclosure sentence appear
      verbatim;
- [ ] with the vault locked, a private-root call from the fronted tab shows
      the unlock prompt and completes on unlock, rejects `4100 locked` on
      dismiss, and never resets the idle timer; shared-root calls and
      `files_getQuota` are unaffected; `identityChanged` arrives on each
      change;
- [ ] an Agent read under its grant raises no event and appears in the
      activity log; an Agent read of a private folder is impossible.
