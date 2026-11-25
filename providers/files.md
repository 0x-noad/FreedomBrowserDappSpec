# Provider: `files` — Files

The Files provider gives dapps one **pool of files** per profile, held by
the host, opaque on disk, encrypted at rest, and managed by the user in
`freedom://files`. Every file belongs to its **author** and carries a
mark: **shared**, readable by every dapp the user allows to read shared
files, or **private**, readable by its author alone. The files marked
shared are what the user sees as their **shared folder**. Nothing in this
provider leaves the device.

The private mark is access control between dapps, nothing more: a private
file stays readable to its own dapp while the identity vault is locked,
and the user sees it in the explorer. Data that must lock with the
identity belongs in `safe` (`providers/safe.md`).

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
  the files data key derived from the identity vault (`SPEC.md` §8.1). No
  node, no network.
- **When absent.** The provider is never absent on a conforming host. If
  the store cannot be opened, every method rejects `4900` with
  `data.reason: "store_unavailable"` for an added dapp, and
  `dapp_getProviders` reports `status: "unavailable"` to it (`SPEC.md`
  §7.4). A site without a record still gets §8.2's defaults from
  `files_getQuota`: whether the user's store opens is the user's state
  (`SPEC.md` §6.2).
- **Identity vault.** The files key is derived at the first unlock of a
  session and stays in memory until the browser exits (`SPEC.md` §8.1).
  While the vault is **sealed** (no unlock yet this session) every method
  except `files_getQuota` and `files_unsubscribe` waits on the unlock
  prompt as `SPEC.md` §6.11 says (`4100 locked` on dismiss or when the
  wait ends). Once unsealed, no Files call is gated by a later lock,
  whatever the file's mark; the one place a later lock is felt is the
  storage prompt, whose accept needs unlock (§8.8). No Files capability
  needs the vault for signing.
- **Offline.** Everything works offline.
- **Other providers.** Any provider that publishes bytes may hold a
  **publication record** on a file (§8.6; the annotation pattern of
  `SPEC.md` §12.5). The record's shape, event and method are
  provider-agnostic; in this revision Swarm is the one writer
  (`providers/swarm.md` §9.4). Files needs none of them.

## 3. Capabilities

| id | tier | scope shape | always-allow | consent-sheet string |
|---|---|---|---|---|
| `files:own` | `consent` | none | not applicable | "Store files on this device" |
| `files:read` | `consent` | none | not applicable | "Read files other dapps shared" |

- **`files:own`** unlocks every method on the dapp's **own** files, shared
  or private: `list` and `subscribe` with `author: "self"`, `read`,
  `stat`, `readJson`, `write`, `writeJson`, `delete`, `rename`, `copy`
  into its own files, `setVisibility`, `setPublication`. A file a dapp
  writes is **shared unless the dapp marks it private** (§4), so the row
  MUST carry this line, verbatim: *"Files this dapp stores go in your
  shared folder, where dapps you allow can read them, unless the dapp
  marks them private."*
- **`files:read`** unlocks reads (`list`, `read`, `stat`, `readJson`,
  `subscribe`, and `copy` as a source) of **shared files of every
  author**. The grant is broad and carries no scope; what bounds a dapp is
  the query: a listing or subscription beyond the dapp's own files MUST
  name the file types it wants (§4), so no dapp can enumerate the whole
  shared folder in one call, which only `freedom://files` does. A private
  file of another author does not exist for the caller. The dapp's own
  shared files are shared files like any other and need nothing more to
  be read. The row MUST carry
  this disclosure, verbatim: *"Everything in your shared folder, including
  which dapp added each file, is visible to every dapp you allow to read
  it."*

A dapp that only keeps its own files asks for `files:own` alone; one that
only reads what others shared asks for `files:read` alone. Neither is
`per-call`: nothing leaves the device, so there is no always-allow. No
method needs a user gesture.

## 4. Methods

A file is addressed by `{ author, name }`: two authors may each have
`config.json`. `author` is a dapp key, `"user"`, `"agent"`, or in a query
`"self"`, which the host resolves to the calling dapp's key. `read`,
`stat`, `readJson` and the `from` of a `copy` take an optional `author`
that defaults to `"self"`; there the caller's own key means the same.
`list` and `subscribe` treat a missing `author` as every author, and only
the literal `"self"` selects the dapp's own files of both marks: the
caller's own key there is an author like any other, narrowing a type query
to its shared files (below). Write methods take no `author` and always
address the caller's own files. `name` follows §8.3.
`entry` below means:

```ts
{ name: string, author: string, visibility: "shared" | "private",
  size: number, type: string, cid: string, mtime: number,
  location: "local" | "published",
  publications?: { [provider: string]: publication } }
```

A `publication` is `{ ref: string, at: number, verified: boolean }` (§8.6);
`location` is `"published"` when `publications` holds at least one entry.

