import { useState } from 'react'
import { api, ApiError } from '../api.js'
import { parseGroupRef } from '../util.js'

export default function Home({ t, navigate }) {
  const [tab, setTab] = useState('create')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const switchTab = (next) => { setTab(next); setErr(''); setValue('') }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')

    setBusy(true)
    try {
      if (tab === 'create') {
        const name = value.trim()
        if (name.length < 2) { setErr(t.errGeneric); return }
        const g = await api.createGroup(name)
        navigate(`/g/${g.id}/join`)
      } else {
        const id = parseGroupRef(value)
        if (!id) { setErr(t.notFound); return }
        // Verify it exists before sending the user into the group.
        await api.getGroup(id)
        navigate(`/g/${id}/join`)
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setErr(t.notFound)
      else setErr(e.message || t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page enter">
      <div className="hero">
        <h1>{t.tagline}</h1>
        <p>{t.blurb}</p>
      </div>

      <div className="card card-pad enter enter-d1">
        <div className="tabs" role="tablist">
          <button className={tab === 'create' ? 'on' : ''} onClick={() => switchTab('create')}>{t.create}</button>
          <button className={tab === 'join' ? 'on' : ''} onClick={() => switchTab('join')}>{t.join}</button>
        </div>

        <form onSubmit={submit} style={{ marginTop: 18 }}>
          <label className="field-lbl">{tab === 'create' ? t.groupName : t.joinLabel}</label>
          <input
            className="input big"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={tab === 'create' ? t.groupNamePh : t.joinPh}
            autoFocus
            maxLength={tab === 'create' ? 60 : 200}
          />
          {tab === 'join' && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t.joinHint}</p>}
          {err && <p className="err">{err}</p>}
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? t.loading : tab === 'create' ? t.createGroup : t.joinGroup}
          </button>
        </form>
      </div>
    </div>
  )
}
