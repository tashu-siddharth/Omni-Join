require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const sign = u => jwt.sign({ id: u.id, role: u.role },
  process.env.JWT_SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(t, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Not logged in' }); }
}

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const r = db.prepare(
      'INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)'
    ).run(name, email, bcrypt.hashSync(password, 10),
      role === 'incoming' ? 'incoming' : 'owner');
    const u = { id: r.lastInsertRowid, role: role === 'incoming' ? 'incoming' : 'owner' };
    res.json({ token: sign(u), role: u.role });
  } catch { res.status(400).json({ error: 'Email already used' }); }
});

app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(req.body.email);
  if (!u || !bcrypt.compareSync(req.body.password, u.password_hash))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), role: u.role });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

const TYPES = ['decision','task','blocker','risk','dependency','question'];
const STATUSES = ['draft','needs_evidence','reviewed','approved','rejected'];

function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner')
    return res.status(403).json({ error: 'Owner access only' });
  next();
}

// Knowledge Continuity Check (rule-based, no AI)
function flagsFor(c, all) {
  const f = [];
  if (!c.source || c.source === '') f.push('Evidence missing');
  if (['task','blocker'].includes(c.type) && !c.owner)
    f.push('No confirmed owner');
  if (c.type === 'decision' && !c.reason)
    f.push('Decision has no recorded reason');
  if (c.type === 'blocker' && !c.reason)
    f.push('Blocker has no next action');
  if (c.owner) {
    const n = all.filter(x => x.owner === c.owner &&
      ['task','blocker','dependency'].includes(x.type) &&
      x.status !== 'rejected').length;
    if (n >= 3) f.push('Single-owner risk: ' + c.owner + ' holds ' + n + ' items');
  }
  return f;
}

app.post('/api/projects', auth, ownerOnly, (req, res) => {
  const r = db.prepare('INSERT INTO projects(name,owner_id) VALUES(?,?)')
    .run(req.body.name || 'Untitled project', req.user.id);
  res.json({ id: r.lastInsertRowid, name: req.body.name });
});

app.get('/api/projects', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM projects').all()));

app.post('/api/projects/:id/claims', auth, ownerOnly, (req, res) => {
  const { type, text, reason, owner, source } = req.body;
  if (!TYPES.includes(type) || !text)
    return res.status(400).json({ error: 'Type and text required' });
  const r = db.prepare(
    'INSERT INTO claims(project_id,type,text,reason,owner,source) VALUES(?,?,?,?,?,?)'
  ).run(req.params.id, type, text, reason || '', owner || '',
        source || 'Manual entry by ' + req.user.id);
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/projects/:id/claims', auth, ownerOnly, (req, res) => {
  const all = db.prepare('SELECT * FROM claims WHERE project_id=? ORDER BY id DESC')
    .all(req.params.id);
  res.json(all.map(c => ({ ...c, flags: flagsFor(c, all) })));
});

app.patch('/api/claims/:id', auth, ownerOnly, (req, res) => {
  const c = db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  const status = STATUSES.includes(b.status) ? b.status : c.status;
  db.prepare('UPDATE claims SET text=?,reason=?,owner=?,source=?,status=? WHERE id=?')
    .run(b.text ?? c.text, b.reason ?? c.reason, b.owner ?? c.owner,
         b.source ?? c.source, status, c.id);
  res.json({ ok: true });
});

// Incoming members only ever see APPROVED claims
app.get('/api/projects/:id/handover', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  const all = db.prepare("SELECT id,type,text,reason,owner,source FROM claims WHERE project_id=? AND status='approved'")
    .all(req.params.id);
  const by = t => all.filter(c => c.type === t);
  res.json({
    project: p,
    decisions: by('decision'), tasks: by('task'), blockers: by('blocker'),
    risks: by('risk'), dependencies: by('dependency'), questions: by('question'),
    first72h: {
      '0-24h': ['Get access to project files', 'Read decisions and their reasons', 'Meet the outgoing member or lead'],
      '24-48h': by('blocker').concat(by('question')).map(c => 'Resolve: ' + c.text),
      '48-72h': by('task').map(c => 'Take over: ' + c.text + (c.owner ? ' (owner: ' + c.owner + ')' : ' (owner not confirmed)'))
    }
  });
});


function ruleExtract(pid, filename, lines) {
  const rules = [
    ['blocker', /block/i], ['risk', /\brisk/i], ['dependency', /depend/i],
    ['decision', /decid|decision|chose|agreed/i],
    ['question', /\?|unknown|nobody knows|not sure/i],
    ['task', /\bwill\b|\bto do\b|todo|need to|must|should/i]
  ];
  const ins = db.prepare('INSERT INTO claims(project_id,type,text,reason,owner,source,status) VALUES(?,?,?,?,?,?,?)');
  let n = 0;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.length < 15) return;
    const hit = rules.find(r => r[1].test(t));
    if (!hit) return;
    const m = t.match(/\b([A-Z][a-z]+)\s+(?:decided|will|agreed|owns|is responsible)/);
    const why = (t.match(/because (.+)/i) || [])[1] || '';
    ins.run(pid, hit[0], t, why, m ? m[1] : '', filename + ' line ' + (i + 1), 'draft');
    n++;
  });
  return n;
}

app.post('/api/projects/:id/extract', auth, ownerOnly, async (req, res) => {
  const { filename, text } = req.body;
  if (!text || text.length < 20) return res.status(400).json({ error: 'File is empty' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY missing in server/.env' });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const lines = text.split('\n');
  const numbered = lines.map((l, i) => `[${i + 1}] ${l}`).join('\n').slice(0, 30000);
  const prompt = `Extract project knowledge from the document below. Return ONLY a JSON array.
Each item: {"type": one of decision|task|blocker|risk|dependency|question,
"text": short statement, "reason": why/next action if stated else "",
"owner": person if stated else "", "quote": an EXACT short quote copied from the document}.
Never invent owners, reasons or dates. If unknown, use "".
DOCUMENT:
${numbered}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
            signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const d = await r.json();
        console.log('Gemini replied with status', r.status);
    if (!r.ok) return res.status(502).json({ error: d.error?.message || 'AI error' });
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const items = JSON.parse(raw);
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const flat = norm(text);
    const ins = db.prepare('INSERT INTO claims(project_id,type,text,reason,owner,source,status) VALUES(?,?,?,?,?,?,?)');
    let added = 0, verified = 0;
    for (const it of items) {
      if (!TYPES.includes(it.type) || !it.text) continue;
      const q = norm(it.quote);
      const ok = q.length > 5 && flat.includes(q);
      let src = '';
      if (ok) {
        const n = lines.findIndex(l => norm(l).includes(q.slice(0, 30))) + 1;
        src = filename + (n ? ' line ' + n : '');
        verified++;
      }
      ins.run(req.params.id, it.type, it.text, it.reason || '', it.owner || '',
        src, ok ? 'draft' : 'needs_evidence');
      added++;
    }
    res.json({ added, verified });
   } catch (e) {
    const added = ruleExtract(req.params.id, filename, lines);
    res.json({ added, verified: added });
  }
});

app.listen(process.env.PORT || 5000,
  () => console.log('Server running'));