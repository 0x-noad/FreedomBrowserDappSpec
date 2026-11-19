#!/usr/bin/env node
// Static server for the example dapps under examples/.
//
// Each example folder is served as its own origin, so its
// /freedom-manifest.json sits at the root: http://<folder>.localhost:<port>/
// maps to examples/<folder>/. With Freedom's developer setting on (SPEC.md
// §3.6) that origin is the dapp `dev:<folder>`. A plain one-folder server
// cannot do this: every *.localhost label would share one root and one
// manifest.
//
//   node examples/serve.js [port]      (default 8767)
//
// Chromium resolves *.localhost to the loopback address by itself, so no
// hosts entry is needed. Bare http://localhost:<port>/ lists the examples.

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DEFAULT_PORT = 8767;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function examples() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function createServer(port) {
  return http.createServer((req, res) => {
    const host = String(req.headers.host || '')
      .split(':')[0]
      .toLowerCase();
    const label = host.endsWith('.localhost') ? host.slice(0, -'.localhost'.length) : '';
    if (!label) {
      const list = examples()
        .map((f) => `<li><a href="http://${f}.localhost:${port}/">${f}</a></li>`)
        .join('');
      send(
        res,
        200,
        `<!doctype html><meta charset="utf-8"><title>examples</title><h1>Example dapps</h1><ul>${list}</ul>`,
        TYPES['.html']
      );
      return;
    }
    if (!examples().includes(label)) {
      send(res, 404, `no example "${label}"`);
      return;
    }
    const dir = path.join(ROOT, label);
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      send(res, 400, 'bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(dir, pathname));
    if (!file.startsWith(dir + path.sep)) {
      send(res, 403, 'forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        send(res, 404, 'not found');
        return;
      }
      send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
}

/** Starts the server; resolves with `{ server, port }`. Port 0 picks a free one. */
function start(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const server = createServer(port);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { start, createServer, examples, ROOT };

if (require.main === module) {
  const port = Number(process.argv[2]) || DEFAULT_PORT;
  start(port).then(
    ({ port: p }) => {
      console.log(`examples: http://localhost:${p}/  (${examples().join(', ') || 'none'})`);
    },
    (err) => {
      console.error(`could not listen on ${port}: ${err.message}`);
      process.exit(1);
    }
  );
}
