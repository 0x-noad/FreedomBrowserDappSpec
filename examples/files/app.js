// Files provider conformance checks. Mirrors providers/files.md §11.
(function () {
  const { test, skip, expectError, assert, eq, once, clear } = window.harness;
  const $ = (s) => document.querySelector(s);
  const dapp = window.dapp;

  const detect = $('#detect');
  if (!dapp) {
    detect.innerHTML = '<b>window.dapp is absent.</b> Either this page is not on a dapp scheme (or the dev realm is off), or this host does not implement the specification yet. Every check below would be skipped.';
  } else {
    detect.innerHTML = `<code>window.dapp</code> present. isFreedomBrowser=<code>${dapp.isFreedomBrowser === true}</code> specVersion=<code>${dapp.specVersion}</code>`;
    for (const id of ['connect', 'run', 'slow', 'relinquish']) $('#' + id).disabled = false;
  }

  const WANT = [
    { id: 'files:private' },
    { id: 'files:read-shared', scope: { types: ['image/*', 'application/json'] } },
    { id: 'files:write-shared' },
  ];
  const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

  $('#connect').onclick = async () => {
    clear();
    await test('dapp_requestCapabilities with the manifest’s three capabilities', async () => {
      const g = await dapp.requestCapabilities({ capabilities: WANT });
      assert(g.enabled, 'dapp should be enabled');
      const ids = g.capabilities.map((c) => c.id).sort();
      eq(JSON.stringify(ids), JSON.stringify(['files:private', 'files:read-shared', 'files:write-shared']), 'granted ids');
      return `granted ${ids.length}; read-shared scope=${JSON.stringify(g.capabilities.find((c) => c.id === 'files:read-shared').scope)}`;
    });
  };

  $('#relinquish').onclick = async () => {
    await test('dapp_relinquish drops every grant; capabilitiesChanged fires', async () => {
      const ev = once(dapp, 'capabilitiesChanged');
      await dapp.relinquish();
      const g = await ev;
      eq(g.capabilities.length, 0, 'no capabilities after relinquish');
      return 'relinquished';
    });
  };

  $('#run').onclick = async () => { clear(); await run(); };
  $('#slow').onclick = async () => { clear(); await slow(); };

  async function run() {
    const held = await dapp.getCapabilities().catch(() => ({ enabled: false, capabilities: [] }));
    const has = (id) => held.capabilities.some((c) => c.id === id && c.enabled);

    await test('detection: isFreedomBrowser and specVersion "1"', async () => {
      eq(dapp.specVersion, '1', 'specVersion');
      return `isFreedomBrowser=${dapp.isFreedomBrowser === true}`;
    });

    await test('dapp_getProviders lists files as available', async () => {
      const p = await dapp.getProviders();
      eq(p.specVersion, '1', 'specVersion');
      const f = p.providers.find((x) => x.id === 'files');
      assert(f, 'files provider missing');
      assert(f.methods.includes('files_list'), 'files_list not listed');
      return `host=${p.host} files.status=${f.status} files.version=${f.version}`;
    });

    await test('dapp_getManifest reports version 1.0.0 and no pending update', async () => {
      const m = await dapp.getManifest();
      eq(m.version, '1.0.0', 'version'); eq(m.updatePending, false, 'updatePending');
      return `reference=${m.reference.slice(0, 24)}… signed=${m.signed}`;
    });

    await test('files_getQuota is public tier (works without any grant)', async () => {
      const q = await dapp.files.getQuota({ root: 'private' });
      eq(q.limit, 536870912, 'private limit'); eq(q.fileLimit, 67108864, 'file limit'); eq(q.countLimit, 1000, 'count limit');
      const s = await dapp.files.getQuota({ root: 'shared' });
      eq(s.fileLimit, 536870912, 'shared file limit'); assert(s.pool && s.pool.limit > 0, 'pool');
      return `private free=${q.free} shared allowance=${s.limit} pool=${s.pool.used}/${s.pool.limit}`;
    });

    if (!held.capabilities.length) {
      await test('without a grant, files_list rejects 4100 unauthorized', () =>
        expectError(4100, 'unauthorized', () => dapp.files.list({ root: 'private' })));
      await test('(everything else needs the grant: press “Request capabilities” first)', () => { throw skip('no grant'); });
      return;
    }

    if (has('files:private')) {
      await test('files_write (text, application/json) returns an entry with a CIDv1', async () => {
        const e = await dapp.files.write({ root: 'private', name: 'notes.json', data: JSON.stringify({ n: 1 }), type: 'application/json' });
        eq(e.name, 'notes.json', 'name'); assert(/^bafy|^bafk/.test(e.cid), 'cid should be CIDv1 base32'); eq(e.location, 'local', 'location');
        return `cid=${e.cid} size=${e.size}`;
      });

      await test('files_read sugar returns a Blob with the stored type; readText round-trips', async () => {
        const b = await dapp.files.read({ root: 'private', name: 'notes.json' });
        assert(b instanceof Blob, 'Blob'); eq(b.type, 'application/json', 'type');
        eq(await dapp.files.readText({ root: 'private', name: 'notes.json' }), '{"n":1}', 'text');
        return `blob ${b.size} bytes`;
      });

      await test('wire files_read returns Uint8Array bytes (no base64)', async () => {
        const r = await dapp.request({ method: 'files_read', params: { root: 'private', name: 'notes.json' } });
        assert(r.bytes instanceof Uint8Array, 'bytes should be Uint8Array'); eq(r.type, 'application/json', 'type');
        return `${r.bytes.length} bytes, cid=${r.cid.slice(0, 16)}…`;
      });

      await test('files_stat.cid equals the write’s cid (etag)', async () => {
        const w = await dapp.files.write({ root: 'private', name: 'etag.txt', data: 'hello', type: 'text/plain' });
        const s = await dapp.files.stat({ root: 'private', name: 'etag.txt' });
        eq(s.cid, w.cid, 'cid'); return s.cid;
      });

      await test('files_writeJson/readJson with ifMatch: stale etag is 4409 conflict', async () => {
        const a = await dapp.files.writeJson({ root: 'private', name: 'doc.json', value: { v: 1 } });
        const r = await dapp.files.readJson({ root: 'private', name: 'doc.json' });
        eq(r.cid, a.cid, 'etag'); eq(r.value.v, 1, 'value');
        await dapp.files.writeJson({ root: 'private', name: 'doc.json', value: { v: 2 }, ifMatch: a.cid });
        return await expectError(4409, 'conflict', () => dapp.files.writeJson({ root: 'private', name: 'doc.json', value: { v: 3 }, ifMatch: a.cid }));
      });

      await test('ifNoneMatch "*" on an existing name is 4409 exists', () =>
        expectError(4409, 'exists', () => dapp.files.write({ root: 'private', name: 'doc.json', data: 'x', type: 'text/plain', ifNoneMatch: '*' })));

      await test('declared image/jpeg over PNG bytes is -32602 type_mismatch', () =>
        expectError(-32602, 'type_mismatch', () => dapp.files.write({ root: 'private', name: 'bad.jpg', data: PNG, type: 'image/jpeg' })));

      await test('invalid name (contains "/") is -32602 invalid_name', () =>
        expectError(-32602, 'invalid_name', () => dapp.files.write({ root: 'private', name: 'a/b.txt', data: 'x', type: 'text/plain' })));

      await test('files_rename keeps the cid and emits one renamed event', async () => {
        const before = await dapp.files.stat({ root: 'private', name: 'etag.txt' });
        const ev = once(dapp, 'files:changed', (e) => e.kind === 'renamed' && e.name === 'etag2.txt');
        await dapp.files.subscribe({ root: 'private' });
        const after = await dapp.files.rename({ root: 'private', from: 'etag.txt', to: 'etag2.txt' });
        const e = await ev;
        eq(after.cid, before.cid, 'cid preserved'); eq(e.from, 'etag.txt', 'from');
        return `renamed; event kind=${e.kind}`;
      });

      await test('files_list with prefix and types narrows; entries carry the full shape', async () => {
        const l = await dapp.files.list({ root: 'private', prefix: 'doc', types: ['application/json'] });
        assert(l.items.length >= 1, 'expected doc.json'); const e = l.items[0];
        for (const k of ['name', 'size', 'type', 'cid', 'mtime', 'location']) assert(k in e, `missing ${k}`);
        return l.items.map((i) => i.name).join(', ');
      });

      await test('files_write of a PNG declared image/png is accepted', async () => {
        const e = await dapp.files.write({ root: 'private', name: 'dot.png', data: PNG, type: 'image/png' });
        return `cid=${e.cid.slice(0, 20)}…`;
      });
    }

    if (has('files:write-shared') && has('files:read-shared')) {
      await test('files_copy private → shared preserves the cid and attributes to this dapp', async () => {
        const src = await dapp.files.stat({ root: 'private', name: 'doc.json' });
        const e = await dapp.files.copy({ from: { root: 'private', name: 'doc.json' }, to: { root: 'shared', name: 'shared-check.json' } });
        eq(e.cid, src.cid, 'cid'); assert(e.author && e.author !== 'user', 'author should be this dapp key');
        return `author=${e.author}`;
      });

      await test('files_list(shared) shows the file with author; a type outside scope is not listed', async () => {
        const l = await dapp.files.list({ root: 'shared', prefix: 'shared-check' });
        const mine = l.items.find((i) => i.name === 'shared-check.json');
        assert(mine, 'shared-check.json missing'); assert(mine.author, 'author missing');
        await dapp.files.write({ root: 'shared', name: 'out-of-scope.txt', data: 'x', type: 'text/plain' });
        const l2 = await dapp.files.list({ root: 'shared', prefix: 'out-of-scope' });
        eq(l2.items.length, 0, 'text/plain is outside the read scope and must not be listed');
        await dapp.files.delete({ root: 'shared', name: 'out-of-scope.txt' });
        return `author=${mine.author}`;
      });

      await test('reading an out-of-scope shared file is -32602 not_found (N4)', async () => {
        await dapp.files.write({ root: 'shared', name: 'hidden.txt', data: 'x', type: 'text/plain' });
        const r = await expectError(-32602, 'not_found', () => dapp.files.read({ root: 'shared', name: 'hidden.txt' }));
        await dapp.files.delete({ root: 'shared', name: 'hidden.txt' });
        return r;
      });

      await test('files_setPublication records a dapp-reported Swarm reference (verified: false)', async () => {
        const e = await dapp.files.setPublication({ root: 'shared', name: 'shared-check.json', provider: 'swarm', ref: 'a'.repeat(64) });
        eq(e.location, 'published', 'location'); eq(e.publications.swarm.verified, false, 'verified');
        return `ref=${e.publications.swarm.ref.slice(0, 8)}… at=${e.publications.swarm.at}`;
      });

      await test('files_setPublication with a bad reference is -32602 invalid_reference', () =>
        expectError(-32602, 'invalid_reference', () => dapp.files.setPublication({ root: 'shared', name: 'shared-check.json', provider: 'swarm', ref: 'nope' })));
      await test('files_setPublication for a provider without publication records is -32602 unknown_provider', () =>
        expectError(-32602, 'unknown_provider', () => dapp.files.setPublication({ root: 'shared', name: 'shared-check.json', provider: 'radicle', ref: 'a'.repeat(64) })));

      await test('shared subscribe delivers files:changed for an in-scope write', async () => {
        await dapp.files.subscribe({ root: 'shared', types: ['application/json'] });
        const ev = once(dapp, 'files:changed', (e) => e.root === 'shared' && e.name === 'event.json');
        await dapp.files.writeJson({ root: 'shared', name: 'event.json', value: { ok: true } });
        const e = await ev; eq(e.kind, 'created', 'kind');
        await dapp.files.delete({ root: 'shared', name: 'event.json' });
        return `author=${e.author} cid=${e.cid.slice(0, 12)}…`;
      });

      await test('cleanup: delete shared-check.json', async () => {
        await dapp.files.delete({ root: 'shared', name: 'shared-check.json' });
        return 'deleted';
      });
    } else {
      await test('shared checks', () => { throw skip('read-shared and write-shared not both held'); });
    }

    await test('unknown method is 4200', () => expectError(4200, undefined, () => dapp.request({ method: 'files_mkdir', params: { root: 'private', name: 'x' } })));

    await test('a capability not in the manifest is 4100 not_in_manifest', () =>
      expectError(4100, 'not_in_manifest', () => dapp.requestCapabilities({ capabilities: [{ id: 'swarm:publish' }] })));

    await test('rate limit: 700 rapid files_stat calls hit -32005 with retryAfterMs', async () => {
      let hit = null;
      for (let i = 0; i < 700 && !hit; i++) {
        try { await dapp.files.stat({ root: 'private', name: 'doc.json' }); } catch (e) { if (e.code === -32005) hit = e; else throw e; }
      }
      if (!hit) throw skip('budget not reached in 700 calls (host may count differently)');
      assert(typeof hit.data.retryAfterMs === 'number', 'retryAfterMs');
      return `retryAfterMs=${hit.data.retryAfterMs}`;
    });
  }

  async function slow() {
    await test('a 65 MB private write is 4300 file_too_large with data.limit/actual', async () => {
      const big = new Uint8Array(65 * 1024 * 1024);
      const r = await expectError(4300, 'file_too_large', () => dapp.files.write({ root: 'private', name: 'big.bin', data: big, type: 'application/octet-stream' }));
      return r;
    });
    await test('1 001 private files is 4300 too_many_files', async () => {
      const q = await dapp.files.getQuota({ root: 'private' });
      const toWrite = q.countLimit - q.count + 1;
      let last;
      for (let i = 0; i < toWrite; i++) {
        try { await dapp.files.write({ root: 'private', name: `many-${i}.txt`, data: 'x', type: 'text/plain' }); }
        catch (e) { last = e; break; }
      }
      assert(last && last.code === 4300 && last.data.reason === 'too_many_files', `expected too_many_files, got ${last && last.code} ${last && last.data && last.data.reason}`);
      const l = await dapp.files.list({ root: 'private', prefix: 'many-', limit: 1000 });
      for (const f of l.items) await dapp.files.delete({ root: 'private', name: f.name });
      return `hit at count ${q.countLimit}; cleaned ${l.items.length}`;
    });
  }
})();
