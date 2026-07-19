import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import * as api from './api'
import Browse from './pages/Browse'
import Anime from './pages/Anime'
import Scans from './pages/Scans'
import ScanReader from './pages/ScanReader'
import Downloads from './pages/Downloads'
import Semaine from './pages/Semaine'

const SECTIONS = [
  { to: '/', label: 'vidéo' },
  { to: '/scans', label: 'scans' },
  { to: '/planning', label: 'planning' },
  { to: '/telechargements', label: 'hors-ligne' },
]

function Star() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9L12 2.5z" />
    </svg>
  )
}

export default function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [surprise, setSurprise] = useState(false)

  // Diagnostic global : si anime-sama est injoignable (FAI/DNS/région),
  // l'app serait vide sans explication. On l'affiche franchement.
  const [statut, setStatut] = useState(null)
  useEffect(() => {
    api.getStatus().then(setStatut).catch(() => {})
  }, [])

  const onDetail = /^\/(anime|scans)\/.+/.test(pathname)
  const inScans = pathname.startsWith('/scans')
  const inDl = pathname.startsWith('/telechargements')
  const inSemaine = pathname.startsWith('/planning')

  // Une page de détail (/anime/…) reste dans sa section : on résout la section
  // active une bonne fois, puis chaque lien compare son chemin.
  const activeSection = inDl ? '/telechargements' : inScans ? '/scans' : inSemaine ? '/planning' : '/'

  // "me surprendre" : anime-sama sait rendre une œuvre au hasard (random=1).
  async function meSurprendre() {
    setSurprise(true)
    try {
      const data = await api.getCatalogue({
        type: [inScans ? 'Scans' : 'Anime'],
        random: true,
      })
      const pick = data.items[0]
      if (pick) {
        const base = inScans ? '/scans' : '/anime'
        navigate(`${base}/${encodeURIComponent(pick.title)}`)
      }
    } catch {
      // Un tirage raté ne mérite pas d'écran d'erreur : on ne bouge pas.
    } finally {
      setSurprise(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="leading-none">
            <span className="text-[clamp(2.5rem,6vw,4rem)] tracking-wide">free anime</span>
          </Link>

          <nav className="flex items-center gap-2 text-xl">
            {SECTIONS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="sd-link"
                data-active={s.to === activeSection}
              >
                {s.label}
              </Link>
            ))}
            {onDetail && (
              <button onClick={() => navigate(-1)} className="sd-link">
                ← retour
              </button>
            )}
          </nav>

          <button onClick={meSurprendre} disabled={surprise} className="sd-btn text-xl">
            <span>{surprise ? 'un instant…' : 'me surprendre'}</span>
            <Star />
          </button>
        </header>

        {statut && !statut.ok && (
          <div className="mb-6 rounded-[20px] border-2 border-red-500 bg-black px-5 py-4 text-red-400">
            <p className="text-xl">⚠ anime-sama injoignable</p>
            <p className="mt-1 text-base text-white/70">{statut.message}</p>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/anime/:title" element={<Anime />} />
          <Route path="/anime/:title/:saison/:version" element={<Anime />} />
          <Route path="/anime/:title/:saison/:version/:episode" element={<Anime />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/scans/:title" element={<ScanReader />} />
          <Route path="/scans/:title/:chapitre" element={<ScanReader />} />
          <Route path="/planning" element={<Semaine />} />
          <Route path="/telechargements" element={<Downloads />} />
        </Routes>

        <footer className="mt-16 flex justify-center gap-6 border-t-2 border-white/15 py-6 text-lg text-white/60">
          <span>{new Date().getFullYear()}</span>
          <span>·</span>
          <span>usage local</span>
        </footer>
      </div>
    </div>
  )
}
