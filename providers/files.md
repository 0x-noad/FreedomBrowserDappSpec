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
  the per-profile data key, wrapped by the operating system's credential
  store (`SPEC.md` §8.1). No node, no network.
- **When absent.** The provider is never absent on a conforming host. A
    weak or absent credential store does not make it absent (`SPEC.md` §8.1:
  store and warn). If the data key cannot be unwrapped or the store cannot be
  opened, every method rejects `4900` with
  `data.reason: "store_unavailable"` for an added dapp, and
  `dapp_getProviders` reports `status: "unavailable"` to it (`SPEC.md`
  §7.4). A site without a record still gets §8.2's defaults from
  `files_getQuota`: whether the user's store opens is the user's state
  (`SPEC.md` §6.2).
- **Identity vault.** None. No Files capability needs the vault; the
  provider is unaffected by the vault's lock (`SPEC.md` §6.11, N8).
- **Offline.** Everything works offline.

## 3. Capabilities

| id | tier | scope shape | always-allow | consent-sheet string |
|---|---|---|---|---|
| `files:private` | `consent` | none | not applicable | "Keep files on this device that only this dapp can open" |
| `files:read-shared` | `consent` | `{ types?: string[], authors?: string[] }` | not applicable | "Read files in your shared folder" |
| `files:write-shared` | `consent` | none | not applicable | "Add files to your shared folder" |

- **`files:private`** unlocks every method on `root: "private"`: the dapp's
  own folder, readable and writable by it alone.
- **`files:read-shared`** unlocks reads (`list`, `read`, `stat`,
  `readJson`, `subscribe`) on `root: "shared"`, narrowed to the scope.
  `types` is a list of MIME patterns (`image/*` or exact types); `authors`
  is a list of dapp keys, or the literal strings `user` and `agent`. An
  omitted field in the manifest means all; in a `dapp_requestCapabilities`
  request it means the manifest's filter, and a request is compatible only
  when it is equal to or narrower than the manifest's scope (`SPEC.md`
  §6.4). The row MUST carry this disclosure, verbatim:
  *"Everything in your shared folder, including which dapp added each file,
  is visible to every dapp you allow to read it."*
- **`files:write-shared`** unlocks writes on `root: "shared"`: `write`,
  `writeJson`, `delete`, `rename`, `copy` into shared, `setPublished`, on
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
  published?: { bzz: string, at: number, verified: boolean } }
