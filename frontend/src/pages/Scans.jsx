import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { recentScans } from '../progress'
import SearchBar from '../components/SearchBar'
import AnimeCard from '../components/AnimeCard'

export default function Scans() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const genre = params.get('genre') ?? ''
  const page = Number(params.get('page') ?? 1)
  const query = params.get('q') ?? ''

  const [genres, setGenres] = useState([])
  const [items, setItems] = useState([])
  const [lastPage, setLastPage] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [resume, setResume] = useState([])

  useEffect(() => {
    setResume(recentScans())
    api.getFilters().then((f) => setGenres(f.genres)).catch(() => {})
  }, [])

  function patch(next) {
    const merged = { genre, ...next }
    const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
    if (next.page && next.page !== '1') clean.page = next.page
    setParams(clean)
  }

  const search = useCallback(
    (q) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (q) next.set('q', q)
        else next.delete('q')
        return next
      })
    },
    [setParams],
  )

  useEffect(() => {
    if (!query) return setResults([])
    let cancelled = false
    setSearching(true)
    api
      .searchAnime(query)
      // La recherche porte sur tout le catalogue : ici on ne garde que ce qui
      // a des scans.
      .then((r) => !cancelled && setResults(r.filter((x) => x.types.includes('Scans'))))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setSearching(false))
    return () => {
      cancelled = true
    }
  }, [query])

  useEffect(() => {
    if (query) return
    let cancelled = false
    setBrowsing(true)
    setError(null)

    api
      .getCatalogue({ type: ['Scans'], genre: genre ? [genre] : [], page })
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setLastPage(data.derniere_page)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setBrowsing(false))

    return () => {
      cancelled = true
    }
  }, [genre, page, query])

  const open = (item) => navigate(`/scans/${encodeURIComponent(item.title)}`)
  const shown = query ? results : items

  return (
    <div className="space-y-5">
      <SearchBar onSearch={search} initial={query} autoFocus />

      {!query && resume.length > 0 && (
        <section className="space-y-2">
          <h2 className="sd-heading">
            Reprendre la lecture
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {resume.map((r) => (
              <button
                key={r.title}
                onClick={() =>
                  navigate(`/scans/${encodeURIComponent(r.title)}/${encodeURIComponent(r.chapitre)}`)
                }
                className="sd-card p-3 text-left"
              >
                <p className="truncate text-lg">{r.title}</p>
                <p className="mt-0.5 text-sm text-white/50">
                  Chapitre {r.chapitre}
                  {r.total ? ` / ${r.total}` : ''}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {!query && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={genre}
            onChange={(e) => patch({ genre: e.target.value, page: '1' })}
            className="sd-field ml-auto px-4 py-2 text-lg"
          >
            <option value="">Tous les genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="rounded-[20px] border-2 border-red-500 bg-black px-4 py-3 text-lg text-red-400">
          {error}
        </p>
      )}

      {(browsing || searching) && (
        <p className="text-sm text-white/50">{searching ? 'Recherche…' : 'Chargement…'}</p>
      )}

      {!browsing && !searching && shown.length === 0 && (
        <p className="py-12 text-center text-sm text-white/40">
          {query ? 'Aucun scan pour cette recherche.' : 'Rien ici.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((item) => (
          <AnimeCard key={item.link} item={item} onOpen={open} />
        ))}
      </div>

      {!query && shown.length > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => patch({ page: String(page - 1) })}
            className="sd-btn text-lg"
          >
            ← Précédent
          </button>
          <span className="text-sm tabular-nums text-white/70">Page {page}</span>
          <button
            disabled={lastPage}
            onClick={() => patch({ page: String(page + 1) })}
            className="sd-btn text-lg"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
