#!/usr/bin/env node
// Signs and verifies freedom-manifest/2 files (SPEC.md §4.6). No dependencies.
//
//   node tools/sign-manifest.js --keygen --out dapp.key
//       writes a fresh 32-byte Ed25519 seed as 64 hex characters; keep it private
//   node tools/sign-manifest.js <manifest.json> --key dapp.key [--out signed.json]
//       adds `publicKey` and `signature`; without --out the file is rewritten in place
//   node tools/sign-manifest.js <manifest.json> --key new.key --rotate-from old.key
//       also adds `rotation`, the old key's endorsement of the new one (SPEC.md §4.6)
//   node tools/sign-manifest.js <manifest.json> --verify
//       exit 0 when the signature (and any rotation) verifies, 1 when not, 2 when unsigned
//   node tools/sign-manifest.js --selftest
//       keygen, sign, verify and a tamper check, all in memory
//
// What is signed: the RFC 8785 (JCS) canonical JSON of the manifest object
// with the `signature` field removed and `publicKey` present. `publicKey`
// is the 32-byte Ed25519 public key and `signature` the 64-byte Ed25519
// signature, both as multibase base58btc (`z…`).
//
// NOTE ON THE SCHEME. Ed25519 over RFC 8785 is the signing scheme of
// specVersion 1. It is subject to being swapped for a different scheme in a
// later version of the specification (for example to share keys with a
// name system or a wallet); the manifest's `publicKey` and `signature`
// fields are the stable part, the algorithm behind them is not. Build
// pipelines should call this tool rather than re-implement the maths.

'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

// ---- RFC 8785 canonical JSON -------------------------------------------

function canonicalize(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number in manifest');
    return JSON.stringify(value); // ES6 Number::toString, as JCS requires
  }
  if (typeof value === 'string') return JSON.stringify(value); // JCS escaping == JSON.stringify
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    // JCS orders keys by UTF-16 code units, which is the default string sort.
    const keys = Object.keys(value).sort();
    return `{${keys
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(',')}}`;
  }
  throw new Error(`cannot canonicalize a ${typeof value}`);
}

// ---- multibase base58btc ----------------------------------------------

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

function base58Decode(str) {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  const bytes = [0];
  for (let i = zeros; i < str.length; i++) {
    let carry = ALPHABET.indexOf(str[i]);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return Buffer.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

function multibaseEncode(bytes) {
  return `z${base58Encode(bytes)}`;
}

function multibaseDecode(str) {
  if (typeof str !== 'string' || str[0] !== 'z') return null;
  return base58Decode(str.slice(1));
}

// ---- Ed25519 via node:crypto ------------------------------------------

// DER prefixes: Ed25519 SubjectPublicKeyInfo (RFC 8410) + 32 raw key bytes,
// and Ed25519 PKCS#8 private key + the 32-byte seed.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function signedBytes(manifest) {
  const copy = { ...manifest };
  delete copy.signature;
  return Buffer.from(canonicalize(copy), 'utf8');
}

function keyFromSeed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('seed must be 32 bytes');
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seed)]),
    format: 'der',
    type: 'pkcs8',
  });
  const spki = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return { privateKey, publicKey: multibaseEncode(spki.subarray(spki.length - 32)) };
}

/** With `rotateFrom` (the previous seed) the result also carries `rotation`: the old key's endorsement of the new one. */
function signManifest(manifest, seed, rotateFrom) {
  const { privateKey, publicKey } = keyFromSeed(seed);
  const withKey = { ...manifest, publicKey };
  delete withKey.signature;
  if (rotateFrom) {
    const old = keyFromSeed(rotateFrom);
    if (old.publicKey === publicKey) throw new Error('--rotate-from names the same key');
    withKey.rotation = {
      from: old.publicKey,
      signature: multibaseEncode(crypto.sign(null, Buffer.from(publicKey, 'utf8'), old.privateKey)),
    };
  }
  const signature = crypto.sign(null, signedBytes(withKey), privateKey);
  return { ...withKey, signature: multibaseEncode(signature) };
}

/** `{ ok: true, publicKey }`, `{ ok: false, reason }`, or `{ ok: false, reason: 'unsigned' }`. */
function verifyManifest(manifest) {
  if (manifest.publicKey === undefined && manifest.signature === undefined) {
    return { ok: false, reason: 'unsigned' };
  }
  const pk = multibaseDecode(manifest.publicKey);
  const sig = multibaseDecode(manifest.signature);
  if (!pk || pk.length !== 32) return { ok: false, reason: 'bad_public_key' };
  if (!sig || sig.length !== 64) return { ok: false, reason: 'bad_signature' };
  try {
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, pk]),
      format: 'der',
      type: 'spki',
    });
    const ok = crypto.verify(null, signedBytes(manifest), keyObject, sig);
    if (!ok) return { ok: false, reason: 'mismatch' };
    if (manifest.rotation !== undefined) {
      const r = verifyRotation(manifest);
      if (!r.ok) return r;
      return { ok: true, publicKey: manifest.publicKey, rotatedFrom: manifest.rotation.from };
    }
    return { ok: true, publicKey: manifest.publicKey };
  } catch {
    return { ok: false, reason: 'verify_failed' };
  }
}

