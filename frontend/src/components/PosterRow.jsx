// Rangée à défilement horizontal de vignettes. Garde l'accueil compact : les
// listes « Reprendre » et « Déjà vu » ne s'empilent plus verticalement.

function Vignette({ item, onOpen }) {
  const pct = item.duration ? Math.min(100, (item.time / item.duration) * 100) : null

  return (
    <button
      onClick={() => onOpen(item)}
      className="sd-card group w-36 shrink-0 overflow-hidden text-left sm:w-40"
    >
      <div className="relative aspect-video bg-black">
        {item.image ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center text-xs text-white/40">
            {item.title}
          </div>
        )}
        {pct !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-white" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="border-t-2 border-white p-2">
        <p className="truncate text-sm">{item.title}</p>
        <p className="truncate text-[11px] text-white/50">{item.sous}</p>
      </div>
    </button>
  )
}

export default function PosterRow({ titre, items, onOpen }) {
  if (!items.length) return null

  return (
    <section className="space-y-2">
      <h2 className="text-lg tracking-wide text-white/70">{titre}</h2>
      {/* pb-2 laisse la place à la barre de défilement sans rogner les cartes */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <Vignette key={item.key} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
