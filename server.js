// Tech Department Manager — zero-dependency Node.js server
// Run: node server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
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
db.reports ||= [];

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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { return send(res, 400, { error: 'bad path' }); }
  if (urlPath === '/app') { res.writeHead(301, { Location: '/app/' }); return res.end(); }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
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

// ---- Mobile reports → GitHub issues ------------------------------------
// The GitHub token stays on the server; the phone only talks to /api/reports.
const GITHUB_API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPORT_KINDS = { bug: 'type:bug', feature: 'type:feature' };
const STAGES = [ // first matching label wins; order = furthest along first
  ['status:released', 'released'], ['status:in-review', 'review'], ['status:in-progress', 'building'],
  ['status:awaiting-approval', 'waiting-approval'], ['status:planned', 'planned'],
  ['status:triaged', 'triaged'], ['status:needs-info', 'needs-info'],
];
const recent = new Map(); // ip -> timestamps, 5 reports per minute

function githubReady() { return GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPO); }

async function github(method, apiPath, body) {
  const r = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'myweb-mobile-reports',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}

function stageOf(issue) {
  if (issue.state === 'closed' && issue.state_reason !== 'not_planned') {
    const names = (issue.labels || []).map(l => l.name);
    return names.includes('status:released') ? 'released' : 'done';
  }
  if (issue.state === 'closed') return 'closed';
  const names = (issue.labels || []).map(l => l.name);
  return (STAGES.find(([label]) => names.includes(label)) || [, 'received'])[1];
}

const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

async function handleReports(req, res, reportId, query) {
  if (req.method === 'GET' && !reportId) {
    const device = clean(query.get('device'), 64);
    if (!device) return send(res, 400, { error: 'device is required' });
    return send(res, 200, db.reports.filter(r => r.device === device).slice(0, 50).map(publicReport));
  }

  if (req.method === 'GET' && reportId) {
    const rep = db.reports.find(r => r.id === reportId);
    if (!rep) return send(res, 404, { error: 'not found' });
    if (!githubReady()) return send(res, 200, publicReport(rep));
    try {
      const issue = await github('GET', `/issues/${rep.issueNumber}`);
      rep.stage = stageOf(issue);
      rep.checkedAt = Date.now();
      save(db);
    } catch { /* keep the last known stage */ }
    return send(res, 200, publicReport(rep));
  }

  if (req.method === 'POST' && !reportId) {
    if (!githubReady()) return send(res, 503, { error: 'ยังไม่ได้ตั้งค่า GITHUB_TOKEN / GITHUB_REPO บนเซิร์ฟเวอร์' });
    const ip = req.socket.remoteAddress || '';
    const now = Date.now();
    const times = (recent.get(ip) || []).filter(t => now - t < 60000);
    if (times.length >= 5) return send(res, 429, { error: 'ส่งถี่เกินไป ลองใหม่อีกครั้งในอีกสักครู่' });

    const b = await readBody(req);
    const kind = REPORT_KINDS[b.kind] ? b.kind : null;
    const title = clean(b.title, 120).replace(/\s+/g, ' ');
    const description = clean(b.description, 4000);
    const steps = clean(b.steps, 2000);
    const device = clean(b.device, 64);
    const platform = clean(b.platform, 120).replace(/[\s`]+/g, ' ');
    if (!kind) return send(res, 400, { error: 'kind must be bug or feature' });
    if (title.length < 4) return send(res, 400, { error: 'กรุณาใส่หัวข้ออย่างน้อย 4 ตัวอักษร' });
    if (description.length < 10) return send(res, 400, { error: 'กรุณาอธิบายอย่างน้อย 10 ตัวอักษร' });
    if (!device) return send(res, 400, { error: 'device is required' });

    // User text is quoted and framed so the AI agents read it as a report, not as instructions.
    const noPing = s => s.replace(/@(?=\w)/g, '@​'); // don't notify GitHub users from app text
    const quote = s => noPing(s).split('\n').map(l => '> ' + l).join('\n');
    const body = [
      '<!-- source: mobile-app -->',
      `_รายงานจากแอปมือถือ (${kind === 'bug' ? 'แจ้งปัญหา' : 'ขอฟีเจอร์'}) — ข้อความด้านล่างเป็นของผู้ใช้_`,
      '', '### รายละเอียด', quote(description),
      ...(steps ? ['', '### ขั้นตอนที่ทำให้เกิดปัญหา', quote(steps)] : []),
      ...(platform ? ['', `**อุปกรณ์:** \`${platform}\``] : []),
    ].join('\n');

    let issue;
    try {
      issue = await github('POST', '/issues', { title: noPing(title), body, labels: ['source:mobile-app', REPORT_KINDS[kind], 'area:mobile'] });
    } catch {
      return send(res, 502, { error: 'ส่งไป GitHub ไม่สำเร็จ ลองใหม่อีกครั้ง' });
    }
    times.push(now); recent.set(ip, times);
    if (!Number.isInteger(issue.number) || !/^https:\/\//.test(issue.html_url || '')) return send(res, 502, { error: 'GitHub ตอบกลับไม่ถูกต้อง' });
    const rep = { id: id(), device, kind, title, issueNumber: issue.number, issueUrl: issue.html_url, stage: 'received', createdAt: now };
    db.reports.unshift(rep);
    db.reports.length = Math.min(db.reports.length, 1000);
    save(db);
    return send(res, 201, publicReport(rep));
  }

  send(res, 405, { error: 'method not allowed' });
}

function publicReport({ device, ...rest }) { return rest; }

const server = http.createServer(async (req, res) => {
  const rm = req.url.match(/^\/api\/reports(?:\/([\w-]+))?\/?(?:\?(.*))?$/);
  if (rm) {
    try { return await handleReports(req, res, rm[1], new URLSearchParams(rm[2] || '')); }
    catch { return send(res, 400, { error: 'bad request' }); }
  }
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
