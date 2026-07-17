import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'

const STATUTS = {
  en_attente: 'en attente',
  en_cours: 'en cours',
  termine: 'prêt',
  erreur: 'échec',
}

const mo = (o) => (o ? `${(o / 1e6).toFixed(0)} Mo` : '—')

export default function Downloads() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lecture, setLecture] = useState(null)
  const timer = useRef(null)

  const charger = useCallback(async () => {
    try {
      setData(await api.listDownloads())
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  // On ne sonde que s'il reste quelque chose à suivre : un mux terminé ne
  // change plus, inutile de réveiller l'API toutes les 2 s pour rien.
  const actifs = data?.items.some((i) => i.statut === 'en_cours' || i.statut === 'en_attente')
  useEffect(() => {
    clearInterval(timer.current)
    if (actifs) timer.current = setInterval(charger, 2000)
    return () => clearInterval(timer.current)
  }, [actifs, charger])

  async function supprimer(id) {
    try {
      await api.delDownload(id)
      if (lecture?.id === id) setLecture(null)
      charger()
    } catch (err) {
      setError(err.message)
    }
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <h2 className="sd-heading">téléchargements</h2>

      {data && !data.ffmpeg && (
        <p className="rounded-[20px] border-2 border-red-500 bg-black px-4 py-3 text-lg text-red-400">
          ffmpeg absent de l'image API — reconstruis avec `docker compose up -d --build`.
        </p>
      )}

      {error && (
        <p className="rounded-[20px] border-2 border-red-500 bg-black px-4 py-3 text-lg text-red-400">
          {error}
        </p>
      )}

      {lecture && (
        <div className="space-y-2">
          <video
            key={lecture.url}
            src={lecture.url}
            controls
            autoPlay
            className="aspect-video w-full rounded-[20px] border-2 border-white bg-black"
          />
          <div className="flex items-center justify-between text-base text-white/50">
            <span>
              {lecture.titre} — {lecture.saison} · épisode {lecture.numero} · {lecture.qualite}
            </span>
            <button onClick={() => setLecture(null)} className="sd-link text-base">
              fermer
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="py-12 text-center text-white/40">
          <p className="text-xl">Aucun téléchargement.</p>
          <p className="mt-2 text-base">
            Ouvre un épisode et utilise le bouton « télécharger » sous le lecteur.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((d) => (
          <div key={d.id} className="sd-card flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg">{d.titre}</p>
              <p className="text-sm text-white/50">
                {d.saison} · {d.version.toUpperCase()} · épisode {d.numero} · {d.qualite}
                {d.taille ? ` · ${mo(d.taille)}` : ''}
              </p>

              {d.statut === 'en_cours' && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/40">
                  <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${d.progres}%` }}
                  />
                </div>
              )}
              {d.erreur && <p className="mt-1 text-sm text-red-400">{d.erreur}</p>}
            </div>

            <span className="text-base tabular-nums text-white/60">
              {STATUTS[d.statut] ?? d.statut}
              {d.statut === 'en_cours' && ` ${d.progres}%`}
            </span>

            {d.statut === 'termine' && (
              <>
                <button onClick={() => setLecture(d)} className="sd-btn text-base">
                  lire
                </button>
                <a href={d.url} download className="sd-btn text-base">
                  enregistrer
                </a>
              </>
            )}

            <button onClick={() => supprimer(d.id)} className="sd-link text-base">
              {d.statut === 'en_cours' ? 'annuler' : 'supprimer'}
            </button>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <p className="text-center text-sm text-white/40">
          Les fichiers vivent dans un volume Docker. `docker compose down -v` les efface.
        </p>
      )}
    </div>
  )
}
