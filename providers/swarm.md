# Provider: `swarm` — Swarm

`window.swarm` ships in Freedom today and **stays as shipped**: its method
table, parameters, tiers, limits, identities, errors and events are those of
upstream `docs/swarm-provider-api.md` (spec version `1.0`), which this
document treats as normative for the API and summarises rather than
restates. What this document adds are the **integration points** by which a
dapp's Swarm rights are declared in the `/2` manifest, granted on the
unified consent sheet, prompted for in the Dapps pane, listed on the details
page, and linked back to the dapp's files.

Everything not stated here is inherited from `SPEC.md` §7 where it applies
to `window.dapp`, and from the upstream document where it applies to
`window.swarm`.

## 1. Identity

| Field | Value |
|---|---|
| id | `swarm` |
| display name | Swarm |
| surface | `window.swarm` (as shipped); nothing is added to `window.dapp.swarm` |
| status | `stable` |
| since | core `specVersion` `1` (API unchanged since Freedom's `swarm_getCapabilities` `specVersion: '1.0'`) |
| version | `1.0` |

## 2. Host dependencies

- **Subsystem.** The user's own Bee node (bundled or external) with a
  usable postage batch for writes; the identity vault for app-scoped
  publisher identities.
- **When absent.** As shipped: every call rejects `4900` with
  `data.reason` `node-stopped`, `node-not-ready`, `ultra-light-mode` or
  `no-usable-stamps` (the four setup reasons also open Freedom's publish
  setup screen on a write), or `4900` without `data` when the provider is
  disabled (Settings → Advanced → Enable Identity & Wallet off).
  `dapp_getProviders` reports `status: "unavailable"` with the same reason
  to an added dapp (`SPEC.md` §7.4; a site without a record gets neither).
  `window.swarm` itself is always present on a dapp page.
- **Identity vault.** `swarm:feeds` and `swarm:signing` need the vault
  unlocked (feed and SOC writes are signed); `SPEC.md` §6.11 applies.
  `swarm:publish` and `swarm:messaging` do not.
- **Offline.** `swarm_listFeeds` and `swarm_getCapabilities` work without
  the node; everything else needs it and fails fast with `4900`.
- **Other providers.** `files`, optional, by the annotation pattern of
  `SPEC.md` §12.5: a publish of a stored file's bytes writes a Swarm
  publication record on the file (§9.4, §10). Without Files nothing is
  recorded and Swarm is unaffected.

## 3. Capabilities

The four keys of the shipped manifest block are this provider's
capabilities. Their tiers are upstream's.

| id | tier | scope shape | always-allow | consent-sheet string |
|---|---|---|---|---|
| `swarm:publish` | `per-call` | none | eligible | "Publish data to Swarm using your postage" |
| `swarm:feeds` | `per-call` | none | eligible | "Create and update Swarm feeds signed by an identity for this dapp" |
| `swarm:signing` | `per-call` | none | eligible | "Sign Swarm chunks with an identity for this dapp" |
| `swarm:messaging` | `per-call` | none | eligible | "Send and receive Swarm messages" |

How the unified sheet maps to the shipped grant model:

- Ticking **any** Swarm row connects the dapp key (the shipped *connection*
  grant). The connection is a consequence of a ticked row, never a grant
  of its own: ticking none leaves it unconnected, and a later
  `swarm_requestAccess` from a dapp that has a record MUST open the unified
  sheet with the manifest's Swarm rows instead of the shipped connect
  prompt, and MUST reject `4100 not_in_manifest` when the manifest declares
  none, so the Swarm store and the dapp record never disagree. The shipped
  connect prompt is for sites without a record (`SPEC.md` §4.8).
- A ticked row with **always-allow on** grants the tier and its
  `autoApprove.<tier>` flag (upstream's *Allow all* for that tier). A ticked
  row with always-allow **off** grants the tier without the flag (upstream's
  *Connect, but ask each time*): each publish, feed write, signing or
  messaging action still prompts.
- `swarm:feeds` and `swarm:signing` share **one** feed grant and one
  app-scoped publisher identity, created on first grant if the key has
  none; they differ only in which auto-approve flag applies.
- Public reads (`swarm_readChunk`, `swarm_readData`,
  `swarm_readSingleOwnerChunk`, `swarm_readFeedEntry`, `swarm_listFeeds`,
  `swarm_getCapabilities`) need no capability and are not rows.

## 4. Methods

As shipped; see upstream for parameters, returns and errors. Tiers in this
table are upstream's; the "requires" column names the capability in this
specification's terms.

Params and returns for every row are those of upstream
`docs/swarm-provider-api.md` ("Methods"); the "prompts" column is this
specification's view of the shipped tier.

| method | params / returns | requires | prompts | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `swarm_getCapabilities` | upstream | none | never | no | none | 60 s |
| `swarm_readChunk`, `swarm_readData`, `swarm_readSingleOwnerChunk`, `swarm_readFeedEntry`, `swarm_listFeeds` | upstream | none | never | no | public-read budget, §4.1 | 60 s (`readData` 300 s) |
| `swarm_requestAccess` | upstream | — | none when the key is connected; the unified sheet with the manifest's rows for a dapp with a record; else the shipped connect prompt | no | none | 60 s; 300 s when it opens the sheet (`SPEC.md` §7.11) |
| `swarm_getUploadStatus` | upstream | connected | never | no | none | 60 s |
| `swarm_publishData`, `swarm_publishFiles`, `swarm_publishChunk` | upstream | `swarm:publish` | per call unless always-allow | no | size limits, §4.1 | 300 s |
| `swarm_createFeed`, `swarm_updateFeed`, `swarm_writeFeedEntry` | upstream | `swarm:feeds` | per call unless always-allow; unlock prompt if the vault is locked | no | none | 300 s |
| `swarm_getSigningIdentity`, `swarm_writeSingleOwnerChunk` | upstream | `swarm:signing` | as feeds | no | none | 300 s |
| `swarm_getMessagingIdentity`, `swarm_subscribe` | upstream | `swarm:messaging` | never for an added dapp (`4100 messaging_not_granted` without the row, §7); for a site without a record, as shipped, the first call grants the tier | no | 32 subscriptions per key | 300 s |
| `swarm_sendPss`, `swarm_sendGsoc` | upstream | `swarm:messaging` | per send unless always-allow | no | 16 new GSOC topics per key per minute | 300 s |
| `swarm_unsubscribe` | upstream | connected | never | no | none | 60 s |

Sugar is upstream's (`window.swarm.publishData(...)` etc.). No `window.dapp`
sugar exists for this provider. Upload progress stays
`swarm_getUploadStatus` polling as shipped; the core job events are not
used.

### 4.1 Limits and rate limits (as shipped)

`maxDataBytes` 10 MiB, `maxFilesBytes` 50 MiB, `maxFileCount` 100,
`maxPathBytes` 100, `maxChunkPayloadBytes` 4096, `maxMessageBytes` 4000,
`maxTargetDepth` 3, `maxSubscriptions` 32 per key. Public-read budget per
key per fixed 60 s window: 600 requests / 5 MiB when connected, 120
requests / 512 KiB when not (`-32602 rate_limited`). New GSOC topics: 16 per
key per 60 s.

## 5. Events

| event | surface | payload | needs | when |
|---|---|---|---|---|
| `connect` | `window.swarm` | `{ origin }` | none | the shipped connect prompt was approved (not when the unified sheet or the shipped manifest sheet connected the key) |
| `disconnect` | `window.swarm` | `{ origin }` | none | the user disconnected the key; goes to the active tab's page |
| `message` | `window.swarm` | `{ type: 'swarm_subscription', subscription, result: { kind, key, data, encoding: 'base64', receivedAt } }` | `swarm:messaging` (a live `swarm_subscribe`) | a subscribed message arrived |
| `capabilitiesChanged` | `window.dapp` | the core payload | none | a Swarm row was granted, revoked, paused or resumed through the unified model (`SPEC.md` §7.5) |

Subscriptions are bound to the subscribing document and end on navigation,
tab close or revocation, as shipped.

## 6. Manifest block

`capabilities.swarm` is **byte-for-byte the block defined by
`freedom-manifest/1`**, so the shipped validator and auto-approve
fingerprint (schema plus sorted capability keys) run on it unchanged.
`schemas/providers/swarm.schema.json`, written from
`src/main/swarm/permission-manifests.js`:

```json
{
  "$id": "https://freedom.example/schemas/providers/swarm.schema.json",
  "title": "capabilities.swarm",
  "type": "object",
  "additionalProperties": false,
  "minProperties": 1,
  "properties": {
    "publish":   { "$ref": "#/$defs/row" },
    "feeds":     { "$ref": "#/$defs/row" },
    "signing":   { "$ref": "#/$defs/row" },
    "messaging": { "$ref": "#/$defs/row" }
  },
  "$defs": {
    "row": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    }
  }
}
```

Differences from the shipped `/1` handling, all outside the block itself:
the `/2` manifest is fetched by the core fetcher on **all four schemes**, not
only `bzz://` (so an `ipfs://` or `web3://` dapp may declare Swarm rows,
which upstream's `/1` path never offered); it is fetched at load and cached
by root reference (`SPEC.md` §4.7) rather than on `swarm_requestAccess`; a
wording-only change to `why` still re-prompts nothing (`SPEC.md` §5.5); a
removed key still withdraws the grants it created (`SPEC.md` §5.5). A site
whose manifest is `/1` is not a dapp and keeps the shipped sheet
(`SPEC.md` §4.8).

## 7. Errors

As shipped. Reason strings under the core codes:

| code | reason | when |
|---|---|---|
| `4001` | (no `data`) | the user rejected a prompt |
| `4100` | `not_connected` | a non-public method without the connection grant |
| `4100` | `feed_not_granted`, `messaging_not_granted` | a feeds/signing or messaging method without that grant |
| `4100` | `tag_ownership_mismatch` | `swarm_getUploadStatus` for another key's tag, or one already `done` |
| `4100` | `disabled`, `update_pending`, `agent_custody`, `locked` | the core's rules (`SPEC.md` §6.9, §5.4, §9.2, §6.11) applied to a Swarm call; `locked` when a feeds or signing write's unlock prompt is dismissed |
| `4900` | `node-stopped`, `node-not-ready`, `ultra-light-mode`, `no-usable-stamps` | the node cannot serve the call; on a write these also open Freedom's publish setup |
| `4900` | `subscription_cancelled`, `cancelled`, `establish_timeout`, `node_subscription_limit` | a subscription was torn down, did not establish in 30 s, or the node's pool is full |
| `4900` | (no `data`) | the provider is disabled in Settings |
| `-32002` | (no `data`) | a hardware-wallet signature is in progress in the sidebar |
| `-32602` | `invalid_params`, `unsupported_option` | malformed params; `options` not `{}` |
| `-32602` | `payload_too_large`, `data_too_large`, `missing_content_type`, `empty_files`, `too_many_files`, `invalid_path`, `duplicate_path`, `invalid_index_document` | publish inputs outside §4.1's limits or rules |
| `-32602` | `invalid_reference`, `invalid_span`, `invalid_identifier`, `invalid_owner`, `chunk_not_found`, `chunk_type_mismatch` | chunk and blob reads and writes |
| `-32602` | `invalid_feed_name`, `invalid_topic`, `feed_not_found`, `feed_empty`, `entry_not_found`, `index_already_exists` | feed methods |
| `-32602` | `invalid_recipient`, `invalid_target`, `invalid_payload`, `invalid_address`, `invalid_kind`, `subscription_not_found`, `too_many_subscriptions` | messaging methods |
| `-32602` | `rate_limited` | the public-read budget or the new-GSOC-topic budget (§4.1) |
| `-32603` | `gsoc_mining_timeout`, `gsoc_mining_failed` | deriving a GSOC signer failed or ran past 15 s |
| `-32603` | (node error text) | Bee 5xx, network errors, timeouts |

**Legacy exceptions (as shipped, kept; `SPEC.md` §7.13 allows them for a
provider documented as shipped):** reads return `{ data, encoding:
'base64' }` rather than `Uint8Array` (`SPEC.md` §7.7); rate limiting is
`-32602
rate_limited` rather than `-32005`; the `-32002` code exists; `connect`,
`disconnect` and `message` events exist on `window.swarm`.

## 8. Storage and quota

- **What is stored per dapp key.** In `swarm-permissions.json`: the
  connection, the feed grant, the messaging grant and the three auto-approve
  flags; in `swarm-feeds.json`: the key's publisher identities (mode, index
  or address) and feed records (name, topic, owner, manifest reference,
  timestamps); in `publish-history.json`: each publish (reference, size,
  time, name). Upload tags live in memory for the session.
- **Quota.** None in this specification: Swarm writes spend the user's
  postage, bounded by the shipped size limits (§4.1).
- **Accounting.** The details page shows publish history with sizes and
  the feed list; the Dapps pane's storage figures do not include Swarm.
- **On revoke** (a row revoked or the dapp paused): as the shipped
  disconnect for that tier: the grant and its auto-approve are removed,
  the key's live subscriptions close when messaging is revoked, `disconnect`
  fires on the active tab when the connection goes. Publisher identities
  and feed records are **kept**, as shipped, so a reconnected dapp signs
  with the same key and sees its old feeds.
- **On remove** (`SPEC.md` §8.4): the connection, grants and auto-approves
  are removed as above. Identities and feed records stay in the Swarm
  store, as upstream keeps them after a disconnect; the user clears them
  from Settings as today. Publish history stays.

## 9. Surfaces

### 9.1 Consent sheet

Up to four rows with the strings in §3, each `per-call` with an
always-allow toggle, off by default. The sheet adds one line under the
Swarm rows: *"Publishing spends your Swarm postage."* The sheet's **Add**
itself needs the vault unlocked (`SPEC.md` §6.11), so no row is granted
while locked; when the vault locks later, a feeds or signing write shows
the unlock prompt (`SPEC.md` §6.11).

Per-call prompts for rows granted through the unified sheet keep the shipped
prompt screens and render in the sidebar with the Dapps tab active
(`SPEC.md` §10.2). They name: for a publish, the size and content
type (or file count and total size); for a feed write, the feed name and
payload size; for a SOC write, the identifier and size; for a send, the
kind, topic and payload size. The `d` indicator shows the waiting state.

### 9.2 Details page

Under **Info**: the dapp's **publisher identity** (mode and address, or
"none yet"); its **feeds** (name, topic, last index, last update, with the
`bzz://` manifest link); its **publish history** (reference, size, time).
Under **Settings**, in **Capabilities**: the four rows with enabled,
always-allow and revoke. Nothing new is stored for this; the index
reads the three Swarm stores.

### 9.3 Sidebar

The Wallet tab's Swarm status row is unchanged for an added dapp; the Dapps
pane's connection banner (`SPEC.md` §10.2) shows the dapp's Swarm
capabilities beside it. Nothing in the wallet UI depends on the dapp
record.

### 9.4 `freedom://files`

The explorer's four slots (`SPEC.md` §10.5):

- **Publication record.** `publications.swarm`, `ref` a Swarm reference
  (64 hexadecimal characters). The host writes it with `verified: true`
  when `swarm_publishData`'s payload hashes to the CID of a file of the
  same dapp (§10 item 5); a dapp records a `swarm_publishFiles` bundle's
  root reference itself with `files_setPublication({ provider: "swarm",
  ref })`, shown dapp-reported.
- **Inspector.** The reference, and a `bzz://<ref>/` link.
- **Verb.** None in this revision (a user-started publish would spend
  postage and pick an identity; left for a later revision).
- **Panel.** None.

## 10. Host implementation requirements

1. The host MUST leave `window.swarm`'s API, tiers, limits and stores as
   shipped; nothing in this specification changes a Swarm method's
   parameters, return shape or error.
2. On **Add** with Swarm rows ticked, the host MUST write the corresponding
   connection, grants and auto-approve flags into the Swarm store for the
   dapp key exactly as the shipped manifest sheet would, so that
   `swarm_requestAccess` resolves without a prompt and the tier methods
   behave as after a shipped grant.
3. The host MUST fetch and validate the `/2` manifest's `swarm` block with
   the shipped validator and fingerprint, on all four schemes, through the
   core fetcher (`SPEC.md` §4.7), and MUST keep the shipped `/1` path for
   `/1` sites.
4. The host MUST show per-call prompts for unified-sheet grants on the
   shipped prompt screens with the sidebar switched to the Dapps tab
   (`SPEC.md` §10.2), with the material facts of §9.1, and MUST keep the
   shipped prompt surfaces for `/1` sites.
5. The host MUST, in the main-process `swarm_publishData` path and
   without touching the provider API, hash the payload to a CIDv1
   (`providers/files.md` §8.5) and look it up in the Files content index
   (`providers/files.md` §8.7) of each root readable at that moment; when
   a file of the same dapp, authored by it, has that CID, the host writes
   the Swarm publication record on it with `verified: true`
   (`providers/files.md` §8.6, §9.4). One hash per publish. A root whose
   key is not in memory (private while locked, both while sealed,
   `SPEC.md` §6.11) is skipped, so a publish made then may leave no
   record; the dapp can report it with `files_setPublication`.
6. The host MUST apply the dapp key as the Swarm permission key. They are
   the same function (`SPEC.md` §3.2), in the development realm too, where
   it emits `dev:<label>:<port>` (`SPEC.md` §3.6), so no store re-keys, nothing
   maps between two spellings, and feed topics
   (`keccak256("<key>/<feed name>")`) are unchanged.
7. The host MUST log every publish, feed write, SOC write and send to the
   dapp's activity log (`SPEC.md` §6.12).
8. On a tab Freedom Agent holds, the host MUST apply the custody rule to
   every Swarm write (`SPEC.md` §9.2).
9. The host MUST reject every non-public Swarm call for the dapp while an
   update notice is pending (`4100 update_pending`), and while the dapp or
   the row is paused (`4100 disabled`).
10. The host MUST NOT mark `swarm:publish` or any Swarm row as never
    auto-approvable; the shipped always-allow rules stand.

*Informative.* Upstream modules: `src/main/swarm/swarm-provider-ipc.js`
(authority), `permission-manifests.js` (generalised by the core fetcher),
`swarm-permissions.js`, `feed-store.js`, `publish-service.js` (the
publication-record CID match, §10 item 5),
`src/renderer/lib/swarm-provider.js` (consent routing to the Dapps pane for
`/2` dapps).

## 11. Security considerations and conformance checklist

- **Postage spend.** Every write spends the user's postage; the sheet says
  so and every write is per-call unless the user chose always-allow against
  a fetchable manifest (N5).
- **Identity linkage.** App-scoped identities are per key and unlinkable;
  `bee-wallet` and `ethereum-wallet` modes link origins and are the user's
  explicit choice, shown on the details page.
- **Cross-origin reads.** Feed topics are keyed by the dapp key; upload
  tags refuse other keys; `swarm_listFeeds` returns only the caller's; the
  messaging identity discloses two bytes of overlay. PSS and GSOC topics are
  global and the authoring guide says so.
- **Manifest on non-bzz schemes.** Declaring Swarm rows from an `ipfs://`
  or `web3://` dapp is new surface; it is bound by the same fetch, validate,
  fingerprint and update rules as any `/2` block.
- **Core rules bearing most:** N1, N2, N5, N6, N8, N10.

Conformance checklist (`examples/swarm/`):

- [ ] a `/2` manifest with all four Swarm rows, all ticked with always-allow
      on, makes `swarm_requestAccess` resolve without a prompt and
      `swarm_getCapabilities` report the granted state;
- [ ] the same with always-allow off makes each tier method prompt on the
      shipped screen with the Dapps tab active, with the facts of §9.1;
- [ ] no Swarm row ticked leaves the key unconnected and
      `swarm_requestAccess` opens the unified sheet again, never the
      shipped connect prompt;
- [ ] a `/1` site is not listed in `freedom://dapps` and sees the shipped
      sheet;
- [ ] a feeds row with the vault locked yields the unlock prompt on the
      first `swarm_createFeed`, then the write;
- [ ] `swarm_publishData` of a stored file's bytes writes
      `publications.swarm` with `verified: true` and the file reads
      `location: "published"` (§9.4, §10 item 5);
- [ ] revoking a row removes its grant and auto-approve and keeps the
      identity and feed records; removing the dapp does the same;
- [ ] the details page lists identity, feeds and publish history;
- [ ] the Wallet-tab Swarm row is unchanged for the added dapp and for a
      `/1` site;
- [ ] an update that removes the `publish` key withdraws that grant on
      approval; a `why`-only change re-prompts nothing.
