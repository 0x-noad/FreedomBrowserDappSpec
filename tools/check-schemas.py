# Checks the four JSON Schemas compile, composes them, parses registry.json, and
# runs accept/reject cases against freedom-manifest-2.schema.json.
# Usage: python3 tools/check-schemas.py <repo root>   (needs: pip install jsonschema)
import json, sys, copy
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

root = Path(sys.argv[1])
def load(rel): return json.loads((root/rel).read_text())
schemas = {
  "schemas/freedom-manifest-2.schema.json": load("schemas/freedom-manifest-2.schema.json"),
  "schemas/providers/files.schema.json": load("schemas/providers/files.schema.json"),
  "schemas/providers/swarm.schema.json": load("schemas/providers/swarm.schema.json"),
  "schemas/providers/radicle.schema.json": load("schemas/providers/radicle.schema.json"),
}
for s in schemas.values(): Draft202012Validator.check_schema(s)
reg = Registry()
for s in schemas.values():
    reg = reg.with_resource(s["$id"], Resource.from_contents(s, default_specification=DRAFT202012))
v = Draft202012Validator(schemas["schemas/freedom-manifest-2.schema.json"], registry=reg)
json.loads((root/"registry.json").read_text())

good = {
  "schema": "freedom-manifest/2", "name": "Notebook",
  "description": "Encrypted notes you can share with other dapps.",
  "icon": "./icon.png", "version": "1.4.0",
  "capabilities": {
    "files": {"private": {"why": "Stores your notes on this device."},
              "read-shared": {"why": "Imports images other dapps shared."},
              "write-shared": {"why": "Shares notes you export."}},
    "swarm": {"publish": {"why": "Publishes a note as a page when you ask."}},
    "radicle": {"node": {"why": "Seeds repos."}, "signing": {"why": "Files issues."}}
  }
}
minimal = {"schema": "freedom-manifest/2", "name": "Hello", "description": "A static page.",
           "icon": "./icon.png", "version": "0.1.0", "capabilities": {}}
web3 = dict(minimal, icon="data:image/png;base64,iVBORw0KGgo=")
signed = dict(minimal, publicKey="z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", signature="z"+"3"*88)
unknown_provider = dict(minimal, capabilities={"messaging": {"inbox": {"why": "Receives mail."}}})
optional = dict(minimal, homepage="https://example.org", source="rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5", author={"name": "Ada", "url": "https://ada.example"}, minSpecVersion="1")

cases_ok = {"full": good, "minimal": minimal, "web3 inline icon": web3, "signed": signed,
            "editor $schema": dict(minimal, **{"$schema": "https://freedom.example/schemas/freedom-manifest-2.schema.json"}),
            "unknown provider": unknown_provider, "optional fields": optional,
            "reserved-but-unknown provider ipfs": dict(minimal, capabilities={"ipfs": {"pin": {"why": "Pins your files."}}}),
            "reserved-but-unknown provider ethereum": dict(minimal, capabilities={"ethereum": {"accounts": {"why": "x"}}})}
def bad(**kw):
    d = copy.deepcopy(minimal); d.update(kw); return d
cases_bad = {
  "unknown field": bad(quota=1),
  "name 33 chars": bad(name="x"*33),
  "author.name 65 chars": bad(author={"name": "a"*65}),
  "wrong schema id": bad(schema="freedom-manifest/1"),
  "publicKey without signature": bad(publicKey="z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"),
  "rotation without publicKey": bad(rotation={"from": "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", "signature": "z" + "2" * 88}),
  "rotation missing signature": bad(rotation={"from": "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"}, publicKey="z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", signature="z" + "2" * 88),
  "reserved key dapp": bad(capabilities={"dapp": {"x": {"why": "x"}}}),
  "swarm unknown row": bad(capabilities={"swarm": {"pin": {"why": "x"}}}),
  "swarm empty block": bad(capabilities={"swarm": {}}),
    "files empty block": bad(capabilities={"files": {}}),
  "files row without why": bad(capabilities={"files": {"private": {}}}),
  "files read-shared takes no scope": bad(capabilities={"files": {"read-shared": {"why": "x", "scope": {"types": ["image/*"]}}}}),
  "why too long": bad(capabilities={"files": {"private": {"why": "w"*141}}}),
  "icon absolute path": bad(icon="/icon.png"),
  "icon dotdot": bad(icon="../icon.png"),
  "icon svg data uri": bad(icon="data:image/svg+xml;base64,PHN2Zz4="),
  "icon http url": bad(icon="https://x.example/i.png"),
  "source not rad or uri": bad(source="not a url"),
  "minSpecVersion zero": bad(minSpecVersion="0"),
}
fails = 0
for name, doc in cases_ok.items():
    errs = sorted(v.iter_errors(doc), key=str)
    print(("OK  " if not errs else "FAIL") + f" accept: {name}" + ("" if not errs else "  -> " + "; ".join(e.message[:90] for e in errs)))
    fails += bool(errs)
for name, doc in cases_bad.items():
    errs = list(v.iter_errors(doc))
    print(("OK  " if errs else "FAIL") + f" reject: {name}" + (f"  ({errs[0].message[:70]})" if errs else ""))
    fails += not errs
print("FAILURES:", fails)

# Example manifests must validate too.
for ex in ["files", "swarm", "radicle"]:
    doc = json.loads((root / "examples" / ex / "freedom-manifest.json").read_text())
    errs = list(v.iter_errors(doc))
    print(("OK  " if not errs else "FAIL") + f" example manifest: {ex}" + ("" if not errs else "  -> " + "; ".join(e.message[:90] for e in errs)))
    fails += bool(errs)
print("FAILURES (incl. examples):", fails)
