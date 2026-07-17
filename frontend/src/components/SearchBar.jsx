import { useEffect, useRef, useState } from 'react'

export default function SearchBar({ onSearch, initial = '', autoFocus = false }) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef(null)

  // Dernière valeur réellement transmise. Sans ce garde-fou, onSearch écrit
  // dans l'URL, ce qui re-rend, ce qui relance l'effet : boucle infinie.
  const emitted = useRef(initial)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Le catalogue est en mémoire côté API : la recherche répond en ~10 ms,
  // un debounce court suffit. Vider le champ rend la main immédiatement.
  useEffect(() => {
    const q = value.trim()
    if (q === emitted.current) return

    const id = setTimeout(
      () => {
        emitted.current = q
        onSearch(q)
      },
      q ? 250 : 0,
    )
    return () => clearTimeout(id)
  }, [value, onSearch])

  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/60"
        fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        placeholder="rechercher…"
        className="sd-field w-full py-3 pl-14 pr-5 text-xl placeholder:text-white/40"
      />
    </div>
  )
}
