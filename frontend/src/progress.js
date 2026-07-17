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

/** Reprises les plus récentes, pour la page d'accueil. */
export function recentProgress(limit = 6) {
  return Object.values(readAll())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export function clearProgress(title, saison, version) {
  const all = readAll()
  delete all[keyOf(title, saison, version)]
  writeAll(all)
}

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
