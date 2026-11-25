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

  const WANT = [{ id: 'files:own' }, { id: 'files:read' }];
  const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

  $('#connect').onclick = async () => {
    clear();
    await test('dapp_requestCapabilities with the manifest’s two capabilities', async () => {
      const g = await dapp.requestCapabilities({ capabilities: WANT });
      assert(g.enabled, 'dapp should be enabled');
      const ids = g.capabilities.map((c) => c.id).sort();
      eq(JSON.stringify(ids), JSON.stringify(['files:own', 'files:read']), 'granted ids');
      return `granted ${ids.length}; neither carries a scope: ${g.capabilities.every((c) => c.scope === undefined)}`;
    });
  };

  $('#relinquish').onclick = async () => {
    await test('dapp_relinquish drops every grant; capabilitiesChanged fires', async () => {
      const ev = once(dapp, 'capabilitiesChanged');
      await dapp.relinquish();
      window.__filesSelfSub = null;   // revocation ended it (providers/files.md §8.9)
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

    await test('dapp_getProviders lists files with its 14 methods and its limit', async () => {
      const p = await dapp.getProviders();
      eq(p.specVersion, '1', 'specVersion');
      const f = p.providers.find((x) => x.id === 'files');
      assert(f, 'files provider missing');
      eq(f.methods.length, 14, 'method count');
      for (const m of ['files_list', 'files_setVisibility', 'files_setPublication', 'files_getQuota']) assert(f.methods.includes(m), `${m} not listed`);
      assert(f.status === undefined || f.status === 'available', 'status is absent before the dapp is added, available after');
      eq(f.limits.fileBytes, 536870912, 'limits.fileBytes');
      return `host=${p.host} files.status=${f.status} files.version=${f.version}`;
    });

    await test('dapp_getManifest reports version 1.0.0 and no pending update', async () => {
      const m = await dapp.getManifest();
      eq(m.version, '1.0.0', 'version'); eq(m.updatePending, false, 'updatePending');
      return `reference=${m.reference.slice(0, 24)}… signed=${m.signed}`;
    });

    await test('files_getQuota is public tier (works without any grant)', async () => {
      const q = await dapp.files.getQuota();
      eq(q.fileLimit, 536870912, 'file limit'); assert(q.limit > 0, 'allowance');
      return `allowance=${q.limit} free=${q.free}${q.pool ? ` pool=${q.pool.used}/${q.pool.limit}` : ' (no pool figure without a grant)'}`;
    });

    if (!held.capabilities.length) {
      await test('without a grant, files_list rejects 4100 unauthorized', () =>
        expectError(4100, 'unauthorized', () => dapp.files.list({ author: 'self' })));
      await test('(everything else needs the grant: press “Request capabilities” first)', () => { throw skip('no grant'); });
      return;
    }

    if (has('files:own')) {
      await test('files_write (text, application/json) returns an entry with a CIDv1, shared by default', async () => {
        const e = await dapp.files.write({ name: 'notes.json', data: JSON.stringify({ n: 1 }), type: 'application/json' });
        eq(e.name, 'notes.json', 'name'); assert(/^bafy|^bafk/.test(e.cid), 'cid should be CIDv1 base32');
        eq(e.location, 'local', 'location'); eq(e.visibility, 'shared', 'a new file is shared unless marked');
        assert(e.author && e.author !== 'user', 'author should be this dapp key');
        return `author=${e.author} cid=${e.cid} size=${e.size}`;
      });

      await test('files_write with visibility: private; an overwrite without visibility keeps the mark', async () => {
        const a = await dapp.files.write({ name: 'draft.txt', data: 'one', type: 'text/plain', visibility: 'private' });
        eq(a.visibility, 'private', 'private as asked');
        const b = await dapp.files.write({ name: 'draft.txt', data: 'two', type: 'text/plain' });
        eq(b.visibility, 'private', 'mark kept on overwrite');
        return expectError(-32602, 'invalid_visibility', () => dapp.files.write({ name: 'x.txt', data: 'x', type: 'text/plain', visibility: 'secret' }));
      });

      await test('files_read sugar returns a Blob with the stored type; readText round-trips', async () => {
        const b = await dapp.files.read({ name: 'notes.json' });
        assert(b instanceof Blob, 'Blob'); eq(b.type, 'application/json', 'type');
        eq(await dapp.files.readText({ name: 'notes.json' }), '{"n":1}', 'text');
        return `blob ${b.size} bytes`;
      });

      await test('wire files_read returns Uint8Array bytes (no base64)', async () => {
        const r = await dapp.request({ method: 'files_read', params: { name: 'notes.json' } });
        assert(r.bytes instanceof Uint8Array, 'bytes should be Uint8Array'); eq(r.type, 'application/json', 'type');
        return `${r.bytes.length} bytes, cid=${r.cid.slice(0, 16)}…`;
      });

      await test('files_stat.cid equals the write’s cid (etag)', async () => {
        const w = await dapp.files.write({ name: 'etag.txt', data: 'hello', type: 'text/plain' });
        const s = await dapp.files.stat({ name: 'etag.txt' });
        eq(s.cid, w.cid, 'cid'); return s.cid;
      });

      await test('files_writeJson/readJson with ifMatch: stale etag is 4409 conflict', async () => {
        const a = await dapp.files.writeJson({ name: 'doc.json', value: { v: 1 } });
        const r = await dapp.files.readJson({ name: 'doc.json' });
        eq(r.cid, a.cid, 'etag'); eq(r.value.v, 1, 'value');
        await dapp.files.writeJson({ name: 'doc.json', value: { v: 2 }, ifMatch: a.cid });
        return await expectError(4409, 'conflict', () => dapp.files.writeJson({ name: 'doc.json', value: { v: 3 }, ifMatch: a.cid }));
      });

      await test('ifMatch on a name that does not exist is 4409 conflict', () =>
        expectError(4409, 'conflict', () => dapp.files.write({ name: 'never-written.txt', data: 'x', type: 'text/plain', ifMatch: 'bafkqaaa' })));

      await test('ifNoneMatch "*" on an existing name is 4409 exists', () =>
        expectError(4409, 'exists', () => dapp.files.write({ name: 'doc.json', data: 'x', type: 'text/plain', ifNoneMatch: '*' })));

      await test('declared image/jpeg over PNG bytes is -32602 type_mismatch', () =>
        expectError(-32602, 'type_mismatch', () => dapp.files.write({ name: 'bad.jpg', data: PNG, type: 'image/jpeg' })));

      await test('invalid name (contains "/") is -32602 invalid_name', () =>
        expectError(-32602, 'invalid_name', () => dapp.files.write({ name: 'a/b.txt', data: 'x', type: 'text/plain' })));

      await test('files_rename keeps the cid and the mark and emits one renamed event', async () => {
        const before = await dapp.files.stat({ name: 'etag.txt' });
        if (!window.__filesSelfSub) window.__filesSelfSub = (await dapp.files.subscribe({ author: 'self' })).subscriptionId;
        const ev = once(dapp, 'files:changed', (e) => e.kind === 'renamed' && e.name === 'etag2.txt');
        const after = await dapp.files.rename({ from: 'etag.txt', to: 'etag2.txt' });
        const e = await ev;
        eq(after.cid, before.cid, 'cid preserved'); eq(after.visibility, before.visibility, 'mark preserved'); eq(e.from, 'etag.txt', 'from');
        return `renamed; event kind=${e.kind}`;
      });

      await test('files_setVisibility re-marks an own file; the author’s subscription gets kind "visibility"', async () => {
        const ev = once(dapp, 'files:changed', (e) => e.kind === 'visibility' && e.name === 'etag2.txt');
        const e1 = await dapp.files.setVisibility({ name: 'etag2.txt', visibility: 'private' });
        eq(e1.visibility, 'private', 'now private'); eq((await ev).visibility, 'private', 'event carries the mark');
        const e2 = await dapp.files.setVisibility({ name: 'etag2.txt', visibility: 'shared' });
        eq(e2.visibility, 'shared', 'shared again');
        return 'private, then shared';
      });

      await test('files_list(author: self) lists own files of both marks without types; visibility, prefix and suffix narrow', async () => {
        const all = await dapp.files.list({ author: 'self' });
        assert(all.items.some((i) => i.name === 'draft.txt' && i.visibility === 'private'), 'private file listed');
        assert(all.items.some((i) => i.name === 'notes.json' && i.visibility === 'shared'), 'shared file listed');
        assert(all.items.every((i) => i.author === all.items[0].author), 'one author only');
        const priv = await dapp.files.list({ author: 'self', visibility: 'private' });
        assert(priv.items.every((i) => i.visibility === 'private'), 'visibility narrows');
        const l = await dapp.files.list({ author: 'self', prefix: 'doc', suffix: '.json', types: ['application/json'] });
        assert(l.items.length >= 1, 'expected doc.json'); const e = l.items[0];
        eq((await dapp.files.list({ author: 'self', suffix: '.nope' })).items.length, 0, 'suffix narrows');
        for (const k of ['name', 'author', 'visibility', 'size', 'type', 'cid', 'mtime', 'location']) assert(k in e, `missing ${k}`);
        return `${all.items.length} own file(s), ${priv.items.length} private`;
      });

      await test('files_write of a PNG declared image/png is accepted', async () => {
        const e = await dapp.files.write({ name: 'dot.png', data: PNG, type: 'image/png' });
        return `cid=${e.cid.slice(0, 20)}…`;
      });

      await test('files_copy of an own file preserves the cid and, without visibility, the source’s mark', async () => {
        const src = await dapp.files.stat({ name: 'draft.txt' });
        const kept = await dapp.files.copy({ from: { name: 'draft.txt' }, to: { name: 'draft-copy.txt' } });
        eq(kept.cid, src.cid, 'cid'); eq(kept.visibility, 'private', 'a private file does not become shared by being copied');
        const e = await dapp.files.copy({ from: { name: 'draft.txt' }, to: { name: 'shared-check.txt' }, visibility: 'shared' });
        eq(e.cid, src.cid, 'cid'); eq(e.visibility, 'shared', 'shared when asked');
        return `author=${e.author}`;
      });

      await test('files_setPublication records a dapp-reported Swarm reference (verified: false), on a file of either mark', async () => {
        const e = await dapp.files.setPublication({ name: 'draft.txt', provider: 'swarm', ref: 'a'.repeat(64) });
        eq(e.location, 'published', 'location'); eq(e.publications.swarm.verified, false, 'verified'); eq(e.visibility, 'private', 'mark unchanged');
        return `ref=${e.publications.swarm.ref.slice(0, 8)}… at=${e.publications.swarm.at}`;
      });

      await test('a copy carries no publication records; an overwrite that changes the bytes drops them', async () => {
        const c = await dapp.files.copy({ from: { name: 'draft.txt' }, to: { name: 'pub-copy.txt' } });
        eq(c.location, 'local', 'the copy is unpublished'); assert(!c.publications, 'no records on the copy');
        await dapp.files.delete({ name: 'pub-copy.txt' });
        const w = await dapp.files.write({ name: 'draft.txt', data: 'three', type: 'text/plain' });
        eq(w.location, 'local', 'records dropped with the old bytes'); eq(w.visibility, 'private', 'mark kept');
        return 'records follow the bytes they describe';
      });

      await test('files_setPublication with a bad reference is -32602 invalid_reference', () =>
        expectError(-32602, 'invalid_reference', () => dapp.files.setPublication({ name: 'draft.txt', provider: 'swarm', ref: 'nope' })));
      await test('files_setPublication for a provider without publication records is -32602 unknown_provider', () =>
        expectError(-32602, 'unknown_provider', () => dapp.files.setPublication({ name: 'draft.txt', provider: 'radicle', ref: 'a'.repeat(64) })));
    } else {
      await test('own-file checks', () => { throw skip('files:own not held'); });
    }

    if (has('files:read')) {
      await test('a listing beyond the dapp’s own files must name types: none, [] and */* are -32602 types_required', async () => {
        await expectError(-32602, 'types_required', () => dapp.files.list({ prefix: 'shared-check' }));
        await expectError(-32602, 'types_required', () => dapp.files.list({ types: [] }));
        return expectError(-32602, 'types_required', () => dapp.files.list({ types: ['*/*'] }));
      });

      await test('files_subscribe without author: self and without types is -32602 types_required', () =>
        expectError(-32602, 'types_required', () => dapp.files.subscribe({})));

      await test('visibility on a listing that is not author: self is -32602 invalid_visibility', () =>
        expectError(-32602, 'invalid_visibility', () => dapp.request({ method: 'files_list', params: { types: ['text/*'], visibility: 'shared' } })));
    } else {
      await test('shared-read checks', () => { throw skip('files:read not held'); });
    }

    if (has('files:own') && has('files:read')) {
      await test('a type-named listing shows shared files only: a family wildcard matches, a private file never appears', async () => {
        const l = await dapp.files.list({ prefix: 'shared-check', types: ['text/*'] });
        const mine = l.items.find((i) => i.name === 'shared-check.txt');
        assert(mine, 'shared-check.txt missing'); eq(mine.visibility, 'shared', 'shared');
        const d = await dapp.files.list({ prefix: 'draft', types: ['text/plain'] });
        assert(!d.items.some((i) => i.name === 'draft.txt'), 'a private file is not in a shared listing, even its author’s');
        const none = await dapp.files.list({ prefix: 'shared-check', types: ['application/*'] });
        eq(none.items.length, 0, 'text/plain is not application/*');
        const byAuthor = await dapp.files.list({ prefix: 'draft', types: ['text/plain'], author: mine.author });
        assert(!byAuthor.items.some((i) => i.visibility === 'private'), 'the dapp’s own key in a type query lists its shared files only; "self" is what selects both marks');
        eq((await dapp.files.list({ prefix: 'shared-check', types: ['text/plain'], author: mine.author })).items.length, 1, 'author narrows, does not widen');
        return `author=${mine.author}`;
      });

      await test('an own file is readable by { author, name } with the dapp’s own key as author (same as "self")', async () => {
        const me = (await dapp.files.stat({ name: 'shared-check.txt' })).author;
        const b = await dapp.files.read({ author: me, name: 'shared-check.txt' });
        assert(b.size > 0, 'bytes');
        return `author=${me}; reading another author’s shared file is a manual check with a second dapp`;
      });

      await test('a subscription with types delivers files:changed for a matching shared write; files_unsubscribe ends it', async () => {
        const { subscriptionId } = await dapp.files.subscribe({ types: ['application/json'] });
        const ev = once(dapp, 'files:changed', (e) => e.name === 'event.json' && e.kind === 'created');
        await dapp.files.writeJson({ name: 'event.json', value: { ok: true } });
        const e = await ev; eq(e.visibility, 'shared', 'mark on the event');
        await dapp.files.delete({ name: 'event.json' });
        await dapp.files.unsubscribe({ subscriptionId });
        await expectError(-32602, 'invalid_subscription', () => dapp.files.unsubscribe({ subscriptionId }));
        return `author=${e.author} cid=${e.cid.slice(0, 12)}…; unsubscribed`;
      });
    }

    if (has('files:own')) {
      await test('cleanup: delete the files this run made, keeping draft.txt (private) and shared-check.txt (shared) for the manual checks', async () => {
        const l = await dapp.files.list({ author: 'self' });
        const mine = ['notes.json', 'draft-copy.txt', 'etag2.txt', 'doc.json', 'dot.png'];
        let n = 0;
        for (const f of l.items) if (mine.includes(f.name)) { await dapp.files.delete({ name: f.name }); n++; }
        return `deleted ${n}`;
      });
    }

    await test('unknown method is 4200', () => expectError(4200, undefined, () => dapp.request({ method: 'files_mkdir', params: { name: 'x' } })));

    await test('a capability not in the manifest is 4100 not_in_manifest', () =>
      expectError(4100, 'not_in_manifest', () => dapp.requestCapabilities({ capabilities: [{ id: 'swarm:publish' }] })));

  }

  async function slow() {
    await test('a 513 MB write is 4300 file_too_large with data.limit/actual', async () => {
      const big = new Uint8Array(513 * 1024 * 1024);
      let err;
      try { await dapp.files.write({ name: 'big.bin', data: big, type: 'application/octet-stream', visibility: 'private' }); } catch (e) { err = e; }
      assert(err && err.code === 4300 && err.data.reason === 'file_too_large', `expected file_too_large, got ${err && err.code} ${err && err.data && err.data.reason}`);
      eq(err.data.limit, 536870912, 'data.limit'); eq(err.data.actual, big.length, 'data.actual');
      return `limit=${err.data.limit} actual=${err.data.actual}`;
    });

    // Last: this one spends the minute's budget, so nothing else can run for a while after it.
    await test('rate limit: 700 rapid files_getQuota calls hit -32005 with retryAfterMs', async () => {
      let hit = null;
      for (let i = 0; i < 700 && !hit; i++) {
        try { await dapp.files.getQuota(); } catch (e) { if (e.code === -32005) hit = e; else throw e; }
      }
      if (!hit) throw skip('budget not reached in 700 calls (host may count differently)');
      assert(typeof hit.data.retryAfterMs === 'number', 'retryAfterMs');
      return `retryAfterMs=${hit.data.retryAfterMs}`;
    });
  }
})();
