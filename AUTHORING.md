# Writing a Freedom dapp

A practical guide for dapp authors. The normative text is `SPEC.md` and the
provider documents under `providers/`; where this guide and those disagree,
they win. Types are in `types/dapp.d.ts`; working examples are under
`examples/`.

## 1. What a dapp is

A dapp is a static site, served over `bzz://`, `ipfs://`, `ipns://` or
`web3://`, that ships a `freedom-manifest.json` and talks to Freedom through
`window.dapp`. There is no server. Your users' data lives in their browser,
in a **private folder** only your dapp can open and a **shared folder**
every dapp they allow can read. Anything you put on a network goes through
the user's own node (`window.swarm`, `window.radicle`) or wallet
(`window.ethereum`), with their consent.

Three things follow from "no server" that are worth internalising early:

- **Your identity is where you are served from.** Freedom keys everything
  (folders, grants, the recorded build) by the **dapp key**: the bare name
  for a named host (`myapp.eth`, `myapp.wei`, `myapp.gwei`, `myapp.tez`,
  `myapp.box`), the scheme-qualified reference for a raw address
  (`bzz://<ref>`, `ipfs://<cid>`), contract plus chain for `web3://`.
  Nothing in your manifest or your code can change that.
- **A raw address never changes.** If you deploy to `ipfs://<cid>` or
  `bzz://<ref>`, the user knows your dapp cannot change under them; that is
  a feature. The cost is in the box below.
- **A named dapp's builds are tracked.** Freedom records the build it added
  and tells the user when it changes (§6). Give every build a `version`.

> **Warning: deploying to a raw address.** Every redeploy to
> `ipfs://<cid>` or `bzz://<ref>` is a *different dapp*. The new build has
> a new key, empty folders, no grants and no activity log, and your users
> must find it and add it again; nothing carries over, and nothing can,
> because the address is the identity. Use a name (`myapp.eth`,
> `myapp.box`, …) or a `web3://` contract for anything whose data or
> grants must outlive a build. Raw addresses are for one-off builds and
> for the content a named dapp points at.
## 2. The manifest

Put `freedom-manifest.json` at the root of your site. Nothing else is
checked; `/.well-known/` is not.

```json
{
  "schema": "freedom-manifest/2",
  "name": "Notebook",
  "description": "Encrypted notes you can share with other dapps.",
  "icon": "./icon.png",
  "version": "1.4.0",
  "capabilities": {
    "files": {
      "private":      { "why": "Keeps your notes on this device." },
      "read-shared":  { "why": "Imports images other dapps shared.",
                        "scope": { "types": ["image/*"] } },
      "write-shared": { "why": "Shares the notes you export." }
    },
    "swarm": {
      "publish": { "why": "Publishes a note as a page when you ask." }
    }
  },
  "homepage": "https://notebook.example",
  "source": "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
  "author": { "name": "Ada" }
}
```

Rules that bite:

- **Required:** `schema`, `name` (≤ 32), `description` (≤ 160), `icon`,
  `version` (≤ 32), `capabilities` (may be `{}`).
- **Unknown fields are rejected.** A typo makes your manifest invalid and
  your site a non-dapp. Lint it against
  `schemas/freedom-manifest-2.schema.json` before every deploy. The one
  foreign key allowed is `$schema`, the editor hint pointing at that schema,
  in the served `freedom-manifest.json` only (strip it from an inline
  `web3://` manifest).
- **8 KiB** for the served file. Each `why` is ≤ 140 characters and is
  shown on the consent sheet under the capability's own words, so write it
  for the user, not for yourself.
- **The icon** is PNG, JPEG or WebP, ≤ 16 KiB, 8–512 px square-ish. No SVG.
  Freedom re-encodes it to 128 px and strips metadata. On served schemes
  `icon` is a relative path; on `web3://` it is a `data:` URI.
- **Declare everything you may ever ask for.** A runtime request for a
  capability not in the manifest fails with `4100 not_in_manifest`. You may
  request a subset at any time, so declaring more than you ask for up front
  is fine; asking for more than you declared is not.
- **`name` is display only.** The consent sheet and every page name your
  dapp by its key first, your name second. Pick a name that matches what
  users will see in the address bar.

### On `web3://`

An onchain app cannot serve a sidecar file, so the manifest goes inline in
the `html()` document, as the first element of this form:

```html
<script type="application/freedom-manifest+json">
{ "schema": "freedom-manifest/2", "name": "…", "icon": "data:image/png;base64,…", … }
</script>
```

