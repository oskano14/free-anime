export default function EpisodeGrid({ episodes, current, loading, onPick }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {episodes.map((ep) => {
        const active = current === ep.episode
        const busy = loading === ep.episode

        return (
          <button
            key={ep.episode}
            disabled={!ep.lisible || busy}
            onClick={() => onPick(ep.episode)}
            title={ep.lisible ? `Lecteurs : ${ep.lecteurs.join(', ')}` : 'Aucun lecteur exploitable'}
            className={[
              'relative aspect-square rounded-[20px] border-2 text-lg tabular-nums transition-all duration-300',
              active
                ? 'border-white bg-white text-black'
                : ep.lisible
                  ? 'border-white bg-black text-white hover:bg-white hover:text-black'
                  : 'cursor-not-allowed border-white/25 bg-black text-white/25 line-through',
            ].join(' ')}
          >
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </span>
            ) : (
              ep.numero
            )}
          </button>
        )
      })}
    </div>
  )
}
