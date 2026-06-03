import { useEffect, useRef, useState, useCallback } from 'react'
import { api, ApiError } from '../api.js'
import { store } from '../store.js'
import { fmt } from '../i18n.js'
import { Avatar, Modal, Spinner, useToast } from '../components/ui.jsx'

const POLL_MS = 4000
const SWIPE_THRESHOLD = 56

export default function PayScreen({ groupId, t, navigate }) {
  const toast = useToast()
  const [group, setGroup] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | error
  const [catIndex, setCatIndex] = useState(0)
  const [modal, setModal] = useState(false)
  const [paying, setPaying] = useState(false)
  const [dx, setDx] = useState(0)
  const [sliding, setSliding] = useState(false)

  const meId = store.getMemberId(groupId)
  const drag = useRef({ x0: 0, dx: 0, active: false, moved: false })

  const load = useCallback(async (initial = false) => {
    try {
      const g = await api.getGroup(groupId)
      setGroup(g)
      setStatus('ready')
    } catch (e) {
      if (initial) setStatus(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error')
    }
  }, [groupId])

  // No identity yet for this group → go claim one.
  useEffect(() => {
    if (!meId) navigate(`/g/${groupId}/join`, true)
  }, [meId, groupId, navigate])

  useEffect(() => { load(true) }, [load])

  // Poll for fresh turn state; pause while a modal is open or mid-drag.
  useEffect(() => {
    const tick = () => { if (!modal && !drag.current.active && !document.hidden) load() }
    const iv = setInterval(tick, POLL_MS)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [load, modal])

  const cats = group?.categories || []
  const members = group?.members || []
  const idx = Math.min(catIndex, Math.max(0, cats.length - 1))
  const cat = cats[idx]
  const payer = cat ? members.find((m) => m.id === cat.currentPayerId) : null
  const itsMe = payer && payer.id === meId
  const panelColor = payer?.color || 'var(--c-violet)'

  // Once identity is missing from the group (member removed elsewhere), re-claim.
  useEffect(() => {
    if (status === 'ready' && meId && members.length && !members.some((m) => m.id === meId)) {
      store.clearMemberId(groupId)
      navigate(`/g/${groupId}/join`, true)
    }
  }, [status, meId, members, groupId, navigate])

  const goCat = (next) => {
    if (next < 0 || next >= cats.length) return
    setSliding(true)
    setCatIndex(next)
    setDx(0)
  }

  const onPointerDown = (e) => {
    drag.current = { x0: e.clientX, dx: 0, active: true, moved: false }
    setSliding(false)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current.active) return
    const d = e.clientX - drag.current.x0
    drag.current.dx = d
    if (Math.abs(d) > 8) drag.current.moved = true
    setDx(d)
  }
  const endDrag = () => {
    if (!drag.current.active) return
    const d = drag.current.dx
    drag.current.active = false
    setSliding(true)
    if (d <= -SWIPE_THRESHOLD && idx < cats.length - 1) goCat(idx + 1)
    else if (d >= SWIPE_THRESHOLD && idx > 0) goCat(idx - 1)
    else setDx(0)
  }

  const onPanelClick = () => {
    if (drag.current.moved) return
    if (!cat || !payer) return
    setModal(true)
  }

  const confirmPaid = async () => {
    if (!cat || !payer) return
    setPaying(true)
    try {
      const updated = await api.pay(groupId, cat.id, payer.id)
      setGroup((g) => ({ ...g, categories: g.categories.map((c) => (c.id === updated.id ? updated : c)) }))
      toast(fmt(t.paidToast, { name: payer.name }))
      setModal(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { toast(t.turnMoved, 'bad'); load() }
      else toast(t.errGeneric, 'bad')
    } finally {
      setPaying(false)
    }
  }

  const shareLink = async () => {
    const url = `${location.origin}/g/${groupId}`
    try {
      if (navigator.share) await navigator.share({ title: group.name, text: t.tagline, url })
      else { await navigator.clipboard.writeText(url); toast(t.shareCopied) }
    } catch { /* user dismissed share sheet */ }
  }

  if (status === 'loading' || !meId) return <div className="full-center"><Spinner /></div>
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
    <div className="pay-wrap">
      <div className="pay-top">
        <div className="pay-group">
          <span className="name">{group.name}</span>
          <span className="meta">{members.length} {members.length === 1 ? 'person' : 'people'} · {cats.length} {cats.length === 1 ? 'category' : 'categories'}</span>
        </div>
        <div className="row gap-8">
          <button className="btn btn-ghost btn-sm" onClick={shareLink}>↗ {t.share}</button>
          <button className="btn btn-soft btn-sm" onClick={() => navigate(`/g/${groupId}/manage`)}>{t.manage}</button>
        </div>
      </div>

      <div
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
      >
        {cats.length > 1 && <div className="swipe-edge l" aria-hidden>‹</div>}
        {cats.length > 1 && <div className="swipe-edge r" aria-hidden>›</div>}

        {cat ? (
          <div
            key={cat.id}
            className={`panel ${itsMe ? 'mine' : ''}`}
            style={{
              '--panel-color': panelColor,
              transform: `translateX(${dx}px)`,
              transition: sliding ? 'transform 0.3s var(--ease), background 0.3s' : 'background 0.3s',
            }}
            onClick={onPanelClick}
          >
            <span className="cat"><span className="emoji">{cat.emoji || '💸'}</span>{cat.name}</span>
            {payer ? (
              <>
                <div className="turn-label">{itsMe ? t.yourTurn : t.turnNow}</div>
                <div className="payer">{payer.name}</div>
                <div className="hint"><span className="tap-ring">€</span>{t.tapToPay}</div>
              </>
            ) : (
              <div style={{ marginTop: 30 }}>
                <div className="payer" style={{ fontSize: 30 }}>{t.noMembers}</div>
                <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={(e) => { e.stopPropagation(); navigate(`/g/${groupId}/manage`) }}>{t.addPeople}</button>
              </div>
            )}
          </div>
        ) : (
          <div className="panel empty-stage" style={{ '--panel-color': 'var(--surface)', color: 'var(--ink)' }}>
            <h3>{t.noCategories}</h3>
            <p className="soft" style={{ margin: '10px 0 18px' }}>{t.addFirstCat}</p>
            <button className="btn btn-primary" onClick={() => navigate(`/g/${groupId}/manage`)}>{t.addCategory}</button>
          </div>
        )}
      </div>

      {cats.length > 1 && (
        <div className="dots">
          {cats.map((c, i) => (
            <button key={c.id} className={`dot ${i === idx ? 'on' : ''}`} onClick={() => goCat(i)} aria-label={c.name} />
          ))}
        </div>
      )}

      {cat && members.length > 0 && (
        <div className="tally">
          {members.map((m) => (
            <span key={m.id} className={`who ${m.id === cat.currentPayerId ? 'up' : ''}`}>
              <Avatar name={m.name} color={m.color} size={26} />
              <span className="n">{m.name}</span>
              <span className="c">{cat.payCounts?.[m.id] || 0}</span>
            </span>
          ))}
        </div>
      )}

      {modal && payer && (
        <Modal onClose={() => !paying && setModal(false)}>
          <div className="big-emoji">{cat.emoji || '💸'}</div>
          <h3 className="center">{fmt(t.didPay, { name: payer.name })}</h3>
          <p className="sub center">{fmt(t.forCategory, { cat: cat.name })}</p>
          <div className="stack gap-10">
            <button className="btn btn-primary btn-lg btn-block" onClick={confirmPaid} disabled={paying}>
              {paying ? t.loading : t.yesPaid}
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setModal(false)} disabled={paying}>{t.notYet}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