The cap is 32 KiB there, to fit the icon. On every other scheme the inline
form is ignored. `web3://` pages cannot `fetch()`; on those origins only,
`window.dapp.fetch({ url })` reads `bzz://`, `ipfs://`, `ipns://` and
`web3://` URLs through Freedom's own verified handlers and resolves a
`Response`. It is absent everywhere else, where `fetch()` already works.

### Signing (recommended)

Add `publicKey` (Ed25519, multibase `z…`) and `signature` (over the RFC 8785
canonical JSON of the manifest without `signature`). Freedom shows "signed" on
the sheet and, on every later build, tells the user the contents were changed
by their author. An unsigned dapp carries the warning "This dapp is not signed
by its author." on the sheet, on the details page and on every update notice.
If a name you own is ever lost or sold, the new owner's builds will fail that
check and users will be warned and asked to re-add from scratch.

**Rotating your key** is safe if the old key endorses the new one. Sign
the first build under the new key with `--rotate-from old.key`: the
manifest gains `rotation: { from, signature }`, Freedom shows an ordinary
update notice reading "signing key rotated", and every grant survives.
Keep the field until that build has reached your users (one hop: a user
who misses it and meets a second rotation sees the warning). Changing the
key without it, or dropping the signature, triggers the warning.
Do not compute this by hand. `tools/sign-manifest.js` in the specification
package signs a manifest file with an Ed25519 seed (or generates one), and
verifies a signed file:

```bash
node tools/sign-manifest.js --keygen --out dapp.key   # once; keep this file private
```

```bash
node tools/sign-manifest.js freedom-manifest.json --key dapp.key
```

```bash
node tools/sign-manifest.js freedom-manifest.json --key new.key --rotate-from dapp.key
```
```bash
node tools/sign-manifest.js freedom-manifest.json --verify
```

Ed25519 over RFC 8785 is the scheme of specVersion 1; a later version may
swap it, so keep the tool, not the maths, in your build.

## 3. Capabilities you can ask for

| id | tier | what it unlocks |
|---|---|---|
| `files:private` | consent | read and write your private folder (512 MB, 64 MB per file, 1 000 files; for sensitive data) |
| `files:read-shared` | consent | read the shared folder, narrowed by `scope.types` and `scope.authors` |
| `files:write-shared` | consent | add, overwrite, delete and rename **your own** files in the shared folder (default 1 GB of an 8 GB pool; the user can raise either, to 8 GB and 32 GB; 512 MB per file) |
| `swarm:publish`, `swarm:feeds`, `swarm:signing`, `swarm:messaging` | per-call | the shipped `window.swarm` tiers; each use prompts unless the user set always-allow |
| `radicle:node`, `radicle:signing` | per-call | the shipped `window.radicle` tiers |

**Consent** means the user is asked once, when they add your dapp, and never
again for that capability. **Per-call** means every use prompts unless the
user chose always-allow on the sheet or the details page. Files never
prompts per call: nothing leaves the device.

The wallet is not a capability. Call `eth_requestAccounts` as you would on
any site; the user sees the wallet's own prompt. Signatures and transactions
always go through the wallet's approvals.

### What the shared folder means

Read this before declaring `files:read-shared` or `files:write-shared`.
The consent sheet tells the user, in these words: **"Everything in your
shared folder, including which dapp added each file, is visible to every
dapp you allow to read it."** Treat anything you put there as published, and
expect to see other dapps' files when you read. Author-filtered reads are
there so you can find your own files or a partner dapp's; they are not a
privacy boundary.

## 4. Talking to Freedom

```js
if (!window.dapp) {
  // Not a dapp page (wrong scheme, iframe, worker, private window), or a
  // host without the spec. Degrade: your page still works as a plain site.
}
const { specVersion } = window.dapp;            // "1"
const providers = await window.dapp.getProviders();
```

`window.dapp` exists only in the **top frame** of a dapp-scheme page. Iframes
and workers get nothing: a same-origin iframe posts to its parent, a worker
posts bytes to the page.

Ask for what you need when you need it, behind a button if you like:

```js
const grant = await window.dapp.requestCapabilities({
  capabilities: [
    { id: 'files:private' },
    { id: 'files:read-shared', scope: { types: ['image/*'] } },
  ],
});
```

- On the first call the consent sheet opens in Freedom's Dapps pane. Until
  the user answers, any capability-gated call rejects `4100 unauthorized`;
  nothing prompts on its own.
- On a later visit, if you ask for **exactly** what you hold, it resolves at
  once with no sheet. Ask for anything different, wider or narrower, and the
  whole sheet comes back. So check first:

