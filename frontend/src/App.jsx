import { useEffect, useState, useCallback } from 'react'
import { STR } from './i18n.js'
import { store } from './store.js'
import Nav from './components/Nav.jsx'
import { ToastProvider } from './components/ui.jsx'
import Home from './screens/Home.jsx'
import Join from './screens/Join.jsx'
import PayScreen from './screens/PayScreen.jsx'
import Manage from './screens/Manage.jsx'

// Routes:
//   /                  → Home (create / join)
//   /g/:id             → PayScreen (the turn screen)
//   /g/:id/join        → Join (claim identity)
//   /g/:id/manage      → Manage (members + categories)
function parse(pathname) {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (parts[0] === 'g' && parts[1]) {
    const groupId = decodeURIComponent(parts[1])
    if (parts[2] === 'join') return { name: 'join', groupId }
    if (parts[2] === 'manage') return { name: 'manage', groupId }
    return { name: 'pay', groupId }
  }
  return { name: 'home' }
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [lang, setLang] = useState(() => store.getLang())
  const t = STR[lang]

  useEffect(() => { store.setLang(lang) }, [lang])
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to, replace = false) => {
    if (to === window.location.pathname) return
    if (replace) window.history.replaceState({}, '', to)
    else window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }, [])

  const route = parse(path)

  let screen
  if (route.name === 'join') screen = <Join key={route.groupId} groupId={route.groupId} t={t} navigate={navigate} />
  else if (route.name === 'manage') screen = <Manage key={route.groupId} groupId={route.groupId} t={t} navigate={navigate} />
  else if (route.name === 'pay') screen = <PayScreen key={route.groupId} groupId={route.groupId} t={t} navigate={navigate} />
  else screen = <Home t={t} navigate={navigate} />

  const showNav = route.name !== 'pay'

  return (
    <ToastProvider>
      {showNav && <Nav lang={lang} setLang={setLang} onBrand={() => navigate('/')} />}
      {screen}
    </ToastProvider>
  )
}
