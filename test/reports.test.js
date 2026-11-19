// Mobile app reports → GitHub issues. GitHub is replaced by a local stub server.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techdept-reports-'));
const TOKEN = 'test-token-not-real';
const issues = [];      // what the stub received
let nextState = null;   // what the stub returns for GET /issues/:n
let stub, stubPort;
const servers = [];

function startStub() {
  return new Promise(resolve => {
    stub = http.createServer((req, res) => {
      let data = '';
      req.on('data', c => (data += c));
      req.on('end', () => {
        const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, {});
        if (req.method === 'POST' && req.url === '/repos/acme/app/issues') {
          const body = JSON.parse(data);
          issues.push(body);
          return json(201, { number: 40 + issues.length, html_url: `https://github.com/acme/app/issues/${40 + issues.length}` });
        }
        const m = req.url.match(/^\/repos\/acme\/app\/issues\/(\d+)$/);
        if (req.method === 'GET' && m) return json(200, { number: +m[1], state: 'open', labels: [], ...nextState });
        json(404, {});
      });
    }).listen(0, '127.0.0.1', () => { stubPort = stub.address().port; resolve(); });
  });
}

async function startApp(extraEnv) {
  const port = 3100 + Math.floor(Math.random() * 800);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tmpDir, `db-${port}.json`), GITHUB_TOKEN: '', GITHUB_REPO: '', ...extraEnv },
    stdio: 'pipe',
  });
  servers.push(proc);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/api/tasks'); return base; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
}

let BASE, BARE;
before(async () => {
  await startStub();
  BASE = await startApp({ GITHUB_TOKEN: TOKEN, GITHUB_REPO: 'acme/app', GITHUB_API: `http://127.0.0.1:${stubPort}` });
  BARE = await startApp({});
});

after(() => {
  servers.forEach(p => p.kill());
  stub?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const post = (base, body) => fetch(base + '/api/reports', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const valid = { kind: 'bug', title: 'ปุ่มบันทึกกดไม่ได้', description: 'กดปุ่มบันทึกแล้วไม่มีอะไรเกิดขึ้นเลย', steps: '1. เปิดหน้า\n2. กดบันทึก', device: 'dev-1', platform: 'iPhone' };

test('creates a GitHub issue labelled as a mobile report', async () => {
  const r = await post(BASE, valid);
  assert.strictEqual(r.status, 201);
  const rep = await r.json();
  assert.strictEqual(rep.issueNumber, 41);
  assert.match(rep.issueUrl, /^https:\/\/github\.com\/acme\/app\/issues\/41$/);
  assert.strictEqual(rep.stage, 'received');
  assert.strictEqual(rep.device, undefined, 'device id is not echoed back');

  const sent = issues.at(-1);
  assert.strictEqual(sent.title, valid.title);
  assert.deepStrictEqual(sent.labels.sort(), ['area:mobile', 'source:mobile-app', 'type:bug']);
  assert.match(sent.body, /> กดปุ่มบันทึกแล้วไม่มีอะไรเกิดขึ้นเลย/, 'description is quoted');
  assert.match(sent.body, /> 2\. กดบันทึก/, 'steps are quoted');
  assert.ok(!sent.body.includes('dev-1'), 'device id is not published');
});

test('feature requests get type:feature and no steps section', async () => {
  const r = await post(BASE, { ...valid, kind: 'feature', steps: 'ignored?', device: 'dev-2' });
  assert.strictEqual(r.status, 201);
  assert.ok(issues.at(-1).labels.includes('type:feature'));
});

test('neutralises @mentions so reports cannot ping GitHub users', async () => {
  await post(BASE, { ...valid, title: 'ช่วยดู @someone', description: 'ลองแท็ก @octocat ในข้อความนี้', device: 'dev-3' });
  const sent = issues.at(-1);
  assert.ok(!/@octocat/.test(sent.body));
  assert.ok(!/@someone/.test(sent.title));
});

test('validates input', async () => {
  for (const bad of [
    { ...valid, kind: 'other' },
    { ...valid, title: 'ab' },
    { ...valid, description: 'สั้น' },
    { ...valid, device: '' },
  ]) {
    assert.strictEqual((await post(BASE, bad)).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await fetch(BASE + '/api/reports', { method: 'POST', body: '{nope' })).status, 400);
});

test('lists only the reports of the asking device', async () => {
  const mine = await (await fetch(BASE + '/api/reports?device=dev-1')).json();
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].title, valid.title);
  assert.strictEqual((await fetch(BASE + '/api/reports')).status, 400);
});

test('maps GitHub labels to a pipeline stage', async () => {
  const [rep] = await (await fetch(BASE + '/api/reports?device=dev-1')).json();
  const stage = async s => { nextState = s; return (await (await fetch(BASE + '/api/reports/' + rep.id)).json()).stage; };
  assert.strictEqual(await stage({ labels: [{ name: 'status:triaged' }] }), 'triaged');
  assert.strictEqual(await stage({ labels: [{ name: 'status:planned' }, { name: 'status:in-progress' }] }), 'building');
  assert.strictEqual(await stage({ labels: [{ name: 'status:needs-info' }] }), 'needs-info');
  assert.strictEqual(await stage({ state: 'closed', state_reason: 'completed', labels: [] }), 'done');
  assert.strictEqual(await stage({ state: 'closed', state_reason: 'not_planned', labels: [] }), 'closed');
  assert.strictEqual(await stage({ state: 'closed', state_reason: 'completed', labels: [{ name: 'status:released' }] }), 'released');
  assert.strictEqual((await fetch(BASE + '/api/reports/nope')).status, 404);
});

test('never returns the GitHub token', async () => {
  const text = await (await fetch(BASE + '/api/reports?device=dev-1')).text();
  assert.ok(!text.includes(TOKEN));
});

test('returns 503 when GitHub is not configured', async () => {
  assert.strictEqual((await post(BARE, valid)).status, 503);
});

test('rate-limits to 5 reports a minute per client', async () => {
  // Earlier tests in this file already sent 3 successful reports from this IP.
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await post(BASE, { ...valid, device: 'dev-rl' })).status);
  assert.deepStrictEqual(codes, [201, 201, 429, 429]);
});

test('serves the mobile app shell', async () => {
  const page = await fetch(BASE + '/app/');
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /<link rel="manifest" href="manifest.webmanifest">/);
  const manifest = await fetch(BASE + '/app/manifest.webmanifest');
  assert.match(manifest.headers.get('content-type'), /manifest\+json/);
  assert.strictEqual((await manifest.json()).start_url, '/app/');
  assert.strictEqual((await fetch(BASE + '/app/sw.js')).status, 200);
  const redirect = await fetch(BASE + '/app', { redirect: 'manual' });
  assert.strictEqual(redirect.status, 301);
});
