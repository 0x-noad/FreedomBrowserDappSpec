# Provider: `radicle` — Radicle

`window.radicle` ships in Freedom today and **stays as shipped**: its
methods, tiers, errors and events are those of upstream
`docs/radicle-provider-api.md` (draft v0.1; `radicle_getCapabilities`
reports `specVersion: '0.2'`), which this document treats as normative for
the API and summarises. What this document adds are the **integration
points**: a `capabilities.radicle` manifest block (new; upstream reads no
manifest for Radicle), grants written by the unified consent sheet, per-call
prompts in the Dapps pane, per-dapp seed records, and the details-page
listing.

Reads of repository data are not part of the provider: any page fetches
`rad:<rid>/…` JSON from the user's in-process storage, world-readable P2P
content that needs no consent. The provider covers what is not a public
read: seeding, syncing, identity disclosure, collaborative-object writes
and node introspection.

Everything not stated here is inherited from `SPEC.md` §7 where it applies
to `window.dapp`, and from the upstream document where it applies to
`window.radicle`.

## 1. Identity

| Field | Value |
|---|---|
| id | `radicle` |
| display name | Radicle |
| surface | `window.radicle` (as shipped); nothing is added to `window.dapp.radicle` |
| status | `stable` |
| since | core `specVersion` `1` |
| version | `0.2` (upstream's `radicle_getCapabilities.specVersion`) |

## 2. Host dependencies

- **Subsystem.** The profile's in-process Radicle node and storage
  (`libradicle` addon, `radicle-data/`), enabled in the profile.
- **When absent.** As shipped: every call rejects `4900` (integration
  disabled, node stopped, or not ready); `radicle_getCapabilities` reports
  `reason` `profile-disabled`, `node-stopped` or `node-not-ready`.
  `dapp_getProviders` reports `status: "unavailable"` with the same reason
  to an added dapp (`SPEC.md` §7.4; a site without a record gets neither).
  `window.radicle` itself is always present on a dapp page.
- **Identity vault.** None for signing: writes sign with the Radicle
  **node identity**, which is the node's own key, not the wallet vault, so
  the lock gates no Radicle call (as shipped). The vault must exist for
  any grant, as for every provider (`SPEC.md` §6.11).
- **Offline.** `radicle_getCapabilities`, `radicle_listSeededRepos`,
  `radicle_getSeedStatus` and `radicle_disconnect` work without peers;
  seeding, syncing and writes need the node running and announce over the
  network, failing fast with `4900` when it is stopped.
- **Other providers.** None.

## 3. Capabilities

The two shipped tiers beyond connection are this provider's capabilities;
the manifest block (§6) is new in `/2`.

| id | tier | scope shape | always-allow | consent-sheet string |
|---|---|---|---|---|
| `radicle:node` | `per-call` | none | eligible, except unseed of a user-seeded repo (never) | "Seed and sync Radicle repositories on your node" |
| `radicle:signing` | `per-call` | none | eligible | "Act as you on Radicle: read your identity and write issues and comments in your name" |

How the unified sheet maps to the shipped grant model:

- Ticking **either** row connects the dapp key (the shipped *connection*
  grant), which unlocks `radicle_getNodeStatus`, `radicle_listSeededRepos`,
    `radicle_getSeedStatus` and `radicle_disconnect`. The connection is a
  consequence of a ticked row, never a grant of its own: ticking none
  leaves it unconnected, and a later `radicle_requestAccess` from a dapp
  that has a record MUST open the unified sheet with the manifest's Radicle
  rows instead of the shipped connect prompt, and MUST reject `4100
  not_in_manifest` when the manifest declares none. The shipped connect
  prompt is for sites without a record (`SPEC.md` §4.8).
- `radicle:node` ticked with always-allow **on** sets the shipped `node`
  auto-approve: `radicle_seed` and `radicle_unseed` run without a per-repo
  prompt. With always-allow **off**, each seed and unseed prompts per
  repository, as shipped. `radicle_sync` never prompts and is limited to
  already-seeded repos.
- **Never auto-approvable:** `radicle_unseed` of a repo the **user** seeded
  by hand (one with no dapp recorded against it, §8). It prompts whatever
  the toggle says.
- `radicle:signing` ticked grants the shipped signing tier
  (`radicle_getIdentity` and every COB write); always-allow **on** sets the
  `signing` auto-approve so writes do not prompt. The row's string says in
  words that the dapp will author content as the user; the identity is the
  user's one Radicle identity, with no per-dapp sub-identity (§11).

## 4. Methods

As shipped; see upstream for parameters, returns and errors.

Params and returns for every row are those of upstream
`docs/radicle-provider-api.md` ("Methods"); the "prompts" column is this
specification's view of the shipped tier. Timeouts are the shipped shim's,
which follows the Swarm table (`SPEC.md` §7.11).

| method | params / returns | requires | prompts | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `radicle_getCapabilities` | upstream (`{ specVersion, canUseNode, reason, writes }`) | none | never | no | none | 60 s |
| `radicle_requestAccess` | upstream | — | none when the key is connected; the unified sheet with the manifest's rows for a dapp with a record; else the shipped connect prompt | no | none | 60 s; 300 s when it opens the sheet (`SPEC.md` §7.11) |
| `radicle_disconnect` | upstream | connected | never | no | none | 60 s |
| `radicle_getNodeStatus` | upstream (`nid` only once signing is granted) | connected | never | no | none | 60 s |
| `radicle_listSeededRepos` | upstream (node-global list) | connected | never | no | none | 60 s |
| `radicle_getSeedStatus` | upstream (replication snapshot) | connected | never | no | none | 60 s |
| `radicle_seed` | upstream (resolves at once; progress via `seedStatus`) | `radicle:node` | per repo unless always-allow | no | host-set write budget, §4.1 | 300 s |
| `radicle_unseed` | upstream (cancels a fetch in flight) | `radicle:node` | per repo unless always-allow; **always** for a user-seeded repo | no | host-set write budget, §4.1 | 300 s |
| `radicle_sync` | upstream | `radicle:node` | never; seeded repos only (`not_seeded`) | no | host-set write budget, §4.1 | 60 s |
| `radicle_getIdentity` | upstream (`{ did, nid, alias }`) | `radicle:signing` | never for an added dapp (`4100` without the row, §7); for a site without a record, as shipped, the first call may prompt | no | none | 300 s |
| `radicle_createIssue`, `radicle_commentIssue`, `radicle_editIssueState`, `radicle_commentPatch` | upstream (announce before returning; irrevocable once gossiped) | `radicle:signing` | per write unless always-allow | no | host-set write budget, §4.1 | 300 s |

Progress for seeding stays the shipped
`seedStatus` event and `radicle_getSeedStatus` snapshot; the core job events
are not used. Sugar is upstream's; no `window.dapp` sugar exists for this
provider.

### 4.1 Limits (as shipped)

RIDs are `z` plus base58, 20–60 characters; COB ids hex, 6–40 characters;
issue titles ≤ 200 bytes, descriptions ≤ 64 KiB (`payload_too_large`).
Upstream v0.8.8 has no write rate limit. For an added dapp the host MUST
limit write methods to 60 per fixed minute per dapp key, reported as
`-32005` with `data.retryAfterMs` (`SPEC.md` §7.12): this is the host's
limit under this specification, not a shipped one, so it takes the core
code.

## 5. Events

| event | surface | payload | needs | when |
|---|---|---|---|---|
| `connect` | `window.radicle` | `{ origin }` | none | the shipped connect prompt was approved (not when the unified sheet connected the key) |
| `disconnect` | `window.radicle` | `{ origin }` | none | the key was disconnected, by the user or by `radicle_disconnect` |
| `seedStatus` | `window.radicle` | the `radicle_getSeedStatus` shape | connected (`radicle:node` to have started the action) | a replication transition for a seed or sync this key started |
| `capabilitiesChanged` | `window.dapp` | the core payload | none | a Radicle row was granted, revoked, paused or resumed through the unified model |

## 6. Manifest block

New in `/2`. `schemas/providers/radicle.schema.json`:

```json
{
  "$id": "https://freedom.example/schemas/providers/radicle.schema.json",
  "title": "capabilities.radicle",
  "type": "object",
  "additionalProperties": false,
  "minProperties": 1,
  "properties": {
    "node":    { "$ref": "#/$defs/row" },
    "signing": { "$ref": "#/$defs/row" }
  },
  "$defs": {
    "row": {
      "type": "object", "additionalProperties": false, "required": ["why"],
      "properties": { "why": { "type": "string", "minLength": 1, "maxLength": 140 } }
    }
  }
}
```

Example:

```json
"radicle": {
  "node":    { "why": "Seeds the repositories you open so they load from your node." },
  "signing": { "why": "Files issues and comments in your name when you submit them." }
}
```

Update rules are the core's (`SPEC.md` §5.5): a removed key withdraws the
grant it created on approval; a `why`-only change re-prompts nothing.

## 7. Errors

As shipped. Reason strings under the core codes:

| code | reason | when |
|---|---|---|
| `4001` | (no `data`) | the user rejected a prompt |
| `4100` | (no `data`) | no connection grant, grant revoked, or tier not granted, as shipped |
| `4100` | `agent_custody` | a grant-answered write on a tab Freedom Agent holds |
| `4100` | `disabled`, `update_pending` | the core's rules (`SPEC.md` §6.9, §5.4) applied to a Radicle call |
| `4900` | (no `data`) | integration disabled, node stopped, or node not ready |
| `-32602` | `invalid_rid`, `invalid_id`, `invalid_title`, `invalid_body` | a parameter fails validation before the addon boundary |
| `-32602` | `not_seeded` | `radicle_sync` of a repo with no seeding policy |
| `-32602` | `repo_not_found`, `announce_failed` | the node does not have the repo, or announcing the write failed |
| `-32602` | `payload_too_large` | a title over 200 bytes or a description over 64 KiB |
| `-32005` | (core) | the host's per-key write budget of §4.1, with `data.retryAfterMs` |
| `-32603` | (addon error text) | internal and addon errors |

**Legacy exceptions (as shipped, kept; `SPEC.md` §7.13 allows them for a
provider documented as shipped):** `4100` and `4900` without a
`data.reason` for the shipped cases; `connect`, `disconnect` and
`seedStatus` events on `window.radicle`. Rate limiting is not a legacy
exception: the limit is new and uses the core `-32005`.

## 8. Storage and quota

- **What is stored per dapp key.** In `radicle-permissions.json`: the
  connection, the signing grant and the `node` / `signing` auto-approve
  flags; **new in this specification:** the list of RIDs this dapp key's
  `radicle_seed` was approved for (the **seed record**), written when the
  seed is approved and removed when the repo is unseeded by anyone. A repo
  the user seeded by hand, or that was seeded before this record existed,
  has no dapp against it.
- **Quota.** None: seeding commits the user's disk and bandwidth per
  repository and is consented per repository or by always-allow.
- **Accounting.** The details page lists the repos the dapp seeded; the
  Dapps pane's storage figures do not include Radicle storage.
- **On revoke** (a row revoked or the dapp paused): as the shipped
  disconnect for that tier: the grant and its auto-approve are removed,
  `disconnect` fires when the connection goes. Seeding policies are **not**
  changed: a revoked dapp's repos stay seeded until the user unseeds them.
  The seed record is kept so the details page can still offer **Unseed**.
- **On remove** (`SPEC.md` §8.4): connection, grants and auto-approves are
  removed as above. The remove confirm lists the repos the dapp seeded and
  offers to **unseed them all**, default **keep** (the user may have come
  to rely on them). Repos kept lose their dapp attribution and become
  user-seeded.

## 9. Surfaces

### 9.1 Consent sheet

Up to two rows with the strings in §3, each `per-call` with an
always-allow toggle, off by default. The `radicle:signing` row MUST carry
this disclosure, verbatim: *"This dapp will author content as you on the
Radicle network. Writes cannot be recalled once announced."*

Per-call prompts for rows granted through the unified sheet keep the shipped
prompt screens and render in the sidebar with the Dapps tab active
(`SPEC.md` §10.2). They name: for a seed or unseed, the RID and the
repo's name where known, and for an unseed of a user-seeded repo the words
"you seeded this yourself"; for a write, the kind (issue, comment, state
change, patch comment), the RID and the content.

### 9.2 Details page

Under **Settings**, in **Seeded repositories**: the repos this dapp seeded
(RID, name, replication state from `radicle_getSeedStatus`) each with
**Unseed**; in **Capabilities**: the two rows with enabled, always-allow
and revoke. Nothing under **Info**: the user's identity is not shown here
(it is the user's, not the dapp's). When the manifest's
`source` is a Radicle RID (`rad:z…`), the **Info** row for `source` opens the
host's own repository page (`SPEC.md` §10.4).

### 9.3 `freedom://files`

None: Radicle holds no stored-file records, verbs or panel
(`SPEC.md` §10.5).

## 10. Host implementation requirements

1. The host MUST leave `window.radicle`'s API, tiers and errors as
   shipped.
2. On **Add** with Radicle rows ticked, the host MUST write the
   corresponding connection, grants and auto-approve flags into the Radicle
   store for the dapp key, so that `radicle_requestAccess` resolves without
   a prompt and the tier methods behave as after a shipped grant.
3. The host MUST record the dapp key against each RID a dapp's
   `radicle_seed` is approved for, remove the record on unseed, and never
   attribute a user-seeded repo to a dapp.
4. The host MUST prompt every `radicle_unseed` of a repo with no dapp
   record, whatever the `node` always-allow state.
5. The host MUST show per-call prompts for unified-sheet grants on the
   shipped prompt screens with the sidebar switched to the Dapps tab
   (`SPEC.md` §10.2), with the facts of §9.1, and keep the shipped surfaces
   for non-dapp origins. The dapp key is the Radicle permission key in the
   development realm too (`SPEC.md` §3.6).
6. The host MUST validate RIDs and COB ids before crossing the addon
   boundary, as shipped.
7. The host MUST log every seed, unseed, sync and COB write to the dapp's
   activity log (`SPEC.md` §6.12).
8. On a tab Freedom Agent holds, the host MUST apply the custody rule to
   every Radicle write, as shipped (`SPEC.md` §9.2).
9. The host MUST reject every non-public Radicle call for the dapp while an
   update notice is pending (`4100 update_pending`) and while the dapp or
   the row is paused (`4100 disabled`).
10. The host MUST rate-limit write methods to 60 per fixed minute per dapp
    key, `-32005` with `data.retryAfterMs` (§4.1).

*Informative.* Upstream modules: the Radicle provider IPC and
`radicle-permissions.js` (grants, now also seed records),
`src/main/radicle/rad-protocol.js` (reads, untouched), the consent routing
in the renderer for `/2` dapps.

## 11. Security considerations and conformance checklist

- **One identity.** Every dapp granted `radicle:signing` acts as the user's
  single Radicle identity; there are no per-dapp sub-identities, by design
  (a forge is a reputation system). The DID is a persistent cross-site
  identifier and is disclosed only behind that grant; `radicle_getNodeStatus`
  withholds the NID until then.
- **Irrevocable writes.** COB writes are announced before returning and
  cannot be recalled; the row string and every per-call prompt say so.
- **Disk and bandwidth.** Seeding is a standing commitment; it is consented
  per repository unless the user chose always-allow, and a dapp can never
  silently drop a policy the user made (§3).
- **Node introspection.** The seeded-repo list and node status are private
  and stay behind the connection grant, as shipped.
- **Core rules bearing most:** N1, N2, N3, N3b, N5, N7.

Conformance checklist (`examples/radicle/`):

- [ ] a `/2` manifest with both rows, ticked with always-allow on, makes
      `radicle_requestAccess` resolve without a prompt, `radicle_seed` run
      without a per-repo prompt, and `radicle_createIssue` write without a
      prompt;
- [ ] with always-allow off, seed, unseed and each write prompt on the
      shipped screen with the Dapps tab active, with the facts of §9.1;
- [ ] no Radicle row ticked leaves the key unconnected and
      `radicle_requestAccess` opens the unified sheet again, never the
      shipped connect prompt;
- [ ] `radicle_unseed` of a repo the user seeded by hand prompts even with
      `node` always-allow on;
- [ ] a dapp-seeded repo appears on the details page with Unseed, and a
      user-seeded one does not;
- [ ] revoking `radicle:node` leaves the repos seeded and the Unseed
      actions available; removing the dapp offers to unseed them all with
      keep as the default;
- [ ] `radicle_sync` of an unseeded RID is `-32602 not_seeded`;
- [ ] `radicle_disconnect` drops connection, signing and auto-approves and
      emits `disconnect`;
- [ ] the signing row's disclosure sentence (§9.1) appears verbatim;
- [ ] on an Agent-held tab a write prompts with its content and a
      grant-answered write is `4100 agent_custody`.
