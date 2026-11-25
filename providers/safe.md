# Provider: `safe` — Safe

The Safe provider gives every dapp a small **key-value store** of its own
for what must stay private: settings, profile data, tokens, save states.
It is encrypted under a key derived from the user's identity and **locks
with it**: while the identity vault is locked nothing in a safe can be
read, by the dapp or by anyone at the browser. No other dapp, and not
Freedom Agent, ever reads a safe. Nothing in this provider leaves the
device.

Bulk data and anything meant for other dapps belongs in `files`
(`providers/files.md`), which has a per-file private mark for data that
need only be kept from other dapps.

Everything not stated here is inherited from `SPEC.md` §7 and bound by
`SPEC.md` §11. Sizes in this document are binary (`SPEC.md` §4.5):
1 MB = 1 048 576 bytes.

## 1. Identity

| Field | Value |
|---|---|
| id | `safe` |
| display name | Safe |
| surface | `window.dapp` (`window.dapp.safe.*`) |
| status | `stable` |
| since | core `specVersion` `1` |
| version | `1` |

## 2. Host dependencies

- **Subsystem.** The host's own store under the profile directory and the
  safe data key derived from the identity vault (`SPEC.md` §8.1). No node,
  no network.
- **When absent.** The provider is never absent on a conforming host. If the
  store cannot be opened, every method rejects `4900` with `data.reason:
  "store_unavailable"` for an added dapp, and `dapp_getProviders` reports
  `status: "unavailable"` to it (`SPEC.md` §7.4). A site without a record
  still gets §8.2's defaults from `safe_getQuota` (`SPEC.md` §6.2).
- **Identity vault.** Every method except `safe_getQuota` and
  `safe_unsubscribe` needs the vault **unlocked**: the safe key is not in
  memory while it is locked or sealed (`SPEC.md` §8.1), so `SPEC.md` §6.11
  applies (from the fronted tab the call shows the unlock prompt and
  proceeds on unlock; `4100 locked` on dismiss or when the wait ends).
- **Offline.** Everything works offline.
- **Other providers.** None.

## 3. Capabilities

| id | tier | scope shape | always-allow | consent-sheet string |
|---|---|---|---|---|
| `safe:store` | `consent` | none | not applicable | "Keep private data for this dapp, locked with your identity" |

`safe:store` unlocks every method on the calling dapp's own safe. There is
no capability that reads another dapp's safe. Nothing here is `per-call`:
nothing leaves the device, so there is no always-allow. No method needs a
user gesture.

## 4. Methods

A `key` is 1–128 characters from `A–Z a–z 0–9 . _ : / -` (§8.1). A `value` is
either **JSON** (any JSON value: object, array, string, number, boolean or
`null`) or **bytes** (`Uint8Array`, `ArrayBuffer` or `Blob`); the host
records which as `kind` and returns bytes as `Uint8Array`. A JSON value is
exactly what `JSON.stringify` makes of it in the page: the shim serialises
it, the host stores that text, and a value for which `JSON.stringify`
throws or yields `undefined` rejects `-32602 invalid_value` before
anything is sent. `item` below means:

```ts
{ key: string, kind: "json" | "bytes", size: number, etag: string,
  mtime: number }
```

`size` is the stored length in bytes: the UTF-8 length of that JSON text,
or the byte length. The 8 MB cap and `used` count it. `etag` is an opaque
string derived from the stored bytes: it changes whenever they do, and
rewriting an identical value keeps it.

| method | params | returns | requires | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `safe_get` | `{ key }` | `item & { value }`, or `null` when the key is absent | `safe:store` | no | §4.1 | 60 s |
| `safe_set` | `{ key, value, ifMatch?, ifNoneMatch? }` | `item` | `safe:store` | no | §4.1 | 60 s |
| `safe_delete` | `{ key }` | `{}` | `safe:store` | no | §4.1 | 60 s |
| `safe_keys` | `{ prefix?, limit?, cursor? }` | `{ items: item[], nextCursor? }` | `safe:store` | no | §4.1 | 60 s |
| `safe_subscribe` | `{ prefix? }` | `{ subscriptionId }` | `safe:store` | no | 60 per document | 60 s |
| `safe_unsubscribe` | `{ subscriptionId }` | `{}` | `safe:store` | no | §4.1 | 60 s |
| `safe_getQuota` | none | §8.2 | `public` | no | §4.1 | 60 s |

Method rules:

- **`safe_get`.** Resolves `null` for a key that does not exist; a stored
  JSON `null` comes back as an item whose `value` is `null`.
- **`safe_set`.** Creates or replaces the value. `ifMatch: <etag>` makes
  the write conditional on the current etag (`4409 conflict`, also when
  the key is absent);
  `ifNoneMatch: "*"` is create-only (`4409 exists`). A value that is
  neither JSON-serialisable nor bytes rejects `-32602 invalid_value`.