```

| method | params | returns | requires | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `files_list` | `{ root, prefix?, types?, author?, limit?, cursor? }` | `{ items: entry[], nextCursor? }` | private: `files:private`; shared: `files:read-shared` | no | §4.1 | 60 s |
| `files_read` | `{ root, author?, name }` | `{ bytes: Uint8Array, type, cid, size, mtime }` | as `list` | no | §4.1 | 60 s |
| `files_stat` | `{ root, author?, name }` | `entry` | as `list` | no | §4.1 | 60 s |
| `files_readJson` | `{ root, author?, name }` | `{ value, cid }` | as `list` | no | §4.1 | 60 s |
| `files_write` | `{ root, name, data, type, ifMatch?, ifNoneMatch? }` | `entry` | private: `files:private`; shared: `files:write-shared` | no | §4.1 | 300 s |
| `files_writeJson` | `{ root, name, value, ifMatch?, ifNoneMatch? }` | `entry` | as `write` | no | §4.1 | 60 s |
| `files_delete` | `{ root, name }` | `{}` | as `write` | no | §4.1 | 60 s |
| `files_rename` | `{ root, from, to }` | `entry` | as `write` | no | §4.1 | 60 s |
| `files_copy` | `{ from: { root, author?, name }, to: { root, name }, ifNoneMatch? }` | `entry` | read on `from.root`, write on `to.root` | no | §4.1 | 300 s |
| `files_setPublished` | `{ root, name, bzz }` | `entry` | as `write` | no | §4.1 | 60 s |
| `files_subscribe` | `{ root, prefix?, types?, author? }` | `{ subscriptionId }` | as `list` | no | 60 per document | 60 s |
| `files_unsubscribe` | `{ subscriptionId }` | `{}` | as `list` | no | §4.1 | 60 s |
| `files_getQuota` | `{ root }` | §8.2 | `public` | no | §4.1 | 60 s |

Method rules:

- **`files_list`.** `prefix` matches the start of `name`. `types` are MIME
  patterns as in a scope. `author` applies to `shared` only; omitted means
  every author the grant's scope allows. `limit` defaults to 200 and is at
  most 1 000; `cursor` follows `SPEC.md` §7.9. Results are always narrowed
  to the grant's scope; a filter that matches nothing, or names an author
  outside scope, returns an empty list.
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
  files; any in-scope shared file, whichever author wrote it) to any root
  it may write (`private`; its own files on `shared`). Bytes never enter
  the page; the CID is preserved; the copy is attributed to the calling
  dapp whoever authored the source, which is no more than the read and the
  write its grants already allow. `ifNoneMatch: "*"` makes it
  create-only.
- **`files_setPublished`.** Records a Swarm reference on the dapp's own
  file as dapp-reported (`verified: false`, §8.6). `bzz` MUST be a valid
  Swarm reference.
- **`files_subscribe`.** Delivers `files:changed` (§5) for files matching
  the filters and the grant's scope until `files_unsubscribe` or the
  document ends. At most 60 live subscriptions per document.

### 4.1 Rate limits

600 `files_*` calls per minute per dapp key across both roots, and 512 MB
read per minute per dapp key (`files_read`, `files_readJson`, `files_copy`
source bytes). Over budget rejects `-32005` with `data.retryAfterMs`.

## 5. Events

| event | payload | needs |
|---|---|---|
| `files:changed` | `{ root, author, name, kind, cid, from?, published? }` | `files:private` for `root: "private"`; `files:read-shared` (scope-narrowed) for `root: "shared"` |

`kind` is one of `created`, `modified`, `deleted`, `renamed` (`from` is the
old name), `published` (`published` is the new record, §8.6). Events are
raised for changes made by another tab of the same dapp, by the user in
`freedom://files`, by another dapp or by Freedom Agent (on `shared`), and by
the host's publish hook. **An Agent read raises nothing** (§9).

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
      "properties": {
        "why": { "type": "string", "minLength": 1, "maxLength": 140 },
        "scope": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "types":   { "type": "array", "maxItems": 32, "uniqueItems": true,
                         "items": { "type": "string", "pattern": "^[a-z0-9!#$&^_.+-]+/([a-z0-9!#$&^_.+-]+|\\*)$" } },
            "authors": { "type": "array", "maxItems": 32, "uniqueItems": true,
                         "items": { "type": "string", "minLength": 1, "maxLength": 256 } }
          }
        }
      }
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
  "read-shared":  { "why": "Imports images other dapps shared.",
                    "scope": { "types": ["image/*"] } },
  "write-shared": { "why": "Shares the pages you export." }
}
```

## 7. Errors

| code | reason | when |
|---|---|---|
| `4100` | `unauthorized` | no grant for the root the call names (never raised for an out-of-scope file: that is `not_found`, N4) |
| `4300` | `dapp_quota` | the private 512 MB, or the dapp's shared allowance, would be exceeded (on `shared`, after the storage prompt of §8.8 was declined or could not be shown) |
| `4300` | `pool_quota` | the shared pool cap would be exceeded |
| `4300` | `file_too_large` | a single file over the per-file cap for its root |
| `4300` | `too_many_files` | the private count cap (1 000) would be exceeded |
| `4409` | `conflict` | `ifMatch` did not match the current CID |
| `4409` | `exists` | `ifNoneMatch: "*"` on an existing name, or `rename` onto one |
| `4900` | `store_unavailable` | the data key could not be unwrapped or the store could not be opened |
| `-32602` | `invalid_root` | `root` is not `private` or `shared` |
| `-32602` | `invalid_name` | `name` breaks §8.3 |
| `-32602` | `invalid_type` | `type` is not a MIME type |
| `-32602` | `type_mismatch` | declared `type` contradicts the magic bytes (§8.4) |
| `-32602` | `not_found` | no such file (own file on `private`; any in-scope file on `shared`) |
| `-32602` | `invalid_reference` | `bzz` in `setPublished` is not a Swarm reference |
| `-32602` | `invalid_cursor`, `invalid_subscription` | bad `cursor` or `subscriptionId` |
| `-32602` | `too_many_subscriptions` | a 61st live subscription in one document (§4) |
| `-32602` | `invalid_json` | `files_readJson` on bytes that do not parse as JSON |
| `-32603` | `disk_full`, `io_error` | the operating system refused the write |

`data.limit` and `data.actual` accompany every `4300`. When one write
breaks more than one limit the host reports the first in this order:
`file_too_large`, `too_many_files`, `dapp_quota`, `pool_quota`. The dapp's
own limits come before the pool's because the dapp can act on them by
freeing its own files, while the pool cap needs the user (§8.8). No `locked`
reason exists. Conventions differing from `SPEC.md` §7: none.

## 8. Storage and quota

### 8.1 The two roots

| | `private` | `shared` |
|---|---|---|
| who reads | the owning dapp and the user | every dapp holding `files:read-shared`, within scope; the user; Freedom Agent under its grant (§9) |
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
serves both roots, which is what makes a `types` scope on shared reads safe
against relabelling.

### 8.5 Content identifiers

On every write the host computes a **CIDv1** of the file's bytes
(raw-leaves, sha2-256, Kubo's default UnixFS chunking), equal to what
`ipfs add` would give the same file. It is the file's etag (`ifMatch`,
`readJson`), a stable identifier dapps may exchange, and the value a future
`ipfs` provider would return unchanged. Swarm references are different
hashes and are computed only on a Swarm publish.

### 8.6 The `published` record

A file is `location: "published"` when a Swarm reference is recorded on it:

- **Verified.** When a dapp calls `swarm_publishData` (on `window.swarm`,
  unchanged), the host hashes the payload to a CIDv1 by §8.5 in the main
  process; if a file of that same dapp, in either root and authored by it,
  has that CID, the resulting Swarm reference is recorded as
  `published: { bzz, at, verified: true }` and `files:changed` with
  `kind: "published"` is emitted. One hash per publish; `window.swarm`'s
  API is untouched.
- **Dapp-reported.** For `swarm_publishFiles` bundles, whose single root
  reference covers many files, the dapp may call `files_setPublished` on
  its own files; the record carries `verified: false` and `freedom://files`
  labels it "dapp-reported".

