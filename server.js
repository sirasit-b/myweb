// Tech Department Manager — zero-dependency Node.js server
// Run: node server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COLLECTIONS = ['tasks', 'members', 'projects'];

function seed() {
  const m1 = id(), m2 = id(), m3 = id(), p1 = id(), p2 = id();
  const now = Date.now();
  return {
    members: [
      { id: m1, name: 'Somchai', role: 'Backend Developer', email: '', createdAt: now },
      { id: m2, name: 'Nida', role: 'Frontend Developer', email: '', createdAt: now },
      { id: m3, name: 'Arthit', role: 'DevOps', email: '', createdAt: now },
    ],
    projects: [
      { id: p1, name: 'Website', status: 'active', description: 'Company website revamp', createdAt: now },
      { id: p2, name: 'Infra', status: 'active', description: 'Servers & CI/CD', createdAt: now },
    ],
    tasks: [
      { id: id(), title: 'Fix login bug', status: 'todo', priority: 'high', assigneeId: m1, projectId: p1, due: '', createdAt: now },
      { id: id(), title: 'Design new dashboard', status: 'doing', priority: 'medium', assigneeId: m2, projectId: p1, due: '', createdAt: now },
      { id: id(), title: 'Renew SSL certificate', status: 'done', priority: 'low', assigneeId: m3, projectId: p2, due: '', createdAt: now },
    ],
  };
}

function id() { return crypto.randomUUID().slice(0, 8); }

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch {
    const db = seed();
    save(db);
    return db;
  }
}
function save(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let db = load();

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// Allowed fields per collection (anything else is ignored)
const FIELDS = {
  tasks: ['title', 'status', 'priority', 'assigneeId', 'projectId', 'due', 'note'],
  members: ['name', 'role', 'email'],
  projects: ['name', 'status', 'description'],
};
function pick(col, body) {
  const out = {};
  for (const k of FIELDS[col]) if (body[k] !== undefined) out[k] = String(body[k]).slice(0, 500);
  return out;
}

const server = http.createServer(async (req, res) => {
  const m = req.url.match(/^\/api\/(\w+)(?:\/([\w-]+))?\/?(?:\?.*)?$/);
  if (!m) return serveStatic(req, res);
  const [, col, itemId] = m;
  if (!COLLECTIONS.includes(col)) return send(res, 404, { error: 'unknown collection' });
  const list = db[col];

  try {
    if (req.method === 'GET' && !itemId) return send(res, 200, list);

    if (req.method === 'POST' && !itemId) {
      const item = { id: id(), ...pick(col, await readBody(req)), createdAt: Date.now() };
      const required = col === 'tasks' ? 'title' : 'name';
      if (!item[required] || !item[required].trim()) return send(res, 400, { error: `${required} is required` });
      if (col === 'tasks') { item.status ||= 'todo'; item.priority ||= 'medium'; }
      if (col === 'projects') item.status ||= 'active';
      list.unshift(item); save(db);
      return send(res, 201, item);
    }

    const idx = list.findIndex(x => x.id === itemId);
    if (idx === -1) return send(res, 404, { error: 'not found' });

    if (req.method === 'PATCH' || req.method === 'PUT') {
      list[idx] = { ...list[idx], ...pick(col, await readBody(req)), updatedAt: Date.now() };
      save(db);
      return send(res, 200, list[idx]);
    }
    if (req.method === 'DELETE') {
      list.splice(idx, 1);
      // clean references
      if (col === 'members') db.tasks.forEach(t => { if (t.assigneeId === itemId) t.assigneeId = ''; });
      if (col === 'projects') db.tasks.forEach(t => { if (t.projectId === itemId) t.projectId = ''; });
      save(db);
      return send(res, 204);
    }
    send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    send(res, 400, { error: 'bad request' });
  }
});

server.listen(PORT, () => console.log(`Tech Dept Manager running → http://localhost:${PORT}`));