- **`safe_delete`.** Deleting a key that does not exist resolves `{}`.
- **`safe_keys`.** Lists the dapp's own keys, in code-point order; `prefix`
  matches the start of the key. `limit` defaults to 200 and is at most
  1 000; `cursor` follows `SPEC.md` §7.9. Values are not returned.
- **`safe_subscribe`.** Delivers `safe:changed` (§5) for keys matching
  `prefix` until `safe_unsubscribe` or the document ends. At most 60 live
  subscriptions per document.

Sugar: `window.dapp.safe.<verb>(params)`, generated from the table.
`safe.get({ key })` resolves the item with its `value`, or `null`. It
differs from `SPEC.md` §7.7 in two ways (§7): a string is a JSON value,
never UTF-8 bytes, and bytes come back as `Uint8Array`, not a `Blob`.

### 4.1 Rate limits

600 `safe_*` calls per minute per dapp key, shared by all its tabs. Over
budget rejects `-32005` with `data.retryAfterMs`.

## 5. Events

| event | payload | needs |
|---|---|---|
| `safe:changed` | `{ key, change: "set" \| "deleted", etag? }` | `safe:store` |

Raised for every change to the dapp's safe that a subscription matches: by any
tab of the dapp, the calling document included, or by the user on the details
page (§9.2). A document receives one event per change, however many of its
subscriptions match. `etag` is the new etag for `set`. Nothing is delivered
while the vault is locked or sealed, while a notice of `SPEC.md` §5 is
unanswered or the build has no valid manifest, while the dapp or the
capability is paused (`SPEC.md` §7.5), or on a tab Freedom Agent holds before
the user has allowed safe reads there (`SPEC.md` §9.2), and nothing is
replayed afterwards; a subscription survives the lock and the dapp refreshes
on `identityChanged` (`SPEC.md` §6.11).

## 6. Manifest block

`schemas/providers/safe.schema.json`:

```json
{
  "$id": "https://freedom.example/schemas/providers/safe.schema.json",
  "title": "capabilities.safe",
  "type": "object",
  "minProperties": 1,
  "additionalProperties": false,
  "properties": {
    "store": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    }
  }
}
```

Example:

```json
"safe": {
  "store": { "why": "Keeps your settings and sign-in on this device." }
}
```

## 7. Errors

| code | reason | when |
|---|---|---|
| `4100` | `unauthorized` | no `safe:store` grant |
| `4100` | `locked` | any method but `safe_getQuota` and `safe_unsubscribe` while the identity vault is locked or sealed, after the unlock prompt was dismissed, its dismissal is cached, or the wait ended (`SPEC.md` §6.11) |
| `4300` | `value_too_large` | a single value over 8 MB |
| `4300` | `too_many_keys` | a 1 001st key |
| `4300` | `safe_quota` | the dapp's 64 MB would be exceeded |
| `4409` | `conflict` | `ifMatch` did not match the current etag, or the key is absent |
| `4409` | `exists` | `ifNoneMatch: "*"` on an existing key |
| `4900` | `store_unavailable` | the store could not be opened |
| `-32602` | `invalid_key` | `key` breaks §8.1 |
| `-32602` | `invalid_value` | `value` is neither JSON-serialisable nor bytes |
| `-32602` | `invalid_cursor`, `invalid_subscription` | bad `cursor` or `subscriptionId` |
| `-32602` | `too_many_subscriptions` | a 61st live subscription in one document |
| `-32603` | `disk_full`, `io_error` | the operating system refused the write |

`data.limit` and `data.actual` accompany every `4300`. When one write
breaks more than one limit the host reports the first in this order:
`value_too_large`, `too_many_keys`, `safe_quota`. Conventions differing
from `SPEC.md` §7: a string passed as `value` is stored as a JSON string,
not as UTF-8 bytes, and a bytes value is returned as `Uint8Array` by the
sugar as well as on the wire, where `SPEC.md` §7.7 would give a `Blob`.

## 8. Storage and quota

### 8.1 The store

One safe per dapp key, readable and writable by that dapp alone and
listable by the user (§9.2). **64 MB per dapp, 8 MB per value, 1 000
keys**, fixed: not user-adjustable and not requestable. The development
realm (`SPEC.md` §3.6) has its own safes, walled off from production.

Keys are exact and case-sensitive. A key is 1–128 characters, each one of
`A–Z`, `a–z`, `0–9`, `.`, `_`, `:`, `/` or `-`. The store is flat: `/` and
`:` are ordinary characters a dapp may use to group keys
(`profile/name`), and `safe_keys({ prefix })` reads a group.

### 8.2 `safe_getQuota`

`public` tier; reports the calling dapp's figures.

