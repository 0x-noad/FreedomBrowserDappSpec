# Writing a Freedom dapp

A practical guide for dapp authors. The normative text is `SPEC.md` and the
provider documents under `providers/`; where this guide and those disagree,
they win. Types are in `types/dapp.d.ts`; working examples are under
`examples/`.

## 1. What a dapp is

A dapp is a static site, served over `bzz://`, `ipfs://`, `ipns://` or
`web3://`, that ships a `freedom-manifest.json` and talks to Freedom through
`window.dapp`. There is no server. Your users' data lives in their browser:
in a **safe**, a small key-value store only your dapp can open and that
locks with their identity, and in **files**, which sit in their shared
folder for other dapps to read unless you mark them private. Anything you
put on a network goes through
the user's own node (`window.swarm`, `window.radicle`) or wallet
(`window.ethereum`), with their consent.

Three things follow from "no server" that are worth internalising early:

- **Your identity is where you are served from.** Freedom keys everything
  (your safe, your files, grants, the recorded build) by the **dapp key**: the
  bare name for a named host (`myapp.eth`, `myapp.wei`, `myapp.gwei`,
  `myapp.tez`, `myapp.box`), the scheme-qualified reference for a raw address
  (`bzz://<ref>`, `ipfs://<cid>`), contract plus chain for `web3://`. Nothing
  in your manifest or your code can change that.
- **A raw address never changes.** If you deploy to `ipfs://<cid>` or
  `bzz://<ref>`, the user knows your dapp cannot change under them; that is
  a feature. The cost is in the box below.
- **A named dapp's builds are tracked.** Freedom records the build it added
  and tells the user when it changes (§6). Give every build a `version`.

> **Warning: deploying to a raw address.** Every redeploy to `ipfs://<cid>` or
> `bzz://<ref>` is a *different dapp*. The new build has a new key, an empty
> safe, no files, no grants and no activity log, and your users must find it
> and add it again; nothing carries over, and nothing can, because the address
> is the identity. Use a name (`myapp.eth`, `myapp.box`, …) or a `web3://`
> contract for anything whose data or grants must outlive a build. Raw
> addresses are for one-off builds and for the content a named dapp points at.

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

### Signing (do it from your first release)

Add `publicKey` (Ed25519, multibase `z…`) and `signature` (over the RFC 8785
canonical JSON of the manifest without `signature`). Freedom shows "signed" on
the sheet and, on every later build, tells the user the contents were changed
by their author. An unsigned dapp carries the warning "This dApp is not signed
by its author." on the sheet, on the details page and on every update notice.
If a name you own is ever lost or sold, the new owner's builds will fail that
check and users will be warned and asked to re-add from scratch.

**Sign before anyone adds your dapp.** Adding a signature later counts as
a signing change too: every user is asked to re-add, and the re-added dapp
starts **empty**, with no way to give it back the safe and private files
of the unsigned build (§6). An unsigned dapp can stay unsigned without
that cost, but then nothing tells your users a new build is yours.

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
| `safe:store` | consent | your own key-value **safe**: JSON or bytes under keys you choose, 64 MB in all, 8 MB per value, 1 000 keys; locked whenever the user's identity is |
| `files:own` | consent | store, read, mark, rename and delete **your own** files (default 1 GB of an 8 GB pool; the user can raise either, to 8 GB and 32 GB; 512 MB per file). They are in the user's shared folder unless you mark them private |
| `files:read` | consent | read the files **other dapps shared**, listing them by file type (never all at once) |
| `swarm:publish`, `swarm:feeds`, `swarm:signing`, `swarm:messaging` | per-call | the shipped `window.swarm` tiers; each use prompts unless the user set always-allow |
| `radicle:node`, `radicle:signing` | per-call | the shipped `window.radicle` tiers |

**Consent** means the user is asked once, when they add your dapp, and never
again for that capability. **Per-call** means every use prompts unless the
user chose always-allow on the sheet or the details page. The safe and
files never prompt per call: nothing leaves the device.

The wallet is not a capability. Call `eth_requestAccounts` as you would on
any site; the user sees the wallet's own prompt. Signatures and transactions
always go through the wallet's approvals.