| method | params | returns | requires | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `files_list` | `{ prefix?, suffix?, types?, author?, visibility?, limit?, cursor? }` | `{ items: entry[], nextCursor? }` | `author: "self"`: `files:own`; otherwise `files:read` | no | §4.1 | 60 s |
| `files_read` | `{ author?, name }` | `{ bytes: Uint8Array, type, cid, size, mtime }` | own file: `files:own`, or `files:read` when it is shared; another author's: `files:read` | no | §4.1 | 60 s |
| `files_stat` | `{ author?, name }` | `entry` | as `read` | no | §4.1 | 60 s |
| `files_readJson` | `{ author?, name }` | `{ value, cid }` | as `read` | no | §4.1 | 60 s |
| `files_write` | `{ name, data, type, visibility?, ifMatch?, ifNoneMatch? }` | `entry` | `files:own` | no | §4.1 | 300 s |
| `files_writeJson` | `{ name, value, visibility?, ifMatch?, ifNoneMatch? }` | `entry` | `files:own` | no | §4.1 | 60 s |
| `files_delete` | `{ name }` | `{}` | `files:own` | no | §4.1 | 60 s |
| `files_rename` | `{ from, to }` | `entry` | `files:own` | no | §4.1 | 60 s |
| `files_copy` | `{ from: { author?, name }, to: { name }, visibility?, ifNoneMatch? }` | `entry` | `files:own`, and `files:read` when `from` is another author's | no | §4.1 | 300 s |
| `files_setVisibility` | `{ name, visibility }` | `entry` | `files:own` | no | §4.1 | 60 s |
| `files_setPublication` | `{ name, provider, ref }` | `entry` | `files:own` | no | §4.1 | 60 s |
| `files_subscribe` | `{ prefix?, suffix?, types?, author? }` | `{ subscriptionId }` | as `list` | no | 60 per document | 60 s |
| `files_unsubscribe` | `{ subscriptionId }` | `{}` | either capability | no | §4.1 | 60 s |
| `files_getQuota` | none | §8.2 | `public` | no | §4.1 | 60 s |

Method rules:

