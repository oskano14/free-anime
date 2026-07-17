import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../api'
import { resumeTime, saveProgress } from '../progress'
import EpisodeGrid from '../components/EpisodeGrid'
import Player from '../components/Player'

const VERSIONS = [
  { id: 'vostfr', label: 'VOSTFR' },
  { id: 'vf', label: 'VF' },
]

// Poids mesurés sur un épisode de 26 min : l'écart est trop gros pour ne pas
// l'afficher avant de lancer un mux.
const DL = [
  { id: '480p', poids: '~110 Mo' },
  { id: '1080p', poids: '~700 Mo' },
]

export default function Anime() {
  const navigate = useNavigate()
  const { title, saison, version, episode } = useParams()

  const current = episode !== undefined ? Number(episode) : null

  const [seasons, setSeasons] = useState([])
  const [episodes, setEpisodes] = useState([])
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)
  const [stream, setStream] = useState(null)
  const [loadingEp, setLoadingEp] = useState(null)
  const [error, setError] = useState(null)

  // Position à laquelle relancer après un renouvellement de lien.
  const [resumeAt, setResumeAt] = useState(null)
  // Un lien frais qui re-403 signalerait autre chose qu'une expiration :
  // sans ce compteur on bouclerait à l'infini.
  const renewals = useRef(0)

  const go = useCallback(
    (s, v, e) => {
      const base = `/anime/${encodeURIComponent(title)}`
      if (e === undefined || e === null) navigate(`${base}/${encodeURIComponent(s)}/${v}`)
      else navigate(`${base}/${encodeURIComponent(s)}/${v}/${e}`)
    },
    [navigate, title],
  )

  // Saisons. Une URL sans saison est complétée par la première disponible.
  useEffect(() => {
    let cancelled = false
    setError(null)

    api
      .getSeasons(title)
      .then((found) => {
        if (cancelled) return
        // panneauScan = chapitres de manga : aucun episode video derriere.
        const videos = found.filter((s) => s.type !== 'scan')
        setSeasons(videos)
        if (!videos.length) setError('Pas de vidéo pour ce titre — uniquement des scans.')
        else if (!saison) navigate(`/anime/${encodeURIComponent(title)}/${encodeURIComponent(videos[0].Saison)}/vostfr`, { replace: true })
      })
      .catch((err) => !cancelled && setError(err.message))

    return () => {
      cancelled = true
    }
  }, [title, saison, navigate])

  // Grille d'épisodes.
  useEffect(() => {
    if (!saison || !version) return
    let cancelled = false
    setLoadingEpisodes(true)
    setEpisodes([])
    setError(null)

    api
      .getEpisodes(title, saison, version)
      .then((data) => !cancelled && setEpisodes(data.episodes))
      // Typiquement : cette saison n'existe pas dans cette version.
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingEpisodes(false))

    return () => {
      cancelled = true
    }
  }, [title, saison, version])

  // Résolution du flux : pilotée par l'URL, donc un rechargement relit tout seul.
  useEffect(() => {
    if (current === null || !saison || !version) return setStream(null)

    let cancelled = false
    setLoadingEp(current)
    setError(null)
    renewals.current = 0
    setResumeAt(null)

    api
      .getEpisodeLink(title, saison, version, current)
      .then((data) => !cancelled && setStream(data))
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setStream(null)
      })
      .finally(() => !cancelled && setLoadingEp(null))

    return () => {
      cancelled = true
    }
  }, [title, saison, version, current])

  // Token expiré (onglet laissé en pause > 12 h) : on en reprend un frais et
  // on repart où on en était, sans faire porter l'incident à l'utilisateur.
  const onExpired = useCallback(
    async (at) => {
      if (renewals.current >= 2) {
        setError('Lien refusé malgré un renouvellement. Recharge la page.')
        return
      }
      renewals.current += 1

      try {
        const data = await api.getEpisodeLink(title, saison, version, current)
        setResumeAt(at)
        setStream(data)
      } catch (err) {
        setError(err.message)
      }
    },
    [title, saison, version, current],
  )

  const onProgress = useCallback(
    (time, duration) => {
      if (current === null) return
      saveProgress({
        title, saison, version, episode: current,
        numero: current + 1, time, duration,
      })
    },
    [title, saison, version, current],
  )

  const onEnded = useCallback(() => {
    const next = episodes.find((e) => e.episode === current + 1 && e.lisible)
    if (next) go(saison, version, next.episode)
  }, [episodes, current, go, saison, version])

  const hasNext = episodes.some((e) => e.episode === current + 1 && e.lisible)

  const [dl, setDl] = useState(null)
  const [dlMsg, setDlMsg] = useState(null)

  async function telecharger(qualite) {
    setDl(qualite)
    setDlMsg(null)
    try {
      await api.addDownload({ n: title, s: saison, v: version, e: current, q: qualite })
      setDlMsg(`Épisode ${current + 1} en ${qualite} mis en file — suivi dans « téléchargements ».`)
    } catch (err) {
      setDlMsg(`Échec : ${err.message}`)
    } finally {
      setDl(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl tracking-wide">{title}</h1>
        {saison && (
          <p className="mt-1 text-sm text-white/50">
            {saison} · {version?.toUpperCase()}
            {current !== null && ` · épisode ${current + 1}`}
          </p>
        )}
      </div>

      {stream && (
        <div className="space-y-2">
          <Player
            src={stream.url}
            type={stream.type}
            title={`${title} — épisode ${stream.numero}`}
            // resumeAt n'est posé qu'après un renouvellement de lien : il prime
            // sur la reprise localStorage, qui est plus ancienne.
            startAt={resumeAt ?? resumeTime(title, saison, version, current)}
            onProgress={onProgress}
            onEnded={onEnded}
            onExpired={onExpired}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
            <span>espace : play/pause · ← → : ±10 s · f : plein écran · m : muet</span>

            <div className="ml-auto flex items-center gap-2">
              {DL.map((q) => (
                <button
                  key={q.id}
                  onClick={() => telecharger(q.id)}
                  disabled={dl !== null}
                  className="sd-link text-sm"
                  title={`Télécharger cet épisode en ${q.id} (${q.poids})`}
                >
                  {dl === q.id ? '…' : `télécharger ${q.id}`}
                </button>
              ))}
              {hasNext && (
                <button onClick={() => go(saison, version, current + 1)} className="sd-link text-sm">
                  Épisode suivant →
                </button>
              )}
            </div>
          </div>

          {dlMsg && <p className="text-sm text-white/60">{dlMsg}</p>}
        </div>
      )}

      {seasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {seasons.map((s) => (
            <button
              key={s.Saison}
              onClick={() => go(s.Saison, version ?? 'vostfr')}
              className="sd-link text-lg"
              data-active={saison === s.Saison}
            >
              {s.Saison}
            </button>
          ))}
          <div className="ml-auto flex gap-1">
            {VERSIONS.map((v) => (
              <button
                key={v.id}
                onClick={() => go(saison, v.id)}
                className="sd-link text-base"
                data-active={version === v.id}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-[20px] border-2 border-red-500 bg-black px-4 py-3 text-lg text-red-400">
          {error}
        </p>
      )}

      {loadingEpisodes && <p className="text-sm text-white/50">Chargement des épisodes…</p>}

      {!loadingEpisodes && episodes.length > 0 && (
        <EpisodeGrid
          episodes={episodes}
          current={current}
          loading={loadingEp}
          onPick={(e) => go(saison, version, e)}
        />
      )}
    </div>
  )
}