### Where your data goes

Three places, by what the data is:

- **The safe**, for what must stay secret: sign-in tokens, keys, settings,
  a profile, a save state. Small on purpose. Nobody but your dapp and the
  user reads it, Freedom Agent never does, and it is unreadable whenever
  the user's identity is locked.
- **A private file**, for bulk data that is only yours: drafts, caches,
  working copies. No other dapp and no Agent tool can see it. The mark is
  access control, not a lock: the user sees the file in `freedom://files`,
  and it stays readable to your dapp while the identity is locked. Do not
  put secrets there.
- **A shared file**, the default, for everything else: documents, media,
  anything another dapp might use. The consent sheet tells the user, in
  these words, under your `files:own` row: **"Files this dApp stores go in
  your shared folder, where dApps you allow can read them, unless the dApp
  marks them private."** And under any `files:read` row: **"Everything in
  your shared folder, including which dApp added each file, is visible to
  every dApp you allow to read it."** Treat a shared file as published.

Marking a shared file private later stops further reads; it does not
recall what another dapp already read.

## 4. Talking to Freedom

```js
if (!window.dapp) {
  // Not a dapp page (wrong scheme, iframe, worker, private window), or a
  // host without the spec. Degrade: your page still works as a plain site.
  showPlainSite();
} else {
  startDapp();
}

// inside startDapp():
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
    { id: 'safe:store' },
    { id: 'files:own' },
    { id: 'files:read' },   // only if you read what other dapps shared
  ],
});
```

- On the first call the consent sheet opens in Freedom's dApps pane. Until
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

**Other dapps' files are read by type.** `files:read` covers every shared
file, whoever added it, and the consent row says so. What bounds you is the
query: a `list` or `subscribe` beyond your own files must name the MIME
types you want, exact (`image/png`) or one family at a time (`image/*`);
asking for nothing, or for `*/*`, is `-32602 types_required`. Only the
user's own `freedom://files` lists everything. Your **own** files are the
exception: `files.list({ author: 'self' })` lists them whole, both marks.
Add `author` to narrow a type query to one dapp's files, and `prefix` or
`suffix` to narrow by name. Give your own file kinds a specific type
(`application/vnd.myapp.state+json`) so they list in one call; reach for
`suffix: '.state'` under a broad type only for files whose writer did not.
A shared file you already know by `{ author, name }` reads directly,
whatever its type; another dapp's private file is simply `not_found`.

- A decline is `4001` and is cached for the document: do not re-prompt in a
  loop; tell the user they can reopen the sheet from the **dApp** label in the
  address bar, or reload.
- Listen for `capabilitiesChanged`: the user can pause or revoke anything at
  any time from the details page.

Every method is reachable as `window.dapp.request({ method, params })` or
as sugar, `window.dapp.files.read(...)`, `window.dapp.safe.get(...)`. The
Files sugar converts bytes for you: reads give you a `Blob`, writes take a
string, `Uint8Array`, `ArrayBuffer` or `Blob`. The safe is different on two
points: a string you store is a JSON string, not bytes, and bytes come
back as a `Uint8Array`.

### The safe in practice

```js
const safe = window.dapp.safe;

await safe.set({ key: 'settings', value: { theme: 'dark', lang: 'en' } });   // any JSON value
await safe.set({ key: 'saves/slot1', value: sramBytes });                     // or bytes
const item = await safe.get({ key: 'settings' });        // { value, kind, etag, size, mtime } or null
const settings = item?.kind === 'json' ? item.value : { theme: 'light' };

// Optimistic concurrency with the etag
if (item) await safe.set({ key: 'settings', value: next(settings), ifMatch: item.etag });   // 4409 conflict if changed

// Group with prefixes; listing returns keys and sizes, never values
const { items } = await safe.keys({ prefix: 'saves/' });
await safe.delete({ key: 'saves/slot1' });
```

Things to know:

- A key is 1–128 characters from letters, digits and `. _ : / -`. The
  store is flat; `/` is just a character you can group by.
