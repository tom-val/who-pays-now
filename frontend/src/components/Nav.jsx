export default function Nav({ lang, setLang, onBrand, right }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <button className="brand" onClick={onBrand} aria-label="Who Pays Now home">
          <span className="brand-mark"><span>€</span></span>
          <span className="brand-name">Who Pays Now</span>
        </button>
        <div className="nav-right">
          {right}
          <div className="seg" role="group" aria-label="Language">
            {['en', 'lt'].map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