- **`files_list`.** With `author: "self"` it lists the dapp's own files,
  shared and private, with no further condition; `visibility` narrows it to
  one mark and is accepted only here (`invalid_visibility` otherwise). Without
  `author: "self"` (no `author`, or an author's key) it lists **shared** files
  only, the dapp's own shared files included, and `types` is then **required
  and non-empty** (`types_required`): a dapp lists the shared folder by type,
  never whole. `types` is a list of MIME patterns, each an exact type
  (`image/png`) or a one-family wildcard (`image/*`); `*/*` is not a pattern.
  `author` narrows a type query to one author. `prefix` matches the start of
  `name`; `suffix` matches its end (`".state"`), for files whose writer
  declared only a broad type; like `author` they narrow a query and never
  stand in for `types`. `limit` defaults to 200 and is at most 1 000; `cursor`
  follows `SPEC.md` §7.9. A filter that matches nothing returns an empty list.
- **`files_read`.** Returns the bytes by structured clone (`SPEC.md` §7.7).
  Sugar: `dapp.files.read()` resolves a `Blob` whose `type` is the stored
  MIME type; `dapp.files.readText()` decodes UTF-8. Another author's
  private file is `not_found`.
- **`files_write`.** `data` is a string (UTF-8), `Uint8Array`, `ArrayBuffer`
  or `Blob`. `type` is required and verified by sniffing (§8.4). Writing an
  existing own `name` overwrites it. `visibility` is `"shared"` or
  `"private"`; a **new file is shared when it is omitted**, and an overwrite
  that omits it keeps the file's mark. `ifMatch: <cid>` makes the write
  conditional on the current CID (`4409 conflict`, also when no such file
  exists); `ifNoneMatch: "*"` is create-only (`4409 exists`). An overwrite
  that changes the bytes drops the file's publication records (§8.6): they
  describe other bytes. Another author's `name` is a different file; a dapp's
  writes can collide only with its own.
- **`files_readJson`.** Decodes the bytes as UTF-8 and parses them as
  JSON, whatever the stored `type`; bytes that do not parse reject
  `-32602 invalid_json`.
- **`files_writeJson`.** Serialises `value` as JSON with `type:
  "application/json"`; `visibility`, `ifMatch` and `ifNoneMatch` as
  `write`. The CID is the etag for optimistic concurrency;
  `files_readJson` returns it.
- **`files_delete`, `files_rename`.** Own files only. `rename` keeps the
  CID and the mark and emits one `files:changed` with `kind: "renamed"`.
  Renaming over an existing own name fails `4409 exists`.
- **`files_copy`.** Copies a file the dapp may read (its own; another author's
  shared file) into its own files. Bytes never enter the page; the CID is
  preserved; the copy is attributed to the calling dapp whoever authored the
  source, which is no more than the read and the write its grants already
  allow. Without `visibility`, the copy of an own file takes the source's
  mark, whether the name is new or existing, so a private file never becomes
  shared by being copied; the copy of another author's file is shared under a
  new name and keeps the existing file's mark when it overwrites one.
  `ifNoneMatch: "*"` makes it create-only. Publication records are never
  copied, and an overwritten file's records are dropped: they describe other
  bytes.
- **`files_setVisibility`.** Changes the mark on the dapp's own file.
  Marking a shared file private withdraws it from other dapps from then
  on; what they already read they keep.
- **`files_setPublication`.** Records a publication by `provider` on the
  dapp's own file as dapp-reported (`verified: false`, §8.6). `provider`
  MUST be a provider whose document declares a publication record
  (`unknown_provider`) and `ref` MUST be valid for it
  (`invalid_reference`). The record is accepted whether or not that
  provider is available (`SPEC.md` §12.4): the dapp holds the reference.
- **`files_subscribe`.** Delivers `files:changed` (§5) for files matching
  the filters until `files_unsubscribe` or the document ends. The rule of
  `list` applies: `author: "self"` watches the dapp's own files; anything
  else watches shared files and requires `types` (`types_required`), so
  change events are no listing by another route. At most 60 live
  subscriptions per document.

### 4.1 Rate limits

600 `files_*` calls per minute per dapp key, shared by all its tabs, and
512 MB read per minute per dapp key (`files_read`, `files_readJson`,
`files_copy` source bytes). Over budget rejects `-32005` with
`data.retryAfterMs`.

## 5. Events

| event | payload | needs |
|---|---|---|
| `files:changed` | `{ author, name, kind, cid, visibility, from?, publication? }` | `files:own` for an `author: "self"` subscription; `files:read` for a type-named one |

`kind` is one of `created`, `modified`, `deleted`, `renamed` (`from` is the
old name), `published` (`publication` is the new record with its `provider`
added, §8.6) and `visibility` (the mark changed; delivered to the author dapp
only, on any of its subscriptions the file matches). To a subscriber that is
not the author, a file marked private arrives as an ordinary `deleted` and a
file marked shared as an ordinary `created`, each indistinguishable from a
real one and carrying `visibility: "shared"`: a private file never appears in
another dapp's events. A document receives one event per change, however many
of its subscriptions match, its own changes included. Events are raised for
changes made by any tab of the same dapp, by the user in `freedom://files`, by
another dapp or by Freedom Agent, and by a provider writing a publication
record. **An Agent read raises nothing** (§9.4). Nothing is delivered while
the vault is sealed, while a notice of `SPEC.md` §5 is unanswered or the build
has no valid manifest, or while the dapp or the capability is paused
(`SPEC.md` §7.5), and nothing is replayed afterwards; dapps refresh on
`identityChanged` and `capabilitiesChanged`.

## 6. Manifest block

`schemas/providers/files.schema.json`:

```json
{
  "$id": "https://freedom.example/schemas/providers/files.schema.json",
  "title": "capabilities.files",
  "type": "object",
  "minProperties": 1,
  "additionalProperties": false,
  "properties": {
    "own": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    },
    "read": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    }
  }
}
```

Example:

```json
"files": {
  "own":  { "why": "Keeps the pages you make and shares the ones you export." },
  "read": { "why": "Imports images other dapps shared." }
}
```

## 7. Errors

| code | reason | when |
|---|---|---|
| `4100` | `unauthorized` | no grant for what the call names: `files:own` for the dapp's own files (`files:read` also reads its shared ones), `files:read` for another author's |
| `4100` | `locked` | any method but `files_getQuota` and `files_unsubscribe` while the identity vault is sealed, after the unlock prompt was dismissed, its dismissal is cached, or the wait ended (`SPEC.md` §6.11) |
| `4300` | `dapp_quota` | the dapp's allowance would be exceeded, after the storage prompt of §8.8 was declined or could not be shown |
| `4300` | `pool_quota` | the pool cap would be exceeded |
| `4300` | `file_too_large` | a single file over 512 MB |
| `4409` | `conflict` | `ifMatch` did not match the current CID, or no such file exists |
| `4409` | `exists` | `ifNoneMatch: "*"` on an existing name, or `rename` onto one |
| `4900` | `store_unavailable` | the store could not be opened |
| `-32602` | `invalid_name` | `name` breaks §8.3 |
| `-32602` | `invalid_type` | `type` is not a MIME type |
| `-32602` | `invalid_visibility` | `visibility` is not `shared` or `private`, or is given on a listing that is not `author: "self"` |
| `-32602` | `type_mismatch` | declared `type` contradicts the magic bytes (§8.4) |
| `-32602` | `not_found` | no such file for the caller: no own file of that name, or no shared file of that author and name |
| `-32602` | `types_required` | `list` or `subscribe` without `author: "self"` and without a non-empty `types`, or with `*/*` |
| `-32602` | `unknown_provider` | `provider` in `setPublication` declares no publication record |
| `-32602` | `invalid_reference` | `ref` in `setPublication` is not valid for `provider` |
| `-32602` | `invalid_cursor`, `invalid_subscription` | bad `cursor` or `subscriptionId` |
| `-32602` | `too_many_subscriptions` | a 61st live subscription in one document (§4) |
| `-32602` | `invalid_json` | `files_readJson` on bytes that do not parse as JSON |
| `-32603` | `disk_full`, `io_error` | the operating system refused the write |

`data.limit` and `data.actual` accompany every `4300`. When one write
breaks more than one limit the host reports the first in this order:
`file_too_large`, `dapp_quota`, `pool_quota`. The dapp's own limit comes
before the pool's because the dapp can act on it by freeing its own files,
while the pool cap needs the user (§8.8). Conventions differing from
`SPEC.md` §7: none.

## 8. Storage and quota

### 8.1 The pool

There is one pool per profile. The development realm (`SPEC.md` §3.6) has
its own, fully walled off: the same cap and allowance figures apply to it
separately, and Freedom Agent's tools and the explorer's **Add files**
never reach it (`SPEC.md` §10.8).

| | a **shared** file | a **private** file |
|---|---|---|
| who reads | its author; every dapp holding `files:read`, by type-named queries; the user; Freedom Agent under its grant (§9.4) | its author and the user |
| who writes | its author (a dapp holding `files:own`, the user, or Freedom Agent under its add grant) | its author |
| who may mark it | its author; the user in `freedom://files`, when the author is a dapp | the same |
| while the vault is locked | readable (once unsealed) | readable to its author (once unsealed) |

Every file carries its `author`: a dapp key, `user` or `agent`. Files the
user adds in `freedom://files` and files Freedom Agent adds are always
shared. A new dapp file is shared unless its writer says otherwise (§4).

**Quota.** Each dapp has an **allowance, default 1 GB**, covering all its
files of either mark, set on the dapp's details page (presets 1 GB, 2 GB, 4
GB, 8 GB), inside a **pool cap, default 8 GB**, covering every file in the
pool, set in the dApps pane's Settings (presets 4 GB, 8 GB, 16 GB, 32 GB). An
allowance never exceeds the cap; neither is requestable by a dapp. **512 MB
per file.** No count cap beyond quota.