- 64 MB in all, 8 MB per value, 1 000 keys, fixed. Over them is `4300`
  with `value_too_large`, `too_many_keys` or `safe_quota`.
- **Every safe call needs the identity unlocked** (next section). Keep
  what you need for rendering in memory after you read it.
- The user can see your keys and their sizes on your details page, delete
  them and export them. They cannot read values there; do not rely on
  that as secrecy from the user, who can export.
- A value is what `JSON.stringify` makes of it: `undefined` members and
  functions vanish, a `Date` becomes a string, and something it cannot
  serialise is `-32602 invalid_value`. Bytes go in as a `Uint8Array`,
  `ArrayBuffer` or `Blob`.
- On a tab Freedom Agent is driving, the user is warned before your first
  safe read, because the Agent can see what you then display; if they
  decline you get `4100 agent_custody` for as long as the Agent holds the
  tab. Show a plain "not available while Freedom Agent is in control"
  state.

### Files in practice

```js
const files = window.dapp.files;

const { author: me } = await files.write({ name: 'notes.md', data: text, type: 'text/markdown' });   // shared by default; `me` is your dapp key
await files.write({ name: 'draft.md', data: text, type: 'text/markdown', visibility: 'private' });
const blob = await files.read({ name: 'cover.png' });   // your own file: Blob, type image/png
img.src = URL.createObjectURL(blob);

// Optimistic concurrency with the CID as etag
const { value, cid } = await files.readJson({ name: 'doc.json' });
await files.writeJson({ name: 'doc.json', value: next(value), ifMatch: cid }); // 4409 conflict if changed

// Publish a draft to other dapps, or withdraw it
await files.setVisibility({ name: 'draft.md', visibility: 'shared' });

// Shared files by type (needs files:read): everyone's, your own shared ones included
const { items } = await files.list({ types: ['image/*'] });
const theirs = items.find((f) => f.author !== me);        // me: the author on any file you wrote
if (theirs) await files.copy({ from: { author: theirs.author, name: theirs.name }, to: { name: 'imported.png' } });

// Stay in sync across tabs and with the user's own edits in freedom://files
await files.subscribe({ author: 'self' });
// Fires for every tab's changes, this one's included: compare the cid before reloading.
window.dapp.on('files:changed', (e) => { if (e.name === 'notes.md' && e.cid !== current.cid) reload(); });
```

Things to know:

- The pool is **flat** and a name may not contain `/`. Encode hierarchy in
  names some other way (`photos.2026.01.jpg`, `photos--2026--01.jpg`).
  Names are exact and case-sensitive. Your names never collide with
  another dapp's: a file is `{ author, name }`.
- **A new file is shared unless you say `visibility: 'private'`.** An
  overwrite keeps the file's mark. A copy of your own file keeps its
  source's mark; a copy of another dapp's shared file is shared unless
  you say otherwise. Copies never carry publication records.
- **On a tab Freedom Agent is driving, nothing you write is silent.**
  Every write, to files or the safe, is shown to the user first and fails
  with `4100 agent_custody` if they decline. Show it as a state; do not
  retry in a loop. Decide per file; when in doubt for
  something only your dapp uses, mark it private.
- Declare a real `type`. Freedom sniffs images, audio, video, PDF, archives
  and fonts and rejects a declaration that contradicts the bytes.
- Every file has a CIDv1 of its bytes, the same CID `ipfs add` would give.
  Use it as an etag and as a stable id you can hand to other dapps.
- **Quotas are the user's**, never a manifest's. Your allowance covers all
  your files, both marks. A write that needs more room than your allowance
  asks the user for you, in the dApps pane, while your call waits (up to 300
  s): you get the normal result if they raise it, or `4300 dapp_quota` if they
  decline, as if nothing had been asked. Wrap writes in try/catch and treat
  `4300` as "no room"; never retry it in a loop, a decline is remembered until
  reload. The prompt needs a recent user gesture, so save on the user's
  action, not on a timer. `files.getQuota()` tells you where you stand.
