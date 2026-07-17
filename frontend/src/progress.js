// Progression de lecture, en localStorage.
//
// Une entrée par (titre, saison, version) : le dernier épisode vu et sa
// position. C'est ce qu'il faut pour "Reprendre", sans garder un historique
// épisode par épisode qui gonflerait indéfiniment.

const KEY = 'animesama:progress'
const MAX_ENTRIES = 60

// En dessous, l'utilisateur n'a fait que survoler ; au-delà de la fin moins
// cette marge, l'épisode est fini et reprendre n'aurait aucun sens.
const MIN_RESUME_SECONDS = 30
const END_MARGIN_SECONDS = 60

const keyOf = (title, saison, version) => `${title}|${saison}|${version}`

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    // Stockage corrompu ou désactivé (navigation privée) : on repart à vide.
    return {}
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Quota plein : perdre la progression ne doit jamais casser la lecture.
  }
}

export function saveProgress(entry) {
  const all = readAll()
  all[keyOf(entry.title, entry.saison, entry.version)] = { ...entry, updatedAt: Date.now() }

  const keys = Object.keys(all)
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => all[b].updatedAt - all[a].updatedAt)
      .slice(MAX_ENTRIES)
      .forEach((k) => delete all[k])
  }

  writeAll(all)
}

export function getProgress(title, saison, version) {
  return readAll()[keyOf(title, saison, version)] ?? null
}

/** Position à laquelle reprendre, ou 0 s'il n'y a rien de pertinent. */
export function resumeTime(title, saison, version, episode) {
  const p = getProgress(title, saison, version)
  if (!p || p.episode !== episode || !p.time) return 0
  if (p.time < MIN_RESUME_SECONDS) return 0
  if (p.duration && p.time > p.duration - END_MARGIN_SECONDS) return 0
  return p.time
}

/** Lectures en cours (reprenables), hors titres déjà terminés, plus récentes
 *  d'abord. C'est la rangée « Reprendre » de l'accueil. */
export function resumeList(limit = 12) {
  const finis = watchedSet()
  return Object.values(readAll())
    .filter((p) => {
      if (finis.has(p.title)) return false // fini → rangée « déjà vu »
      if (!p.time || p.time < MIN_RESUME_SECONDS) return false
      if (p.duration && p.time > p.duration - END_MARGIN_SECONDS) return false
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export function clearProgress(title, saison, version) {
  const all = readAll()
  delete all[keyOf(title, saison, version)]
  writeAll(all)
}

// --- Titres terminés -------------------------------------------------------
// Map { titre -> {title, image, updatedAt} }. On garde l'image pour l'aperçu de
// la rangée « déjà vu ». Par titre, pas par saison : une carte du catalogue ne
// connaît pas la saison, et « déjà regardé » se comprend au niveau de l'œuvre.

const WATCHED_KEY = 'animesama:watched'

function readWatched() {
  try {
    const raw = JSON.parse(localStorage.getItem(WATCHED_KEY))
    // Ancien format : tableau de titres nus. On le migre à la volée.
    if (Array.isArray(raw)) {
      return Object.fromEntries(raw.map((t) => [t, { title: t, image: null, updatedAt: 0 }]))
    }
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeWatched(all) {
  try {
    localStorage.setItem(WATCHED_KEY, JSON.stringify(all))
  } catch {
    // Quota plein : sans conséquence, l'étiquette est un confort.
  }
}

export function markWatched(title, image = null) {
  const all = readWatched()
  all[title] = { title, image: image ?? all[title]?.image ?? null, updatedAt: Date.now() }
  writeWatched(all)
}

export function unmarkWatched(title) {
  const all = readWatched()
  delete all[title]
  writeWatched(all)
}

/** Ensemble des titres terminés, pour tester `has(title)` en O(1). */
export const watchedSet = () => new Set(Object.keys(readWatched()))

export const isWatched = (title) => title in readWatched()

/** Titres terminés avec leur image, plus récents d'abord. */
export const watchedList = (limit = 12) =>
  Object.values(readWatched())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)

// --- Scans -----------------------------------------------------------------
// Store séparé : un scan n'a ni saison, ni version, ni position en secondes.
// Mélanger les deux formes dans la même clé rendrait "Reprendre" ambigu.

const SCAN_KEY = 'animesama:scans'

function readScans() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCAN_KEY))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function saveScanProgress(title, chapitre, total) {
  const all = readScans()
  all[title] = { title, chapitre, total, updatedAt: Date.now() }

  const keys = Object.keys(all)
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => all[b].updatedAt - all[a].updatedAt)
      .slice(MAX_ENTRIES)
      .forEach((k) => delete all[k])
  }

  try {
    localStorage.setItem(SCAN_KEY, JSON.stringify(all))
  } catch {
    // Quota plein : ne doit jamais casser la lecture.
  }
}

export const getScanProgress = (title) => readScans()[title] ?? null

export const recentScans = (limit = 6) =>
  Object.values(readScans())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
