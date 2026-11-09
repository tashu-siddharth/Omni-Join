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

app.listen(process.env.PORT || 5000,
  () => console.log('Server running'));