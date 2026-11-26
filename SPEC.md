# Freedom Browser Dapp Specification — Core

**specVersion:** `1` · **Status:** draft 1, 2026-11-19 · **Applies to:** Freedom
Browser, upstream `solardev-xyz/freedom-browser`, written against v0.8.8 "Goa".

This document is the **core** of the specification. It defines what a dapp
is, how the host identifies it, the manifest, consent and grants, the update
mechanism, the injected `window.dapp` object, the conventions every provider
inherits, the management surfaces, and the security rules. Everything a
single provider offers (its capabilities, methods, events, storage and host
requirements) lives in that provider's document under `providers/`, written
to `providers/TEMPLATE.md`. A new provider is one new document; the core
does not change for it (§12).

---

## 1. Scope and conformance

1.1. A **dapp** is a static, serverless site served over one of the schemes
in §3.1 that declares itself with a manifest (§4) and talks to the host
through `window.dapp` (§7) and, where it uses them, the shipped globals
`window.swarm`, `window.radicle` and `window.ethereum`.

1.2. This specification is **Freedom-specific**. The page names
`freedom://dapps` and `freedom://files`, the sidebar's dApps pane, and the
provider set in §12 are normative. Another host MAY implement it; §7.1 says
how such a host identifies itself.

1.3. The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be
interpreted as in RFC 2119. Text marked *informative* carries no requirement.

1.4. **What stays as shipped.** `window.swarm`, `window.radicle` and
`window.ethereum` keep their shipped APIs. This specification adds
`window.dapp`, the `/2` manifest, the unified consent sheet, the update
mechanism, the Safe and Files providers, and the management surfaces. Where it
touches the shipped providers it does so only at the integration points their
provider documents name (grants written by the unified sheet, listings on the
details page, and the seed and publication records described in Appendix A and
in `providers/radicle.md` and `providers/files.md`).

1.5. **Local-first.** Safe and Files reads, the launcher, the details page and
the dApps pane MUST work with no network. Operations that need a node (Swarm
publishing, Radicle sync) MUST fail with a clear `4900` error rather than
hang.

1.6. **Not in scope.** No IPFS write surface (pinning, add, IPNS) and no
chain-read provider exist in v1; their prefixes `ipfs` and `chain` are
reserved (§12.1). Iframes, workers and service workers receive no
`window.dapp` (§3.4). Private windows receive nothing (§3.5).

## 2. Terms

| Term | Meaning |
|---|---|
| **host** | the browser implementing this specification |
| **dapp** | the client page, identified by its **dapp key** (§3.2) |
| **scheme** | how a dapp is served: `bzz`, `ipfs`, `ipns`, `web3`. A scheme is not a provider |
| **realm** | the development realm `dev:` (§3.6) |
| **provider** | a named bundle of capabilities, methods, events, a manifest block and host requirements, described by one document under `providers/` |
| **capability** | one grantable right within a provider, written `<provider>:<name>` (§6.1) |
| **scope** | the optional narrowing object a capability carries (§6.3) |
| **tier** | how a capability may be granted: `public`, `consent` or `per-call` (§6.2) |
| **grant** | the user's recorded decision on one capability for one dapp, with its scope, tier state and enabled flag (§6.8) |
| **always-allow** | the user's standing approval of a `per-call` capability, so it runs without a prompt (§6.2) |
| **method** | one callable, written `<provider>_<verb>`; core methods use the `dapp_` prefix (§7.3) |
| **event** | one host-to-dapp notification, written `<provider>:<event>` or a bare core name (§7.5) |
| **surface** | where a provider's methods live: `window.dapp` (every provider this specification introduces) or its own global (the shipped providers) |
| **root reference** | the content reference the host resolved the dapp's root from on a given load (§5.1) |
| **added** | a dapp for which the user has pressed **Add** on the consent sheet at least once; it appears in `freedom://dapps` |
| **identity vault** | the host's password-encrypted identity (in Freedom, the wallet seed phrase) with its idle lock. It MUST exist before a dapp can be added, and its lock gates what §6.11 says |

*Informative.* "Provider" is the word Freedom already uses for its injected
globals and EIP-1193 uses for the Ethereum object. Under EIP-1193 the
provider is the object itself; here `window.dapp` is the object and the
providers live inside it. "Capability" is the word Freedom's Swarm manifest
already uses for exactly this unit (`capabilities.swarm.*`); "permission"
is reserved for Chromium site permissions (camera, notifications) so the two
stay distinct in UI strings and code. EIP-2255 "permissions" on
`window.ethereum` are that provider's capabilities.

## 3. Dapp identity

### 3.1 Schemes

A dapp MUST be served from a top-level document whose origin scheme is one
of `bzz`, `ipfs`, `ipns` or `web3`. `http` and `https` are never dapp
origins outside the development realm (§3.6). `rad://` is a read API, not a
host.

`web3://` documents (ERC-8244 onchain apps) are first-class dapps with three
stated exceptions: the manifest is inline (§4.1), `dapp_fetch` is their
method-form public read because `fetch()` is blocked for them (§7.14), and
they run with no workers at all under Freedom's default-deny policy for
onchain documents (§3.4).

### 3.2 The dapp key

The host MUST identify a dapp by its **dapp key**, derived in the main
process from the top-level document's origin, never from anything the page
says about itself. The dapp key is the key Freedom's
`src/shared/origin-utils.js` `getPermissionKey` already computes:

| Origin | Dapp key | Example |
|---|---|---|
| a name host under any dapp scheme | the bare, lowercase name | `bzz://name.eth/` → `name.eth`; `ipfs://site.wei/` → `site.wei` |
| a raw content reference | the scheme-qualified reference | `bzz://<64-hex>`, `ipfs://bafy…`, `ipns://k51…` |
| an onchain app | the contract, and the chain id when not mainnet | `web3://0xabc…` (chain 1); `web3://0xabc…:100` (chain 100) |
| a development-realm site | `dev:`, the label and the port | `http://game.localhost:8080/` → `dev:game:8080` |

Supported name systems: `.eth` and `.box` (ENS), `.wei` (WNS), `.gwei`
(GNS), `.tez` (Tezos Domains).

*Informative.* A name resolves to one contenthash record, owned by one
party, and the record encodes its transport; the host treats the typed
scheme as an assertion and refuses a mismatch. So `bzz://name.eth` and
`ipfs://name.eth` can never be two different sites, and the scheme adds
nothing to a name's identity. Raw references cannot collide across schemes.
Keying by the bare name means a transport move by a name's owner is an
ordinary update (§5), not a loss of the dapp's data and grants. Chromium's
own storage (localStorage, IndexedDB) stays partitioned by full origin; that
is Chromium's concern, not this specification's.

A contract deployed on two chains is two dapps, and the key's spelling is the
one `getPermissionKey` emits, not the address-bar form:
`web3://0xabc….eip155-1` in the address bar is the dapp `web3://0xabc…`. Every
store the host joins by dapp key, the wallet's included (§6.14, Appendix A),
MUST use that one spelling. Case is whatever Chromium reports as the origin;
`ipfs` and `ipns` authorities are canonicalised to lowercase base32 / base36
before Chromium sees them, Swarm references are hex, names are lowercase.

The dapp key is the namespace for the dapp's safe, for every grant, for
the recorded root reference, and for the author of its files
(`providers/safe.md`, `providers/files.md`).

### 3.3 Immutability of raw addresses

A dapp served from a raw content reference (`ipfs://<cid>`, `bzz://<ref>`)
can never change under the user. This specification treats that as a
security feature: the user knows the dapp itself has not changed, by the
content-addressing properties of the scheme. Raw-address dapps are fully
supported; the reference check in §5 still runs for them, as a tripwire.

### 3.4 Top frame only

`window.dapp` MUST be injected only into the **top-level document**. Iframes
of any origin, workers of any kind and service workers receive nothing. A
same-origin iframe MAY `postMessage` to its top frame, which holds the
grant; a worker MAY post bytes to the page, which writes them.

### 3.5 Where the object is absent

`window.dapp` MUST NOT exist in private windows, on `http(s)`, `file:` or
any non-dapp scheme (outside the development realm), or in any frame but the
top frame. There is nothing to fingerprint and nothing to reject: a page
checks `window.dapp` and finds `undefined`.

### 3.6 The development realm