### 8.7 At rest

Both roots are encrypted under the per-profile data key (wrapped by the OS
credential store, `SPEC.md` §8.1) with
authenticated encryption and a per-file nonce, with hashed on-disk names
and a sidecar index of names, CIDs, types, sizes, authors and `published`
(`SPEC.md` §8.1). The identity vault's lock never affects them. The data
is **not** editable in the operating system's file manager; the user's way
in and out is `freedom://files` (§9.3). *Informative:* under the profile
directory, `dapp-files/private/<sha256(dappKey)>/` and
`dapp-files/shared/` (`SPEC.md` Appendix A).

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
through: when the allowance is below the pool cap and the write fits the
pool, the host shows a prompt in the Dapps pane (`SPEC.md` §10.2), "<name>
needs more storage", with the allowance, the usage, the size of the write
and the presets above the current allowance up to the cap. One tap sets
the allowance and the write proceeds, returning its normal result; the
call waits as any prompting call does (`SPEC.md` §7.11, 300 s). **Not
now**, the timeout or a closed sidebar rejects the write `4300 dapp_quota`
exactly as if nothing had been asked, and the decline is cached for the
document like a consent decline (`SPEC.md` §6.6): further over-allowance
writes reject at once until reload. No prompt when the write would also
exceed the pool cap (the cap is set in the pane), on `private`, under
Freedom Agent custody (`SPEC.md` §9.2), or on a call without a user
gesture in the last 60 s. The dapp needs no new call: it wraps the write
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
removed raise `files:changed` deletions for their readers.

## 9. Surfaces

### 9.1 Consent sheet

Three rows, with the strings in §3, and the disclosure sentence of §3 under
the `files:read-shared` row verbatim. When the manifest narrows that row's
scope, the row's own words say so in plain language rather than in MIME
syntax: "Read PNG, JPEG and MP3 files in your shared folder" for
`types: ["image/png", "image/jpeg", "audio/mpeg"]`, "Read images in your
shared folder" for `image/*`, "Read files from Gallery in your shared
folder" for an `authors` entry that names an added dapp (its name, with
the key on hover or beneath), the key itself for one that is not added,
and "your own files" / "Freedom Agent's files" for `user` / `agent`. A
type the host has no common name for is shown as written. The host MUST
render the scope; the plain words are RECOMMENDED. The `why` sits beneath
as always. No Files row has an always-allow toggle.

### 9.2 Details page

Under **Info**: private usage of 512 MB; shared usage of the dapp's
allowance; counts of files in each root; a link into `freedom://files`
filtered to this dapp. Under **Settings**, in **Storage**: the allowance
control (1 GB, 2 GB, 4 GB, 8 GB, §8.8); in **Capabilities**: the three
rows with enabled and revoke.

### 9.3 `freedom://files`

The files explorer. Usable while the identity vault is locked.

