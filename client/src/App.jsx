import { useState, useEffect } from 'react'
import './index.css'

const API = import.meta.env.VITE_API || 'http://localhost:5000'
async function api(path, method = 'GET', body) {
  const r = await fetch(API + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    body: body ? JSON.stringify(body) : undefined
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Error')
  return d
}

function Login({ onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'owner' })
  const [mode, setMode] = useState('login')
  const [err, setErr] = useState('')
  const go = async (data = f, m = mode) => {
    try {
      const d = await api(m === 'login' ? '/login' : '/register', 'POST', data)
      localStorage.setItem('token', d.token)
      onDone(d.role)
    } catch (e) { setErr(e.message) }
  }
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return (
    <div className="wrap"><h1>Omni Join</h1>
      <p>Project continuity and knowledge handover</p>
      <div className="card">
        <b>Quick demo login</b><br />
        <button onClick={() => go({ email: 'owner@demo.com', password: 'demo1234' }, 'login')}>
          Demo Owner (capture + review)</button>
        <button className="alt" onClick={() => go({ email: 'new@demo.com', password: 'demo1234' }, 'login')}>
          Demo Incoming Member</button>
      </div>
      <div className="card">
        <b>{mode === 'login' ? 'Login' : 'Register'}</b>
        {mode === 'register' && <>
          <input placeholder="Name" onChange={set('name')} />
          <select onChange={set('role')}>
            <option value="owner">Owner / reviewer</option>
            <option value="incoming">Incoming member</option></select></>}
        <input placeholder="Email" onChange={set('email')} />
        <input placeholder="Password" type="password" onChange={set('password')} />
        <button onClick={() => go()}>{mode === 'login' ? 'Login' : 'Create account'}</button>
        <button className="alt" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account?' : 'Have an account?'}</button>
        {err && <p style={{ color: 'red' }}>{err}</p>}
      </div>
    </div>)
}

function Capture({ pid, onAdded }) {
  const empty = { type: 'decision', text: '', reason: '', owner: '', source: '' }
  const [f, setF] = useState(empty)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (!f.text) return alert('Write what it is')
    await api(`/projects/${pid}/claims`, 'POST', f)
    setF(empty); onAdded()
  }
  return (
    <div className="card"><b>Log knowledge now</b>
      <select value={f.type} onChange={set('type')}>
        {['decision', 'task', 'blocker', 'risk', 'dependency', 'question']
          .map(t => <option key={t}>{t}</option>)}</select>
      <textarea placeholder="What is it? (e.g. Use JWT for login)" value={f.text} onChange={set('text')} />
      <input placeholder="Why / next action" value={f.reason} onChange={set('reason')} />
      <input placeholder="Owner (who is responsible)" value={f.owner} onChange={set('owner')} />
      <input placeholder="Source (file name, page, link)" value={f.source} onChange={set('source')} />
      <button onClick={save}>Add</button></div>)
}

function Review({ pid, refresh, tick }) {
  const [claims, setClaims] = useState([])
  useEffect(() => { api(`/projects/${pid}/claims`).then(setClaims) }, [pid, tick])
  const upd = async (id, body) => { await api('/claims/' + id, 'PATCH', body); refresh() }
  const edit = c => {
    const owner = prompt('Owner:', c.owner || ''); if (owner === null) return
    const reason = prompt('Reason / next action:', c.reason || ''); if (reason === null) return
    upd(c.id, { owner, reason })
  }
  return (<div>{claims.map(c => (
    <div className="card" key={c.id}>
      <span className="tag">{c.type}</span> <small>status: <b>{c.status}</b></small>
      <p><b>{c.text}</b></p>
      <small>Why: {c.reason || '—'} | Owner: {c.owner || 'not confirmed'} | Source: {c.source || 'none'}</small><br />
      {c.flags.map(f => <span className="flag" key={f}>⚠ {f}</span>)}<br />
      <button className="ok" onClick={() => upd(c.id, { status: 'approved' })}>Approve</button>
      <button className="bad" onClick={() => upd(c.id, { status: 'rejected' })}>Reject</button>
      <button className="alt" onClick={() => upd(c.id, { status: 'needs_evidence' })}>Needs evidence</button>
      <button className="alt" onClick={() => edit(c)}>Edit</button>
    </div>))}
    {!claims.length && <p>No items yet. Add some in Capture.</p>}</div>
)}

function Handover({ pid, tick }) {
  const [h, setH] = useState(null)
  useEffect(() => { api(`/projects/${pid}/handover`).then(setH) }, [pid, tick])
  if (!h) return <p>Loading…</p>
  const Sec = ({ title, items }) => (
    <div className="card"><b>{title}</b>
      {items.length ? items.map(c => (
        <p key={c.id}>• {c.text}<br />
          <small>Why: {c.reason || 'not recorded'} | Owner: {c.owner || 'not confirmed'} | Source: {c.source || 'none'}</small></p>
      )) : <p><small>Nothing approved yet.</small></p>}</div>)
  return (<div>
    <h2>Handover: {h.project?.name}</h2>
    <small>Only reviewer-approved items appear here.</small>
    <Sec title="Decisions already taken" items={h.decisions} />
    <Sec title="Unfinished work" items={h.tasks} />
    <Sec title="Blockers" items={h.blockers} />
    <Sec title="Risks" items={h.risks} />
    <Sec title="Dependencies" items={h.dependencies} />
    <Sec title="Open questions" items={h.questions} />
    <div className="card"><b>First 72 hours</b>
      {Object.entries(h.first72h).map(([k, v]) => (
        <div key={k}><b>{k}</b>{v.map((x, i) =>
          <div key={i}><label><input type="checkbox" style={{ width: 'auto' }} /> {x}</label></div>)}</div>))}
    </div></div>)
}

export default function App() {
  const [role, setRole] = useState(null)
  const [projects, setProjects] = useState([])
  const [pid, setPid] = useState(null)
  const [tab, setTab] = useState('handover')
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  useEffect(() => {
    if (!localStorage.getItem('token')) return
    api('/me').then(me => { setRole(me.role); setTab(me.role === 'owner' ? 'review' : 'handover') })
      .catch(() => localStorage.removeItem('token'))
  }, [])
  useEffect(() => {
    if (!role) return
    api('/projects').then(p => { setProjects(p); if (p[0]) setPid(p[0].id) })
  }, [role])

  if (!role) return <Login onDone={r => { setRole(r); setTab(r === 'owner' ? 'review' : 'handover') }} />
  const newProject = async () => {
    const name = prompt('Project name:'); if (!name) return
    const p = await api('/projects', 'POST', { name })
    setProjects([...projects, p]); setPid(p.id)
  }
  return (
    <div className="wrap">
      <h1>Omni Join <small>({role})</small>
        <button className="alt" onClick={() => { localStorage.clear(); setRole(null) }}>Logout</button></h1>
      <select value={pid || ''} onChange={e => setPid(Number(e.target.value))}>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {role === 'owner' && <button onClick={newProject}>+ New project</button>}
      {role === 'owner' && <div className="tabs">
        {['capture', 'review', 'handover'].map(t =>
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>}
      {pid && tab === 'capture' && role === 'owner' && <Capture pid={pid} onAdded={refresh} />}
      {pid && tab === 'review' && role === 'owner' && <Review pid={pid} refresh={refresh} tick={tick} />}
      {pid && tab === 'handover' && <Handover pid={pid} tick={tick} />}
    </div>)
}