// Strict type-check fixture for types/dapp.d.ts. Run from the repo root:
//   npx -p typescript tsc -p tools
// Every @ts-expect-error line must stay an error; everything else must compile.
/// <reference path="../types/dapp.d.ts" />
async function main() {
  const d = window.dapp;
  if (!d?.isFreedomBrowser) return;
  const grant = await d.requestCapabilities({ capabilities: [
    { id: "files:private" },
    { id: "files:read-shared", scope: { types: ["image/*"] } },
  ]});
  const held: FreedomDapp.HeldCapability[] = grant.capabilities;
  const list = await d.request({ method: "files_list", params: { root: "shared", types: ["image/*"] } });
  const first: FreedomDapp.FileEntry | undefined = list.items[0];
  const blob: Blob = await d.files.read({ root: "private", name: "notes.json" });
  const q = await d.files.getQuota({ root: "private" });
  const n: number = q.countLimit;
  const sq = await d.files.getQuota({ root: "shared" });
  // `pool` is present only with a shared row (providers/files.md §8.2), so it must be narrowed.
  const pool: number = sq.pool?.limit ?? sq.limit;
  // @ts-expect-error pool is optional
  const poolBad: number = sq.pool.limit;
  void poolBad;
  d.on("files:changed", (e) => { const k: FreedomDapp.FilesChangedKind = e.kind; void k; });
  d.on("updatePending", (e) => { void e.toVersion; });
  const m: FreedomDapp.Manifest = {
    schema: "freedom-manifest/2", name: "x", description: "y", icon: "./i.png", version: "1",
    capabilities: { files: { private: { why: "w" } }, swarm: { publish: { why: "p" } } },
  };
  // @ts-expect-error scope not allowed on files:private
  await d.requestCapabilities({ capabilities: [{ id: "files:private", scope: { types: [] } }] });
  // @ts-expect-error unknown method
  await d.request({ method: "ipfs_pin", params: {} });
  // `pending` names the unanswered notice; `updatePending` is its "update" case (SPEC.md §7.4).
  const rec: FreedomDapp.ManifestRecord = { version: "1", reference: "", signed: false, updatePending: false };
  const why: "update" | "missing" | "invalid" | "key-change" | undefined = rec.pending;
  // @ts-expect-error not a notice state
  const badWhy: FreedomDapp.ManifestRecord["pending"] = "paused";
  // Files `limits` carry the fixed figures only (providers/files.md §8.2).
  const lim: FreedomDapp.FilesLimits = { privateBytes: 536870912, privateFileBytes: 67108864, privateCount: 1000, sharedFileBytes: 536870912 };
  // @ts-expect-error the pool cap is the user's figure, never a limit
  const limBad: FreedomDapp.FilesLimits = { ...lim, poolBytes: 1 };
  // Publication records are keyed by provider id (providers/files.md §8.6).
  const pub = await d.files.setPublication({ root: "shared", name: "a.json", provider: "swarm", ref: "ab".repeat(32) });
  const swarmRef: string | undefined = pub.publications?.swarm?.ref;
  d.on("files:changed", (e) => { if (e.kind === "published") { const p: string | undefined = e.publication?.provider; void p; } });
  // @ts-expect-error the old single-provider field is gone
  const oldField = pub.published;
  // The identity vault: state method and event (SPEC.md §6.11).
  const idState: FreedomDapp.IdentityState = await d.getIdentityState();
  d.on("identityChanged", (e) => { const l: boolean = e.locked && e.sealed && e.exists; void l; });
  const reason: FreedomDapp.CoreReason = "no_identity";
  void [held, first, blob, n, pool, m, why, badWhy, limBad, swarmRef, oldField, idState, reason];
}
main();
