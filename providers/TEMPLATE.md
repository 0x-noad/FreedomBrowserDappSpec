# Provider: `<id>` — <Display name>

> Copy this file to `providers/<id>.md`. Keep the eleven sections in this
> order; delete nothing, write "none" where a section has nothing to say.
> Everything not stated here is inherited from `SPEC.md` §7 (wire, naming,
> events, binary, pagination, jobs, timeouts, rate limits, errors) and bound
> by `SPEC.md` §11 (security rules). A provider document may tighten a core
> convention; it may never weaken §11.

## 1. Identity

| Field | Value |
|---|---|
| id | `<id>` — the method prefix (`<id>_<verb>`), the manifest key (`capabilities.<id>`), the capability prefix (`<id>:<name>`) and the event prefix (`<id>:<event>`) |
| display name | <Name shown on the consent sheet and the details page> |
| surface | `window.dapp` (this specification) or `window.<global>` (as shipped) |
| status | `experimental` \| `stable` |
| since | core `specVersion` `<n>` |
| version | `<provider version string>`, reported by `dapp_getProviders` |

## 2. Host dependencies

- **Subsystem.** <Which node, service or key material the provider needs.>
- **When absent.** <What the dapp sees: `4900` with which `data.reason`
  values, and what `dapp_getProviders` reports as `status`.>
- **Identity vault.** <Which capabilities need the vault unlocked, so that
  `SPEC.md` §6.11 applies to them; "none" if none. The vault's existence
  is required for every grant by the core, not by the provider.>
- **Offline.** <What works with no network (`SPEC.md` §1.5).>
- **Other providers.** <Each provider this one integrates with, by id,
  the pattern of `SPEC.md` §12.5 it uses, and what happens when that
  provider is absent or unavailable; "none" if none.>

## 3. Capabilities

| id | tier | scope shape | always-allow eligible | consent-sheet string |
|---|---|---|---|---|
| `<id>:<name>` | `public` \| `consent` \| `per-call` | `none` or a JSON shape | yes \| no \| never | "<plain words the sheet shows above the manifest `why`>" |

Notes: <what each capability unlocks; which are never auto-approvable
(`SPEC.md` §6.2); how scopes narrow results (`SPEC.md` §6.3).>

## 4. Methods

| method | params | returns | requires | user gesture | rate limit | timeout |
|---|---|---|---|---|---|---|
| `<id>_<verb>` | `{ … }` | `{ … }` | `<id>:<name>` (or `public`) | yes \| no | <per `SPEC.md` §7.12> | <per `SPEC.md` §7.11> |

A provider documented *as shipped* (its own global, `SPEC.md` §12.1) MAY
fill `params` and `returns` with a reference to the upstream document that
defines them, but MUST keep every other column.

Sugar: `window.dapp.<id>.<verb>(params)`, generated from this table, with
the binary conversions of `SPEC.md` §7.7 unless §7 below says otherwise.
Long-running methods return `{ jobId }` and report through the core job
events (`SPEC.md` §7.10).

## 5. Events

| event | payload | needs |
|---|---|---|
| `<id>:<event>` | `{ … }` | `<id>:<name>` (the capability a dapp must hold to receive it) |

Subscription methods, if any, and their per-document limits.

## 6. Manifest block

The JSON Schema of `capabilities.<id>`, published as
`schemas/providers/<id>.schema.json` and composed into
`schemas/freedom-manifest-2.schema.json`. Show it here:

```json
{
  "$id": "…/schemas/providers/<id>.schema.json",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "<name>": {
      "type": "object",
      "additionalProperties": false,
      "required": ["why"],
      "properties": {
        "why": { "type": "string", "maxLength": 140 },
        "scope": { "…": "…" }
      }
    }
  }
}
```

## 7. Errors

`data.reason` strings this provider adds, each under the core code it
belongs to (`SPEC.md` §7.13). No new numeric codes, except that a provider
documented *as shipped* lists the codes and event names it already emits
as legacy exceptions.

| code | reason | when |
|---|---|---|
| `4100` | … | … |
| `4300` | … | … |
| `4900` | … | … |
| `-32602` | … | … |

Binary or other conventions that differ from `SPEC.md` §7: <state them, or
"none">.

## 8. Storage and quota

- **What is stored per dapp key**, and where in the host's data (opaque,
  encrypted at rest per `SPEC.md` §8.1 where the provider holds dapp bytes).
- **Quota**: the `<id>_getQuota` shape (`SPEC.md` §8.2) and the limits.
- **Accounting**: what the details page and the Dapps pane show for this
  provider (`SPEC.md` §8.3).
- **On revoke**: what ends (subscriptions), what stays (data).
- **On remove** (`SPEC.md` §8.4): what is deleted, what is offered for
  export, what remains and why.

## 9. Surfaces

- **Consent sheet**: the rows this provider contributes, any mandatory
  wording (for example a disclosure the row must carry), and which prompts
  it raises later (per-call prompts, with the material facts they name).
- **Details page**: what this provider shows under **Info** (read-only
  facts and figures) and under **Settings** (every row with a control:
  revoke, unseed, allowance, …). Never a third header (`SPEC.md` §10.4).
- **`freedom://files`**: what this provider puts in each of the
  explorer's four slots (`SPEC.md` §10.5): its publication record (the
  `ref` format and when the host writes one), inspector facts, a per-file
  verb, a panel; or "none".
- **Other pages**: any page or pane section this provider owns.

## 10. Host implementation requirements

Numbered MUST / SHOULD statements for the host, specific to this provider:
main-process service, how the dapp key is applied, isolation, lock
behaviour, offline behaviour, what is logged to the activity log
(`SPEC.md` §6.12), Agent custody (`SPEC.md` §9.2) where writes exist.

*Informative:* where in upstream Freedom this lands (modules to extend).

## 11. Security considerations and conformance checklist

- Threats specific to this provider and how the rules above meet them.
- Which core rules (`SPEC.md` §11) bear most on it.

Conformance checklist (each item testable by the provider's example dapp
under `examples/<id>/`):

- [ ] every method in §4 behaves as specified for a dapp holding the grant;
- [ ] every method rejects `4100 unauthorized` without it;
- [ ] every capability's scope narrows results and nothing outside scope is
      observable;
- [ ] every `data.reason` in §7 is produced by the stated condition;
- [ ] quota and caps in §8 are enforced and reported;
- [ ] the consent-sheet strings in §9 appear verbatim;
- [ ] revoke and remove behave as §8 says;
- [ ] …