- **Rate limits** are per dapp key, so every open tab of your dapp shares
  one budget: 600 Files calls and 512 MB read per minute, and 600 safe
  calls. Over it is `-32005` with `retryAfterMs`; wait that long, do not
  retry in a loop. Save state once per change, not per keystroke; one
  `files.list` with a `prefix` beats a `stat` per file; read a file once
  and keep it in memory.
- To get a file in from the user's disk, use `<input type="file">` and
  `files.write`; to get one out, offer a download. There are no import or
  export methods.

### The identity vault and the lock

Freedom keeps dapp data under the user's **identity**: the safe and the
files are encrypted with keys derived from their recovery phrase, which is
also what makes them survive a reinstall. Three consequences for you:

- A user who has not yet created an identity cannot add your dapp. Your
  first `requestCapabilities` opens Freedom's identity setup for them and
  then the consent sheet; if they back out you get `4100 no_identity`.
  Nothing for you to do but show a plain message and try again later.
- After a browser launch the identity is **sealed** and your dapp is not
  connected until the user unlocks it once. Your first call beyond the
  public tier, on `window.dapp`, `window.swarm` or `window.radicle`
  (usually `requestCapabilities`), shows the unlock prompt in the tab the
  user is looking at and completes after it; once you are added,
  `getIdentityState().sealed` tells you without prompting. One unlock
  lasts the session.