### 8.2 `files_getQuota`

`public` tier; reports the calling dapp's figures.

```ts
{ used, limit /* this dapp's allowance */, free /* min(allowance free, pool free) */,
  fileLimit: 536870912, pool?: { used, limit, free } }
```

While the vault is sealed the figures come from the plain counters of
§8.7.

The pool's size is an oracle on other dapps', the user's and the Agent's
adds and deletes (`SPEC.md` §11 N3), so `pool`, and the pool component of
`free`, are present only while the dapp holds `files:own` or `files:read`;
otherwise `free` is the allowance's free space alone. A site without a
grant record (`SPEC.md` §6.2) gets the host's defaults only: `used` 0,
`free` equal to `limit`, and no `pool`, even while the store is unavailable
(§2).

`dapp_getProviders` `limits` for this provider carries the fixed figure
only: `fileBytes` 536870912 (`FilesLimits` in `types/dapp.d.ts`). The pool
cap and the allowance are the user's figures and appear only here, behind
a grant.

Files with author `user` or `agent` count against the pool only. Each
dapp file is charged to its author.

### 8.3 Names

The pool is **flat**: no folders. A `name` is 1–255 bytes of UTF-8 in
NFC, contains no `/`, `\`, NUL or other control character, and is not `.`
or `..`. It also contains none of the characters that change what a name
reads as in the explorer or in the OS save dialog on export: the bidi
controls (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069), the
zero-width space (U+200B), the byte-order mark (U+FEFF) and the line and
paragraph separators (U+2028, U+2029); and it is not whitespace only. The
joiners U+200C and U+200D stay allowed, since emoji sequences and several
scripts need them. Names are exact and case-sensitive: `A.txt` and `a.txt`
are two files. Dapps that want hierarchy encode it in names. On disk names
are hashed, so the operating system's case rules never apply.

### 8.4 Types

Every file carries a MIME `type` the writer declared. For types the host
recognises by magic bytes (images, audio, video, PDF, archives, fonts) a
declaration that contradicts the bytes is rejected with `type_mismatch`;
text and unrecognised types are stored as declared. This is what makes a
type-named listing reliable against relabelling.

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
Swarm: `providers/swarm.md` §9.4). A record may sit on a file of either
mark: publishing is the dapp's act and does not change who may read the
stored file.

- **Verified.** The host writes the record itself, in the provider's
  main-process publish path, when it can match the published bytes to a
  file authored by the same dapp (by CID, §8.5). `verified: true`. One
  such check per publish; the provider's own API is untouched.
- **Dapp-reported.** The dapp calls `files_setPublication` on its own file
  (for a bundle whose single reference covers many files, say). The record
  carries `verified: false` and `freedom://files` labels it
  "dapp-reported".

