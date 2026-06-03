import { useEffect, useState, useCallback, createContext, useContext } from 'react'

export function initials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0][0] || '?').toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, color, size = 36 }) {
  return (
    <span className="av" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  )
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="loading" />
}

export function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}

// --- toast ---
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const show = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind, id: Math.random() })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'bad' ? 'bad' : ''}`}>{toast.msg}</div>}
    </ToastCtx.Provider>
  )
}