/** Checks `rotation` on its own: the old key's signature over the new `publicKey` string. */
function verifyRotation(manifest) {
  const r = manifest.rotation;
  if (!r || typeof r !== 'object') return { ok: false, reason: 'bad_rotation' };
  const from = multibaseDecode(r.from);
  const sig = multibaseDecode(r.signature);
  if (!from || from.length !== 32 || !sig || sig.length !== 64) return { ok: false, reason: 'bad_rotation' };
  try {
    const keyObject = crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, from]), format: 'der', type: 'spki' });
    const ok = crypto.verify(null, Buffer.from(manifest.publicKey, 'utf8'), keyObject, sig);
    return ok ? { ok: true } : { ok: false, reason: 'rotation_mismatch' };
  } catch {
    return { ok: false, reason: 'bad_rotation' };
  }
}

module.exports = { canonicalize, signManifest, verifyManifest, verifyRotation, signedBytes, multibaseEncode, multibaseDecode };

// ---- CLI ------------------------------------------------------------------

function usage(code) {
  const lines = fs
    .readFileSync(__filename, 'utf8')
    .split('\n')
    .slice(1, 13)
    .map((l) => l.replace(/^\/\/ ?/, ''));
  (code ? console.error : console.log)(lines.join('\n'));
  process.exit(code);
}

function readSeed(file) {
  const hex = fs.readFileSync(file, 'utf8').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${file}: expected 64 hex characters`);
  return Buffer.from(hex, 'hex');
}

function selftest() {
  const manifest = {
    schema: 'freedom-manifest/2',
    name: 'Selftest',
    description: 'Signs and verifies in memory.',
    icon: 'icon.png',
    version: '1.0.0',
    capabilities: { files: { private: { why: 'Keeps your notes.' } } },
  };
  const seed = crypto.randomBytes(32);
  const signed = signManifest(manifest, seed);
  const v = verifyManifest(signed);
  if (!v.ok) throw new Error(`verify failed: ${v.reason}`);
  const tampered = { ...signed, version: '1.0.1' };
  if (verifyManifest(tampered).ok) throw new Error('tampered manifest verified');
  const reordered = JSON.parse(canonicalize(signed));
  if (!verifyManifest(reordered).ok) throw new Error('canonical re-serialisation did not verify');
  if (verifyManifest(manifest).reason !== 'unsigned') throw new Error('unsigned not reported');
  if (!/^z[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(signed.publicKey)) throw new Error('publicKey shape');
  if (!/^z[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signed.signature)) throw new Error('signature shape');
  const seed2 = crypto.randomBytes(32);
  const rotated = signManifest({ ...manifest, version: '2.0.0' }, seed2, seed);
  const rv = verifyManifest(rotated);
  if (!rv.ok || rv.rotatedFrom !== signed.publicKey) throw new Error('rotation did not verify');
  const forged = { ...rotated, rotation: { ...rotated.rotation, from: signed.publicKey.slice(0, -1) + '2' } };
  if (verifyRotation(forged).ok) throw new Error('forged rotation verified');
  console.log(`selftest ok: publicKey ${signed.publicKey}, rotated to ${rotated.publicKey}`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keygen' || a === '--verify' || a === '--selftest' || a === '--help' || a === '-h') opt[a.slice(2)] = true;
    else if (a === '--key' || a === '--out' || a === '--rotate-from') opt[a.slice(2)] = argv[++i];
    else if (a.startsWith('-')) usage(2);
    else opt.positional.push(a);
  }
  if (opt.help || opt.h) usage(0);
  try {
    if (opt.selftest) {
      selftest();
    } else if (opt.keygen) {
      const seed = crypto.randomBytes(32).toString('hex');
      if (!opt.out) {
        console.log(seed);
      } else {
        fs.writeFileSync(opt.out, seed + '\n', { mode: 0o600 });
        console.log(`wrote seed to ${opt.out} (keep it private)`);
      }
    } else {
      const [input] = opt.positional;
      if (!input) usage(2);
      const manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
      if (opt.verify) {
        const v = verifyManifest(manifest);
        if (v.ok) {
          console.log(v.rotatedFrom ? `ok: signed by ${v.publicKey}, rotated from ${v.rotatedFrom}` : `ok: signed by ${v.publicKey}`);
        } else {
          console.log(v.reason === 'unsigned' ? 'unsigned' : `FAILED: ${v.reason}`);
          process.exit(v.reason === 'unsigned' ? 2 : 1);
        }
      } else {
        if (!opt.key) usage(2);
        const signed = signManifest(manifest, readSeed(opt.key), opt['rotate-from'] ? readSeed(opt['rotate-from']) : undefined);
        fs.writeFileSync(opt.out || input, JSON.stringify(signed, null, 2) + '\n');
        console.log(`signed ${opt.out || input} with publicKey ${signed.publicKey}${signed.rotation ? `, rotated from ${signed.rotation.from}` : ''}`);
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
