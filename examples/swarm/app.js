// Swarm provider conformance checks. Mirrors providers/swarm.md §11.
// window.swarm is the shipped provider; window.dapp carries the unified grant.
(function () {
  const { test, skip, expectError, assert, eq, once, clear } = window.harness;
  const $ = (s) => document.querySelector(s);
  const dapp = window.dapp, swarm = window.swarm;

  const detect = $('#detect');
  if (!dapp) {
    detect.innerHTML = '<b>window.dapp is absent.</b> Not a dapp scheme, dev realm off, or this host does not implement the specification yet.';
  } else if (!swarm) {
    detect.innerHTML = '<b>window.swarm is absent.</b> This host has no Swarm provider.';
  } else {
    detect.innerHTML = `window.dapp and window.swarm present. swarm.isFreedomBrowser=<code>${swarm.isFreedomBrowser === true}</code>`;
    $('#connect').disabled = false; $('#run').disabled = false;
  }

  const WANT = [{ id: 'files:private' }, { id: 'swarm:publish' }, { id: 'swarm:feeds' }, { id: 'swarm:signing' }, { id: 'swarm:messaging' }];

  $('#connect').onclick = async () => {
    clear();
    await test('dapp_requestCapabilities with files:private and the four Swarm rows', async () => {
      const g = await dapp.requestCapabilities({ capabilities: WANT });
      const ids = g.capabilities.map((c) => c.id).sort();
      return `granted: ${ids.join(', ')}; alwaysAllow: ${g.capabilities.filter((c) => c.alwaysAllow).map((c) => c.id).join(', ') || 'none'}`;
    });
  };

  $('#run').onclick = async () => { clear(); await run(); };

  async function run() {
    const held = await dapp.getCapabilities().catch(() => ({ capabilities: [] }));
    const has = (id) => held.capabilities.some((c) => c.id === id && c.enabled);
    if (!held.capabilities.length) {
      await test('(press “Request capabilities” first)', () => { throw skip('no grant'); });
      return;
    }

    await test('dapp_getProviders lists swarm with surface-as-shipped status', async () => {
      const p = await dapp.getProviders();
      const s = p.providers.find((x) => x.id === 'swarm');
      assert(s, 'swarm provider missing');
      return `status=${s.status} version=${s.version}`;
    });

    await test('swarm_requestAccess resolves at once (no second prompt) after the unified grant', async () => {
      const t0 = performance.now();
      const r = await swarm.requestAccess();
      const ms = Math.round(performance.now() - t0);
      assert(r.connected === true, 'connected');
      if (ms > 1500) throw skip(`took ${ms} ms; a prompt probably appeared: check manually`);
      return `connected in ${ms} ms; origin=${r.origin}`;
    });

    await test('swarm_getCapabilities reports canPublish or a node reason', async () => {
      const c = await swarm.getCapabilities();
      if (!c.canPublish) throw skip(`node not ready to publish: ${c.reason}`);
      return `canPublish; limits.maxDataBytes=${c.limits.maxDataBytes}`;
    });

    let published = null;
    if (has('swarm:publish') && has('files:private')) {
      await test('publish hook: swarm_publishData of a stored file’s bytes marks the file published (verified: true)', async () => {
        const data = `spec-check ${Date.now()}`;
        const w = await dapp.files.write({ root: 'private', name: 'published.txt', data, type: 'text/plain' });
        await dapp.files.subscribe({ root: 'private' });
        const ev = once(dapp, 'files:changed', (e) => e.kind === 'published' && e.name === 'published.txt', 300000);
        const r = await swarm.publishData({ data, contentType: 'text/plain', name: 'spec-check' });
        published = r;
        const e = await ev;
        eq(e.published.bzz, r.reference, 'reference recorded on the file');
        eq(e.published.verified, true, 'verified');
        const s = await dapp.files.stat({ root: 'private', name: 'published.txt' });
        eq(s.location, 'published', 'location'); eq(s.cid, w.cid, 'cid unchanged');
        return `bzz://${r.reference.slice(0, 12)}…`;
      });

      await test('swarm_readData returns the published bytes (public tier, base64 as shipped)', async () => {
        if (!published) throw skip('nothing published');
        const r = await swarm.readData({ reference: published.reference });
        eq(r.encoding, 'base64', 'encoding'); assert(atob(r.data).startsWith('spec-check'), 'bytes');
        return `${atob(r.data).length} bytes`;
      });
    }

    if (has('swarm:feeds')) {
      await test('swarm_createFeed + writeFeedEntry + readFeedEntry round-trip', async () => {
        const f = await swarm.createFeed({ name: 'spec-check' });
        const { index } = await swarm.writeFeedEntry({ name: 'spec-check', data: 'entry ' + Date.now() });
        const e = await swarm.readFeedEntry({ name: 'spec-check' });
        eq(e.index, index, 'latest index');
        return `feedId=${f.feedId} identity=${f.identityMode} index=${index}`;
      });
    }

    if (has('swarm:signing')) {
      await test('swarm_getSigningIdentity returns an owner and identity mode', async () => {
        const i = await swarm.getSigningIdentity();
        assert(/^0x[0-9a-fA-F]{40}$/.test(i.owner), 'owner address');
        return `${i.identityMode} ${i.owner.slice(0, 10)}…`;
      });
    }

    if (has('swarm:messaging')) {
      await test('swarm_subscribe (gsoc) then swarm_sendGsoc delivers a message event', async () => {
        const topic = 'freedom-dapp-spec/check/' + Math.random().toString(36).slice(2);
        const sub = await swarm.subscribe({ kind: 'gsoc', topic });
        const ev = new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('no message within 60 s')), 60000);
          swarm.on('message', (m) => { if (m.subscription === sub.subscriptionId) { clearTimeout(t); resolve(m); } });
        });
        await swarm.sendGsoc({ topic, data: 'ping' });
        const m = await ev;
        eq(atob(m.result.data), 'ping', 'payload');
        await swarm.unsubscribe({ subscriptionId: sub.subscriptionId });
        return `key=${sub.key.slice(0, 12)}…`;
      });
    }

    await test('a Swarm method without its row rejects 4100 (revoke swarm:messaging on the details page, then re-run to see this pass)', async () => {
      if (has('swarm:messaging')) throw skip('swarm:messaging is held');
      return await expectError(4100, undefined, () => swarm.getMessagingIdentity());
    });
  }
})();