Writing a record of either kind emits `files:changed` with `kind: "published"`
and the record as `publication` with its `provider`. A record is replaced,
never appended, by a later publication from the same provider; `delete`
removes the file with its records; a `write` or `copy` that changes the file's
bytes drops them; `rename` keeps them; a copy carries none over.

### 8.7 At rest

The pool is encrypted under the **files key** derived from the identity vault
(`SPEC.md` §8.1) with authenticated encryption and a per-file nonce, with
hashed on-disk names and a sidecar index, encrypted under the same key, of
names, authors, marks, CIDs, types, sizes and `publications`. The key is
derived at the first unlock of a session and stays in memory until the browser
exits, so files of either mark stay readable through later locks; before the
first unlock nothing is readable (`SPEC.md` §6.11, sealed). Plain per-author
byte and file counters, split by mark (keyed by dapp key, figures only, never
names) keep `files_getQuota` and the explorer's usage figures working while
sealed. The data is **not** editable in the operating system's file manager;
the user's way in and out is `freedom://files` (`SPEC.md` §10.5).
*Informative:* under the profile directory, `dapp-files/` (`SPEC.md` Appendix
A).

### 8.8 Accounting

The details page shows the dapp's usage of its allowance, split by mark,
and sets the allowance (§9.2); the dApps pane shows the pool's usage of
its cap and sets the cap. The host offers each as a preset chooser
(allowance: 1 GB, 2 GB, 4 GB, 8 GB; cap: 4 GB, 8 GB, 16 GB, 32 GB) and MAY
accept a custom figure. Lowering a figure below current usage is allowed
and deletes nothing: writes fail `4300` until usage falls under it. An
allowance is clamped to the cap. A write over both the allowance and the
cap is `dapp_quota` (§7 gives the order).

**The storage prompt.** A write that would exceed the dapp's allowance does
not fail at once when raising the allowance would let it through. It applies
to every call that adds bytes under the dapp's author: `write`, `writeJson`
and `copy`; `rename`, `setVisibility` and `setPublication` add none and never
prompt. When the allowance is below the pool cap and the write fits the pool,
the host shows a prompt in the dApps pane (`SPEC.md` §10.2), "<name> needs
more storage", with the allowance, the usage, the size of the write and the
figures the user may pick: the presets above the current allowance that are
enough for the write, and the cap itself when it is not a preset. When no
figure under the cap is enough there is no prompt, just `4300 dapp_quota`. One
tap sets the allowance and the write proceeds, returning its normal result;
the call waits as any prompting call does (`SPEC.md` §7.11, 300 s). The prompt
is bound to its tab like a sheet (`SPEC.md` §6.7): raised from a background
tab, or while the sidebar is closed, it waits, recallable from the address-bar
indicator, until its tab is fronted and the sidebar open or the wait ends.
**Not now**, the end of the wait, or closing the sidebar while the prompt is
on screen rejects the write `4300 dapp_quota` exactly as if nothing had been
asked, and the decline is cached for the document like a consent decline
(`SPEC.md` §6.6): further over-allowance writes reject at once until reload.
No prompt when the write would also exceed the pool cap (the cap is set in the
pane), under Freedom Agent custody (`SPEC.md` §9.2), or on a call without a
user gesture in the last 60 s. While the identity vault is locked the prompt
is shown as usual and its accept raises a figure, so the unlock prompt follows
it (`SPEC.md` §6.11); a dismissed unlock is the same `4300 dapp_quota` as
**Not now**. The dapp needs no new call: it wraps the write and treats `4300`
as "no room". The prompt is the user setting a figure, not a grant: nothing is
recorded beyond the new allowance.

### 8.9 On revoke

Revoking `files:own` ends the dapp's `author: "self"` subscriptions;
revoking `files:read` ends its type-named ones. No
file is deleted by revocation, and the dapp's shared files stay readable
to other dapps.

### 8.10 On remove

`SPEC.md` §8.4 applies. The confirm names the dapp's files by mark, with count
and bytes, and offers an **export** first (a decrypted copy to a user-chosen
location, in the format of §9.3). Its **private** files are deleted with the
dapp: no other dapp could ever read them. For its **shared** files the confirm
asks whether to remove them too, **keep** being the default because other
dapps may be reading them. Shared files that are kept stay attributed to the
removed dapp key and remain deletable in `freedom://files`; files that are
removed raise `files:changed` deletions for their readers. While the vault is
sealed the pool's index is unreadable and the host cannot tell the dapp's
files apart, so this part of the removal is recorded and applied at the next
unseal, as the user answered, raising its ordinary `deleted` events then
(`SPEC.md` §8.4). Private files held from a previous build (§8.11) are deleted
with the dapp, after the same export offer.