```ts
{ used, limit: 67108864, free, count, countLimit: 1000, valueLimit: 8388608 }
```

While the vault is locked or sealed the figures come from the plain
counters of §8.3. A site without a grant record (`SPEC.md` §6.2) gets the
host's defaults only: `used` 0, `count` 0, `free` equal to `limit`, even
while the store is unavailable (§2). `dapp_getProviders` `limits` for this
provider carries `bytes` 67108864, `valueBytes` 8388608 and `keys` 1000
(`SafeLimits` in `types/dapp.d.ts`).

### 8.3 At rest

Every value, and the index of keys, is encrypted under the **safe key**
derived from the identity vault (`SPEC.md` §8.1) with authenticated
encryption and a per-value nonce, under hashed on-disk names. The safe key
is derived on unlock and **dropped on lock**, so a locked or sealed vault
leaves every safe unreadable, key names included. Plain per-dapp byte and
key counters (keyed by dapp key, figures only, never key names) keep
`safe_getQuota` and the details page's usage working. *Informative:* under
the profile directory, `dapp-safe/<sha256(dappKey)>/` (`SPEC.md`
Appendix A).

### 8.4 Accounting

The details page shows the dapp's safe usage of 64 MB and its key count
(§9.2); the Dapps pane sums safe usage across dapps (`SPEC.md` §10.2).

### 8.5 On revoke

Revoking `safe:store` ends the dapp's safe subscriptions. No value is
deleted by revocation.

### 8.6 On remove

`SPEC.md` §8.4 applies. The confirm names the bytes in the safe and offers an
**export** first. On OK the safe and its index are unlinked. The safe is wiped
at once whatever the vault's state: its blobs are its own and its index goes
with them. A safe held from a previous build (§8.7) is named in the confirm,
covered by the export and deleted with the dapp.

**Export** writes a decrypted copy to a folder the user chooses: one file
per key (a JSON value as JSON text, bytes as they are) and an `index.json`
that maps each file name to its key, kind, size and date (ms since epoch).
File names are the host's choice, since keys contain `/` and `:`;
`index.json` is authoritative. There is no import. Export needs the vault
unlocked (`SPEC.md` §6.11).

### 8.7 After a signing-key change

`SPEC.md` §5.7 applies. A dapp re-added after a signing-key warning starts
with an **empty safe**. The previous build's safe is never handed to it:
it is held for the user alone, listed in the **Safe** section as "previous
build" with its size, **Export** and **Delete** only. A held safe is
outside the dapp's namespace: no `safe_*` call reaches it, it counts
neither in `safe_getQuota` nor against the 64 MB, and it is deleted when
the dapp is removed (§8.6).

## 9. Surfaces

### 9.1 Consent sheet

One row, with the string in §3 and the manifest `why` beneath. No
always-allow toggle.

### 9.2 Details page

The **Safe** section (`SPEC.md` §10.4) MUST show:

- usage of 64 MB and the key count, always;
- while the vault is unlocked, the list of keys with kind, size and date,
  a **Delete** per key, **Delete all**, and **Export** (§8.6). Values are
  not displayed: they are the dapp's own format, and the user reads them
  by exporting;
- while the vault is locked or sealed, **Unlock** in place of the list and of
  **Export**; **Delete all** stays, since deleting narrows (`SPEC.md` §6.11);
- the `safe:store` row with enabled and revoke;
- a previous build's safe, when a signing-key change left one (§8.7), and a
  safe left unreadable by a change of identity as one "from a previous
  identity" entry with its size and **Delete** (`SPEC.md` §6.11).

A user deletion raises `safe:changed` for the dapp's subscriptions.

### 9.3 `freedom://files`

None: a safe is not a file store and does not appear in the explorer
(`SPEC.md` §10.5).

### 9.4 Other pages

None.

## 10. Host implementation requirements

1. The host MUST derive the dapp key for every call in the main process and
   MUST apply it as the safe's namespace; no call names a dapp.
2. The host MUST keep a safe readable only by its own dapp key and, on the
   details page, the user. Freedom Agent has no tool that reads or writes
   a safe, on a tab it holds or anywhere else.
3. The host MUST encrypt values and the key index as §8.3 says, MUST
   derive the safe key on unlock and drop it on lock, and MUST gate every
   method but `safe_getQuota` and `safe_unsubscribe` as `SPEC.md` §6.11
   says.
4. The host MUST enforce the limits of §8.1 on every `safe_set` and report
   them through `safe_getQuota`.
5. The host MUST treat values as opaque: a JSON value is parsed only to
   check that it is JSON, and bytes are never sniffed or interpreted
   (`SPEC.md` §11 N9).
6. The host MUST log every `safe_set` and `safe_delete` to the dapp's
   activity log with the action and the size and **without the key**: the
   log stays readable while the vault is locked (`SPEC.md` §6.12), and a
   safe's key names must not.
