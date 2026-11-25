// Strict type-check fixture for types/dapp.d.ts. Run from the repo root:
//   npx -p typescript tsc -p tools
// Every @ts-expect-error line must stay an error; everything else must compile.
/// <reference path="../types/dapp.d.ts" />
async function main() {
  const d = window.dapp;
  if (!d?.isFreedomBrowser) return;
  const grant = await d.requestCapabilities({ capabilities: [
    { id: "safe:store" },
    { id: "files:own" },
    { id: "files:read" },
  ]});
  const held: FreedomDapp.HeldCapability[] = grant.capabilities;
  // @ts-expect-error no capability carries a scope in this revision (SPEC.md §6.3)
  await d.requestCapabilities({ capabilities: [{ id: "files:read", scope: { types: ["image/*"] } }] });
  // @ts-expect-error the two-root capabilities are gone
  await d.requestCapabilities({ capabilities: [{ id: "files:private" }] });

  // Files: one pool, a mark per file, no `root` (providers/files.md §4).
  const list = await d.request({ method: "files_list", params: { types: ["image/*"] } });
  const first: FreedomDapp.FileEntry | undefined = list.items[0];
  const mark: FreedomDapp.Visibility | undefined = first?.visibility;
  const author: string | undefined = first?.author;
  // @ts-expect-error a listing beyond the dapp's own files must name types
  await d.files.list({});
  // @ts-expect-error an empty types list is not a type query
  await d.files.list({ types: [] });
  await d.files.list({ author: "self" });
  // @ts-expect-error visibility filters the dapp's own listing only
  await d.request({ method: "files_list", params: { types: ["image/*"], visibility: "shared" } });
  await d.files.list({ author: "self", visibility: "private", suffix: ".state" });
  await d.files.list({ types: ["image/*", "application/json"], author: "name.eth", prefix: "a" });
  await d.files.subscribe({ author: "self" });
  await d.files.subscribe({ types: ["image/*"] });
  // @ts-expect-error a subscription beyond the dapp's own files must name types
  await d.files.subscribe({ prefix: "a" });
  const blob: Blob = await d.files.read({ name: "notes.json" });
  const theirs: Blob = await d.files.read({ author: "name.eth", name: "cover.png" });
  const w = await d.files.write({ name: "a.json", data: "{}", type: "application/json", visibility: "private" });
  // @ts-expect-error there is no root any more
  await d.files.write({ root: "private", name: "a.json", data: "{}", type: "application/json" });
  // @ts-expect-error not a mark
  await d.files.setVisibility({ name: "a.json", visibility: "secret" });
  await d.files.setVisibility({ name: "a.json", visibility: "shared" });
  await d.files.copy({ from: { author: "name.eth", name: "cover.png" }, to: { name: "cover.png" }, visibility: "private" });
  const fq = await d.files.getQuota();
  // `pool` is present only with a files grant (providers/files.md §8.2), so it must be narrowed.
  const pool: number = fq.pool?.limit ?? fq.limit;
  // @ts-expect-error pool is optional
  const poolBad: number = fq.pool.limit;
  const fl: FreedomDapp.FilesLimits = { fileBytes: 536870912 };
  // @ts-expect-error the pool cap is the user's figure, never a limit
  const flBad: FreedomDapp.FilesLimits = { ...fl, poolBytes: 1 };
  // Publication records are keyed by provider id (providers/files.md §8.6).
  const pub = await d.files.setPublication({ name: "a.json", provider: "swarm", ref: "ab".repeat(32) });
  const swarmRef: string | undefined = pub.publications?.swarm?.ref;
  d.on("files:changed", (e) => {
    const k: FreedomDapp.FilesChangedKind = e.kind;
    if (e.kind === "published") { const p: string | undefined = e.publication?.provider; void p; }
    if (e.kind === "visibility") { const v: FreedomDapp.Visibility = e.visibility; void v; }
    void k;
  });
  // @ts-expect-error the old single-provider field is gone
  const oldField = pub.published;

  // Safe: key-value, JSON or bytes (providers/safe.md §4).
  const item = await d.safe.set({ key: "profile/name", value: { first: "Ada" } });
  const etag: string = item.etag;
  await d.safe.set({ key: "save.state", value: new Uint8Array(4), ifMatch: etag });
  // @ts-expect-error a function is neither JSON nor bytes
  await d.safe.set({ key: "bad", value: () => 1 });
  const got = await d.safe.get({ key: "profile/name" });
  // The result is null for an absent key, so it must be narrowed; bytes come back as Uint8Array.
  if (got && got.kind === "bytes") { const b: Uint8Array = got.value; void b; }
  if (got && got.kind === "json") { const j: FreedomDapp.Json = got.value; void j; }
  // @ts-expect-error get may resolve null
  const unsafe: FreedomDapp.SafeItem = await d.safe.get({ key: "x" });
  const keys = await d.safe.keys({ prefix: "profile/" });
  // @ts-expect-error a listing carries no values
  const noValue = keys.items[0].value;
  const sq = await d.safe.getQuota();
  const sl: FreedomDapp.SafeLimits = { bytes: sq.limit, valueBytes: sq.valueLimit, keys: sq.countLimit };
  d.on("safe:changed", (e) => { const k: "set" | "deleted" = e.change; void [k, e.key]; });
  await d.request({ method: "safe_delete", params: { key: "profile/name" } });
  // Methods whose params are optional still accept them on the wire.
  await d.request({ method: "safe_keys", params: { prefix: "profile/" } });
  await d.request({ method: "safe_keys" });
  await d.request({ method: "safe_subscribe", params: { prefix: "saves/" } });
  await d.request({ method: "dapp_relinquish", params: { capabilities: ["files:read"] } });
  // @ts-expect-error wrong params for the method
  await d.request({ method: "safe_keys", params: { key: "x" } });

  d.on("updatePending", (e) => { void e.toVersion; });
  const m: FreedomDapp.Manifest = {
    schema: "freedom-manifest/2", name: "x", description: "y", icon: "./i.png", version: "1",
    capabilities: { safe: { store: { why: "s" } }, files: { own: { why: "w" } }, swarm: { publish: { why: "p" } } },
  };
  // @ts-expect-error unknown method
  await d.request({ method: "ipfs_pin", params: {} });
  // `pending` names the unanswered notice; `updatePending` is its "update" case (SPEC.md §7.4).
  const rec: FreedomDapp.ManifestRecord = { version: "1", reference: "", signed: false, updatePending: false };
  const why: "update" | "missing" | "invalid" | "key-change" | undefined = rec.pending;
  // @ts-expect-error not a notice state
  const badWhy: FreedomDapp.ManifestRecord["pending"] = "paused";
  // The identity vault: state method and event (SPEC.md §6.11).
  const idState: FreedomDapp.IdentityState = await d.getIdentityState();
  d.on("identityChanged", (e) => { const l: boolean = e.locked && e.sealed && e.exists; void l; });
  const reason: FreedomDapp.CoreReason = "no_identity";
  void [held, first, mark, author, blob, theirs, w, pool, poolBad, flBad, swarmRef, oldField, unsafe, noValue, sl, m, why, badWhy, idState, reason];
}
main();