### 8.11 After a signing-key change

`SPEC.md` §5.7 applies. A dapp re-added after a signing-key warning owns
**no files**. What the previous build stored leaves the dapp's namespace:

- Its **private** files are **held** for the user alone. They carry no
  author a dapp can name: no listing, read, copy or event of any dapp
  reaches them, `author: "self"` included, and the re-added dapp may reuse
  their names freely. `freedom://files` lists them apart as "previous
  build" with **Export** and **Delete** only (no re-mark). They count
  against the pool cap and against no allowance, and they are deleted
  when the dapp is removed (§8.10).
- Its **shared** files stay in the shared folder, re-attributed to author
  `user` (a name that collides with a user file gains a numeric suffix).
  Readers see that as a `deleted` and a `created` (§5); the files count
  against the pool only from then on and follow the rules of any `user`
  file.

## 9. Surfaces

### 9.1 Consent sheet

Up to two rows, with the strings in §3. The `files:own` row carries, beneath its
words, verbatim: *"Files this dapp stores go in your shared folder, where
dapps you allow can read them, unless the dapp marks them private."* The
`files:read` row carries, verbatim: *"Everything in your shared folder,
including which dapp added each file, is visible to every dapp you allow
to read it."* Neither row has a scope to show, and the host's wording MUST
NOT suggest one. The `why` sits beneath as always. No Files row has an
always-allow toggle.

### 9.2 Details page

The **Files** section (`SPEC.md` §10.4) MUST show:

- the dapp's usage of its allowance, split into shared and private, with
  the file count of each;
- the **allowance** control (1 GB, 2 GB, 4 GB, 8 GB, §8.8);
- a link into `freedom://files` filtered to this dapp's files;
- the capability rows the dapp declares, each with enabled and revoke.

### 9.3 `freedom://files`

The explorer is a core surface (`SPEC.md` §10.5). Files supplies what it
shows: every file in the pool, of every author and either mark, with the facts
in `entry`, plus the Agent controls of §9.4 and the Agent log. The user sees
private files too: the mark keeps a file from other dapps, not from its
owner's user. **Add files** adds with author `user`, shared, under §8.3, §8.4
and the pool cap; **Export** writes a decrypted copy with an `index.json` that
maps each written file to its `name`, author, mark, type and CID (on-disk file
names are the host's choice where authors' names collide); **Delete** removes
the file with its publication records (§8.6) and raises `deleted` for its
readers (§5). The user may change the mark of a dapp's file there (files of
`user` and `agent` are always shared; marking a file shared needs the vault
unlocked, `SPEC.md` §6.11); the author dapp receives `visibility`. Private
files held from a previous build (§8.11) are listed apart with **Export** and
**Delete** only, and a pool left unreadable by a change of identity is one
"from a previous identity" entry with its size and **Delete** (`SPEC.md`
§6.11). Files fills none of the four provider slots: the publication column
reads the records of §8.6, which other providers write.

### 9.4 Freedom Agent

The user can give Freedom Agent access to the shared folder. It never
reads or lists a private file.

- **Read.** A switch, **off by default**. While on, the Agent may list
  shared files by type and read them through the tools below, under the
  same type-named rule as a dapp (§4): only `freedom://files` lists the
  whole pool. The grant survives restarts until the user switches it off.
- **Add.** A separate switch, **off by default**. While on, the Agent may
  add files through the tool below; the Agent's approval barrier shows the
  file's name, type and size before the add happens. Files it adds carry
  author `agent`, are always shared, and count against the pool only. The
  Agent may overwrite only files with author `agent`; it has no delete
  tool, the user deletes in `freedom://files`.
