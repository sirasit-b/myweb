const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techdept-'));
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_FILE: path.join(tmpDir, 'db.json') },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/tasks'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});

after(() => {
  proc?.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const api = (method, url, body) =>
  fetch(BASE + '/api/' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

test('seeds sample data on first run', async () => {
  for (const col of ['tasks', 'members', 'projects']) {
    const r = await api('GET', col);
    assert.strictEqual(r.status, 200);
    assert.ok((await r.json()).length > 0, `${col} should be seeded`);
  }
});

test('creates a task with defaults', async () => {
  const r = await api('POST', 'tasks', { title: 'Write tests' });
  assert.strictEqual(r.status, 201);
  const t = await r.json();
  assert.strictEqual(t.status, 'todo');
  assert.strictEqual(t.priority, 'medium');
});

test('rejects a task without a title', async () => {
  const r = await api('POST', 'tasks', { title: '   ' });
  assert.strictEqual(r.status, 400);
});

test('updates and deletes a task', async () => {
  const t = await (await api('POST', 'tasks', { title: 'Temp' })).json();
  const u = await (await api('PATCH', 'tasks/' + t.id, { status: 'done' })).json();
  assert.strictEqual(u.status, 'done');
  assert.strictEqual((await api('DELETE', 'tasks/' + t.id)).status, 204);
  assert.strictEqual((await api('PATCH', 'tasks/' + t.id, { status: 'todo' })).status, 404);
});

test('deleting a member clears task assignments', async () => {
  const m = await (await api('POST', 'members', { name: 'Temp Member' })).json();
  const t = await (await api('POST', 'tasks', { title: 'Assigned', assigneeId: m.id })).json();
  await api('DELETE', 'members/' + m.id);
  const tasks = await (await api('GET', 'tasks')).json();
  assert.strictEqual(tasks.find(x => x.id === t.id).assigneeId, '');
});

test('blocks path traversal on static files', async () => {
  const r = await fetch(BASE + '/..%2Fserver.js');
  assert.ok([403, 404].includes(r.status));
});
