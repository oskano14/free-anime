import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../api'
import { saveScanProgress } from '../progress'

export default function ScanReader() {
  const navigate = useNavigate()
  const { title, chapitre } = useParams()

  const [data, setData] = useState(null)
  const [pages, setPages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const topRef = useRef(null)

  // Liste des chapitres.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setData(null)

    api
      .getScanChapitres(title)
      // ~14% des titres tagges "Scans" n'ont pas de fichiers heberges.
      .catch((err) => !cancelled && setError(err.message))
      .then((d) => !cancelled && d && setData(d))

    return () => {
      cancelled = true
    }
  }, [title])

  // Pages du chapitre courant.
  useEffect(() => {
    if (!chapitre) return setPages(null)

    let cancelled = false
    setLoading(true)
    setPages(null)
    setError(null)

    api
      .getScanPages(title, chapitre)
      .then((d) => {
        if (cancelled) return
        setPages(d)
        topRef.current?.scrollIntoView()
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [title, chapitre])

  useEffect(() => {
    if (chapitre && data) saveScanProgress(title, chapitre, data.total)
  }, [title, chapitre, data])

  const list = data?.chapitres ?? []
  const index = list.findIndex((c) => String(c.chapitre) === String(chapitre))
  const prev = index > 0 ? list[index - 1] : null
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null

  const go = (c) => navigate(`/scans/${encodeURIComponent(title)}/${encodeURIComponent(c.chapitre)}`)

  const Nav = () => (
    <div className="flex items-center justify-center gap-3">
      <button
        disabled={!prev}
        onClick={() => prev && go(prev)}
        className="sd-btn text-lg"
      >
        ← Chapitre {prev?.chapitre ?? ''}
      </button>
      <span className="text-sm tabular-nums text-white/70">
        {chapitre} / {data?.total ?? '…'}
      </span>
      <button
        disabled={!next}
        onClick={() => next && go(next)}
        className="sd-btn text-lg"
      >
        Chapitre {next?.chapitre ?? ''} →
      </button>
    </div>
  )

  return (
    <div className="space-y-5" ref={topRef}>
      <div>
        <h1 className="text-4xl tracking-wide">{data?.titre ?? title}</h1>
        <p className="mt-1 text-sm text-white/50">
          {data ? `${data.total} chapitres` : 'Chargement…'}
          {chapitre && ` · chapitre ${chapitre}`}
          {pages && ` · ${pages.pages} pages`}
        </p>
      </div>

      {error && (
        <p className="rounded-[20px] border-2 border-red-500 bg-black px-4 py-3 text-lg text-red-400">
          {error}
        </p>
      )}

      {chapitre && pages && <Nav />}

      {loading && <p className="text-sm text-white/50">Chargement du chapitre…</p>}

      {pages && (
        <div className="mx-auto max-w-3xl space-y-1">
          {pages.images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`Page ${i + 1}`}
              // ~920 Ko par page : sans lazy, un chapitre de 55 pages tire
              // ~50 Mo d'un coup.
              loading={i < 2 ? 'eager' : 'lazy'}
              // min-h est ce qui rend le lazy efficace : une image pas encore
              // chargée mesure 0px de haut, donc les 55 s'empilent au même
              // endroit et le navigateur les croit toutes visibles. Réserver
              // de la hauteur les espace pour de bon. Une page de manga rendue
              // à cette largeur dépasse toujours 70vh, donc pas de trou après
              // chargement.
              className="min-h-[70vh] w-full bg-black"
            />
          ))}
        </div>
      )}

      {chapitre && pages && <Nav />}

      {!chapitre && data && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {list.map((c) => (
            <button
              key={c.chapitre}
              onClick={() => go(c)}
              title={`${c.pages} pages`}
              className="rounded-[14px] border-2 border-white bg-black px-2 py-2 text-base transition-all duration-300 hover:bg-white hover:text-black"
            >
              {c.chapitre}
            </button>
          ))}
        </div>
      )}

      {chapitre && data && (
        <details className="sd-card p-4">
          <summary className="cursor-pointer text-lg text-white/70">
            Tous les chapitres ({data.total})
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {list.map((c) => (
              <button
                key={c.chapitre}
                onClick={() => go(c)}
                className={[
                  'rounded-[14px] border-2 px-2 py-2 text-base transition-all duration-300',
                  String(c.chapitre) === String(chapitre)
                    ? 'border-white bg-white text-black'
                    : 'border-white bg-black text-white hover:bg-white hover:text-black',
                ].join(' ')}
              >
                {c.chapitre}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