The host MUST offer a **developer setting**, off by default, that admits
`http://<label>.localhost[:port]` origins as dapps with the key
`dev:<label>:<port>`, where `<port>` is the origin's port (`80` when the URL
names none). The port is part of the identity because every loopback service
answers for every `*.localhost` host: a page that another local server (a
third-party dev server, the bundled node's own gateway) serves under the label
`game` is a different dapp with no data, not an impostor drawing prompts under
`dev:game:8080`'s identity. A dev server that moves to another port is
therefore a new dapp with no data; **Wipe dev data** (§10.8) clears the old
one. The setting lives in the dApps pane, under its **Developer settings**
header (§10.2), and not on the browser's Settings page; while it is on, the
pane shows a persistent tag on that header. While it is on, the host's key
function (in Freedom, `getPermissionKey`) MUST itself return
`dev:<label>:<port>` for such an origin, so that every store keyed by dapp
key, the shipped Swarm and Radicle stores included, agrees on the key with no
mapping layer; while it is off, the origin is an ordinary `http` origin to
every store. Two consequences are intended: the site-permission store (camera,
clipboard and the rest) and the wallet connection store key such an origin as
`dev:<label>:<port>` too, so a dev dapp's site permissions and wallet
connection are its own and not the `http` origin's; and anything recorded
under the `http` origin before the setting went on is not visible while it is
on, and the reverse, since neither spelling is migrated to the other. Bare
`localhost`, IP literals, `https` and non-loopback hosts MUST be refused. A
`dev:` dapp has its own safe and the development realm its own files pool,
fully walled from production data; no root reference check runs for it, the
update notice being driven by the manifest hash instead (§5.2); everything
else (manifest, sheet, prompts, limits) behaves as in production. The
management surfaces list `dev:` dapps under their own heading with a visible
tag, exclude them from summary counts and storage figures, and offer a
one-action **Wipe dev data** beside the setting (§10.8).

## 4. The manifest

### 4.1 Location and forms

A dapp MUST declare itself with a manifest. On `bzz`, `ipfs` and `ipns` the
manifest is the file **`/freedom-manifest.json`** at the dapp's root, and
only there. On `web3://`, which cannot serve a sidecar file, the manifest is
**inline**: the first `<script type="application/freedom-manifest+json">`
element in the raw bytes of the `html()` document. The inline form MUST be
ignored on every other scheme, so a page cannot shadow its served manifest.

### 4.2 Schema

The manifest is a JSON object whose `schema` field is
`"freedom-manifest/2"`. The host MUST validate it against the published
schema `schemas/freedom-manifest-2.schema.json` (§12.6); a manifest that
passes the published schema passes the host.

| Field | Required | Rules |
|---|---|---|
| `schema` | yes | the string `freedom-manifest/2` |
| `$schema` | no | a string: the JSON Schema URL that code editors read to validate the file as the author types, meant for this package's schema (§12.6). The host ignores it (it is signed over like any field). Allowed in the served `freedom-manifest.json` only; inline on `web3://` (§4.1) it is a manifest error |
| `name` | yes | ≤ 32 characters; display only, never identity (§3.2) |
| `description` | yes | ≤ 160 characters; shown on the consent sheet and the details page (§6.5, §10.4), as author text (§11 N12) |
| `icon` | yes | §4.4 |
| `version` | yes | ≤ 32 characters; a string the update notice can show (§5.3) |
| `capabilities` | yes | §4.3; MAY be an empty object |
| `homepage` | no | URL, ≤ 256 characters |
| `source` | no | a Radicle RID (`rad:z…`, optionally written `rad://z…`) or a URL, ≤ 256 characters; shown on the details page |
| `author` | no | `{ name, url? }`; free text, unverified; `name` ≤ 64 characters, `url` ≤ 256 characters |
| `minSpecVersion` | no | the lowest core `specVersion` the dapp needs; when the host's own is lower it shows "needs Freedom spec `<n>` or newer" on the consent sheet and the details page (§6.5, §10.4), the short badge "needs a newer Freedom" on the tile (§10.3), and changes nothing else: the dapp is still added and calls still run, since the host cannot know which would fail and the dapp can read `specVersion` from `dapp_getProviders` |
| `publicKey` | no | §4.6; required when `signature` is present |
| `signature` | no | §4.6; required when `publicKey` is present |
| `rotation` | no | `{ from, signature }`, the previous key's endorsement of this one (§4.6); needs `publicKey` |

Unknown fields MUST be rejected. Forward compatibility comes from the schema
number, not from ignoring fields.

### 4.3 The `capabilities` block

`capabilities` is an object keyed by provider id. Each provider's sub-block
is defined by that provider's document and its schema
`schemas/providers/<id>.schema.json`. The general shape is one entry per
capability name, each carrying `why` (≤ 140 characters, shown on the consent
sheet) and, where the capability has a scope (§6.3), `scope`:

```json
{
  "schema": "freedom-manifest/2",
  "name": "Notebook",
  "description": "Encrypted notes you can share with other dapps.",
  "icon": "./icon.png",
  "version": "1.4.0",
  "capabilities": {
    "safe": {
      "store": { "why": "Keeps your settings and sign-in on this device." }
    },
    "files": {
      "own":  { "why": "Stores your notes and shares the ones you export." },
      "read": { "why": "Imports images other dapps shared." }
    },
    "swarm": {
      "publish": { "why": "Publishes a note as a page when you ask." }
    }
  }
}
```

The manifest declares **every capability the dapp may ever use**; a runtime
request outside it is refused (§6.4). The `swarm` sub-block is byte-for-byte
the block defined by `freedom-manifest/1`, so a `/2` manifest is a strict
superset of `/1` and the shipped Swarm validator and auto-approve
fingerprint run on it unchanged. At most 64 capabilities in total.

An **unknown provider id** in `capabilities` MUST NOT make the manifest
invalid. The host shows those entries on the sheet as ungrantable ("needs a
provider this browser does not have") so a dapp built for a newer host still
loads on an older one.

### 4.4 The icon

`icon` is a relative path on served schemes (`"./icon.png"`), fetched
same-origin once at consent, and a `data:` URI on `web3://` only. A path on
`web3://` or a `data:` URI elsewhere is a manifest error. The image MUST be
PNG, JPEG or WebP (never SVG), its declared type MUST match its magic bytes,
it MUST be at most 16 KiB and between 8 and 512 pixels on each side. The
host MUST re-encode it in the main process (stripping EXIF, ICC and
animation), downscale to at most 128 × 128 without upscaling, and store the
result with the dapp's record. Anything else falls back to a monogram of the
name.

### 4.5 Limits and validation

| Limit | Value |
|---|---|
| served manifest | ≤ 8 KiB |
| inline manifest on `web3://` | ≤ 32 KiB |
| `name` / `version` | ≤ 32 characters |
| `description` | ≤ 160 characters |
| each `why` | ≤ 140 characters |
| capabilities in total | ≤ 64 |
| `author.name` | ≤ 64 characters |
| `homepage`, `source`, `author.url` | ≤ 256 characters |

Every byte quantity in this package is binary. KiB and MiB are 1 024 and 1 048
576 bytes; the MB and GB written for user-facing figures (the storage presets
of §10.2 and `providers/files.md` §8.1, the Safe and Files caps) are the same
units in the spelling the UI shows, so 1 GB is 1 073 741 824 bytes and never
10⁹.

A manifest that is oversized, not JSON, fails the schema, or carries unknown
fields is **invalid**. An invalid manifest leaves the site a non-dapp
(§6.4, `no_manifest`) and, for an already-added dapp, is treated as a change
(§5.6).

### 4.6 Signed manifests

A manifest MAY be signed. `publicKey` is the 32-byte Ed25519 public key and
`signature` the 64-byte Ed25519 signature, each encoded as multibase base58btc
(a `z` prefix, as the schema's patterns require), the signature being over the
RFC 8785 canonical JSON serialisation of the manifest object with the
`signature` field removed. The host MUST verify the signature when both fields
are present; a failed verification makes the manifest invalid (§4.5), so the
site is a non-dapp or, for an added dapp, §5.6 applies. The host records the
key with the dapp (§6.8), shows it on the details page, and compares it across
updates (§5.7). In v1 the key is verified against nothing else; it establishes
continuity, not identity. Authoring guidance SHOULD recommend signing, and
`tools/sign-manifest.js` signs and verifies a manifest file. Ed25519 over RFC
8785 is the scheme of specVersion `1`; a later version may replace it, and the
tool says so.

**Rotation.** A dapp moving to a new key carries `rotation: { from, signature
}`: `from` is the previous `publicKey` and `signature` that previous key's
Ed25519 signature over the UTF-8 bytes of the new `publicKey` string, both
multibase as above. The host reads `rotation` only when the manifest's key
differs from the recorded one (§5.7): a rotation whose `from` is the recorded
key and whose signature verifies is **accepted**, and the change is an
ordinary update whose notice reads as any same-author update (§5.3), its
signing state saying the key rotated; one whose `from` is not the recorded
key, or that does not verify, is ignored and the change is a key change. One
hop: a dapp that rotated twice between a user's visits is a key change for
that user. The field may be dropped once a build with the new key has been
approved; it is signed over like any other field. The tool's `--rotate-from`
adds it.

An unsigned dapp carries the warning "This dapp is not signed by its author."
wherever a surface names its signing state: the consent sheet header (§6.5),
every update notice (§5.3) and the details page (§10.4).

### 4.7 Fetch and cache

On every top-level navigation to a `bzz`, `ipfs`, `ipns` or `web3` origin the
host MUST resolve the root reference (§5.1). If it equals the reference
recorded for that dapp key, the host MUST use the manifest it recorded;
otherwise it MUST fetch the manifest once (same-origin, or the inline form)
and proceed to §5. An added raw-address dapp therefore fetches its manifest
once ever after it is added; for a site that is not added nothing is recorded,
and the host MAY keep a short in-memory cache for the session so that repeated
visits do not refetch. The result drives the address-bar indicator (§10.1),
the reference check and the dapp's record.

### 4.8 `freedom-manifest/1`

A site whose manifest is `freedom-manifest/1` is **not a dapp**. For it,
`window.dapp` offers the public tier only, `swarm_requestAccess` shows the
shipped Swarm manifest sheet, and nothing appears in `freedom://dapps`. A
`/2` manifest routes the same Swarm rows through the unified sheet (§6.14)
and lists the site as a dapp.

## 5. Root reference and updates

### 5.1 The recorded root reference

A manifest cannot contain the hash of the build that contains it, so the
host records, at the moment the user adds the dapp, the **root reference it
loaded the dapp from**:

| Scheme | Recorded reference |
|---|---|
| `ipfs://<name>`, `ipns://<key>`, `ipns://<name>` | the resolved CID of the root |
| `bzz://<name>` | the resolved Swarm reference of the root |
| raw `ipfs://<cid>`, `bzz://<ref>` | the reference that is the origin |
| `web3://` | the Keccak-256 of the `html()` document the onchain handler computed |

The reference comes from the handler that served the document. For a
gateway-backed scheme the root header (`X-Ipfs-Roots`) is the primary
source, and a host MAY take the root from any other response field its own
gateway guarantees to carry it (Freedom's native gateway names the resolved
root in its `ETag`, `"fi1:<root cid>:<path>:<size>"`, and sends no roots
header on `ipns://` loads). Only when no such source exists for a load does
the host record the reference as **unknown**
and use the SHA-256 of the manifest bytes as the thing compared in §5.2,
showing "reference unavailable" wherever the reference is displayed. The
host SHOULD take the reference from the protocol handler rather than
resolving the name a second time, so that no load costs two lookups.


### 5.2 The check

On every later load the host MUST compare the resolved reference with the
recorded one, for every scheme including raw addresses (always equal; a
tripwire against a resolver bug) and `web3://` (a contract owner cannot
rewrite `html()` under the user without the notice below). For `dev:`
dapps the reference check MUST NOT run; instead the host MUST compare the
SHA-256 of the fetched manifest bytes with the one recorded when the dapp
was added, and a difference raises the same update notice under the same
rules (§5.3 to §5.6). The manifest changes most in the realm where it is
being written, and this is how those changes reach the user.

Before the first unlock of a session (§6.11) the host still makes the
comparison, and holds its result: nothing is connected, so nothing can
use the new build. The notice is raised, whatever it withdraws is
withdrawn and its entry is logged (§6.12) at the first unlock, before any
call of that dapp is answered.

### 5.3 The update notice

A different reference means the dapp changed. The host MUST show an **update
notice** in the dApps pane (§10.2) before the new build may use anything. The
notice opens with one plain sentence. For a signed dapp whose key is the same
or rotated with the old key's endorsement (§4.6): "This dapp's contents have
been changed by its author." For an unsigned dapp: "This dapp has changed
since you added it." with the unsigned warning of §4.6, "This dapp is not
signed by its author." The notice then shows, in this order: the old and new
manifest `version`; the capability diff when the new manifest asks for more,
as rows the user ticks (added capabilities, and held capabilities whose scope
widened, are never granted silently); the signing state (§5.7); the old and
new root reference, secondary. It is the same sheet as a consent request: one
**OK** approves the update and whatever new rows the user ticked, and only
then is the stored reference updated.

### 5.4 While an update is pending

The page loads and runs, but every `window.dapp` call beyond the public tier
MUST reject with `4100` and `data.reason: "update_pending"` until the user
approves. A decline keeps the old reference and the dapp stays blocked
until approved or removed. Nothing the new build does touches the user's
data or nodes before the OK. The host emits `updatePending` on the page
when the notice is raised and `updateApplied` when the user approves (§7.5);
`dapp_getManifest` reports the pending state (§7.4).

### 5.5 Change rules

Inside an approved update: a capability **added** is shown and granted only
if ticked; a capability **removed** has its grant and any always-allow
revoked when the user accepts; a held capability whose scope **widened**
is a row to tick, unticked by default, and left unticked keeps the held
scope; a scope
that **narrowed** is applied on accept, since the manifest bounds the grant
(§6.4); a change to `why`, `name`, `description`,
`icon`, `homepage`, `source`, `author` or `minSpecVersion` is shown in the
diff and needs no re-consent; a change to `publicKey` or `signature` is
§5.7; **always-allow survives** unless that capability's scope changed.

### 5.6 Missing or invalid manifest

A new build whose manifest is missing or invalid counts as a change. The
notice is shown, naming the state (`missing`, or `invalid` with the
validation error), and every always-allow is withdrawn. Its **OK** has
nothing to apply: it acknowledges the state and dismisses the notice, and
the recorded reference and manifest stay as they were. The grants themselves
are kept in the record, not deleted, but because the manifest is required
(§6.4) no call beyond the public tier works until a build with a valid
manifest is loaded and approved: calls reject `4100 no_manifest`. For rows
the unified sheet wrote into the shipped providers' stores, those
providers' own rules apply (Swarm keeps the connection and prompts, as
shipped). The dapp's tile shows "manifest missing" or "manifest invalid",
and `dapp_getManifest` reports `pending: "missing"` or `"invalid"` (§7.4).

### 5.7 Signing-key change

*Informative.* A name can be sold or expire and be re-registered, and the
new owner then publishes under the same dapp key. That is true under any
keying. The defence is here.

When the new build's manifest is signed by a **different key** without an
accepted `rotation` (§4.6), or goes from **signed to unsigned** or **unsigned
to signed**, the update notice MUST become a warning sheet that names the
change, **withdraws every grant and always-allow**, and offers exactly two
actions: **re-add** the dapp from scratch (the full consent sheet, §6.5) or
**remove** it (§8.4). The previous build's safe and files stay in place
meanwhile, unreachable by the new build. On **re-add** the dapp starts from
nothing: an empty safe and no files of its own. What the previous build stored
is **never handed to the new signer**: its safe and its private files are held
for the user alone, listed as "previous build" on the details page and in
`freedom://files` with **Export** and **Delete** only; its shared files stay
in the shared folder, re-attributed to author `user` (a name that collides
with a user file gains a numeric suffix), which their readers see as a
`deleted` and a `created` (`providers/files.md` §5). Held data is outside the
dapp's namespace: the re-added dapp cannot name it, it counts against no
allowance (held files count against the pool cap only), and removing the dapp
deletes it after the export offer (§8.4). `providers/safe.md` §8.7 and
`providers/files.md` §8.11 give each store's part. An unsigned manifest that
stays unsigned across an update is an ordinary notice, and so is a key change
with an accepted `rotation`: its notice opens with the same-author sentence of
§5.3, the recorded key becomes the new one on OK, and every grant survives.
Neither the update notice nor this warning can be suppressed by any
always-allow, toggle or setting (§11, N10). While the warning is unanswered
`dapp_getManifest` reports `pending: "key-change"` (§7.4).

While the warning is unanswered the grants are already gone: a
capability-gated call rejects `4100 unauthorized`, as §6.11's order has it,
and `dapp_requestCapabilities` rejects `4100 update_pending` without opening
a sheet, since the warning is the only way forward.

The previous build's data is set aside at **re-add**. A re-add that cannot set
it aside (a full disk, a failed write) MUST NOT complete: the warning stays,
and the host says why, so that no build ever runs with the previous one's data
in its namespace.

## 6. Capabilities and grants

### 6.1 Identifiers

A capability id is `<provider>:<name>`, with `provider` a registered
provider id (§12.1) and `name` lowercase ASCII letters, digits and hyphens.
The same ids are used in the manifest (`capabilities.<provider>.<name>`),
in `dapp_requestCapabilities`, in `dapp_getCapabilities` and on the
consent sheet. Each provider document lists its capabilities with their
tier, scope shape and consent-sheet string, and `registry.json` (§12.6)
carries the union.

### 6.2 Tiers

| Tier | Meaning |
|---|---|
| `public` | no grant needed. Discovery and quota calls (`dapp_getProviders`, `dapp_getCapabilities`, `dapp_getManifest`, `dapp_getIdentityState`, `safe_getQuota`, `files_getQuota`, `dapp_fetch` on `web3://`). To a site without a grant record (§6.8) a public answer MUST be the same for every user of that host build: it describes the host, never the user's settings, data or node state (`dapp_getProviders` §7.4, the quota methods in `providers/safe.md` §8.2 and `providers/files.md` §8.2) |
| `consent` | granted once on the consent sheet; thereafter silent. Reads and writes to the dapp's own storage, shared reads |
| `per-call` | each use prompts, unless the user has set **always-allow** for that capability on the sheet or the details page. Anything that leaves the device, costs the user, or is irreversible: Swarm publish, feed writes, messaging sends |

Some capabilities are **never** eligible for always-allow, whatever the
manifest or the user's toggles say: Radicle unseed of a repo the user
seeded by hand, and anything a provider document so marks. The wallet's
signing and transaction prompts are outside this specification altogether
(§6.14) and can never be pre-answered by it.

### 6.3 Scopes

A capability MAY carry a **scope**, an object defined by its provider
document that narrows the grant. The scope asked for in the manifest or the
request becomes the scope of the grant. Results of calls under a scoped
grant MUST be narrowed to the scope; nothing outside the scope exists from
the dapp's point of view (§11, N4). No capability in this revision carries
a scope: `files:read` is a broad grant over every shared file, and what a
dapp sees of them is bounded at call time by the type-named queries of
`providers/files.md` §4, not by the grant. The mechanism stays
for providers that need one.

### 6.4 Requesting

`dapp_requestCapabilities({ capabilities })` is the one call that opens the
consent sheet. `capabilities` is an array of `{ id, scope? }`.

- Every id MUST appear in the dapp's manifest, and a requested scope MUST
  be **compatible** with the manifest's: equal to it, or narrower, admitting
  nothing the manifest's scope does not; a field the request omits means
  the manifest's value, not everything. The provider document that defines
  a scope defines compatibility for it (none does in this revision, §6.3).
  Otherwise the call rejects `4100` with
  `data.reason: "not_in_manifest"` and no sheet is shown: the manifest
  bounds what a dapp may ever ask.
- Without a valid `/2` manifest, every call beyond the public tier rejects
  `4100` with `data.reason: "no_manifest"`.
- While no identity vault exists (§6.11), `dapp_requestCapabilities` opens the
  pane on the **create identity** step instead of the sheet (§10.2) and waits
  as a sheet does (300 s, §7.11); when onboarding completes the sheet proper
  follows, with its own 300 s. If the step is dismissed or the wait ends, the
  call rejects `4100` with `data.reason: "no_identity"` and the dismissal is
  cached for the document like a decline (§6.6) until an identity exists. No
  other call reports it to a site without a record: with no vault there is
  no record and no
  grant, so every other capability-gated call rejects `unauthorized` as
  always, and a site without a record learns nothing about the user (§6.2,
  N3).
- A capability-gated call made before any grant MUST reject `4100` with
  `data.reason: "unauthorized"`; it never prompts. The dapp controls the
  moment by calling `dapp_requestCapabilities` (or the user by pressing
  **Add** in the pane).
- **Silent reconnect.** If the request is exactly what the dapp already
  holds (same ids, same scopes), the call resolves at once with the grant
  and no sheet is shown.
- **Before the first unlock of a session** (§6.11) an added dapp's request
  shows the unlock prompt first, a silent reconnect included: nothing
  connects while the vault is sealed. A site without a record gets the
  sheet as always, drawn over the pane's unlock screen (§10.7), and its
  **Add** needs the unlock: such a site learns nothing of the vault's
  state (§6.2), and the user sees who is asking before unlocking.
- **Any difference re-shows the whole sheet.** If the request differs from
  what is held in any way, wider or narrower, the full sheet is shown with
  every requested row, held rows pre-ticked. A dapp that wants to avoid the
  sheet calls `dapp_getCapabilities` first and requests only when something
  is missing.
- The call resolves with the resulting grant in the shape of
  `dapp_getCapabilities`, after the user answers.

### 6.5 The consent sheet

The sheet renders in the dApps pane (§10.2). It MUST show:

1. **Header.** The dapp key as the identity (a raw reference truncated with a
   copy affordance); a realm tag when `dev:`; the manifest icon and `name` as
   a label clearly subordinate to the key; `version`; the manifest
   `description` beneath them, as author text (§11 N12); a "signed" marker
   when the manifest carries a key, else the warning "This dapp is not signed
   by its author." (§4.6); a "needs Freedom spec `<n>` or newer" marker when
   `minSpecVersion` is above the host's (§4.2); an "experimental" tag on rows
   of an experimental provider (§12.3).
2. **Rows.** One row per requested capability, in plain words from the
   provider document's consent string, with the manifest `why` beneath;
   each row has a tick: on the first sheet for a dapp every row is ticked
   (the user is adding the dapp as asked and unticks what they refuse); on
   any later sheet, held rows are pre-ticked and new rows are unticked, so
   nothing new is ever granted by a bare **OK**, and unticking a held row
   revokes it on **OK** exactly as a revoke on the details page would
   (§6.10); `per-call` rows carry an
   **always-allow** toggle, off by default; a row whose provider the host
   does not have is shown ungrantable; the `files:own` and `files:read`
   rows MUST carry the verbatim lines of `providers/files.md` §9.1: that
   the dapp's files are shared unless it marks them private, and that a
   reading dapp sees every shared file and which dapp added it.
3. **Footer.** **Add** and **Don't add**. These verbs differ on purpose
   from the **Reject** of the host's action approvals: the sheet adds a
   dapp to the browser, it does not approve an action. The update notice
   and the warning sheet keep their own verbs (§5.3, §5.7).

Quota is not shown; it is fixed or user-set, never requested by a manifest.
(A write that needs more room raises the storage prompt of
`providers/files.md` §8.8, where the user sets a figure; it is not a grant.)

### 6.6 Declining

A declined sheet rejects the pending call with `4001` and writes nothing to
any store. A decline is **cached for the document**: further
`dapp_requestCapabilities` calls reject at once, with no sheet, until
reload. `data.reason` is `user_rejected` on the decline itself and on the
first two cached rejections; `cooldown` on the third and every later cached
rejection in the same document, telling the dapp to stop asking;
`sheet_busy` (§6.7); or `navigated`, when the page left before answering.
The address-bar indicator (§10.1) still lets the user reopen the sheet.

### 6.7 One sheet per window

At most one consent sheet is open per browser window; the update notice
is the same sheet (§5.3). A second `dapp_requestCapabilities` from any tab
in that window rejects `4001 sheet_busy`. A sheet is bound to its tab:
switching tabs hides it, closing or navigating the tab dismisses it with
`4001 navigated`. Closing the sidebar leaves a sheet pending and recallable
from the indicator. Per-call prompts follow their provider's shipped
rules. An unlock prompt (§6.11) raised by a call while a sheet is open
waits behind the sheet; one raised by the sheet's own **Add** is part of
the sheet.

### 6.8 The grant record

For each added dapp the host keeps, keyed by dapp key: the manifest record
(`version`, the recorded root reference, a hash of the manifest bytes, the
re-encoded icon, the signing key or none, the optional fields), the dapp's
**enabled** flag, and **one sub-object per provider** holding that
provider's grants: for each capability its scope, whether always-allow is
on, and its enabled flag. A grant is the user's own record, not a secret;
plain JSON is acceptable. The host MUST derive the dapp key for every
lookup in the main process and MUST re-check the grant on every call; the
renderer's sheet is UX, not the boundary.

*Informative.* Freedom keeps the shipped Swarm, Radicle and wallet grants in
their existing per-provider files and adds `dapps.json` and
`files-grants.json` beside them (Appendix A). A later revision is to fold
these into one store; the shapes above are chosen so that fold is a key
move, not a rewrite.

### 6.9 Pausing

The user can switch a grant **off without deleting it**, per capability and
for the dapp as a whole, on the details page (**Enabled**, §10.4) or, for
the whole dapp, with **Pause** / **Resume** in the pane's banner (§10.2).
While off, calls reject
`4100` with `data.reason: "disabled"`; `dapp_requestCapabilities` does not
re-prompt for a disabled capability (it is held, just off). Switching on
restores it silently. Pausing the dapp as a whole also disconnects its
wallet connection (§6.14); the wallet prompts again on the next
`eth_requestAccounts` after resume.

### 6.10 Revocation and relinquishment

The user revokes any capability, or removes the dapp (§8.4), from the
details page. A dapp MAY drop its own grants with
`dapp_relinquish({ capabilities? })` (all, if omitted). Revocation ends live
subscriptions on the affected provider, emits `capabilitiesChanged`, and
**deletes no data**: safe values and files stay until the user deletes them
(on the details page, in `freedom://files`) or removes the dapp (§8.4).

### 6.11 The identity vault

**Required.** A dapp can be added only once the host's identity vault
exists (§2): the dapp data keys of §8.1 derive from it. A user without one
who opens a dapp is offered the host's identity onboarding from the pane
(§10.2) and by `dapp_requestCapabilities` (§6.4), the only call that
reports `no_identity` to a site without a record (an added dapp whose
vault was deleted gets it from every gated call, below). Every public-tier
method (§6.2) works without a vault.

**Three states.** From launch until the user's first unlock of the session
the vault is **sealed**: no dapp data key is in memory, so neither safes
nor files are readable. The first unlock derives both keys (§8.1). The
idle lock afterwards leaves the vault **locked**: the safe key is dropped,
the files key stays until the browser exits. Otherwise it is
**unlocked**. A sealed vault is reported as locked with `sealed: true`
(§7.4).

**Sealed: unlock first.** Until the first unlock of a session nothing
dapp-related happens, for a dapp or for the user.

- **No added dapp is connected.** Every call an added dapp makes beyond
  the public tier (§6.2) waits on the unlock prompt, on `window.dapp` and
  on a shipped provider's own surface alike: `dapp_requestCapabilities`,
  a provider's own access request, and every method that needs a
  capability or a connection, whatever its tier and whatever always-allow
  says. The public tier still answers, as do the methods of a shipped
  provider that need no connection and the `unsubscribe` methods. A
  site without a record is untouched: its request opens the consent
  sheet, whose **Add** needs the unlock (§6.4).
- **No dApps surface opens.** The pane, `freedom://dapps`, the details
  pages, `freedom://files` and the log page show the unlock screen and
  nothing else (§10.7): no list, figure or control is reachable before
  it, the narrowing ones included. There is nothing to narrow against,
  since nothing runs.

The wallet is outside this model (§6.14) and is untouched. One unlock
opens everything for the rest of the session: a later idle lock
disconnects no dapp, closes no surface and gates only what the list below
names. Nothing is logged before the first unlock: what the host notices
before it (a changed build, §5.2) is held and takes effect at the unlock
(§6.12).

**What the lock gates.** While the vault is locked the host MUST refuse:

- every capability a provider's §2 marks as needing the vault (signing);
- every Safe call except `safe_getQuota` and `safe_unsubscribe`: the safe
  key is not in memory (`providers/safe.md` §2);
- every surface action that **grants or widens**: the **Add** or **OK** that
  commits at least one new or widened row on the consent sheet (never the tick
  itself, and never an **Add** that changes no grant), approving an update
  notice (§5.3) or a signing-key warning (§5.7), always-allow on, **Resume**,
  the Freedom Agent switches on, raising a storage figure (the storage
  prompt's accept included, `providers/files.md` §8.8), the developer setting
  on (§3.6), marking a dapp's private file shared in `freedom://files`, and
  **Export** of a safe (§10.7).

Once unsealed, the lock never gates **files**, whatever their mark (a private
file is kept from other dapps, not locked with the identity, and Freedom
Agent's reads of shared files continue), nor any action that **narrows**:
untick, revoke, always-allow off, **Pause**, **Delete**, **Remove dapp**,
marking a file private, Agent switches off, the developer setting off, **Wipe
dev data**. Reads of grants, manifests, usage figures and the logs (§6.12),
and **Clear** on a log, are not gated by the lock. Any control not named
here is not gated by it.

**Mechanism.** The unlock prompt is shown only for a call that would otherwise
proceed: the other `4100` conditions are checked first, in the order
`no_manifest`, `unauthorized`, `not_in_manifest`, `no_identity`,
`update_pending`, `disabled`, and an `agent_custody` decline already given for
the document (§9.2). A custody prompt still to be shown comes after the
unlock, as any prompt does. A gated call from the fronted tab shows the host's
**unlock prompt** (§10.2), over the pane's unlock screen when the vault is
sealed (§10.7), in place of whatever prompt the call would have had; on unlock
the original prompt (or always-allow) runs and the call proceeds; on dismiss
the call rejects `4100` with `data.reason: "locked"` and the dismissal is
cached for the document: further gated calls reject `locked` at once until the
vault unlocks or the document reloads. From a background tab the call waits
for an unlock from any source (the pane's **Unlock**, another tab's prompt)
for 300 s (§7.11), showing the prompt if its tab is fronted meanwhile, then
rejects `locked`. A gated surface action shows the prompt when pressed; an
unlock prompt raised by a call while a sheet is open waits behind the sheet
(§6.7). A subscription survives a lock: nothing is delivered from a store
while it is gated and nothing is replayed on unlock; a dapp refreshes on
`identityChanged`. A call made under a consent-tier grant or under
always-allow never resets the vault's idle timer, so a dapp cannot hold the
vault open by polling or by writing; a per-call write the user approved on its
prompt does, as any user act. This binds the shipped providers' signing paths
too (`providers/swarm.md` §10). Added dapps receive `identityChanged` (§7.5)
on every change of `exists`, `locked` or `sealed` and may read the state with
`dapp_getIdentityState` (§7.4).

**Deleting the vault.** Because the data keys derive from the vault's secret,
a host that lets the user delete the vault MUST say in that confirm that dapp
data stays on disk and becomes readable again only by importing the same
recovery phrase (§8.1). Records, grants and the log store survive the
deletion, and nothing is logged while no vault exists; added dapps receive
`identityChanged` with `exists: false` and their capability-gated calls reject
`4100 no_identity` until an identity exists again; the pane offers **Create
identity**. After a different phrase is imported, what the old keys encrypted
cannot be read, names included: each store is shown as one aggregate entry,
"from a previous identity", with its size and **Delete** only (a safe on its
dapp's details page, the pool in `freedom://files`). It counts against no
allowance or cap, calls behave as on empty stores, and the log store kept
under the old key is dropped. The host wipes nothing else on its own.

### 6.12 The dapp activity log and the session log

The user MUST be able to see everything a dapp did and everything that
changed about their dapps. The host keeps one **log store** and shows it
two ways: each dapp's **dapp activity log** on its details page (§10.4),
and the **session log** in the dApps pane and on its own page (§10.2,
§10.9), which holds every dapp's activity together with the changes the
user and the host made. No method, event or error exposes either to a
page.

**Sessions.** A session runs from the first unlock after launch (§6.11)
until the browser exits. Nothing dapp-related happens before that unlock,
so every entry belongs to a session and none is ever made that the host
could not write. The store is encrypted under the files key (§8.1) and is
readable through every later lock. Every entry has a `time` and a `type`:
`dapp`, `change`, `agent` or `session`.

**Dapp activity entries** (`type: "dapp"`). The host MUST record, for
every added dapp:

- every write, and every action that leaves the device or commits the
  user's node. Each provider document lists them in its **Activity log**
  table (its §9): Safe set and delete; Files write, writeJson, delete,
  rename, copy, setVisibility and setPublication; Swarm publish, feed
  write, SOC write and send; Radicle seed, unseed, sync and COB write;
- every wallet transaction the dapp sends (§6.14): `target` is the chain
  and the recipient, `detail` the value and the transaction hash. The
  entry is made when the transaction is sent, with outcome `ok`: a
  rejected approval and the transaction's later fate belong to the
  wallet's own history. The wallet signs only with the vault unlocked,
  so these too fall inside a session;
- every read that reaches **another author's** shared file, and every
  type-named listing or subscription over the shared folder
  (`providers/files.md` §9.6). A dapp's reads of its own safe and its own
  files are not recorded;
- every such call the user **refused** on its prompt, that **failed**
  once it came to act, or that hit a **limit** (a quota, a per-item cap,
  a rate limit). By code: `refused` is a `4001` on the call's own prompt
  and a `4100 agent_custody`; `failed` is `4900` and `-32603`, a timeout
  included, and any other reason a provider's table names; `limited` is
  `4300` and `-32005`. Every other rejection makes no entry, even after
  a prompt was answered: a `-32602`, a `4409`, a missing or paused grant,
  a pending notice, the lock. The call never came to act.

An entry has these fields, and each provider's table says how its methods
fill them:

| field | meaning |
|---|---|
| `dapp` | the dapp key, with the name and version at that time |
| `visit` | the visit the entry belongs to (below) |
| `provider`, `action` | the provider id and the method name (`files`, `files_write`); `wallet` and `transaction` for a wallet transaction |
| `target` | what was acted on, as the provider's table defines; absent where the table says so |
| `size` | the bytes written, sent or read, where the table defines one |
| `via` | what answered for the call: `grant` (a grant alone, with no prompt), `always-allow`, `prompt` (the call was put to the user on its own prompt), `custody` (it was put to the user on a tab Freedom Agent holds, §9.2), or `wallet` (the wallet's own approval, §6.14). Absent on a `limited` entry |
| `outcome` | `ok`; `failed`, with the error code and reason; `refused` (the user said no on the prompt); or `limited`, with the reason |
| `detail` | facts the provider's table adds (a file's resulting mark, a copy's source) |
| `count`, `until` | on a folded entry: how many calls it stands for, and the time of the last |

**Visits.** A visit is one top-level document of an added dapp for as
long as it is connected (§10.1): from its load, or from the first unlock
or a resume if that comes later, until it unloads, the dapp is paused or
removed, or the session ends. A visit cut short by a crash ends at its
last entry. Every dapp activity entry belongs to one visit, and a visit
with no entry is still recorded with its start and end, so the log shows
every time a dapp was used. A wallet transaction from a dapp that never
connected opens a visit of its own.

**Folding.** The log is bounded by folding, never by dropping:

- within a visit, `ok` and `refused` calls with the same `action`,
  `target` and `via` fold into one entry, with `count`, `until` and the
  summed `size`. The entry carries the `detail` of its last call, unless
  the provider's table names a detail that must also match for calls to
  fold;
- `failed` and `limited` calls fold by `action`, `outcome`, code and
  reason alone and carry no target, so a dapp cannot spend the log's
  room on calls that did nothing;
- reads of the shared folder always fold: one entry per visit, action
  and type of the files read, with the count, the summed size and the
  number of authors, and no file name. Listings and subscriptions fold
  per visit and action, with the count and the patterns asked for (the
  first twenty distinct ones);
- a visit keeps at most 200 targeted entries per provider. Beyond that,
  further `ok` and `refused` calls fold by `action` and `via` alone,
  without a target;
- a dapp keeps at most 100 visits and 2 000 targeted entries per
  provider in one calendar day of the device's time zone, counted across
  sessions. Beyond that the day's further visits fold into
  one row, and their calls by `action`, `via` and `outcome` alone.

Every call is counted and none is dropped, so a dapp can neither push an
earlier action out of the log nor grow it without bound.

**Change entries** (`type: "change"`) record what the user or the host
did. Each has an `event`, the `dapp` it concerns (absent for a change
that concerns none), a `detail`, and `by`: `user`, `host`, or `dapp` for
a dapp's own `dapp_relinquish`. The host MUST record at least:

| group | events |
|---|---|
| adding and removing | a dapp added, with the capabilities granted; a dapp removed, with what became of its shared files |
| permissions | a capability granted, revoked or relinquished; always-allow turned on or off; a consent sheet declined by the user (for an added dapp only: a site that was never added leaves no entry anywhere in the log) |
| pausing | a dapp or a capability paused or resumed |
| updates | an update notice raised; approved, with the old and new version and any capability added; declined; a manifest found missing or invalid (§5.6) |
| signing | a signing-key warning raised, with its kind; the dapp re-added or removed after it; a rotation accepted (§5.7) |
| storage | an allowance changed, and whether through the storage prompt; the pool cap changed; safe values, a held store or files deleted or exported by the user (never naming a safe key); files added or re-marked by the user in `freedom://files`, and files published there where a provider offers the verb (§10.5 slot 3), folded by action |
| provider controls | a control the user used in a provider's section of a details page (a Radicle unseed), and a wallet disconnect there |
| development | the developer setting turned on or off; development data wiped |
| the log | a dapp's activity list cleared on its details page; the whole log cleared (the first entry of the store that follows) |

**Agent entries** (`type: "agent"`) record Freedom Agent's part (§9): its
shared read and add switches turned on or off; every shared file it read or
added, with the file's author, name, type and size and the conversation it
served, and each listing it made as one entry with the patterns asked for and
the number of files returned, all grouped by conversation; and every prompt
the user answered for an added dapp on a tab the Agent held (§9.2), grouped by
the stretch it held that tab. A write answered there is one entry seen from
both sides: it is in its dapp's visit with `via: "custody"`, and in the
Agent's group. A group folds as a visit does.

**Session entries** (`type: "session"`) mark the session's start, at the
first unlock, and each later lock and unlock.

**What entries may hold.** Entries name files by name. Safe entries carry
the action and the size and never the key (`providers/safe.md` §9.5), so
nothing a locked safe holds is readable in the log. No entry holds
content: not a value, not file bytes, not a message payload.

**Keeping and clearing.** The host MUST keep every entry for at least 90
days, unless the user deletes it as this paragraph allows. It MAY keep
entries longer and MAY let the user choose a longer period; it MUST NOT
drop a younger entry to save space, and folds instead. **Clear** on a
dapp's details page empties that page's list only: the page lists the
dapp's entries since it was last added or its list last cleared, no entry
folds across that moment, and the entries stay in the session log.
Removing a dapp leaves its entries in the session log too, under the name
and key recorded at the time, and the removal confirm says so (§8.4).
**Clear** on the log page deletes the whole store after a confirm
(§10.9); the new store opens with a "log cleared" entry and the current
session's start. **Wipe dev data** deletes the development realm's
entries (§10.8). No **Clear** is gated by the lock.

### 6.13 Never enumerable

No page can learn which dapps the user has added, through any method, event,
error or timing. The one deliberate exception is the shared folder, visible
to dapps the user granted `files:read` (`providers/files.md`).

### 6.14 Rows for the shipped providers, and the wallet

When a `/2` manifest declares `swarm` or `radicle` capabilities, the unified
sheet shows their rows beside the others and, on **Add**, writes the grants
into those providers' own stores. `swarm_requestAccess` and
`radicle_requestAccess` then resolve without a second prompt; called by an
added dapp whose rows are not held, they open the unified sheet again
rather than the shipped connect prompt (provider documents, §3). Per-call
prompts for Swarm and Radicle rows granted through the unified sheet keep
their shipped prompt screens and render in the sidebar with the dApps tab
active (§10.2).

**The wallet is beside this specification, not in it.** `window.ethereum`
has no provider document, no manifest block and no row on the consent
sheet; `eth_requestAccounts` shows the wallet's own connect prompt, and
signatures and transactions keep the Wallet pane's approvals and the
wallet's own auto-approve rules, exactly as for any site today. Two core
rules tie the wallet's connection to the dapp, because the wallet keys its
connections by the same dapp key: the details page **lists** the wallet
connection for the key (account, chain) with a **Disconnect** that calls
the wallet's shipped disconnect (§10.4), and **pausing or removing** the
dapp disconnects it (§6.9, §8.4). Transactions the dapp sends appear in its
activity log (§6.12). The `ethereum` prefix is reserved (§12.1).

## 7. The injected object

### 7.1 Injection and detection

`window.dapp` is injected into top-level documents on `bzz`, `ipfs`, `ipns`
and `web3` origins, and on `dev:` origins while the developer setting is on,
outside private windows. It carries two synchronous properties:
`isFreedomBrowser === true` on Freedom, and `specVersion === "1"`. Freedom
reports `host: "freedom"` in `dapp_getProviders`. Another host implementing
this specification MUST set `specVersion`, MUST report its own name as
`host`, and MUST NOT set `isFreedomBrowser`.

### 7.2 Request and sugar

`window.dapp.request({ method, params })` is the one wire; it returns a
promise. Each provider's methods table also generates **sugar**:
`window.dapp.<provider>.<verb>(params)` for provider methods and
`window.dapp.<verb>(params)` for core methods. The sugar is a thin wrapper:
same method, same params, with the binary conversions of §7.7 applied. A
dapp MAY use either form. The three shipped globals stay beside
`window.dapp`.

### 7.3 Naming and routing

Wire method names are `<provider>_<verb>`; core methods are `dapp_<verb>`.
The prefix is the routing key: the host dispatches by prefix to the
provider's service. An unknown method rejects `4200`.

### 7.4 Core methods

All core methods are `public` tier.

| Method | Params | Returns |
|---|---|---|
| `dapp_requestCapabilities` | `{ capabilities: [{ id, scope? }] }` | the grant, as `dapp_getCapabilities` (§6.4) |
| `dapp_getCapabilities` | none | `{ enabled, capabilities: [{ id, scope?, tier, alwaysAllow, enabled }] }` for this dapp |
| `dapp_getProviders` | none | `{ specVersion, host, providers: [{ id, experimental, version, methods, limits?, status?, reason? }] }`. `id`, `experimental` (§12.3), `version`, `methods` and `limits` are facts of the host build and always present; `status` (`"available"` or `"unavailable"`) and `reason` are present only for an added dapp, since whether a provider is enabled or its node is up is the user's state (§6.2); a site without a record gets neither |
| `dapp_relinquish` | `{ capabilities?: string[] }` | `{}` after dropping the named (or all) grants (§6.10) |
| `dapp_getManifest` | none | `{ version, reference, signed, pending?, updatePending, pendingVersion? }`: for an added dapp, the record the host holds, even while the new build's manifest is missing or invalid (§5.6); `pending` is `"update"` (§5.3), `"missing"` or `"invalid"` (§5.6) or `"key-change"` (§5.7) while that notice is unanswered and absent otherwise, so a blocked dapp can say why; `updatePending` is `pending === "update"`, kept from the first shape. For a site that is not added, the fetched manifest's `version`, the `reference` resolved for this load (`""` when unknown, §5.1), `signed`, no `pending` and `updatePending: false`; `4100 no_manifest` for a site without a record and without a valid manifest |
| `dapp_cancelJob` | `{ jobId }` | `{}`; cancels a job this dapp started (§7.10) |
| `dapp_getIdentityState` | none | `{ exists, locked, sealed }` (§6.11) for an added dapp; `sealed` implies `locked`. For a site that is not added, `{ exists: true, locked: false, sealed: false }`: whether the user has an identity, and whether it is open, is the user's state (§6.2) |
| `dapp_fetch` | `{ url }` | `{ status, headers, bytes }`; `web3://` origins only (§7.14) |

There is no connect, disconnect or session method (§7.6).

### 7.5 Events

`window.dapp.on(event, handler)`, `addListener` and `removeListener`, as
EIP-1193 and `window.swarm`. Core events:

| Event | Payload | When |
|---|---|---|
| `capabilitiesChanged` | the new `dapp_getCapabilities` result | grant, revoke, pause, resume, relinquish |
| `updatePending` | `{ fromVersion, toVersion }` | an update notice was raised (§5.4) |
| `updateApplied` | `{ version }` | the user approved an update |
| `providersChanged` | the new `dapp_getProviders` result | a provider became available or unavailable; sent to added dapps only (§7.4) |
| `identityChanged` | `{ exists, locked, sealed }` | the identity vault was created, deleted, unsealed, locked or unlocked (§6.11); sent to added dapps only |
| `job:progress`, `job:done`, `job:failed` | `{ jobId, provider, … }` | §7.10 (no v1 provider emits them) |

Provider events are namespaced `<provider>:<event>` (for example
`files:changed`) and defined in the provider documents. There are no `connect`
or `disconnect` events. No provider event is delivered on `window.dapp` while
a notice of §5 is unanswered, while its build has no valid manifest (§5.6), or
while the dapp or the event's capability is paused (§6.9), and nothing is
replayed afterwards. Events on a shipped provider's own surface
(`window.swarm`, `window.radicle`) follow that provider's document and are not
touched by this rule.

### 7.6 Stateless per dapp

The grant is the state. There is no session id and no connect handshake.
Subscriptions have ids and die with the document. A reload starts clean,
except for the document-cached decline (§6.6).

### 7.7 Binary convention

Every provider inherits this unless its document says otherwise. **Writes**
accept `string` (UTF-8), `Uint8Array`, `ArrayBuffer` or `Blob`. **Reads**
return `Uint8Array` on the wire by structured clone (never base64); the
sugar returns a `Blob` carrying the stored MIME type, and offers a text
helper that decodes UTF-8. *Informative:* `window.swarm` keeps its shipped
`{ data, encoding: "base64" }` form.

*Note for hosts.* This is a page-facing promise. Inside the host a `Blob`
may not cross the process boundary (Electron's IPC clones `Uint8Array` and
`ArrayBuffer` only), so the page-side shim converts a `Blob` to bytes
before sending and builds one on return; none of that is visible to the
page.

### 7.8 File references

Any provider method MAY accept a **file reference** in place of bytes:
`{ author?: string, name: string }`, naming a file in the Files provider
(`author` omitted means the caller's own). The host reads the bytes in the
main process; they never enter the page. The caller needs the grant that
reads that file (`providers/files.md` §3). In v1
no shipped provider accepts one (`window.swarm` is untouched); the type is
defined here so a future provider need not invent it.

### 7.9 Pagination

List methods take `limit` (default and maximum set per method) and `cursor`,
and return `{ items, nextCursor? }`. A cursor is opaque and valid for the
document's lifetime.

### 7.10 Jobs

A `window.dapp` method that starts long-running work resolves promptly with `{
jobId }` and reports through `job:progress` (`{ jobId, provider, done, total?,
phase? }`), `job:done` (`{ jobId, provider, result }`) and `job:failed` (`{
jobId, provider, error }`). `dapp_cancelJob({ jobId })` cancels a job the
calling dapp started; a cancelled job ends with `job:failed` whose `error` is
`-32603` with `data.reason: "cancelled"`. A provider document states which of
its jobs can be cancelled after they have started and what a cancel leaves
behind. Jobs have no call timeout once started. *Informative:* no v1 provider
starts a job; the shipped providers keep their own progress mechanisms
(`swarm_getUploadStatus` polling, Radicle's replication events). The job
convention exists so a future `window.dapp` provider need not invent one.

### 7.11 Timeouts

| Call | Timeout |
|---|---|
| reads and metadata | 60 s |
| large writes and copies; any call that opens a sheet or prompt | 300 s, prompt time included |
| jobs | none after start (§7.10) |

A timeout rejects `-32603` with `data.reason: "timeout"`, except the two waits
of §6.4 and §6.11 (create identity, unlock), which use the 300 s figure and
reject `4100` with their own reason when it ends. A call that waits on any
other prompt (the storage prompt, an Agent-custody prompt, §9.2) uses the 300
s figure whatever its own. A provider document MAY tighten per method.

### 7.12 Rate limits

The host MUST budget calls per dapp key per minute for every provider,
with the numbers each provider document states, and MAY also budget bytes
read per dapp key per minute where a provider document sets a figure. Over
budget rejects `-32005` with `data.retryAfterMs`.

### 7.13 Errors

Errors are `{ code, message, data? }`. Numeric codes are **core-only**;
provider documents add only `data.reason` strings. The one exception is a
provider documented *as shipped* (§12.1): it keeps the numeric codes and
event names it already emits, and its document lists them as legacy
exceptions. A `data.reason` is scoped to the provider that raised it: the
same string may mean different things under different providers (`conflict`
is a failed conditional write under Safe and Files; a provider documented
as shipped may use a word of its own differently), and a dapp reads it
against the method it called.

| Code | Meaning | Core `data.reason` values |
|---|---|---|
| `4001` | the user rejected | `user_rejected`, `cooldown`, `sheet_busy`, `navigated` |
| `4100` | not authorized | `unauthorized`, `disabled`, `locked`, `no_identity`, `update_pending`, `no_manifest`, `not_in_manifest`, `agent_custody`; when several hold, §6.11 gives the order |
| `4200` | unknown method | |
| `4300` | quota exceeded | set per provider (Safe: `safe_quota`, `value_too_large`, `too_many_keys`; Files: `dapp_quota`, `pool_quota`, `file_too_large`) |
| `4409` | conflict | `conflict` (a conditional write failed), `exists` (create-only on an existing name) |
| `4900` | provider unavailable | set per provider (node down, provider disabled) |
| `-32602` | invalid params | core: `payload_too_large` (§7.14); provider reasons (`invalid_key`, `invalid_name`, `type_mismatch`, `not_found`, …); `data.limit` / `data.actual` where useful |
| `-32005` | rate limited | `data.retryAfterMs` |
| `-32603` | internal | `timeout`, `cancelled` (§7.10), `disk_full`, `io_error`, or a node error passed through |

### 7.14 `dapp_fetch` on `web3://`

Because `web3://` documents cannot `fetch()` dweb URLs, the host MUST offer
`dapp_fetch({ url })` on `web3://` origins only, `public` tier. It reads
`bzz://`, `ipfs://`, `ipns://` and `web3://` URLs through the host's own
protocol handlers (verified, same size limits as a page fetch, 60 s) and
returns `{ status, headers, bytes }`; the sugar returns a `Response`. It is
absent on every other origin, where `fetch()` already works.

Redirects are **not followed**: a 3xx is returned to the page as it came,
so a gateway or contract can never steer the host into `http(s):` or a
loopback service carrying the session's cookies. A body over the size
limit rejects `-32602 payload_too_large` with `data.limit`.

## 8. Storage and quota conventions

### 8.1 Encryption at rest

Dapp bytes held on disk by a provider this specification introduces (in
v1, the Safe provider's safes and the Files provider's pool) MUST be
encrypted at rest with authenticated encryption and a per-item nonce under
**data keys derived from the identity vault's secret** (§6.11): one key per
provider store, each derived with a fixed, distinct info string from the
vault's master secret (the recovery phrase's seed, never a wallet account
key), so that the same recovery phrase on another install yields the same
keys and a copied profile folder plus the phrase restores every dapp's
data. No key is written to disk, wrapped or plain, and no operating-system
credential store is involved. The keys never leave the main process (N6).

Both keys are derived at the first unlock of a session; until then the
vault is **sealed** and neither store is readable (§6.11). The **safe
key** MUST be dropped from memory when the vault locks and re-derived on
unlock, so a locked vault leaves every safe, key names included,
unreadable by anyone at the running browser. Once derived, the **files
key** MUST stay in memory until the browser exits, so files of either mark
stay readable through every later lock (§6.11): the private mark on a file
is access control between dapps, not a lock. Plain per-dapp counters
(bytes and item counts, split by mark for Files, keyed by dapp key,
figures only, never names) are
kept outside the encrypted data so the quota methods and the surfaces can
show usage while a store is unreadable. The shipped providers' own stores
are unchanged (§1.4). On-disk names MUST be hashed, so the data is opaque
outside the host and the OS filesystem's case rules never apply. A copied
profile folder or a stolen disk yields ciphertext without the recovery
phrase; a running browser is guarded by the lock for safes and by the OS
session lock for the rest (§11). The log store (§6.12) is encrypted
under the files key; its Safe entries carry no key names.

### 8.2 Quota interface

A provider that stores data exposes a `<provider>_getQuota` method returning
`{ used, limit, free }` per scope it defines, plus any per-item caps; over
quota rejects `4300` with a provider reason. Quotas are fixed by the host or
set by the user; a manifest never requests one.

### 8.3 Accounting

Each provider reports, for the details page and the dApps pane, the bytes
each dapp holds under it, broken down as its document defines. The pane's
summary header sums them.

### 8.4 Removing a dapp

**Remove dapp** on the details page MUST show a confirm that names the dapp
and the bytes it holds under each provider, offers an **export** first (a
decrypted copy of its safe and its files to a user-chosen location; exporting
the safe needs the vault unlocked, §6.11), and asks whether to also remove the
**shared** files the dapp authored, showing their count and bytes, with
**keep** as the default. On OK the host unlinks the dapp's safe, its private
files, its grants in every store (for a shipped provider, as that provider's
own disconnect does), its wallet connection (§6.14), its record and any data
held from a previous build (§5.7), which the confirm names and the export
covers, and any safe of the dapp's left unreadable by a change of identity
(§6.11), which the confirm names with its size and says cannot be exported.
The export is in the formats of `providers/safe.md` §8.6 and
`providers/files.md` §9.3. The safe is wiped at once even while the vault is
locked: its blobs are its own, and its index goes with them; no event is
raised for a safe removed unread. The dapp's entries stay in the session log,
under the name and key recorded at the time, until they age out or the user
clears the log, and the confirm says so (§6.12). What a provider keeps after
removal (for example Swarm's publisher identity, or Radicle seeds the dapp
asked for) is stated in that provider's document, §8 "On remove", and a
provider document MAY add one question of its own to this confirm (for example
Radicle's offer to unseed the repos the dapp seeded, default keep). No OS
trash is involved: the blobs would be unreadable there.

## 9. Freedom Agent

### 9.1 Access to shared files

The user can grant and revoke Freedom Agent **read** access to their
shared files (every file marked shared, `providers/files.md` §8.1), a
plain switch like a dapp's `files:read` grant, and separately **add**
access (files it adds carry author `agent` and are always shared). Both
are **off by default**, live in `freedom://files` and in the dApps pane's
Settings as one record, survive restarts until revoked, and are exercised
through three Agent tools (`dapp_files_list`, `dapp_files_read`,
`dapp_files_add`) whose contract `providers/files.md` §9.4 defines. The
Agent never reads a private file and never a safe. An Agent read is
undetectable by dapps and is shown to the user in the Agent's own
conversation, as each of its tool calls is, and in the session log
(§6.12).

### 9.2 Custody

On a tab Freedom Agent holds, **no write is answered silently**: neither a
consent-tier grant nor always-allow runs it. Every write a dapp attempts
(Safe set and delete; Files write, writeJson, delete, rename, copy,
setVisibility and setPublication; Swarm per-call writes granted through
the unified sheet; Radicle seed, unseed and COB writes) MUST be prompted.
**Allow** runs that one write; **Don't allow** rejects it with `4100` and
`data.reason: "agent_custody"`, on every provider for an added dapp (a
`/1` site or a non-dapp origin gets the shipped provider's own answer). A
call waiting on the prompt uses the 300 s timeout (§7.11).

The prompt names the action and its target and shows the content: text
and JSON from the start, up to a host-chosen length of at least 2 000
characters and marked as cut when it is; for any other bytes, the type
and the size. A shipped provider's prompt shows what its document lists
(its §9.1). For the Safe the prompt shows the action and the size and
never the key or the value. Every answer given for an added dapp on such
a tab is recorded in the session log (§6.12).

**Safe reads are prompted too.** Whatever a dapp reads from its safe and
then displays, the Agent can see. The first `safe_get` or `safe_keys` from
a document on a tab the Agent holds MUST show a prompt that names the dapp
and carries, verbatim: *"Freedom Agent is in control of this tab and may
see what this dapp reads from its Safe."* The answer holds for that
document until it unloads or the Agent releases the tab: after **Allow**
its safe reads run; after **Don't allow** they reject `4100 agent_custody`
without asking again. Until the user allows, no `safe:changed` event is
delivered to that document either, since it carries key names. Files reads
are not prompted: what a dapp shows on such a tab is visible to the Agent,
which is one more reason secrets belong in the Safe.

## 10. Surfaces

### 10.1 The address-bar indicator

On every tab whose top-level document is on a dapp scheme (or a `dev:`
origin), the host shows the label **dApp** in the address bar: hidden when the
site is not a dapp, **grey** when it is a dapp that is not connected (not
added, paused, or waiting on a prompt, an update or the first unlock of the
session, §6.11, with a small dot for the waiting states), **purple**
(`#8b5cf6`) when connected. The dot is for added dapps: a site without a
record shows none. Before the first unlock every added dapp shows it, whatever
else is true of it, since the wait for the unlock comes before "paused" and
"update pending". Clicking the indicator opens the sidebar on the dApps pane.
Where the address bar is too narrow for the label (a narrow window, a phone),
the host MAY show the letter **d** alone, with the same colours and behaviour.
The indicator is always shown on such a tab: no setting hides it. Its
accessible name says the state in words, since colour alone does not.

**The connected colour.** Purple `#8b5cf6` means "a dapp, connected" on
every surface of this section, and the surfaces use it for nothing else.
In this revision it marks the indicator, the dot of the pane's connection
banner, a dapp's row in the pane's list while that dapp is connected in
an open tab, and the rows of the session log that hold what dapps did
while connected (§10.2). A surface that comes to mark connection uses the
same colour.

### 10.2 The dApps pane

A tab titled **dApps** in the sidebar beside Wallet, Nodes and Settings.
**Every dapp prompt renders in the sidebar with this tab active**: the consent
sheet (§6.5), the update notice (§5.3), the signing-key warning (§5.7), the
storage prompt (`providers/files.md` §8.8), the **create identity** step
(§6.4) and the Agent-custody prompts (§9.2) render inside the pane; the
**unlock prompt** (§6.11) is the host's existing one, shown as an **overlay
over this pane**: the host switches the sidebar to this tab before showing it,
and before the first unlock of a session it is all the pane shows (§10.7);
per-call prompts for Swarm and Radicle rows granted through the unified sheet
keep their shipped prompt screens, which cover the sidebar whichever tab is
active, and the host MUST switch the sidebar to this tab before showing one.
The sidebar opens when a prompt arrives; the page is not dimmed; the call
waits up to 300 s. Wallet transaction and signature approvals stay in the
Wallet pane.

The sidebar offers the dApps tab before any identity vault exists, but a
dapp cannot be added until one does (§6.11): the connection banner for a
dapp then shows **Create identity** in place of **Add**, with the line
"Dapps keep their data under your identity", and opens the host's identity
onboarding; a `dapp_requestCapabilities` call waits for it (§6.4). Once
onboarding completes the sheet proper follows. Before the first unlock of
a session the pane shows the unlock screen alone; while the vault is
locked afterwards the pane is usable and its widening controls prompt for
unlock (§10.7).

At rest, top to bottom: the connection banner, then five sections under
the headers **SUMMARY**, **DAPPS**, **SESSION LOG**, **SETTINGS** and
**DEVELOPER SETTINGS**. Each header collapses and expands its section,
and the host keeps each one's state per profile; at first use Summary,
Dapps and Session log are open and the other two collapsed. A prompt
rendered in the pane sits in no section and is never hidden by a
collapsed one.

1. **Connection banner** for the fronted tab: a dot in the indicator's
   colour (§10.1) and the state, one of: not a dapp ("This site is not a
   dapp"); dapp, not added (key, name, **Add**); connected (key, name,
   version, one line per provider with its capabilities, buttons
   **Details**, **Pause** / **Resume**, **Files**); paused; update pending
   (opens the notice); prompt waiting; create identity (§6.11), which
   takes precedence over "prompt waiting" while a request waits on it,
   since the request is what opened it. The Wallet
   tab's own status rows (wallet connection, Swarm, auto-pay) are
   unchanged for a dapp; nothing in the wallet UI depends on the dapp
   record.
2. **Summary**: added dapps, disk used (safes in total; files used of the
   pool cap), dapps with updates pending or paused, Freedom Agent shared
   access state (off / read / read + add), and whether the identity vault
   is locked, with **Unlock**; links to `freedom://dapps`,
   `freedom://files` and `freedom://dapps/log`.
3. **Dapps**: every added dapp, one row each with its icon and name,
   ordered by name; a row opens that dapp's details page (§10.4). The
   list scrolls within a bounded height of its own, so the headers beneath
   it stay in reach however many dapps there are. A dapp connected in an
   open tab is marked in the connected colour (§10.1); `dev:` dapps sit
   under the Development heading (§10.8). With no dapp added the section
   says so in one line.
4. **Session log**: everything that has happened this session (§6.12),
   oldest first, with the newest at the bottom and in view. Its first
   line is the link **View previous session logs**, shown when an earlier
   session is kept, which opens `freedom://dapps/log` (§10.9). Its second
   line is **New session** with the date and time of the session's first
   unlock. Then one row per entry or group, each with its time and
   coloured by type:
   - **dapp activity**, in the connected colour (§10.1): one row per
     visit, with the dapp's icon and name, the visit's start and end and
     its number of actions. The row expands to that visit's entries:
     the same rows as on the dapp's details page (§10.4), here oldest
     first as the log is;
   - **changes**, in beige: one row per change entry;
   - **Freedom Agent**, in blue: one row per switch change, one
     expandable row per Agent conversation holding the shared files it
     listed, read and added, and one expandable row per stretch the Agent
     held a dapp's tab, holding each prompt answered there;
   - **session markers**, uncoloured: locked, unlocked.

   Colour is never the only sign of a type: each row also names it, by
   an icon or a word. The beige and blue shades are the host's. The
   section scrolls within a bounded height of its own.
5. **Settings**: the Freedom Agent shared read and add switches (§9.1),
   and **Total dapp storage**, the pool cap, offered as 4 GB, 8 GB, 16 GB
   or 32 GB, default 8 GB (`providers/files.md` §8.1).
6. **Developer settings**: the developer setting (§3.6), with **Wipe dev
   data** while it is on. This section is the setting's only home (not
   the browser's Settings page, §10.6); while the setting is on, its tag
   shows on the header, collapsed or not.

*Informative.* The connection banner, list and usage figures follow the
pattern of Freedom's existing sidebar connection rows.

### 10.3 `freedom://dapps`

The launcher: one **tile** per added dapp with icon, name, key, version, and
at most one badge: "update pending" (§5.3), "paused" (§6.9), "manifest
missing" or "manifest invalid" (§5.6), "signing key changed" while the §5.7
warning is unanswered, or "needs a newer Freedom" (§4.2). Clicking a tile
opens the details page; a tile has no other action. `dev:` dapps appear under
a **Development** heading (§10.8).

### 10.4 `freedom://dapps/<key>`

The details page. The key is carried as one path segment,
`encodeURIComponent(key)`, and decoded by the page: raw references and
`web3://` keys contain `/` and `:`, `dev:` keys contain `:`, and the
internal-page router admits one segment per level.

A **title bar** carries the icon, name, key, the manifest `description`
beneath the name as author text (§11 N12), and **Launch**, which navigates
to the key's canonical URL and never to a page-supplied one. Below it the
page is a fixed sequence of **sections**:

1. **Dapp.** Version, recorded root reference, the signing key or the
   warning "This dapp is not signed by its author." (§4.6), `homepage`,
   `source`, `author`, `minSpecVersion` (marked when above the host's,
   §4.2); **Enabled**, the whole-dapp pause (§6.9); and the **dapp
   activity log** (§6.12): the dapp's entries, newest first and grouped
   by visit, with a filter by provider, and **Clear**, which empties this
   list and nothing else (the entries stay in the session log, §10.9).
   `homepage`, `source` and `author.url` are shown in full as the
   author's URLs (§11 N12) and open in a new tab only when the user
   clicks them, never on their own; a `rad:` source opens the host's own
   repository page where it has one (`providers/radicle.md` §9.2).
2. **One section per provider**, headed by the provider's display name, in
   the order of §12.1, for every provider the dapp's manifest declares or
   under which the dapp holds a grant or data. The provider's document
   defines what its section holds (its §9.2), and every section MUST show
   at least:
   - the provider's **capability rows** for this dapp, each with enabled,
     always-allow where the capability is eligible, and revoke;
   - the dapp's **usage and facts** under that provider (§8.3);
   - the provider's **controls** for this dapp, if it has any.

   In this revision: **Safe** (`providers/safe.md` §9.2), **Files**
   (`providers/files.md` §9.2), **Swarm** (`providers/swarm.md` §9.2) and
   **Radicle** (`providers/radicle.md` §9.2). A provider the manifest names
   but the host does not have gets a section headed by its id as written,
   after the known ones, with its rows ungrantable (§12.4); an experimental
   provider's section carries the tag (§12.3). A provider with nothing
   declared, granted or stored for the dapp has no section. A section also
   lists, apart from the dapp's own data, anything held from a previous build
   (§5.7) or left unreadable by a change of identity (§6.11), with the little
   the user may do with it.
3. **Wallet.** The connection for the key (account, chain) with
   **Disconnect**, read from the wallet's own store and never edited
   beyond that (§6.14). The wallet is not a provider; the section is
   absent when the key has no connection.
4. **Remove dapp**, last and set apart (§8.4).

A provider adds nothing outside its own section (§12.2), and the page has
no section other than these.

### 10.5 `freedom://files`

The files explorer. Like the details page it is a **core surface**: the
host draws the skeleton defined here, the Files provider supplies the pool
it shows, and every other provider appears only through the four **slots**
below, filled from its own document's §9 (§12.2, §12.5). No provider adds
a view, a column, a header or a control anywhere else on the page. Safes
are not files and are not shown here: the user reaches a safe on its
dapp's details page (§10.4).

**The list.** Every file in the pool, of every author and either mark, in one
list with **author** and **visibility** columns, sortable by **author**,
**date added**, **visibility** and **location** (`local` / `published`, the
publication slot), and filterable to one dapp or one mark. The user sees
private files too: the mark keeps a file from other dapps, not from the user.
Actions: **Add files** (an operating-system open dialog; the files are added
with author `user`, shared, under `providers/files.md` §8.3, §8.4 and the pool
cap), **Export** (a decrypted copy of the selected files to a user-chosen
location, with an `index.json` naming each file's author, mark, type and CID),
**Delete**, and changing the mark of a dapp's file (files of `user` and
`agent` are always shared). The **pool cap** and **each dapp's allowance** are
shown with their usage and link to where they are set (the dApps pane's
**Total dapp storage**, §10.2; the dapp's **Files** section, §10.4). `dev:`
files sit under the Development heading (§10.8); private files held from a
previous build (§5.7) are listed apart as "previous build" with **Export** and
**Delete** only, and a pool left unreadable by a change of identity is one
"from a previous identity" entry (§6.11). Beneath the list: the **Freedom
Agent** controls (§9.1, `providers/files.md` §9.4), then any provider panels
(slot 4).

There is no reveal-in-Finder: data on disk is opaque (§8.1). Before the
first unlock of a session the page shows the unlock screen alone (§10.7);
after it the page is fully usable through every later lock, apart from
its widening controls (the Agent switches, §6.11).

**Provider slots.** Four, and only these:

1. **Publication.** The location column reads the file's **publication
   records** (`providers/files.md` §8.6): at most one per provider, keyed
   by provider id. The column shows the provider's display name
   ("Swarm"), several when several providers hold a record, and labels a
   record the dapp reported itself "dapp-reported". The record's
   reference format and when the host writes one are the provider's to
   say (its §9).
2. **Inspector.** Selecting a file shows the Files facts (name, author,
   mark, type, size, CID, dates) and beneath them one group per provider that
   holds a publication record on the file or declares inspector facts:
   the reference, a link that opens in a new tab on click only (the
   §10.4 rule), and provider status such as pinned or replicated.
3. **Actions.** The per-file menu holds **Export**, **Delete** and, for a
   dapp's file, the mark change, then one verb per provider that declares one
   ("Publish to Swarm", "Add to IPFS"). A verb is the user's own action: it
   runs in the main process under the user's authority, never under a dapp's
   grant, with the provider's own prompts (postage, identity, unlock), and
   enters no dapp's activity log; the session log records it as a change
   (§6.12). Where it produces a reference the host
   writes the publication record with `verified: true`. The verb is absent
   while the provider is unavailable (§12.4); records already made stay shown.
4. **Panel.** A section beneath the Agent controls, one per provider
   that declares one, for provider-wide figures or controls about stored
   files (a pin set's total, a sync switch). None in this revision.

Column names, verbs and labels are the host's wording. A provider with
nothing to contribute says "none" in its §9.

### 10.6 The shipped management screens

The details page is authoritative for an added dapp's grants. The host keeps
whatever per-site management screens its shipped providers already have, for
`/1` sites and non-dapp origins (in Freedom v0.8.8: the Swarm permission
screen reached from the Wallet tab's Swarm row by **Manage**; Radicle has
none, and there is no Settings-page list of either). Opened for an added dapp,
such a screen shows the dapp's name and **Open dapp details** in place of its
inline toggles. Where the host offers deleting the vault, that confirm gains
one sentence: dapp data stays on disk and becomes readable again only by
importing the same recovery phrase (§6.11). Freedom v0.8.8 offers no such
screen.

### 10.7 Sealed and locked identity

**Before the first unlock of a session** every surface of this section but the
address-bar indicator shows the **unlock screen** and nothing else: the dApps
pane, `freedom://dapps`, the details pages, `freedom://files` and
`freedom://dapps/log`. The screen says that dapps wait for the identity to be
unlocked and offers **Unlock**, the host's unlock prompt (§6.11). No list,
figure or control is reachable before it, the narrowing ones included. The
indicator is still shown, grey, with the waiting dot for an added dapp
(§10.1), and opens the pane on that screen. A gated call from the fronted tab
opens the pane and raises the unlock prompt over the screen; dismissing the
prompt leaves the screen and rejects the call `locked` (§6.11). A consent
sheet for a site without a record is a prompt and is drawn over the screen as
over any pane (§6.4); it is the only one. A notice of §5 left unanswered, from
this session's loads or an earlier session, waits for the unlock (§5.2). The
shipped providers' own screens (§10.6) are theirs and are not part of this. A
user who cannot unlock restores or resets the identity with the host's own
screens (§6.11): nothing here works around the lock.

**After it, while the vault is locked**, every surface stays open: every
fact and every narrowing control works, and every widening control
(§6.11) shows the unlock prompt when pressed. On a details page the
**Safe** section shows usage with **Unlock** in place of its key list and
**Export**, since the safe key is not in memory (§8.1). `freedom://files`
and the logs are unaffected by a lock, the explorer's widening controls
apart. The removal confirm's export offer prompts for unlock where it
needs it (§8.4), and a dapp whose stores cannot be opened is still
removable.

**While no vault exists**, before the first is created or after one is
deleted (§6.11), the surfaces list nothing and the pane offers **Create
identity** (§10.2).

### 10.8 Development data

`dev:` dapps appear under their own **Development** heading with a visible tag
on every surface, are excluded from summary counts and storage figures, and
are wiped together by **Wipe dev data** after a confirm, which deletes their
entries from the log store too (§6.12). The development pool is separate from
the user's: the same cap and allowance figures apply to it on their own,
Freedom Agent's tools and **Add files** never reach it, and `files_getQuota`
reports it to a `dev:` dapp.

### 10.9 `freedom://dapps/log`

The session log's own page. (`log` is never a dapp key: every name carries its
suffix and every other key its scheme, §3.2.) It lists every session the store
holds, newest first, each under its **New session** line with the date and
time, and draws each as the pane does (§10.2): the same rows, colours and
expansion. It offers filters by dapp, by type and by provider, and **Clear**,
which deletes the whole store after a confirm, leaves a "log cleared" entry
(§6.12) and is not gated by the lock. Where the host lets the user keep
entries longer than the 90 days of §6.12, the setting is here. A removed
dapp's rows stay, under the name and key recorded at the time.

## 11. Security and privacy rules

Each provider document references these; none may weaken them.

- **N1.** The page never names its own origin, dapp key or storage key; the
  host derives the dapp key from the sender frame in the main process.
- **N2.** The main process re-checks every grant on every call; the
  renderer's sheet is UX, not the boundary.
- **N3.** No existence oracles outside the shared folder: a dapp cannot
  learn which other dapps the user has through safes, private files,
  feeds, grants, errors or timing. Shared files are the deliberate
  exception, and only for dapps granted `files:read`.
- **N3a.** Freedom Agent reads shared files only under a grant the user
  gave it, never a private file, and never through a dapp's grant; a dapp
  cannot detect an Agent read; the user sees each one in the Agent's own
  conversation and in the session log. It has no tool that reads a safe,
  and what a dapp reads from its own safe on a tab the Agent holds needs
  the user's go-ahead first (§9.2).
- **N3b.** Agent custody (§9.2).
- **N4.** Where a dapp asks about something it was not granted, absent and
  declined look the same (an empty list, `null`), never a distinguishing
  error.
- **N5.** Nothing a dapp wrote leaves the device without a per-call prompt
  or an always-allow the user set against a fetchable manifest.
- **N6.** Keys (Swarm app-scoped keys, the dapp data keys of §8.1, and any key
  the host holds to verify manifests) never leave the main process; an
  external node or gateway receives signed material, never a key.
- **N7.** Rate limits on public-tier reads and on write methods per dapp
  key (§7.12).
- **N8.** The identity vault's lock gates signing, every read and write of
  a dapp's safe, and every action that grants or widens. Until the first
  unlock of a session no added dapp is connected and no dApps surface
  opens, so no dapp data is read, nothing changes and nothing goes
  unrecorded (§6.12). Once unsealed the lock never gates files, whatever
  their mark, or any action that narrows (§6.11, §8.1).
- **N9.** The host never executes or interprets dapp bytes: files are opaque
  blobs sniffed for type only, safe values are opaque, the manifest is data
  validated against the
  schema, and the icon is re-encoded.
- **N10.** The update notice and the signing-key warning cannot be
  suppressed by any always-allow, toggle or setting.
- **N11.** Nothing a dapp stores is readable by another dapp except its
  shared files under a `files:read` grant, and never through Chromium
  storage of another origin; a safe and a private file are readable only
  by their own dapp key and the user.
- **N12.** Author text is shown as the author's words. Wherever the host
  displays manifest text (`name`, `description`, every `why`,
  `author.name`) it renders it as plain text, never as markup or a link,
  and sets it visibly apart from the host's own wording (quoted, in a
  distinct style or block; the form is the host's). The user can always
  tell which words the dapp chose and which the browser did; a
  `description` reading "Verified by Freedom" is still plainly the
  dapp's claim.

## 12. The provider model

### 12.1 Registry

| Provider id | Surface | Status | Document |
|---|---|---|---|
| `safe` | `window.dapp` | stable | `providers/safe.md` |
| `files` | `window.dapp` | stable | `providers/files.md` |
| `swarm` | `window.swarm` (as shipped) | stable | `providers/swarm.md` |
| `radicle` | `window.radicle` (as shipped) | stable | `providers/radicle.md` |
| `ethereum` | — | reserved | the wallet stays beside this specification (§6.14); no provider document |
| `ipfs` | — | reserved | a future write surface (pin, add, IPNS) |
| `chain` | — | reserved | a future public-tier verified-read surface |

The `dapp` prefix is the core's. No other prefix is defined.

### 12.2 Provider documents

Every provider is described by one document written to
`providers/TEMPLATE.md`, in that template's order: identity; host
dependencies; capabilities table; methods table; events table; manifest block
schema; `data.reason` strings; storage and quota; consent-sheet, details-page
(its own section and that section's minimum, §10.4) and `freedom://files` (the
four slots of §10.5, or none) contributions, and its activity-log table
(§6.12); host implementation requirements; security considerations and
conformance checklist. A provider document inherits every convention of §7
unless it says otherwise, and may never weaken §11.

### 12.3 Adding a provider

To add a provider: copy the template, assign an id, write the document and
its `schemas/providers/<id>.schema.json`, add one row to §12.1, and add its
capabilities to `registry.json`. The core `specVersion` does not change for a
new provider; each provider carries its own `version`, reported by
`dapp_getProviders`. A provider ships as `experimental` before `stable`: its
rows carry an "experimental" tag on the consent sheet and in its section
of the details page, and the host MAY gate
it behind a setting like the developer setting.

### 12.4 Host behaviour on unknown and absent providers

A manifest naming a provider the host does not have stays valid; its rows
are shown ungrantable (§4.3). A call to a provider the host has but which is
unavailable (its node down, its setting off) rejects `4900` with the
provider's reason where its document defines one (a shipped provider keeps
its shipped payload, which may carry no `data`); for an added dapp
`dapp_getProviders` reports `status` and `reason` accordingly and
`providersChanged` fires on change; a site without a record sees neither
(§7.4, §6.2).

### 12.5 Integrating with another provider

A provider that touches another provider's objects, operations or surfaces
does so through one of these patterns, names the pattern in its §2 and
nothing else is permitted.

- **Shared core types.** A value that crosses providers is defined once in
  the core and produced or accepted by providers: the file reference of
  §7.8, the job of §7.10, the scope shapes of §6.3. A provider never
  defines a type for another provider to accept.
- **Annotation records.** A provider attaches facts to another provider's
  objects through a record the **owning** provider defines, keyed by the
  annotating provider's id, persisted by the owner and announced by the
  owner's event. The Files publication record (`providers/files.md` §8.6)
  is the model: Swarm fills `publications.swarm`; Files owns the shape,
  the event and the method and names no provider. The annotating provider
  never writes the owner's store directly and reads it only through an
  index the owner keeps for the purpose (for Files, the sidecar index of
  `providers/files.md` §8.7), never the store's files.
- **Slot contributions.** A provider appears on a core surface only in the
  slots the core names: the consent sheet's rows (§6.5), its own section
  of the details page (§10.4), the explorer's four slots (§10.5). It
  fills them from its own §9 and adds no other section, view or column.
- **Composite actions.** An action that spans two providers (publishing a
  stored file to Swarm, adding one to IPFS) is a method of the provider
  named by its prefix. That provider checks the other grant it needs in
  the core grant store (§6.8) before acting and rejects `4100
  unauthorized` without it. No grant implies another and no provider
  grants on another's behalf. Started by the user from a surface (an
  explorer verb, §10.5) the same action runs under the user's authority
  with the provider's own prompts and needs no dapp grant.
- **Declared dependencies.** Each provider's §2 lists the providers it
  integrates with, by id, with the pattern used and the behaviour when the
  partner is absent or unavailable (§12.4): records already made stay
  shown, new ones are not made, verbs are absent. A dependency is never
  required: a provider that cannot find its partner degrades; it does not
  become unavailable itself.
- **Identity stays per provider.** Keys and identities (Swarm's publisher
  identities, Radicle's node identity, the wallet's accounts) belong to
  their provider. No provider derives from, signs with or exposes
  another's, and the core brokers no key material (N6). Which of them the
  identity vault's lock gates is each provider's own §2 statement (§6.11).

Three things no pattern allows: a page-facing method of one provider that
calls another provider on the page's behalf; a provider adding a code to
§7.13 or a reason to another provider's §7; a provider reading another's
store except through the index.

### 12.6 Deliverables

The specification consists of: this `SPEC.md`; `providers/TEMPLATE.md` and one
`providers/<id>.md` per provider; `schemas/freedom-manifest-2.schema.json`
composed from `schemas/providers/<id>.schema.json`; `registry.json`, every
capability with id, provider, tier, scope schema, the methods it unlocks,
whether the identity vault's lock gates it (`needsIdentityVault`) and its
consent string, and per provider whether its data is unreadable until the
first unlock of a session (`needsUnseal`, §6.11) and its public-tier methods
(`publicMethods`), generated from the provider documents; `types/dapp.d.ts`;
`examples/<provider>/`, one minimal dapp per provider that doubles as the
conformance check; `AUTHORING.md`; and `tools/`, the schema, type and signing
checks, which are aids and carry no requirement.

## 13. Host requirements (summary)

A conforming host:

1. injects `window.dapp` exactly where §3.4–3.6 and §7.1 say and nowhere
   else;
2. derives the dapp key in the main process (§3.2) and re-checks every grant
   there (§6.8);
3. fetches, validates and records the manifest as §4 says, and validates
   with the published schema;
4. records the root reference at add time and checks it on every load,
   raising the notices of §5 and blocking calls while one is pending;
5. keeps grants per dapp key with one sub-object per provider (§6.8) and
   plans to fold its per-provider stores into one;
6. implements the consent sheet, decline semantics, pausing, revocation,
   identity-vault rules (existence, sealed and locked) and the logs of §6;
7. implements the core methods, events, binary, pagination, job, timeout,
   rate-limit and error conventions of §7;
8. encrypts stored dapp data at rest under keys derived from the identity
   vault, drops the safe key on lock (§8.1), requires the vault before
   any grant (§6.11), and implements the removal flow of §8.4;
9. implements the Freedom Agent access and custody rules of §9;
10. provides the surfaces of §10;
11. upholds every rule of §11;
12. ships each provider in §12.1 to its document.

## 14. Versioning

`specVersion` is a string; this is `"1"`. Breaking changes bump it. The
manifest schema id is versioned on its own: `freedom-manifest/2` is the
manifest schema of `specVersion` `1`, succeeding the shipped
`freedom-manifest/1`, and a later `specVersion` names the schema id it
requires. Adding a provider, a capability, a method, an event or a
`data.reason` string does not bump `specVersion`.

---

## Appendix A — Freedom implementation notes (informative)

Nothing in this appendix is a requirement. It names where in upstream
v0.8.8 each part of the core naturally lands.

- **Channel and dispatcher.** One IPC channel, `dapp:request`, beside
  `swarm:provider-request` and the Radicle channel, with one dispatcher in
  the main process routing by prefix (`safe_*`, `files_*`, `dapp_*`) to new
  `src/main/safe/` and `src/main/files/` services, their grant stores and
  `dapps.json`. The page
  shim joins `window.swarm`'s block in `src/main/webview-preload.js`.
  `src/renderer/lib/dapp-provider.js` draws the dApps pane and the
  address-bar indicator; `src/renderer/lib/sidebar.js` `openForPrompt`
  opens the pane for a prompt.
- **Stores.** `dapps.json` (per dapp key: manifest record, enabled flag,
  dev-realm entries) and `files-grants.json` (per dapp key: the Safe and Files
  sub-objects) beside the shipped `swarm-permissions.json`,
  `radicle-permissions.json` and the wallet's `dapp-permissions.json` (that
  name is the wallet connection store and is taken). A read-only index in main
  joins all of them by dapp key (`src/shared/origin-utils.js`
  `getPermissionKey`, which emits `dev:<label>:<port>` for a `*.localhost`
  origin while the developer setting is on, §3.6) for the launcher, the
  details page (`freedom://dapps/<encodeURIComponent(key)>`) and the pane; it
  is the seam along which the stores are folded into one in a later revision.
- **Manifest fetcher.** `src/main/swarm/permission-manifests.js`
  generalised to `freedom-manifest/2` on all four schemes (inline on
  `web3://`), recording the root reference, feeding the unified sheet, and
  leaving the `/1` path and the Swarm auto-approve fingerprint untouched.
- **Disk layout.** Under the profile directory (Electron `userData`:
  `~/Library/Application Support/Freedom`, `~/.config/freedom`,
  `%APPDATA%\Freedom`; `Profiles/<id>` for non-default profiles;
  `Freedom Dev/<checkout>/` for a source checkout):
  `dapp-safe/<sha256(dappKey)>/` and `dapp-files/`, content encrypted
  under two keys derived from the vault: HKDF-SHA256 over the BIP-39 seed
  of the vault's mnemonic (empty passphrase) with the info strings
  `freedom-dapp-safe/1` and `freedom-dapp-files/1`, derived in the vault
  service where the seed is already unwrapped and handed to the two
  services as bytes: both at the first unlock of a session, the safe key
  withdrawn on `vault:locked` and handed over again on each unlock; hashed
  on-disk names; a sidecar index per store encrypted under that store's
  key (safe: keys, kinds, sizes; files: names, authors, marks, CIDs,
  types, sizes, `publications`) and plain per-dapp byte and item counters
  for the quota methods and the surfaces. No key file exists.
- **Publication records.** Swarm's record on a stored file is written in
  main's Swarm publish path, which already sees the bytes
  (`providers/swarm.md` §10); Files owns the record (`providers/files.md`
  §8.6).
- **Seed records.** The dapp key is recorded against each RID a dapp's
  `radicle_seed` is approved for, in the Radicle grant store.
- **The log store.** One store under the profile directory,
  encrypted under the files key; the details page's list, the pane's
  section and `freedom://dapps/log` are three views of it. A per-dapp
  "cleared before" time in the dapp's record gives the details page its
  **Clear** without touching the store.
- **Wallet transactions in the activity log.** Taken from the wallet's
  transaction recorder when the sending origin's key is an added dapp.

## Appendix B — Example manifest

See §4.3. A minimal manifest for a dapp that only wants to be listed:

```json
{
  "schema": "freedom-manifest/2",
  "name": "Hello",
  "description": "A static page that wants a tile in freedom://dapps.",
  "icon": "./icon.png",
  "version": "0.1.0",
  "capabilities": {}
}
```