**Shared view.** All dapps' files in one list with an **author** column,
sortable by **author**, **date added** and **location** (`local` /
`published`; dapp-reported entries labelled). Actions: **Add files** (an
operating-system open dialog; the files are added with author `user`,
subject to §8.3, §8.4 and the pool cap), **Export** (a decrypted copy of
the selected files to a user-chosen location), **Delete**. The **pool cap**
and **each dapp's allowance** are shown with their usage and link to where
they are set (the Dapps pane's **Total dapp storage**, `SPEC.md` §10.2;
the details page's **Storage**, §9.2). Controls here: the **Freedom Agent**
controls (§9.4), with the **Agent log** beneath them (every Agent read and
add, with file, time and the conversation it served; `SPEC.md` §6.12 ring
buffer and **Clear**).

**Private view.** One folder per added dapp (and per `dev:` dapp under the
Development heading), showing usage against 512 MB, with **Export** and
**Delete**. A folder left behind by a signing-key warning (`SPEC.md` §5.7)
is shown as belonging to the previous build.

There is no reveal-in-Finder on either view.

### 9.4 Freedom Agent

The user can give Freedom Agent access to the shared pool. Nothing here
touches a private folder.

- **Read.** A switch, **off by default**, with the same scope shape as
  `files:read-shared` (`types`, `authors`; default: everything). While on,
  the Agent may list and read in-scope shared files through the tools
  below. The grant survives restarts until the user switches it off.
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
  | `dapp_files_list` | `{ prefix?, types?, author?, limit?, cursor? }` | as `files_list` on `shared`, narrowed to the read scope | read |
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
  for readers in scope.
- **Log.** Every Agent read and add is logged for the user in the Agent's
  own log (`SPEC.md` §6.12; shown here, §9.3) with file, time and the
  conversation it served. Dapps' activity logs never carry Agent entries.

## 10. Host implementation requirements

1. The host MUST derive the dapp key for every call in the main process and
   MUST apply it as the private folder's namespace and as `author` on every
   shared write.
2. The host MUST keep the private folder readable only by its own dapp key
   and the user, and MUST narrow every shared read to the grant's scope
   before any result or event leaves the main process.
3. The host MUST encrypt both roots at rest as `SPEC.md` §8.1 says, with
   hashed on-disk names, and MUST NOT make the vault's lock state affect
   any Files call.
4. The host MUST enforce the quotas, per-file caps and count cap of §8.1 on
   every write and copy, and report them through `files_getQuota`.
5. The host MUST compute the CIDv1 of §8.5 on every write and keep it in
   the index, and MUST verify declared types by sniffing as §8.4 says.
6. The host MUST deliver `files:changed` for every change visible to a
   subscriber under its grant, including changes made by the user, other
   dapps and Freedom Agent, and MUST NOT deliver anything for an Agent
   read.
7. The host MUST implement the publish hook of §8.6 in its Swarm publish
   path without changing `window.swarm`'s API.
8. The host MUST log every write, delete, rename, copy and setPublished to
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
a sidecar index per root, the data key wrapped by Electron's `safeStorage`
(`dapp-files/key.enc`), and a hook in `src/main/swarm/` where `swarm_publishData`
already receives the bytes.

## 11. Security considerations and conformance checklist

- **Cross-dapp disclosure.** The shared pool is the one place a dapp learns
  of other dapps. The consent row says so verbatim, authorship is always
  on, and `types`/`authors` scopes narrow what a given dapp sees. A dapp
  without `files:read-shared` learns nothing (N3).
- **Relabelling.** A dapp cannot smuggle a file past another dapp's `types`
  scope by declaring a false type (§8.4).
- **Hostile writes.** No dapp can alter or delete another author's file:
  the write methods take no `author`, so every write addresses the
  caller's own bucket and another author's name is simply not there
  (`not_found`). The user can do anything from `freedom://files`.
- **Data at rest.** A copied profile folder or a stolen disk yields
    ciphertext without the credential store that wraps the data key (§8.7);
  on a weak store the user is warned (`SPEC.md` §8.1). The private folder is for
  sensitive data; the fixed 512 MB keeps it small.
- **Agent.** The Agent is a reader and adder of `shared` only under
  explicit off-by-default switches, never of a private folder, undetectably
  to dapps, and always logged (N3a).
- **Oracles.** `not_found`, empty lists and out-of-scope filters are
  indistinguishable from the dapp's side (N4). No Files call can tell a
  dapp whether another dapp exists except through in-scope shared files.
- **Core rules bearing most:** N1, N3, N3a, N4, N8, N9, N11.

Conformance checklist (`examples/files/`):

- [ ] every method behaves as §4 for a dapp holding the matching grant;
- [ ] every method rejects `4100 unauthorized` without it, and
      `files_getQuota` works without any grant;
- [ ] a `types` scope and an `authors` scope each narrow `list`, `read`,
      `stat`, `readJson` and `files:changed`, and an out-of-scope read is
      `not_found`;
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
- [ ] a `swarm_publishData` of a stored file's bytes sets
      `published.verified: true` and emits `published`; `setPublished` sets
      `verified: false`;
- [ ] a second author's `config.json` does not collide with the first's;
- [ ] a write naming another author's shared file is `not_found` (the
      write lands in the caller's own bucket or not at all);
- [ ] revocation ends subscriptions and deletes nothing; removal follows
      §8.10 including the shared-files question and export offer;
- [ ] the three consent strings and the disclosure sentence appear
      verbatim;
- [ ] nothing in Files prompts, needs a user gesture, or fails while the
      identity vault is locked;
- [ ] an Agent read under its grant raises no event and appears in the
      activity log; an Agent read of a private folder is impossible.