- After a while idle (Freedom's own setting) the identity **locks**, and
  with it your **safe**. Your files stay readable, private ones included.
  A safe call from the tab the user is looking at shows the unlock prompt
  and then completes; from a background tab it waits for an unlock from
  anywhere and fails with `4100 locked` only if none comes within the
  timeout. A dismissed prompt is remembered for the page, so a retry loop
  gets `locked` at once instead of nagging. Listen for `identityChanged`
  to pause background writes and refresh after unlock, and keep safe
  writes small and resumable:

```js
window.dapp.on('identityChanged', ({ locked }) => { if (!locked) flushQueue(); });
const { exists, locked, sealed } = await window.dapp.getIdentityState();
```

Your own calls never keep the identity open; only the user's acts do.

### Publishing to Swarm

`window.swarm` is unchanged. Read a file, pass the bytes:

```js
const blob = await files.read({ name: 'page.html' });
const { reference } = await window.swarm.publishData({ data: await blob.arrayBuffer(), contentType: 'text/html' });
```

Freedom notices that those bytes were one of your files and records the
reference on it as `publications.swarm`, verified; `files:changed` fires
with `kind: 'published'` and the record as `publication`. For a multi-file
`publishFiles` bundle, record the root reference yourself with
`files.setPublication({ name, provider: 'swarm', ref })`; it shows in
`freedom://files` as dApp-reported. A future provider that publishes (IPFS,
say) gets its own key beside `swarm`; your code never has to change for it.

### Errors

Every rejection is `{ code, message, data?: { reason, … } }`. The codes are
the EIP-1193 ones plus three:

| code | meaning | typical `data.reason` |
|---|---|---|
| `4001` | user rejected | `user_rejected`, `cooldown`, `sheet_busy`, `navigated` |
| `4100` | not authorized | `unauthorized`, `disabled` (paused), `locked`, `no_identity`, `update_pending`, `no_manifest`, `not_in_manifest`, `agent_custody` |
| `4200` | unknown method | |
| `4300` | quota | files: `file_too_large`, `dapp_quota`, `pool_quota` (your own limit comes before the pool's, so free your files first); safe: `value_too_large`, `too_many_keys`, `safe_quota` |
| `4409` | conflict | `conflict`, `exists` |
| `4900` | provider unavailable | node down, store unavailable |
| `-32602` | invalid params | `invalid_name`, `invalid_key`, `type_mismatch`, `types_required`, `not_found`, `invalid_json`, … |
| `-32005` | rate limited | `retryAfterMs` |
| `-32603` | internal | `timeout`, `disk_full`, `io_error` |

Freedom never tells a dapp whether something it cannot see exists:
`not_found` and an empty list are the only answers about what is absent.

## 5. Developing locally

Turn on the **developer setting**, under **Developer settings** at the
bottom of Freedom's dApps pane (sidebar). Then serve your build at
`http://<label>.localhost[:port]`, for example
`http://notebook.localhost:8767/`. Freedom treats it as a dapp with the key
`dev:notebook:8767` (the port is part of the key: any local server can
answer for any `*.localhost` name, so a server on another port is another
dapp), with its own safe and files of its own in a separate development
pool, walled off from production. There is no build check; instead Freedom
watches the manifest itself and shows the update notice when it changes,
so edits to your capabilities reach the sheet. Everything else behaves as
in production: the manifest, the sheet, prompts, limits. If you serve
several dapps at once, give each its own label: `examples/serve.js` does
that for one folder per label. Bare `localhost`,
IP addresses and `https` are refused. Dev dapps sit under a Development
heading on every page and can be wiped in one action.

`examples/` has four runnable fixtures you can copy from.

## 6. Shipping, updating, and what the user sees

**Deploy** to a raw address or a name. For `bzz://` and `ipfs://`, the
manifest is fetched once per build; for a name, Freedom resolves the root
reference on every load and fetches the manifest only when it changed.

**On the first visit** the user sees a yellow **dApp** label in the address bar
(just **d** where the bar is narrow). Nothing prompts until you call
`requestCapabilities` or they click the label and press Add; it turns purple
once your dapp is connected. Design your first screen to make sense before any
grant.

**When you ship a new build** under a name, Freedom notices the root reference
changed and shows an **update notice** before the new build may use anything:
old and new `version`, any new capabilities (unticked; the user ticks them),
and whether the signing key is the same. Until the user approves, every call
beyond the public tier (discovery, `getCapabilities`, `getManifest`,
`safe.getQuota`, `files.getQuota`) rejects `4100 update_pending`. Handle it:
show "update waiting for approval" rather than an error. `updatePending` and
`updateApplied` events tell you when, and `getManifest().pending` says which
notice is waiting (`update`, `missing`, `invalid` or `key-change`). After a
`key-change` your grants are gone until the user re-adds you: gated calls
reject `unauthorized` and `requestCapabilities` rejects `update_pending`, so
read `pending` before asking again.

Rules of the update:

- Bump `version` on every build. It is what the user sees.
- A capability you remove loses its grant when the user approves. A
  capability you add is granted only if they tick it. Changing `why`, the
  name, the description or the icon needs no re-consent.
- A build with a missing or invalid manifest blocks everything beyond the
  public tier until a valid one is back. Lint before deploying.
- Changing the signing key without a rotation, going from signed to
  unsigned, or adding a first signature to an unsigned dapp withdraws
  every grant and asks the user to re-add from
  scratch, and the re-added dapp starts **empty**: the previous build's
  safe and private files are never handed over (the user keeps them, to
  export or delete), and its shared files become the user's. Rotate
  properly (§2) and keep your key safe; there is no way back.

**What the user can do at any time** from `freedom://dapps` and your
details page: pause a capability or the whole dapp (`4100 disabled`),
revoke, see every file you stored (private ones too) and the keys in your
safe, delete or export any of it, see every publish and feed, and remove
your dapp. They can also read a log of everything your dapp did, on your
details page and in the dApps pane: every write, everything you sent,
every call they refused or that failed, and your reads of other dapps'
shared files (counted by type, never your own data). Removal deletes your
safe and your private files (after offering an export) and asks whether to
remove your shared files too. Design for data the user controls: never
assume a file or a key is still there.

## 7. Checklist before you publish

- [ ] `freedom-manifest.json` at the root, validates against the schema, ≤ 8 KiB
- [ ] every capability you will ever request is declared, each with a `why` written for the user
- [ ] `version` bumped
- [ ] icon is PNG/JPEG/WebP, ≤ 16 KiB, 8–512 px
- [ ] the page works with `window.dapp` undefined and before any grant
- [ ] `getCapabilities` is checked before `requestCapabilities`
- [ ] `4001` is not retried in a loop; `4100 update_pending` and `disabled` are shown as states, not errors
- [ ] secrets are in the safe, not in files; files only your dapp needs are marked private
- [ ] signed, and the key is stored somewhere you will still have it next release
