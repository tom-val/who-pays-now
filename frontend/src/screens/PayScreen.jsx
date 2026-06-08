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
  const [pos, setPos] = useState(1) // carousel slide slot (loops via clones)
  const [snap, setSnap] = useState(false) // true while teleporting across the loop seam (no transition)
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
      store.setLastGroup(groupId) // remember for next PWA launch
    } catch (e) {
      if (initial && e instanceof ApiError && e.status === 404) {
        store.clearLastGroup() // don't keep bouncing into a dead group
        setStatus('notfound')
      } else if (initial) {
        setStatus('error')
      }
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
  const N = cats.length
  const looping = N > 1
  // Render real panels flanked by clones of the last/first so the track can
  // slide past either end, then teleport back invisibly: [cN-1, c0..cN-1, c0].
  const slides = looping ? [cats[N - 1], ...cats, cats[0]] : cats
  const step = 100 / (slides.length || 1)
  const realIdx = looping ? (((pos - 1) % N) + N) % N : 0
  const cat = cats[realIdx]
  const payer = cat ? members.find((m) => m.id === cat.currentPayerId) : null

  // Keep the slot valid when the category count changes (added/removed).
  useEffect(() => {
    setPos(N > 1 ? 1 : 0)
    setDx(0)
    setSliding(false)
  }, [N])

  // After a slide lands on a clone, jump (without animation) to its real twin.
  useEffect(() => {
    if (!snap) return
    const id = requestAnimationFrame(() => setSnap(false))
    return () => cancelAnimationFrame(id)
  }, [snap])

  // Once identity is missing from the group (member removed elsewhere), re-claim.
  useEffect(() => {
    if (status === 'ready' && meId && members.length && !members.some((m) => m.id === meId)) {
      store.clearMemberId(groupId)
      navigate(`/g/${groupId}/join`, true)
    }
  }, [status, meId, members, groupId, navigate])

  // Jump to a real category index (from the dots), animated.
  const goCat = (i) => {
    setSnap(false)
    setSliding(true)
    setPos(looping ? i + 1 : 0)
    setDx(0)
  }

  // When a slide animation ends on a clone, teleport to the matching real slot.
  const onTrackTransitionEnd = () => {
    if (!looping) return
    if (pos > N) { setSnap(true); setPos(pos - N) }
    else if (pos < 1) { setSnap(true); setPos(pos + N) }
  }

  const onPointerDown = (e) => {
    drag.current = { x0: e.clientX, dx: 0, active: true, moved: false }
    setSliding(false)
    // NB: don't setPointerCapture here — capturing on the stage redirects the
    // click away from inner buttons (Add category) and the tappable panel.
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
    setSnap(false)
    // A decisive horizontal swipe steps the carousel (wraps around endlessly)…
    if (looping && d <= -SWIPE_THRESHOLD) { setPos(pos + 1); setDx(0); return }
    if (looping && d >= SWIPE_THRESHOLD) { setPos(pos - 1); setDx(0); return }
    setDx(0)
    // …a near-stationary release is a tap to pay. (Buttons inside the stage
    // handle their own clicks; here cat/payer are null so we no-op for them.)
    if (Math.abs(d) < 10 && cat && payer) setModal(true)
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

        {cats.length === 0 ? (
          <div className="panel empty-stage" style={{ '--panel-color': 'var(--surface)', color: 'var(--ink)' }}>
            <h3>{t.noCategories}</h3>
            <p className="soft" style={{ margin: '10px 0 18px' }}>{t.addFirstCat}</p>
            <button className="btn btn-primary" onClick={() => navigate(`/g/${groupId}/manage`)}>{t.addCategory}</button>
          </div>
        ) : (
          <div
            className="track"
            onTransitionEnd={onTrackTransitionEnd}
            style={{
              width: `${slides.length * 100}%`,
              transform: `translateX(calc(${-(looping ? pos : 0) * step}% + ${looping ? dx : 0}px))`,
              transition: sliding && !snap ? 'transform 0.36s var(--ease-out)' : 'none',
            }}
          >
            {slides.map((c, s) => {
              const p = members.find((m) => m.id === c.currentPayerId)
              const mine = p && p.id === meId
              return (
                <div className="cat-panel" key={s} style={{ width: `${step}%` }}>
                  <div className={`panel ${mine ? 'mine' : ''}`} style={{ '--panel-color': p?.color || 'var(--c-violet)' }}>
                    <span className="cat"><span className="emoji">{c.emoji || '💸'}</span>{c.name}</span>
                    {p ? (
                      <>
                        <div className="turn-label">{mine ? t.yourTurn : t.turnNow}</div>
                        <div className="payer">{p.name}</div>
                        <div className="hint"><span className="tap-ring">€</span>{t.tapToPay}</div>
                      </>
                    ) : (
                      <div style={{ marginTop: 30 }}>
                        <div className="payer" style={{ fontSize: 30 }}>{t.noMembers}</div>
                        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={(e) => { e.stopPropagation(); navigate(`/g/${groupId}/manage`) }}>{t.addPeople}</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {looping && (
        <div className="dots">
          {cats.map((c, i) => (
            <button key={c.id} className={`dot ${i === realIdx ? 'on' : ''}`} onClick={() => goCat(i)} aria-label={c.name} />
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
