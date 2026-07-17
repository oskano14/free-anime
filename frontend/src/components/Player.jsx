import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

const SAVE_EVERY_SECONDS = 5

export default function Player({ src, type, title, startAt = 0, onProgress, onEnded, onExpired }) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null)

  // Gardés en ref : les changer ne doit pas relancer le chargement du flux.
  const cbRef = useRef({ onProgress, onEnded, onExpired })
  cbRef.current = { onProgress, onEnded, onExpired }
  const startRef = useRef(startAt)
  startRef.current = startAt

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setError(null)
    let hls = null

    const seekToStart = () => {
      if (startRef.current > 0) video.currentTime = startRef.current
    }
    video.addEventListener('loadedmetadata', seekToStart, { once: true })

    if (type !== 'm3u8' || video.canPlayType('application/vnd.apple.mpegurl')) {
      // mp4 (SendVid), ou HLS natif (Safari).
      video.src = src
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return
        hls.destroy()

        // Le token Vidmoly vaut 12 h à partir de sa résolution. Le seul moyen
        // de le voir expirer est de laisser l'onglet en pause plus longtemps :
        // on redemande un lien frais au lieu d'afficher une erreur.
        if (data.response?.code === 403 && cbRef.current.onExpired) {
          setError(null)
          cbRef.current.onExpired(video.currentTime)
          return
        }

        setError(
          data.response?.code === 403
            ? 'Lien expiré. Recharge la page pour en obtenir un nouveau.'
            : `Erreur de lecture (${data.details})`,
        )
      })
    } else {
      setError('HLS non supporté par ce navigateur')
      return
    }

    let lastSave = 0
    const onTime = () => {
      const { currentTime, duration } = video
      if (!duration || currentTime - lastSave < SAVE_EVERY_SECONDS) return
      lastSave = currentTime
      cbRef.current.onProgress?.(currentTime, duration)
    }
    const onEnd = () => {
      cbRef.current.onProgress?.(video.duration, video.duration)
      cbRef.current.onEnded?.()
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onEnd)

    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onEnd)
      video.removeEventListener('loadedmetadata', seekToStart)
      hls?.destroy()
    }
  }, [src, type])

  // Raccourcis clavier, ignorés dès qu'on tape dans un champ.
  useEffect(() => {
    const onKey = (e) => {
      const video = videoRef.current
      if (!video) return
      if (e.target.matches('input, textarea, select')) return

      const actions = {
        ' ': () => (video.paused ? video.play() : video.pause()),
        ArrowLeft: () => (video.currentTime -= 10),
        ArrowRight: () => (video.currentTime += 10),
        f: () => (document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen()),
        m: () => (video.muted = !video.muted),
      }
      const run = actions[e.key]
      if (!run) return
      e.preventDefault()
      run()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className="aspect-video w-full bg-black"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 text-center">
          <div>
            <p className="font-medium text-red-400">{error}</p>
            <p className="mt-1 text-sm text-white/50">{title}</p>
          </div>
        </div>
      )}
    </div>
  )
}
