// Radicle provider conformance checks. Mirrors providers/radicle.md §11.
// window.radicle is the shipped provider; window.dapp carries the unified grant.
(function () {
  const { test, skip, expectError, assert, eq, clear } = window.harness;
  const $ = (s) => document.querySelector(s);
  const dapp = window.dapp, radicle = window.radicle;

  const detect = $('#detect');
  if (!dapp) {
    detect.innerHTML = '<b>window.dapp is absent.</b> Not a dapp scheme, dev realm off, or this host does not implement the specification yet.';
  } else if (!radicle) {
    detect.innerHTML = '<b>window.radicle is absent.</b> This host has no Radicle provider.';
  } else {
    detect.textContent = 'window.dapp and window.radicle present.';
    for (const id of ['connect', 'run', 'write']) $('#' + id).disabled = false;
  }

  const WANT = [{ id: 'radicle:node' }, { id: 'radicle:signing' }];
  const rid = () => $('#rid').value.trim();

  $('#connect').onclick = async () => {
    clear();
    await test('dapp_requestCapabilities with radicle:node and radicle:signing', async () => {
      const g = await dapp.requestCapabilities({ capabilities: WANT });
      return `granted: ${g.capabilities.map((c) => c.id + (c.alwaysAllow ? ' (always-allow)' : '')).join(', ')}`;
    });
  };

  $('#run').onclick = async () => { clear(); await run(); };
  $('#write').onclick = async () => {
    await test('radicle_createIssue writes as the user (irrevocable once announced)', async () => {
      if (!rid()) throw skip('enter a RID');
      const r = await radicle.createIssue({ rid: rid(), title: 'FreedomBrowserDappSpec conformance check', description: `Written by examples/radicle at ${new Date().toISOString()}. Safe to close.` });
      return `issue id=${r.id}`;
    });
  };

  async function run() {
    const held = await dapp.getCapabilities().catch(() => ({ capabilities: [] }));
    const has = (id) => held.capabilities.some((c) => c.id === id && c.enabled);
    if (!held.capabilities.length) {
      await test('(press “Request capabilities” first)', () => { throw skip('no grant'); });
      return;
    }

    await test('dapp_getProviders lists radicle', async () => {
      const p = await dapp.getProviders();
      const r = p.providers.find((x) => x.id === 'radicle');
      assert(r, 'radicle provider missing');
      return `status=${r.status} version=${r.version}`;
    });

    await test('radicle_requestAccess resolves at once (no second prompt) after the unified grant', async () => {
      const t0 = performance.now();
      const r = await radicle.requestAccess();
      const ms = Math.round(performance.now() - t0);
      assert(r.connected === true, 'connected');
      if (ms > 1500) throw skip(`took ${ms} ms; a prompt probably appeared: check manually`);
      return `connected in ${ms} ms`;
    });

    await test('radicle_getCapabilities reports canUseNode or a reason', async () => {
      const c = await radicle.getCapabilities();
      if (!c.canUseNode) throw skip(`node not usable: ${c.reason}`);
      return `writes=${c.writes.join(',')}`;
    });

    await test('radicle_listSeededRepos works under the connection grant', async () => {
      const l = await radicle.listSeededRepos();
      return `${l.length} seeded repo(s)`;
    });

    if (has('radicle:signing')) {
      await test('radicle_getIdentity returns did, nid, alias', async () => {
        const i = await radicle.getIdentity();
        assert(i.did && i.nid, 'did/nid');
        return `${i.alias || '(no alias)'} ${i.did.slice(0, 24)}…`;
      });
    }

    if (has('radicle:node')) {
      await test('radicle_sync of an unseeded RID is -32602 not_seeded', async () => {
        return await expectError(-32602, 'not_seeded', () => radicle.sync({ rid: 'rad:z2NoSuchRepoHereXyzAbcDefGhJkm' }));
      });

      await test('radicle_seed the entered RID resolves with a status; seedStatus events follow', async () => {
        if (!rid()) throw skip('enter a RID');
        const before = await radicle.listSeededRepos();
        const wasSeeded = before.some((r) => r.rid === rid());
        const r = await radicle.seed({ rid: rid() });
        assert(r.seeded === true, 'seeded'); assert(r.status && r.status.state, 'status');
        return `state=${r.status.state}${wasSeeded ? ' (was already seeded: the unseed below should prompt as user-seeded)' : ''}`;
      });

      await test('radicle_getSeedStatus returns the snapshot shape', async () => {
        if (!rid()) throw skip('enter a RID');
        const s = await radicle.getSeedStatus({ rid: rid() });
        for (const k of ['state', 'inStorage', 'attemptCount']) assert(k in s, `missing ${k}`);
        return `state=${s.state} inStorage=${s.inStorage} attempts=${s.attemptCount}`;
      });

      await test('radicle_unseed the entered RID (prompts if you seeded it yourself, whatever always-allow says)', async () => {
        if (!rid()) throw skip('enter a RID');
        const r = await radicle.unseed({ rid: rid() });
        assert(r.seeded === false, 'unseeded');
        return 'unseeded';
      });
    }

    await test('a Radicle write without radicle:signing rejects 4100 (revoke it on the details page, then re-run to see this pass)', async () => {
      if (has('radicle:signing')) throw skip('radicle:signing is held');
      return await expectError(4100, undefined, () => radicle.getIdentity());
    });
  }
})();