- **Tools.** Three tools in the Agent's tool set, present only while the
  matching switch is on, each applied in the main process under the Agent's
  own grant record (never a dapp's):

  | tool | params | returns | needs |
  |---|---|---|---|
  | `dapp_files_list` | `{ prefix?, suffix?, types, author?, limit?, cursor? }` | as `files_list` over shared files; `types` required and non-empty (`types_required` as a tool error) | read |
  | `dapp_files_read` | `{ author, name }` | `entry` plus `text` (UTF-8) for `text/*` and JSON types, else the bytes as an attachment in the Agent's attachment store (its per-file cap applies); a private file is `not_found` | read |
  | `dapp_files_add` | `{ name, type, text? \| attachment? }` | `entry` | add |

  `dapp_files_add` takes UTF-8 `text` or the id of an `attachment` the Agent
  holds, never both; `name` follows §8.3; it overwrites the Agent's own file
  of that name and no one else's. The tools surface the Files errors of §7 to
  the Agent as tool errors. While the vault is sealed they fail with `locked`:
  the Agent cannot raise the unlock prompt.
- **Where.** Both switches live in `freedom://files` and in the dApps
  pane's Settings, as one record.
- **Detection.** An Agent read raises no `files:changed`, appears in no
  listing and moves no counter: dapps cannot detect it and are told to
  treat the shared folder as published. An Agent add is an ordinary change
  for readers whose subscription names its type.
- **Log.** Every Agent read and add is logged for the user in the Agent's
  own log (`SPEC.md` §6.12; shown in the explorer, `SPEC.md` §10.5) with
  file, time and the conversation it served. Dapps' activity logs never
  carry Agent entries.

### 9.5 Other pages

None beyond the Agent controls of §9.4.

## 10. Host implementation requirements

1. The host MUST derive the dapp key for every call in the main process and
   MUST apply it as `author` on every write and as the meaning of
   `"self"`; no call names the caller.
2. The host MUST keep a private file readable only by its author and the
   user: absent from every other dapp's listings, reads, events and
   copies, and from every Freedom Agent tool, with `not_found` as the only
   answer (`SPEC.md` §11 N4).
3. The host MUST reject a `list` or `subscribe`, from a dapp or from
   Freedom Agent, that is not the dapp's own `author: "self"` query and
   names no types (`types_required`, §4), before anything leaves the main
   process.
4. The host MUST encrypt the pool at rest as `SPEC.md` §8.1 says, with
   hashed on-disk names, MUST derive the files key at the first unlock and
   gate every call but `files_getQuota` and `files_unsubscribe` while
   sealed, and MUST NOT let a later lock affect any Files call, the
   storage prompt's accept apart (§8.8).
5. The host MUST enforce the allowance, the pool cap and the per-file cap
   of §8.1 on every write and copy, and report them through
   `files_getQuota`.
6. The host MUST compute the CIDv1 of §8.5 on every write and keep it in
   the index, and MUST verify declared types by sniffing as §8.4 says.
7. The host MUST deliver `files:changed` for every change visible to a
   subscriber under its grant, including changes made by the user, other dapps
   and Freedom Agent, MUST present a mark change to non-authors as `created`
   or `deleted` (§5), MUST deliver nothing while `SPEC.md` §7.5 withholds
   events, and MUST NOT deliver anything for an Agent read.
8. The host MUST keep publication records as §8.6 says: written with
   `verified: true` only from a provider's own main-process publish path
   on a CID match, with `verified: false` from `files_setPublication`,
   one per provider per file, each emitting `published`.
9. The host MUST log every write, delete, rename, copy, setVisibility and
   setPublication (writeJson as a write) to the dapp's activity log with the
   file's resulting mark and, for a copy or a rename, its source (`SPEC.md`
   §6.12), and every Agent read and add to the Agent's.
10. On a tab Freedom Agent holds, the host MUST prompt every Files write with
    its content, never answering it from the grant; **Don't allow** is `4100
    agent_custody` (`SPEC.md` §9.2).
11. The host MUST reject every Files call while an update notice is
    pending for the dapp (`4100 update_pending`, `SPEC.md` §5.4), except
    `files_getQuota`.
12. The host SHOULD complete a 64 MB `files_read` in under one second on
    ordinary hardware; the single-transfer design (no streaming) assumes
    it.

*Informative.* In upstream Freedom this is a new `src/main/files/` service
behind the `dapp:request` dispatcher, `files-grants.json` for the grants,
one sidecar index for the pool, the files key handed over by the vault
service at the first unlock (`SPEC.md` Appendix A), and the
publication-record CID match in `src/main/swarm/` where
`swarm_publishData` already receives the bytes (`providers/swarm.md` §10
item 5).

## 11. Security considerations and conformance checklist

- **Cross-dapp disclosure.** The shared folder is the one place a dapp
  learns of other dapps. A dapp's files are shared by default and both
  consent rows say so verbatim; authorship is always on. The type-named
  query rule (§4) is friction against indiscriminate scraping and a nudge
  towards relevance, not confidentiality: a dapp that holds `files:read`
  can enumerate types one by one and can read any shared file it knows by
  `{ author, name }`. A dapp without `files:read` learns nothing (N3).
- **What the private mark is.** Access control between dapps: no other
  dapp and no Agent tool can see, list, read, copy or be told of a private
  file. It is **not** secrecy from the user, who sees it in the explorer,
  and **not** locked with the identity: once the vault has been unsealed a
  private file is readable to its dapp, and to anyone using that dapp at
  the running browser, through every later lock. Secrets belong in `safe`
  (`providers/safe.md`).
- **Withdrawal is not recall.** Marking a shared file private stops
  further reads; dapps that already read or copied it keep what they have.
- **Relabelling.** A dapp cannot keep a shared file out of another dapp's
  type-named listing by declaring a false type (§8.4).
- **Hostile writes.** No dapp can alter, delete or re-mark another author's
  file: the write methods take no `author`, so every write addresses the
  caller's own files and another author's name is simply not there
  (`not_found`). The user can do anything to a dapp's file from
  `freedom://files`.