7. On a tab Freedom Agent holds (`SPEC.md` §9.2) the host MUST prompt
   every `safe_set` and `safe_delete`, never answering it from the grant
   and naming the action and the size, never the key or the value;
   **Don't allow** is `4100 agent_custody`. It MUST also prompt before the
   first `safe_get` or `safe_keys` of a document, with the warning of
   `SPEC.md` §9.2 verbatim. The answer holds for that document until it
   unloads or the Agent releases the tab: after **Allow** its safe reads
   run; after **Don't allow** they reject `4100 agent_custody` without
   asking again. Until the user allows, the host MUST deliver no
   `safe:changed` to that document.
8. The host MUST reject every safe call while an update notice is pending
   for the dapp (`4100 update_pending`, `SPEC.md` §5.4), except
   `safe_getQuota`.
9. A safe call made under the grant MUST NOT reset the vault's idle timer
   (`SPEC.md` §6.11).

*Informative.* In upstream Freedom this is a `src/main/safe/` service
behind the `dapp:request` dispatcher, its grants beside the Files grants,
and the safe key handed over by the vault service on unlock and withdrawn
on `vault:locked` (`SPEC.md` Appendix A).

## 11. Security considerations and conformance checklist

- **What the lock gives.** A copied profile folder or a stolen disk yields
  ciphertext without the recovery phrase. At a running browser, a locked
  or sealed vault leaves every safe unreadable, key names included: the
  key is not in memory. This is the one store in the specification with
  that property, which is why secrets belong here and not in a private
  file.
- **No cross-dapp surface.** No method takes a dapp key and no capability
  reads another safe; the only other reader is the user, who sees keys and
  sizes and exports values.
- **Freedom Agent.** It has no tool that reads or writes a safe. On a tab
  it holds, whatever the dapp reads and displays it can see, so the first
  safe read there waits for the user's go-ahead under a plain warning
  (§10 item 7).
- **A new signer gets nothing.** After a signing-key change the previous
  build's safe is held for the user and never handed to the re-added dapp
  (§8.7): a re-registered name cannot inherit its predecessor's secrets.
- **The log.** Activity-log entries carry no key names (§10 item 6), so
  the log's readability while locked reveals only that writes happened.
- **Oracles.** A safe reveals nothing about other dapps: every answer is
  about the caller's own keys (`SPEC.md` §11 N3, N4).
- **Core rules bearing most:** N1, N2, N6, N8, N9, N11.

Conformance checklist (`examples/safe/`):

- [ ] every method behaves as §4 for a dapp holding `safe:store`;
- [ ] every method rejects `4100 unauthorized` without it, and
      `safe_getQuota` works without any grant;
- [ ] JSON values round-trip, including `null`; bytes round-trip as
      `Uint8Array`; `kind` reports which;
- [ ] `safe_get` of an absent key resolves `null`; `safe_delete` of one
      resolves `{}`;
- [ ] `ifMatch` and `ifNoneMatch` produce `4409 conflict` and `4409
      exists`;
- [ ] an over-long or ill-formed key is `invalid_key`; a value over 8 MB,
      a 1 001st key and the 64 MB total produce the three `4300` reasons
      with `data.limit` and `data.actual`;
- [ ] `safe_keys` pages with `cursor` and narrows with `prefix`;
- [ ] `safe:changed` arrives for another tab's `set` and `delete` and for
      a user deletion on the details page;
- [ ] with the vault locked, a call from the fronted tab shows the unlock
      prompt and completes on unlock, rejects `4100 locked` on dismiss,
      and never resets the idle timer; `safe_getQuota` still answers;
- [ ] the details page's Safe section shows usage and **Unlock** while
      locked, and the key list with **Delete** and **Export** while
      unlocked;
- [ ] the activity log shows safe writes without key names;
- [ ] on a tab Freedom Agent holds, the first safe read shows the warning
      prompt, **Allow** covers the document and **Don't allow** is `4100
      agent_custody`; safe writes prompt with action and size only;
- [ ] after a signing-key change the re-added dapp's safe is empty and the
      previous build's is listed for export or deletion only;
- [ ] the consent string appears verbatim; revocation ends subscriptions
      and deletes nothing; removal follows §8.6 including the export
      offer, and wipes the safe even while the vault is locked;
- [ ] `ifMatch` on an absent key is `conflict`; rewriting an identical
      value keeps the etag; `size` is the UTF-8 length of the JSON text;
      keys list in code-point order; a value `JSON.stringify` cannot
      serialise is `invalid_value`; a 61st subscription is
      `too_many_subscriptions`;
- [ ] a document receives one `safe:changed` per change, its own included,
      and none while locked, paused, or a notice is unanswered;
- [ ] **Export** writes one file per key and an `index.json`.