```js
const held = await window.dapp.getCapabilities();
const missing = wanted.filter((w) => !held.capabilities.some((h) => h.id === w.id && h.enabled));
if (missing.length) await window.dapp.requestCapabilities({ capabilities: wanted });
```

Request **exactly the scope your manifest declares**. Freedom compares what
you ask for with what you hold; any difference, wider or narrower, shows
the full sheet again, and a scope wider than the manifest's is refused
(`4100 not_in_manifest`; SPEC.md §6.4 defines compatible). A scope that
changes per session (today's collaborator in `authors`, say) means a
sheet per session. Narrow at call time instead: `files.list({ types,
author })` filters within your grant without touching it.

- A decline is `4001` and is cached for the document: do not re-prompt in a
  loop; tell the user they can reopen the sheet from the `d` in the address
  bar, or reload.
- Listen for `capabilitiesChanged`: the user can pause or revoke anything at
  any time from the details page.

Every method is reachable as `window.dapp.request({ method, params })` or
as sugar, `window.dapp.files.read(...)`. The sugar converts bytes for you:
reads give you a `Blob`, writes take a string, `Uint8Array`, `ArrayBuffer`
or `Blob`.

### Files in practice

```js
const files = window.dapp.files;

await files.write({ root: 'private', name: 'notes.json', data: JSON.stringify(notes), type: 'application/json' });
const blob = await files.read({ root: 'private', name: 'cover.png' });   // Blob, type image/png
img.src = URL.createObjectURL(blob);

// Optimistic concurrency with the CID as etag
const { value, cid } = await files.readJson({ root: 'private', name: 'doc.json' });
await files.writeJson({ root: 'private', name: 'doc.json', value: next(value), ifMatch: cid }); // 4409 conflict if changed

// Shared folder: your files are addressed by { author, name }; others' by their author
const { items } = await files.list({ root: 'shared', types: ['image/*'] });
await files.copy({ from: { root: 'private', name: 'cover.png' }, to: { root: 'shared', name: 'cover.png' } });

// Stay in sync across tabs and with the user's own edits in freedom://files
await files.subscribe({ root: 'private' });
window.dapp.on('files:changed', (e) => { if (e.name === 'notes.json') reload(); });
```

Things to know:

- Folders are **flat** and a name may not contain `/`. Encode hierarchy in
  names some other way (`photos.2026.01.jpg`, `photos--2026--01.jpg`).
  Names are exact and case-sensitive.
- Declare a real `type`. Freedom sniffs images, audio, video, PDF, archives
  and fonts and rejects a declaration that contradicts the bytes.
- Every file has a CIDv1 of its bytes, the same CID `ipfs add` would give.
  Use it as an etag and as a stable id you can hand to other dapps.
- **Default to the shared folder.** The private folder is for small
  sensitive things: key-value state, a profile or settings JSON, tokens. It
  is flat (no folders, hierarchy goes in names), 512 MB and 1 000 files,
  small on purpose. Documents, media, anything bulky and anything another
  dapp might want go in the shared folder, under your own author, or on
  Swarm.
- **Quotas are the user's**, never a manifest's. A shared write that needs
  more room than your allowance asks the user for you, in the Dapps pane,
  while your call waits (up to 300 s): you get the normal result if they
  raise it, or `4300 dapp_quota` if they decline, as if nothing had been
  asked. Wrap writes in try/catch and treat `4300` as "no room"; never
  retry it in a loop, a decline is remembered until reload. The prompt
  needs a recent user gesture, so save on the user's action, not on a timer.
  `files.getQuota({ root })` tells you where you stand.
- **Rate limits** are per dapp key, so every open tab of your dapp shares
  one budget: 600 Files calls and 512 MB read per minute. Over it is
  `-32005` with `retryAfterMs`; wait that long, do not retry in a loop.
  Save state once per change, not per keystroke; one `files.list` with a
  `prefix` beats a `stat` per file; read a file once and keep it in memory.
- To get a file in from the user's disk, use `<input type="file">` and
  `files.write`; to get one out, offer a download. There are no import or
  export methods.

### Publishing to Swarm

`window.swarm` is unchanged. Read a file, pass the bytes:

```js
const blob = await files.read({ root: 'private', name: 'page.html' });
const { reference } = await window.swarm.publishData({ data: await blob.arrayBuffer(), contentType: 'text/html' });
```

Freedom notices that those bytes were one of your files and marks it
published, verified, with the reference; `files:changed` fires with
`kind: 'published'`. For a multi-file `publishFiles` bundle, record the
reference yourself with `files.setPublished({ root, name, bzz })`; it shows
as dapp-reported.

### Errors

Every rejection is `{ code, message, data?: { reason, … } }`. The codes are
the EIP-1193 ones plus three:

| code | meaning | typical `data.reason` |
|---|---|---|
| `4001` | user rejected | `user_rejected`, `cooldown`, `sheet_busy`, `navigated` |
| `4100` | not authorized | `unauthorized`, `disabled` (paused), `locked`, `update_pending`, `no_manifest`, `not_in_manifest`, `agent_custody` |
| `4200` | unknown method | |
| `4300` | quota | `dapp_quota`, `pool_quota`, `file_too_large`, `too_many_files`; when several apply you get your own limit before the pool's, so free your files first |
| `4409` | conflict | `conflict`, `exists` |
| `4900` | provider unavailable | node down, store unavailable |
| `-32602` | invalid params | `invalid_name`, `type_mismatch`, `not_found`, `invalid_json`, … |
| `-32005` | rate limited | `retryAfterMs` |
| `-32603` | internal | `timeout`, `disk_full`, `io_error` |

`not_found` is what you get for a file outside your shared-read scope too;
Freedom never tells a dapp whether something it cannot see exists.

## 5. Developing locally

Turn on the **developer setting**, under **Developer settings** at the
bottom of Freedom's Dapps pane (sidebar). Then serve your build at
`http://<label>.localhost[:port]`, for example
`http://notebook.localhost:8767/`. Freedom treats it as a dapp with the key
`dev:notebook:8767` (the port is part of the key: any local server can
answer for any `*.localhost` name, so a server on another port is another
dapp), with its own private folder and its own shared folder,
walled off from production. There is no build check; instead Freedom
watches the manifest itself and shows the update notice when it changes,
so edits to your capabilities reach the sheet. Everything else behaves as
in production: the manifest, the sheet, prompts, limits. If you serve
several dapps at once, give each its own label: `examples/serve.js` does
that for one folder per label. Bare `localhost`,
IP addresses and `https` are refused. Dev dapps sit under a Development
heading on every page and can be wiped in one action.

`examples/` has three runnable fixtures you can copy from.

## 6. Shipping, updating, and what the user sees

**Deploy** to a raw address or a name. For `bzz://` and `ipfs://`, the
manifest is fetched once per build; for a name, Freedom resolves the root
reference on every load and fetches the manifest only when it changed.

**On the first visit** the user sees a grey `d` in the address bar. Nothing
prompts until you call `requestCapabilities` or they click the `d` and
press Add. Design your first screen to make sense before any grant.

**When you ship a new build** under a name, Freedom notices the root
reference changed and shows an **update notice** before the new build may
use anything: old and new `version`, any new capabilities (unticked; the
user ticks them), and whether the signing key is the same. Until the user
approves, every call beyond the public tier (discovery, `getCapabilities`,
`getManifest`, `files.getQuota`) rejects `4100 update_pending`. Handle it: show
"update waiting for approval" rather than an error. `updatePending` and
`updateApplied` events tell you when, and `getManifest().pending` says which
notice is waiting (`update`, `missing`, `invalid` or `key-change`).

Rules of the update:

- Bump `version` on every build. It is what the user sees.
- A capability you remove loses its grant when the user approves. A
  capability you add is granted only if they tick it. Changing `why`, the
  name, the description or the icon needs no re-consent.
- A build with a missing or invalid manifest blocks everything beyond the
  public tier until a valid one is back. Lint before deploying.
- Changing the signing key, or going from signed to unsigned, withdraws
  every grant and asks the user to re-add from scratch. Do not do it by
  accident.

**What the user can do at any time** from `freedom://dapps` and your
details page: pause a capability or the whole dapp (`4100 disabled`),
revoke, see every file you stored, every publish and feed, an activity log
of your writes, and remove your dapp. Removal deletes the private folder
(after offering an export) and asks whether to remove your shared files
too. Design for data the user controls: never assume a file is still there.

## 7. Checklist before you publish

- [ ] `freedom-manifest.json` at the root, validates against the schema, ≤ 8 KiB
- [ ] every capability you will ever request is declared, each with a `why` written for the user
- [ ] `version` bumped
- [ ] icon is PNG/JPEG/WebP, ≤ 16 KiB, 8–512 px
- [ ] the page works with `window.dapp` undefined and before any grant
- [ ] `getCapabilities` is checked before `requestCapabilities`
- [ ] `4001` is not retried in a loop; `4100 update_pending` and `disabled` are shown as states, not errors
- [ ] nothing sensitive is written to the shared folder
- [ ] signed, and the key is stored somewhere you will still have it next release