- **Data at rest.** A copied profile folder or a stolen disk yields
  ciphertext without the recovery phrase (§8.7).
- **Agent.** The Agent is a reader and adder of shared files only, under
  explicit off-by-default switches, never of a private file or a safe,
  undetectably to dapps, and always logged (N3a).
- **Oracles.** `not_found` and an empty list are the only answers about
  what is absent (N4): another author's private file and a file that never
  existed are indistinguishable. No Files call can tell a dapp whether
  another dapp exists except through shared files.
- **Core rules bearing most:** N1, N3, N3a, N4, N8, N9, N11.

Conformance checklist (`examples/files/`):

- [ ] every method behaves as §4 for a dapp holding the matching grant;
- [ ] with `files:own` alone a dapp writes, lists (`author: "self"`),
      reads, renames, re-marks and deletes its own files and cannot read
      another author's (`4100 unauthorized`); with `files:read` alone it
      reads shared files and cannot write; `files_getQuota` works without
      any grant;
- [ ] a new file is shared when `visibility` is omitted and private when
      asked; an overwrite without `visibility` keeps the mark;
- [ ] another author's private file is `not_found` to `read`, `stat`,
      `readJson` and `copy`, absent from every listing, and raises no
      event for a non-author; marking a file private raises `deleted` for
      other subscribers and `visibility` for the author's;
- [ ] a `list` or `subscribe` without `author: "self"` and without
      `types`, with an empty list or with `*/*`, is `types_required`;
      `image/*` matches every image type; `author`, `prefix` and `suffix`
      narrow a type query; `author: "self"` lists the dapp's own files of
      both marks whole, and `visibility` narrows it;
- [ ] `ifMatch` and `ifNoneMatch` produce `4409 conflict` and `4409 exists`;
- [ ] the storage presets appear in the dApps pane (4/8/16/32 GB) and on the
      details page (1/2/4/8 GB) and take effect on the next write;
- [ ] the allowance, the pool cap and the 512 MB per-file cap produce the
      three `4300` reasons with `data.limit` and `data.actual`, and the
      allowance counts files of both marks;
- [ ] a declared `image/jpeg` over PNG bytes is `type_mismatch`;
- [ ] `files_stat(...).cid` equals `ipfs add` of the same bytes;
- [ ] `rename` keeps the CID and the mark and emits one `renamed` event;
      `copy` preserves the CID and attributes the copy to the caller; the
      copy of an own private file is private unless asked otherwise;
- [ ] a provider's publish of a stored file's bytes sets
      `publications.<id>.verified: true` and emits `published` (Swarm:
      `providers/swarm.md` §11); `setPublication` sets `verified: false`,
      and an unknown `provider` is `unknown_provider`;
- [ ] a second author's `config.json` does not collide with the first's;
- [ ] revocation ends subscriptions and deletes nothing; removal follows
      §8.10: private files go, shared files are asked about, export is
      offered; after a signing-key change the re-added dapp owns no files
      (§8.11);
- [ ] the two consent strings and the two verbatim lines appear as
      written;
- [ ] while the vault is sealed a call shows the unlock prompt and
      completes on unlock; after that, locking the vault changes nothing
      for any Files call, private files included, except that accepting
      the storage prompt asks for unlock;
- [ ] an Agent read under its grant raises no event and appears in the
      Agent log; no Agent tool returns or lists a private file, and the
      tools fail `locked` while the vault is sealed;
- [ ] a dapp holding `files:read` alone reads its own shared file; its own
      key as `author` in a type query lists its shared files only;
      `visibility` on a listing that is not `author: "self"` is
      `invalid_visibility`;
- [ ] a copy of another author's file is shared; a copy onto an existing
      name follows §4; no copy carries publication records, and a write
      that changes the bytes drops them; `ifMatch` on an absent name is
      `conflict`;
- [ ] a document receives one event per change, its own included, and none
      while a notice is unanswered or the dapp is paused;
- [ ] on a tab Freedom Agent holds, every write is prompted with its
      content and **Don't allow** is `4100 agent_custody`;
- [ ] the user can re-mark a dapp's file and not a `user` or `agent` file;
- [ ] after a signing-key change the previous build's private files are
      listed apart for export or deletion only and its shared files are
      the user's (§8.11);
- [ ] exports carry `index.json`; removal while sealed is applied at the
      next unseal; the development pool is closed to the Agent and to
      **Add files**; log entries carry the file's mark and a copy's or
      rename's source.
