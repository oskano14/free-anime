import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import PosterRow from '../components/PosterRow'

// Planning : toutes les sorties de la semaine, un jour par rangée, en
// commençant par aujourd'hui (l'API renvoie déjà les jours dans cet ordre).
export default function Semaine() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getSemaine().then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <p className="rounded-[20px] border-2 border-red-500 bg-black px-4 py-3 text-lg text-red-400">
        {error}
      </p>
    )
  }

  if (!data) return <p className="text-white/50">Chargement du planning…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-4xl tracking-wide">Planning de la semaine</h1>

      {data.jours.map((j) => {
        // Un jour sans sortie vidéo n'a pas de rangée : évite les trous.
        if (!j.animes.length) return null
        const label =
          `${j.jour}${j.date ? ` — ${j.date}` : ''}` +
          (j.jour === data.aujourdhui ? ' · aujourd’hui' : '')

        return (
          <PosterRow
            key={j.jour}
            titre={label}
            items={j.animes.map((a) => ({
              key: `${j.jour}-${a.title}`,
              title: a.title,
              image: a.image,
              sous: a.langues.join(' · '),
              nav: `/anime/${encodeURIComponent(a.title)}`,
            }))}
            onOpen={(it) => navigate(it.nav)}
          />
        )
      })}
    </div>
  )
}
