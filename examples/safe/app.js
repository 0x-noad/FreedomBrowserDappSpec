// Safe provider conformance checks. Mirrors providers/safe.md §11.
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
    // For the manual checks: show safe:changed events and poll the quota while idle.
    dapp.on('safe:changed', (e) => { $('#events').textContent = `last safe:changed: ${e.change} ${e.key} at ${new Date().toLocaleTimeString()}`; });
    const poll = () => dapp.safe.getQuota().then((q) => { $('#quota').textContent = `quota (polled every 20 s): used ${q.used} of ${q.limit}, ${q.count} key(s)`; }, () => {});
    poll(); setInterval(poll, 20000);
  }

  const WANT = [{ id: 'safe:store' }];
  const P = 'check/';   // every key this fixture writes starts with this prefix

  $('#connect').onclick = async () => {
    clear();
    await test('dapp_requestCapabilities with safe:store', async () => {
      const g = await dapp.requestCapabilities({ capabilities: WANT });
      assert(g.enabled, 'dapp should be enabled');
      eq(JSON.stringify(g.capabilities.map((c) => c.id)), JSON.stringify(['safe:store']), 'granted ids');
      const c = g.capabilities[0]; eq(c.tier, 'consent', 'tier'); eq(c.alwaysAllow, false, 'no always-allow');
      return 'granted';
    });
  };

  $('#relinquish').onclick = async () => {
    await test('dapp_relinquish drops the grant; capabilitiesChanged fires', async () => {
      const ev = once(dapp, 'capabilitiesChanged');
      await dapp.relinquish();
      window.__safeCheckSub = null;   // revocation ended it (providers/safe.md §8.5)
      eq((await ev).capabilities.length, 0, 'no capabilities after relinquish');
      return 'relinquished';
    });
  };

  $('#run').onclick = async () => { clear(); await run(); };
  $('#slow').onclick = async () => { clear(); await slow(); };

  // Runs fn, waiting out the per-minute budget (-32005) instead of failing on it.
  async function paced(fn) {
    for (;;) {
      try { return await fn(); }
      catch (e) { if (e.code !== -32005) throw e; await new Promise((r) => setTimeout(r, (e.data && e.data.retryAfterMs) || 1000)); }
    }
  }

  async function cleanup() {
    let cursor, n = 0;
    do {
      const page = await dapp.safe.keys({ prefix: P, limit: 1000, cursor });
      for (const i of page.items) { await paced(() => dapp.safe.delete({ key: i.key })); n++; }
      cursor = page.nextCursor;
    } while (cursor);
    return n;
  }

  async function run() {
    const held = await dapp.getCapabilities().catch(() => ({ enabled: false, capabilities: [] }));
    const has = held.capabilities.some((c) => c.id === 'safe:store' && c.enabled);

    await test('dapp_getProviders lists safe with its 7 methods and limits', async () => {
      const p = await dapp.getProviders();
      const s = p.providers.find((x) => x.id === 'safe');
      assert(s, 'safe provider missing');
      for (const m of ['safe_get', 'safe_set', 'safe_delete', 'safe_keys', 'safe_subscribe', 'safe_unsubscribe', 'safe_getQuota']) assert(s.methods.includes(m), `${m} not listed`);
      eq(s.limits.bytes, 67108864, 'limits.bytes'); eq(s.limits.valueBytes, 8388608, 'limits.valueBytes'); eq(s.limits.keys, 1000, 'limits.keys');
      return `safe.status=${s.status} safe.version=${s.version}`;
    });

    await test('dapp_getIdentityState reports exists, locked and sealed', async () => {
      const s = await dapp.getIdentityState();
      for (const k of ['exists', 'locked', 'sealed']) eq(typeof s[k], 'boolean', k);
      assert(!s.sealed || s.locked, 'sealed implies locked');
      return JSON.stringify(s);
    });

    await test('safe_getQuota is public tier (works without any grant)', async () => {
      const q = await dapp.safe.getQuota();
      eq(q.limit, 67108864, 'limit'); eq(q.valueLimit, 8388608, 'value limit'); eq(q.countLimit, 1000, 'count limit');
      return `used=${q.used} count=${q.count} free=${q.free}`;
    });

    if (!has) {
      await test('without a grant, safe_get rejects 4100 unauthorized', () =>
        expectError(4100, 'unauthorized', () => dapp.safe.get({ key: P + 'x' })));
      await test('(everything else needs the grant: press “Request capabilities” first)', () => { throw skip('no grant'); });
      return;
    }

    await test('safe_set / safe_get round-trip a JSON object; kind is "json"', async () => {
      const w = await dapp.safe.set({ key: P + 'profile', value: { name: 'Ada', n: 1 } });
      eq(w.key, P + 'profile', 'key'); eq(w.kind, 'json', 'kind'); assert(typeof w.etag === 'string' && w.etag, 'etag'); assert(w.size > 0, 'size');
      const r = await dapp.safe.get({ key: P + 'profile' });
      eq(r.value.name, 'Ada', 'value'); eq(r.etag, w.etag, 'etag');
      return `etag=${w.etag.slice(0, 12)}… size=${w.size}`;
    });

    await test('a stored JSON null is an item whose value is null; an absent key resolves null', async () => {
      await dapp.safe.set({ key: P + 'nothing', value: null });
      const r = await dapp.safe.get({ key: P + 'nothing' });
      assert(r !== null && r.value === null && r.kind === 'json', 'stored null is an item');
      eq(await dapp.safe.get({ key: P + 'never-set' }), null, 'absent key');
      return 'null value and absent key are distinct';
    });

    await test('bytes round-trip as Uint8Array; kind is "bytes"', async () => {
      const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
      const w = await dapp.safe.set({ key: P + 'save.state', value: bytes });
      eq(w.kind, 'bytes', 'kind'); eq(w.size, 6, 'size');
      const r = await dapp.safe.get({ key: P + 'save.state' });
      assert(r.value instanceof Uint8Array, 'Uint8Array'); eq(r.value.length, 6, 'length'); eq(r.value[5], 255, 'last byte');
      return `${r.value.length} bytes`;
    });

    await test('a string is a JSON value, not bytes', async () => {
      const w = await dapp.safe.set({ key: P + 'token', value: 'abc' });
      eq(w.kind, 'json', 'kind'); eq((await dapp.safe.get({ key: P + 'token' })).value, 'abc', 'value');
      return 'kind=json';
    });

    await test('ifMatch with a stale etag is 4409 conflict; ifNoneMatch "*" on an existing key is 4409 exists', async () => {
      const a = await dapp.safe.set({ key: P + 'doc', value: { v: 1 } });
      const b = await dapp.safe.set({ key: P + 'doc', value: { v: 2 }, ifMatch: a.etag });
      assert(b.etag !== a.etag, 'etag changes with the value');
      await expectError(4409, 'conflict', () => dapp.safe.set({ key: P + 'doc', value: { v: 3 }, ifMatch: a.etag }));
      return expectError(4409, 'exists', () => dapp.safe.set({ key: P + 'doc', value: 0, ifNoneMatch: '*' }));
    });

    await test('ifMatch on an absent key is 4409 conflict; rewriting an identical value keeps the etag', async () => {
      await expectError(4409, 'conflict', () => dapp.safe.set({ key: P + 'never-set', value: 1, ifMatch: 'anything' }));
      const a = await dapp.safe.set({ key: P + 'same', value: { v: 1 } });
      const b = await dapp.safe.set({ key: P + 'same', value: { v: 1 } });
      eq(b.etag, a.etag, 'etag derives from the stored bytes');
      eq(a.size, new TextEncoder().encode(JSON.stringify({ v: 1 })).length, 'size is the UTF-8 length of the JSON text');
      return `etag=${a.etag.slice(0, 12)}… size=${a.size}`;
    });

    await test('an ill-formed or over-long key is -32602 invalid_key', async () => {
      await expectError(-32602, 'invalid_key', () => dapp.safe.set({ key: 'has space', value: 1 }));
      await expectError(-32602, 'invalid_key', () => dapp.safe.set({ key: '', value: 1 }));
      return expectError(-32602, 'invalid_key', () => dapp.safe.set({ key: 'k'.repeat(129), value: 1 }));
    });

    await test('a value JSON.stringify cannot serialise is -32602 invalid_value', async () => {
      const loop = {}; loop.self = loop;
      await expectError(-32602, 'invalid_value', () => dapp.safe.set({ key: P + 'bad', value: loop }));
      return expectError(-32602, 'invalid_value', () => dapp.safe.set({ key: P + 'bad', value: () => 1 }));
    });

    await test('safe_keys lists own keys in key order without values; prefix narrows; cursor pages', async () => {
      const all = await dapp.safe.keys({ prefix: P });
      const keys = all.items.map((i) => i.key);
      eq(JSON.stringify(keys), JSON.stringify([...keys].sort()), 'key order');
      assert(all.items.every((i) => !('value' in i)), 'no values in a listing');
      for (const k of ['key', 'kind', 'size', 'etag', 'mtime']) assert(k in all.items[0], `missing ${k}`);
      eq((await dapp.safe.keys({ prefix: P + 'save' })).items.length, 1, 'prefix narrows');
      const first = await dapp.safe.keys({ prefix: P, limit: 2 });
      eq(first.items.length, 2, 'limit'); assert(first.nextCursor, 'nextCursor');
      const second = await dapp.safe.keys({ prefix: P, limit: 2, cursor: first.nextCursor });
      assert(second.items[0].key > first.items[1].key, 'second page continues');
      return keys.join(', ');
    });

    await test('safe_delete resolves {} for a present and for an absent key', async () => {
      await dapp.safe.delete({ key: P + 'token' });
      eq(await dapp.safe.get({ key: P + 'token' }), null, 'gone');
      await dapp.safe.delete({ key: P + 'token' });
      return 'idempotent';
    });

    await test('this document’s own set raises safe:changed on its subscription', async () => {
      const { subscriptionId } = await dapp.safe.subscribe({ prefix: P });
      const ev = once(dapp, 'safe:changed', (e) => e.key === P + 'event' && e.change === 'set');
      const w = await dapp.safe.set({ key: P + 'event', value: 1 });
      eq((await ev).etag, w.etag, 'event carries the new etag');
      await dapp.safe.unsubscribe({ subscriptionId });
      return 'set delivered, then unsubscribed';
    });

    await test('the 61st live subscription in one document is -32602 too_many_subscriptions', async () => {
      if (window.__safeCheckSub) { await dapp.safe.unsubscribe({ subscriptionId: window.__safeCheckSub }); window.__safeCheckSub = null; }
      const ids = [];
      try {
        for (let i = 0; i < 60; i++) ids.push((await dapp.safe.subscribe({ prefix: P })).subscriptionId);
        return await expectError(-32602, 'too_many_subscriptions', () => dapp.safe.subscribe({ prefix: P }));
      } finally {
        for (const id of ids) await dapp.safe.unsubscribe({ subscriptionId: id });
      }
    });

    await test('one subscription is left live for the manual checks (a user deletion shows above)', async () => {
      if (!window.__safeCheckSub) window.__safeCheckSub = (await dapp.safe.subscribe({ prefix: P })).subscriptionId;
      return 'subscribed';
    });

    await test('safe_getQuota counts what the run stored', async () => {
      const q = await dapp.safe.getQuota();
      assert(q.count >= 6 && q.used > 0, 'count and used reflect the writes');
      eq(q.free, q.limit - q.used, 'free');
      return `used=${q.used} count=${q.count}`;
    });

    await test('cleanup: delete every key under the fixture’s prefix', async () => `deleted ${await cleanup()}`);

    await test('unknown method is 4200', () => expectError(4200, undefined, () => dapp.request({ method: 'safe_clear', params: {} })));

    await test('a capability not in the manifest is 4100 not_in_manifest', () =>
      expectError(4100, 'not_in_manifest', () => dapp.requestCapabilities({ capabilities: [{ id: 'files:own' }] })));
  }

  async function slow() {
    await test('a 9 MB value is 4300 value_too_large with data.limit/actual', async () => {
      let err;
      try { await dapp.safe.set({ key: P + 'big', value: new Uint8Array(9 * 1024 * 1024) }); } catch (e) { err = e; }
      assert(err && err.code === 4300 && err.data.reason === 'value_too_large', `expected value_too_large, got ${err && err.code} ${err && err.data && err.data.reason}`);
      eq(err.data.limit, 8388608, 'data.limit'); eq(err.data.actual, 9 * 1024 * 1024, 'data.actual');
      return `limit=${err.data.limit} actual=${err.data.actual}`;
    });

    await test('a 1 001st key is 4300 too_many_keys', async () => {
      const q = await dapp.safe.getQuota();
      const toWrite = q.countLimit - q.count + 1;
      let last;
      for (let i = 0; i < toWrite; i++) {
        try { await paced(() => dapp.safe.set({ key: `${P}many/${i}`, value: i })); }
        catch (e) { last = e; break; }
      }
      assert(last && last.code === 4300 && last.data.reason === 'too_many_keys', `expected too_many_keys, got ${last && last.code} ${last && last.data && last.data.reason}`);
      return `hit at count ${q.countLimit}; cleaned ${await cleanup()}`;
    });

    await test('the 64 MB total is 4300 safe_quota', async () => {
      const chunk = new Uint8Array(8 * 1024 * 1024);
      let last;
      for (let i = 0; i < 9; i++) {
        try { await dapp.safe.set({ key: `${P}fill/${i}`, value: chunk }); } catch (e) { last = e; break; }
      }
      assert(last && last.code === 4300 && last.data.reason === 'safe_quota', `expected safe_quota, got ${last && last.code} ${last && last.data && last.data.reason}`);
      assert(typeof last.data.limit === 'number' && typeof last.data.actual === 'number', 'data.limit and data.actual');
      return `limit=${last.data.limit}; cleaned ${await cleanup()}`;
    });
  }
})();
