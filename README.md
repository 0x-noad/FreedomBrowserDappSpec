# FreedomBrowserDappSpec

The specification for **dapps in Freedom Browser**: static sites served over
`bzz://`, `ipfs://`, `ipns://` or `web3://` that declare themselves with a
manifest, get a safe and a place for files, private or shared, and use the
user's own
Swarm and Radicle nodes with consent. specVersion `1`, draft 1 (2026-11-19),
written against upstream Freedom v0.8.8.

| File | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | the **core**: identity, manifest, updates, capabilities and grants, `window.dapp`, conventions, surfaces, security rules, the provider model |
| [`providers/TEMPLATE.md`](providers/TEMPLATE.md) | the fixed eleven-section template every provider document follows |
| [`providers/safe.md`](providers/safe.md) | the Safe provider: a per-dapp key-value store locked with the user's identity, seven methods |
| [`providers/files.md`](providers/files.md) | the Files provider: one pool of files, each marked shared or private, fourteen methods, the Freedom Agent controls, `freedom://files` |
| [`providers/swarm.md`](providers/swarm.md) | `window.swarm` as shipped, plus its integration points |
| [`providers/radicle.md`](providers/radicle.md) | `window.radicle` as shipped, plus its integration points and seed records |
| [`schemas/`](schemas/) | `freedom-manifest-2.schema.json`, composed from one schema per provider |
| [`registry.json`](registry.json) | every capability: id, tier, scope, methods, consent string |
| [`types/dapp.d.ts`](types/dapp.d.ts) | page-facing TypeScript types for `window.dapp` |
| [`examples/`](examples/README.md) | one runnable conformance fixture per provider, with `serve.js` (one `<folder>.localhost` origin per fixture) |
| [`AUTHORING.md`](AUTHORING.md) | the guide for dapp authors |
| [`tools/`](tools/) | `check-schemas.py` (schema compile, compose, accept/reject cases, example manifests), `check-types.ts` with `tsconfig.json` (strict type-check fixture), and `sign-manifest.js` (sign, verify or keygen for §4.6; no dependencies) |
| [`LICENSE`](LICENSE) | CC0 1.0: no rights reserved |

Checks:

```bash
python3 tools/check-schemas.py .     # needs: pip install jsonschema
```

```bash
npx -p typescript tsc -p tools
```

```bash
node tools/sign-manifest.js examples/files/freedom-manifest.json --verify
```

```bash
node examples/serve.js
```

Reserved provider prefixes: `ipfs` (a future write surface), `chain` (a
future verified-read surface), `ethereum` (the wallet stays beside the
specification). Adding a provider is one new document under `providers/`
plus its schema and registry rows; the core does not change (`SPEC.md` §12).
