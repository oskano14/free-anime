// Vide en dev (proxy Vite -> same-origin), URL publique de l'API en prod.
const BASE = import.meta.env.VITE_API_URL ?? ''

async function get(path, params) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}${path}?${qs}`)
  const data = await res.json().catch(() => null)

  if (data && data.error) throw new Error(data.error)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return data
}

// getSerchAnime renvoie 'lien', getCatalogue renvoie 'link' : on aplanit ici
// plutôt que de trimballer les deux formes dans les composants.
const toCard = (x) => ({
  title: x.title,
  link: x.lien ?? x.link,
  image: x.image ?? null,
  genres: x.genres ?? [],
  types: x.types ?? [],
  langues: x.langues ?? [],
})

export const searchAnime = async (q, limit = 24) =>
  (await get('/api/getSerchAnime', { q, l: limit })).map(toCard)

export const getFilters = () => get('/api/getFilters')

export const getSorties = () => get('/api/getSorties', {})

export const getSemaine = () => get('/api/getSemaine', {})

export async function getCatalogue({ type = [], genre = [], langue = [], statut = [], page = 1, random = false }) {
  const params = new URLSearchParams()
  type.forEach((v) => params.append('type', v))
  genre.forEach((v) => params.append('genre', v))
  langue.forEach((v) => params.append('langue', v))
  statut.forEach((v) => params.append('statut', v))
  params.set('page', page)
  if (random) params.set('random', '1')

  const res = await fetch(`${BASE}/api/getCatalogue?${params}`)
  const data = await res.json().catch(() => null)
  if (data && data.error) throw new Error(data.error)
  if (!res.ok) throw new Error(`API ${res.status}`)

  return { ...data, items: data.items.map(toCard) }
}

export const getSeasons = (q) =>
  get('/api/getInfoAnime', { q })

export const getEpisodes = (nom, saison, version) =>
  get('/api/getEpisodes', { n: nom, s: saison, v: version })

// Les liens expirent en ~12h : jamais de cache long, on resout au clic.
export const getEpisodeLink = (nom, saison, version, episode) =>
  get('/api/getEpisodeLink', { n: nom, s: saison, v: version, e: episode })

export const listDownloads = () => get('/api/downloads', {})

export async function addDownload({ n, s, v, e, q }) {
  const res = await fetch(`${BASE}/api/downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n, s, v, e, q }),
  })
  const data = await res.json().catch(() => null)
  if (data && data.error) throw new Error(data.error)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return data
}

export async function delDownload(id) {
  const res = await fetch(`${BASE}/api/downloads/${id}`, { method: 'DELETE' })
  const data = await res.json().catch(() => null)
  if (data && data.error) throw new Error(data.error)
  return data
}

export const getScanChapitres = (nom) => get('/api/getScanChapitres', { n: nom })

export const getScanPages = (nom, chapitre) =>
  get('/api/getScanPages', { n: nom, c: chapitre })
