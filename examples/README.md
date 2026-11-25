# Example dapps

One minimal static dapp per provider. Each is a conformance fixture for its
provider document's §11 checklist: open it in Freedom, press **Add** on the
consent sheet, press **Run**, and read the table. Rows marked *manual* need
the user to look at the Dapps pane, the details page or `freedom://files`;
the page cannot see those.

| Folder | Exercises | Needs |
|---|---|---|
| `safe/` | every `safe_*` method: JSON and byte values, conditional writes, key rules, the three quota errors, listing and paging | nothing beyond Freedom |
| `files/` | every `files_*` method: the shared and private marks, type-named queries, conditional writes, quota and type errors, change events, relinquish | nothing beyond Freedom |
| `swarm/` | the four Swarm rows on the unified sheet, publish, feeds, the publication record written on a stored file | a running Bee node with a usable postage batch |
| `radicle/` | the two Radicle rows, seed records, unseed prompting rules | the Radicle integration enabled; a public RID to seed |

Every example is plain HTML and JavaScript with relative paths, so it can be
served from any dapp scheme unchanged:

- **Development realm** (fastest): turn on the developer setting in the
  Dapps pane's Developer settings group, run `node examples/serve.js`
  (port 8767 by default) and open `http://safe.localhost:8767/`,
  `http://files.localhost:8767/`, `http://swarm.localhost:8767/` or
  `http://radicle.localhost:8767/`. The
  server maps each `<folder>.localhost` host to `examples/<folder>/`, so
  every example is its own origin with its own manifest at the root and
  its own dapp key (`dev:safe:8767`, `dev:files:8767`, `dev:swarm:8767`,
  `dev:radicle:8767`;
  the port is part of a dev key, SPEC.md §3.6). A plain
  one-folder server such as `python3 -m http.server` cannot do this: every
  `*.localhost` label would share one root and one manifest. Chromium
  resolves `*.localhost` to loopback by itself; no hosts entry is needed.
- **Swarm**: publish the folder with Freedom's publish tools
  (`swarm_publishFiles` with `indexDocument: "index.html"`), open the
  resulting `bzz://<reference>/`. A raw reference fetches its manifest once
  (SPEC.md §4.7); the reference check still runs but always matches
  (SPEC.md §3.3), so no update notice can appear.
- **IPFS**: `ipfs add -r --cid-version 1 files/` and open
  `ipfs://<cid>/`.

Each manifest validates against `schemas/freedom-manifest-2.schema.json`
(`python3 tools/check-schemas.py .` also checks these four files). The
icons are 32 × 32 PNGs well under the 16 KiB cap.

The pages use `window.dapp` as `types/dapp.d.ts` declares it. Until a host
ships it, every row reads *skipped: window.dapp absent*; that is the
expected result in today's Freedom.
