// Tiny conformance harness shared (by copy) across the example dapps.
// test(name, fn): fn returns a string detail, or throws. Throwing an object
// with { skip: 'reason' } records a skip. expectError(code, reason?) helps
// assert the SPEC.md §7.13 error shape.
(function () {
  const tbody = () => document.querySelector('#results tbody');
  const summary = () => document.querySelector('#summary');
  const state = { n: 0, pass: 0, fail: 0, skip: 0 };

  function row(name, cls, result, detail) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${++state.n}</td><td>${esc(name)}</td><td class="${cls}">${result}</td><td><code>${esc(detail || '')}</code></td>`;
    tbody().appendChild(tr);
    summary().textContent = `${state.pass} passed, ${state.fail} failed, ${state.skip} skipped`;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  async function test(name, fn) {
    try {
      const detail = await fn();
      state.pass++; row(name, 'pass', 'pass', detail);
      return true;
    } catch (e) {
      if (e && e.skip) { state.skip++; row(name, 'skip', 'skipped', e.skip); return null; }
      state.fail++; row(name, 'fail', 'FAIL', (e && (e.stack || e.message)) || String(e));
      return false;
    }
  }

  function skip(reason) { return { skip: reason }; }

  // Runs fn and asserts it rejects with the given code (and reason, if given).
  async function expectError(code, reason, fn) {
    try {
      await fn();
    } catch (e) {
      if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code} (${e.message})`);
      if (reason && (!e.data || e.data.reason !== reason)) throw new Error(`expected reason ${reason}, got ${e.data && e.data.reason}`);
      return `${e.code} ${e.data && e.data.reason ? e.data.reason : ''}`.trim();
    }
    throw new Error(`expected rejection ${code}${reason ? ' ' + reason : ''}, but it resolved`);
  }

  function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
  function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

  // Waits for one event matching pred, or times out.
  function once(emitter, event, pred, ms = 5000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { emitter.removeListener(event, h); reject(new Error(`no ${event} event within ${ms} ms`)); }, ms);
      function h(payload) { if (!pred || pred(payload)) { clearTimeout(t); emitter.removeListener(event, h); resolve(payload); } }
      emitter.on(event, h);
    });
  }

  function clear() { tbody().innerHTML = ''; Object.assign(state, { n: 0, pass: 0, fail: 0, skip: 0 }); summary().textContent = ''; }

  window.harness = { test, skip, expectError, assert, eq, once, clear };
})();
