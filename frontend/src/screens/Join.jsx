import { useEffect, useState } from 'react'
import { api, ApiError } from '../api.js'
import { store } from '../store.js'
import { Avatar, Spinner } from '../components/ui.jsx'

// Mirror of the backend colour palette (Domain.Palette).
export const PALETTE = [
  'oklch(0.62 0.19 285)', 'oklch(0.68 0.18 28)', 'oklch(0.68 0.13 165)',
  'oklch(0.76 0.14 75)', 'oklch(0.66 0.14 235)', 'oklch(0.69 0.17 350)',
  'oklch(0.64 0.16 140)', 'oklch(0.70 0.15 55)', 'oklch(0.60 0.16 300)',
  'oklch(0.66 0.13 195)',
]

export default function Join({ groupId, t, navigate }) {
  const [group, setGroup] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound
  const [name, setName] = useState('')
  const [color, setColor] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.getGroup(groupId)
      .then((g) => { if (alive) { setGroup(g); setStatus('ready') } })
      .catch((e) => { if (alive) setStatus(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error') })
    return () => { alive = false }
  }, [groupId])

  // Default colour = first not already taken by an existing member.
  const taken = new Set((group?.members || []).map((m) => m.color))
  const suggested = color || PALETTE.find((c) => !taken.has(c)) || PALETTE[0]

  const claim = (memberId) => {
    store.setMemberId(groupId, memberId)
    navigate(`/g/${groupId}`)
  }

  const addMe = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const m = await api.addMember(groupId, trimmed, suggested)
      claim(m.id)
    } catch (e) {
      setBusy(false)
    }
  }

  if (status === 'loading') return <div className="full-center"><Spinner /></div>
  if (status === 'notfound' || status === 'error') {
    return (
      <div className="full-center">
        <div className="card card-pad center" style={{ maxWidth: 380 }}>
          <h3>{t.notFound}</h3>
          <p className="soft" style={{ margin: '8px 0 18px' }}>{t.notFoundSub}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>{t.goHome}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page enter">
      <button className="lnk" onClick={() => navigate('/')} style={{ marginBottom: 8 }}>← {t.back}</button>
      <div className="hero" style={{ margin: '4px 0 20px' }}>
        <h1 style={{ fontSize: 26 }}>{group.name}</h1>
        <p style={{ marginTop: 6 }}>{t.whoAreYou}</p>
      </div>

      {group.members.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>{t.claimExisting}</p>
          <div className="stack" style={{ gap: 8 }}>
            {group.members.map((m) => (
              <button key={m.id} className="list-item" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => claim(m.id)}>
                <Avatar name={m.name} color={m.color} />
                <span className="label grow">{m.name}</span>
                <span className="lnk" style={{ pointerEvents: 'none' }}>{t.imIn} →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="card card-pad" onSubmit={addMe}>
        <label className="field-lbl">{t.yourName}</label>
        <input className="input big" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.yourNamePh} maxLength={30} />

        <label className="field-lbl" style={{ marginTop: 16 }}>{t.pickColor}</label>
        <div className="color-grid">
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              className={`opt ${suggested === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label="colour"
            />
          ))}
        </div>

        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 20 }} disabled={busy || !name.trim()}>
          {busy ? t.loading : t.addMe}
        </button>
      </form>
    </div>
  )
}
