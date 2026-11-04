// The page against a stub of the Zapier hook. Run with `npm test`.
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { test, before, after, beforeEach } = require('node:test');

const PAGE_PORT = 3995;
const HOOK_PORT = 3996;
const page = `http://localhost:${PAGE_PORT}`;

let hookCalls = [];
let hookStatus = 200;
let hook;
let server;
let logs = '';

before(async () => {
  hook = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      hookCalls.push({ url: req.url, body });
      res.statusCode = hookStatus;
      res.end('{}');
    });
  });
  await new Promise((resolve) => hook.listen(HOOK_PORT, resolve));

  server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: PAGE_PORT, ZAPIER_HOOK_URL: `http://localhost:${HOOK_PORT}/hook` },
  });
  await new Promise((resolve) => {
    server.stdout.on('data', (chunk) => {
      logs += chunk;
      if (logs.includes('Server is running')) resolve();
    });
  });
  server.stderr.on('data', (chunk) => (logs += chunk));
});

after(async () => {
  server.kill();
  await new Promise((resolve) => hook.close(resolve));
});

beforeEach(() => {
  hookCalls = [];
  hookStatus = 200;
});

const click = (fields) =>
  fetch(page, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

const EXTRA = {};
const CONFIRM = /Ga je akkoord met de aangifte inkomstenbelasting\?[\s\S]*Akkoord geven \/ Approve/;
const THANKS = /checkmark"[\s\S]*Bedankt voor je goedkeuring/;
const INCOMPLETE = /Deze link is niet compleet/;
const FAILED = /Je akkoord is niet verwerkt/;

test('an old link opened with GET shows the button and calls nothing', async () => {
  const response = await fetch(`${page}/?deal_id=123`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, CONFIRM);
  assert.match(html, /name="deal_id" value="123"/);
  assert.match(html, /<button/);
  assert.doesNotMatch(html, /checkmark"/);
  assert.equal(hookCalls.length, 0);
});

test('the id is cleaned to digits, so nothing else reaches the page', async () => {
  const dirty = encodeURIComponent('123​"><script>');
  const html = await (await fetch(`${page}/?deal_id=${dirty}`)).text();

  assert.match(html, /value="123"/);
  assert.doesNotMatch(html, /<script>/);
});

test('a link without an id shows no button', async () => {
  const html = await (await fetch(`${page}/?`)).text();

  assert.doesNotMatch(html, /<button/);
  assert.match(html, INCOMPLETE);
  assert.equal(hookCalls.length, 0);
});

test('the click calls the hook once with the right body and shows the thanks page', async () => {
  const response = await click({ deal_id: '123', ...EXTRA });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, THANKS);
  assert.equal(hookCalls.length, 1);
  assert.equal(hookCalls[0].url, '/hook');
  assert.deepEqual(JSON.parse(hookCalls[0].body), { deal_id: '123', ...EXTRA });
});

test('a failing hook shows the failed page and never the thanks page', async () => {
  hookStatus = 500;
  const response = await click({ deal_id: '123', ...EXTRA });
  const html = await response.text();

  assert.equal(response.status, 502);
  assert.match(html, FAILED);
  assert.doesNotMatch(html, THANKS);
});

test('a click without an id calls nothing', async () => {
  const response = await click({ deal_id: '', ...EXTRA });

  assert.equal(response.status, 400);
  assert.match(await response.text(), INCOMPLETE);
  assert.equal(hookCalls.length, 0);
});

test('every response carries the headers, scanner paths get a plain 404', async () => {
  const response = await fetch(`${page}/.env`);

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'none'");
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('the logs hold method, path and status, never the id', async () => {
  await fetch(`${page}/?deal_id=987654`);
  await click({ deal_id: '987654', ...EXTRA });
  hookStatus = 500;
  await click({ deal_id: '987654', ...EXTRA });
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.match(logs, /GET \/ 200/);
  assert.match(logs, /Hook call failed: 500/);
  assert.doesNotMatch(logs, /987654/);
});
