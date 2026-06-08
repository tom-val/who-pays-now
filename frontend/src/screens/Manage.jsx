import { useEffect, useState } from 'react'
import { api, ApiError } from '../api.js'
import { store } from '../store.js'
import { EMOJI_CHOICES } from '../util.js'
import { PALETTE } from './Join.jsx'
import { Avatar, Spinner, useToast } from '../components/ui.jsx'

export default function Manage({ groupId, t, navigate }) {
  const toast = useToast()
  const [group, setGroup] = useState(null)
  const [status, setStatus] = useState('loading')
  const meId = store.getMemberId(groupId)

  // add-member form
  const [mName, setMName] = useState('')
  const [mColor, setMColor] = useState(null)
  // add-category form
  const [cName, setCName] = useState('')
  const [cEmoji, setCEmoji] = useState(EMOJI_CHOICES[0])
  const [busy, setBusy] = useState(false)

  const load = () => api.getGroup(groupId)
    .then((g) => { setGroup(g); setStatus('ready') })
    .catch((e) => setStatus(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error'))

  useEffect(() => { load() }, [groupId])

  if (status === 'loading') return <div className="full-center"><Spinner /></div>
  if (status !== 'ready') {
    return (
      <div className="full-center">
        <div className="card card-pad center" style={{ maxWidth: 380 }}>
          <h3>{t.notFound}</h3>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>{t.goHome}</button>
        </div>
      </div>
    )
  }

  const taken = new Set(group.members.map((m) => m.color))
  const suggestedColor = mColor || PALETTE.find((c) => !taken.has(c)) || PALETTE[0]

  const addMember = async (e) => {
    e.preventDefault()
    if (!mName.trim()) return
    setBusy(true)
    try { await api.addMember(groupId, mName.trim(), suggestedColor); setMName(''); setMColor(null); await load() }
    finally { setBusy(false) }
  }

  const removeMember = async (id) => {
    await api.removeMember(groupId, id)
    if (id === meId) store.clearMemberId(groupId)
    await load()
  }

  const addCategory = async (e) => {
    e.preventDefault()
    if (!cName.trim()) return
    setBusy(true)
    try { await api.addCategory(groupId, cName.trim(), cEmoji); setCName(''); await load() }
    finally { setBusy(false) }
  }

  const removeCategory = async (id) => { await api.removeCategory(groupId, id); await load() }

  const leave = () => {
    store.clearMemberId(groupId)
    store.clearLastGroup() // don't auto-return to a group you left
    navigate('/')
  }

  return (
    <div className="page enter">
      <button className="lnk" onClick={() => navigate(`/g/${groupId}`)} style={{ marginBottom: 6 }}>← {group.name}</button>

      {/* Members */}
      <div className="section-title">{t.members}</div>
      {group.members.map((m) => (
        <div className="list-item" key={m.id}>
          <Avatar name={m.name} color={m.color} />
          <span className="label grow">{m.name}{m.id === meId ? ' ·' : ''} {m.id === meId && <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>you</span>}</span>
          <button className="icon-btn" onClick={() => removeMember(m.id)} aria-label={t.remove}>✕</button>
        </div>
      ))}
      <form className="card card-pad" onSubmit={addMember} style={{ marginTop: 12 }}>
        <label className="field-lbl">{t.addMember}</label>
        <input className="input" value={mName} onChange={(e) => setMName(e.target.value)} placeholder={t.yourNamePh} maxLength={30} />
        <div className="color-grid" style={{ marginTop: 12 }}>
          {PALETTE.map((c) => (
            <button type="button" key={c} className={`opt ${suggestedColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setMColor(c)} aria-label="colour" />
          ))}
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || !mName.trim()}>{t.add}</button>
      </form>

      {/* Categories */}
      <div className="section-title">{t.categories}</div>
      {group.categories.map((c) => (
        <div className="list-item" key={c.id}>
          <span className="icon-emoji">{c.emoji || '💸'}</span>
          <span className="label grow">{c.name}</span>
          <button className="icon-btn" onClick={() => removeCategory(c.id)} aria-label={t.remove}>✕</button>
        </div>
      ))}
      <form className="card card-pad" onSubmit={addCategory} style={{ marginTop: 12 }}>
        <label className="field-lbl">{t.addCategory}</label>
        <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Restaurant" maxLength={40} />
        <label className="field-lbl" style={{ marginTop: 12 }}>{t.emoji}</label>
        <div className="emoji-grid">
          {EMOJI_CHOICES.map((em) => (
            <button type="button" key={em} className={cEmoji === em ? 'on' : ''} onClick={() => setCEmoji(em)}>{em}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || !cName.trim()}>{t.add}</button>
      </form>

      <div style={{ marginTop: 28 }}>
        <button className="btn btn-ghost btn-block" onClick={leave} style={{ color: 'var(--bad)' }}>{t.leaveGroup}</button>
      </div>
    </div>
  )
}
