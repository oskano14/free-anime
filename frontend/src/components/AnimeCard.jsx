import { useState } from 'react'

const LANG_LABEL = { FR: 'VF', JP: 'VOSTFR', EN: 'EN' }

export default function AnimeCard({ item, onOpen, watched = false }) {
  const [broken, setBroken] = useState(false)

  return (
    <button onClick={() => onOpen(item)} className="sd-card group flex flex-col text-left">
      <div className="relative aspect-[2/3] overflow-hidden bg-black">
        {item.image && !broken ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className={[
              'h-full w-full object-cover transition duration-500 group-hover:scale-105',
              // Une œuvre déjà vue est grisée : le badge seul se remarque mal
              // dans une grille de 48 cartes.
              watched ? 'opacity-45' : '',
            ].join(' ')}
          />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center text-sm text-white/40">
            {item.title}
          </div>
        )}

        {watched && (
          <span className="absolute left-1.5 top-1.5 rounded-[10px] border border-white bg-white px-1.5 text-[11px] text-black">
            ✓ déjà vu
          </span>
        )}

        {item.langues?.length > 0 && (
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            {item.langues.map((l) => (
              <span
                key={l}
                className="rounded-[10px] border border-white bg-black/80 px-1.5 text-[11px] text-white"
              >
                {LANG_LABEL[l] ?? l}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t-2 border-white p-2.5">
        <p className="line-clamp-2 text-base leading-tight">{item.title}</p>
        {item.genres?.length > 0 && (
          <p className="line-clamp-1 text-xs text-white/50">{item.genres.slice(0, 3).join(' · ')}</p>
        )}
        {item.types?.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {item.types.map((t) => (
              <span key={t} className="rounded-[10px] border border-white/60 px-1.5 text-[11px] text-white/80">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
