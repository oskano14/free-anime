import { useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import * as api from './api'
import Browse from './pages/Browse'
import Anime from './pages/Anime'
import Scans from './pages/Scans'
import ScanReader from './pages/ScanReader'
import Downloads from './pages/Downloads'

const SECTIONS = [
  { to: '/', label: 'vidéo' },
  { to: '/scans', label: 'scans' },
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

  const onDetail = /^\/(anime|scans)\/.+/.test(pathname)
  const inScans = pathname.startsWith('/scans')
  const inDl = pathname.startsWith('/telechargements')

  const sectionActive = (to) =>
    to === '/telechargements' ? inDl : to === '/scans' ? inScans && !inDl : !inScans && !inDl

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
            <span className="text-[clamp(2.5rem,6vw,4rem)] tracking-wide">anime sama</span>
          </Link>

          <nav className="flex items-center gap-2 text-xl">
            {SECTIONS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="sd-link"
                // NavLink ne sait pas qu'une page de détail (/anime/…) fait
                // encore partie de sa section : on décide nous-mêmes.
                data-active={sectionActive(s.to)}
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

        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/anime/:title" element={<Anime />} />
          <Route path="/anime/:title/:saison/:version" element={<Anime />} />
          <Route path="/anime/:title/:saison/:version/:episode" element={<Anime />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/scans/:title" element={<ScanReader />} />
          <Route path="/scans/:title/:chapitre" element={<ScanReader />} />
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
