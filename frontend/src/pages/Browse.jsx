import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { resumeList, watchedList, watchedSet } from '../progress'
import SearchBar from '../components/SearchBar'
import AnimeCard from '../components/AnimeCard'
import PosterRow from '../components/PosterRow'

// Pas de catégorie "Tout" : anime-sama combine les type[] en ET, donc
// "Anime OU Film" est inexprimable, et sans filtre on récupère les titres
// scans-only — sans vidéo derrière.
export const CATEGORIES = [
  { id: 'saison', label: 'De la saison', filters: { type: ['Anime'], statut: ['En cours'] } },
  { id: 'anime', label: 'Animés', filters: { type: ['Anime'] } },
  { id: 'film', label: 'Films', filters: { type: ['Film'] } },
]

export default function Browse() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const category = params.get('cat') ?? 'saison'
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
  const [vusRow, setVusRow] = useState([])
  const [sorties, setSorties] = useState(null)
  // Recalculé à chaque montage : de retour d'un anime terminé, tout se met à jour.
  const [vus, setVus] = useState(() => watchedSet())

  useEffect(() => {
    setResume(resumeList())
    setVusRow(watchedList())
    setVus(watchedSet())
    api.getFilters().then((f) => setGenres(f.genres)).catch(() => {})
    api.getSorties().then(setSorties).catch(() => {})
  }, [])

  function patch(next) {
    const merged = { cat: category, genre, page: '1', ...next }
    const clean = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v && v !== '1' && v !== ''),
    )
    // 'page' saute du clean quand il vaut 1 : l'URL reste propre.
    if (merged.page && merged.page !== '1') clean.page = merged.page
    setParams(clean, { replace: false })
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
      .then((r) => !cancelled && setResults(r))
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

    const { filters } = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]

    api
      .getCatalogue({ ...filters, genre: genre ? [genre] : [], page })
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
  }, [category, genre, page, query])

  const open = (item) => navigate(`/anime/${encodeURIComponent(item.title)}`)
  const shown = query ? results : items

  return (
    <div className="space-y-5">
      <SearchBar onSearch={search} initial={query} autoFocus />

      {!query && sorties?.animes?.length > 0 && (
        <PosterRow
          titre={`Sorties du ${sorties.jour}${sorties.date ? ` — ${sorties.date}` : ''}`}
          items={sorties.animes.map((a) => ({
            key: `sortie-${a.title}`,
            title: a.title,
            image: a.image,
            sous: a.langues.join(' · '),
            nav: `/anime/${encodeURIComponent(a.title)}`,
          }))}
          onOpen={(it) => navigate(it.nav)}
        />
      )}

      {!query && (
        <>
          <PosterRow
            titre="Reprendre"
            items={resume.map((r) => ({
              key: `${r.title}|${r.saison}|${r.version}`,
              title: r.title,
              image: r.image,
              time: r.time,
              duration: r.duration,
              sous: `${r.saison} · ${r.version.toUpperCase()} · ép. ${r.numero}`,
              nav: `/anime/${encodeURIComponent(r.title)}/${encodeURIComponent(r.saison)}/${r.version}/${r.episode}`,
            }))}
            onOpen={(it) => navigate(it.nav)}
          />
          <PosterRow
            titre="Déjà regardé"
            items={vusRow.map((v) => ({
              key: v.title,
              title: v.title,
              image: v.image,
              sous: 'terminé',
              nav: `/anime/${encodeURIComponent(v.title)}`,
            }))}
            onOpen={(it) => navigate(it.nav)}
          />
        </>
      )}

      {!query && (
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => patch({ cat: c.id, page: '1' })}
              className="sd-link text-xl"
              data-active={category === c.id}
            >
              {c.label}
            </button>
          ))}

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
          {query ? 'Aucun résultat.' : 'Rien dans cette catégorie.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((item) => (
          <AnimeCard key={item.link} item={item} onOpen={open} watched={vus.has(item.title)} />
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
