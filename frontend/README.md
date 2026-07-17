# Frontend — Anime Sama

SPA React (Vite + Tailwind v4) qui consomme l'API AnimeSamaApi. Lecture HLS via
hls.js, ou lecture native sur Safari.

## Dev

```bash
# 1. l'API, depuis la racine du repo
python main.py            # -> http://127.0.0.1:5000

# 2. le front
cd frontend
npm install
npm run dev               # -> http://localhost:5173
```

En dev, Vite proxifie `/api` vers `127.0.0.1:5000` (voir `vite.config.js`) : on
reste en same-origin, donc pas de CORS à gérer localement.

## Build & déploiement (Vercel)

```bash
npm run build             # -> dist/
```

Réglages Vercel : *Root Directory* = `frontend`, framework Vite (auto-détecté).

Deux variables à poser, une de chaque côté :

| Où | Variable | Valeur |
|---|---|---|
| Vercel | `VITE_API_URL` | URL publique de l'API, sans slash final |
| API | `CORS_ORIGINS` | `https://<ton-app>.vercel.app` |

Sans `VITE_API_URL`, le build appelle `/api` en relatif — ce qui n'existe pas sur
Vercel. Sans `CORS_ORIGINS`, l'API accepte toutes les origines (`*`), pratique en
test mais à restreindre en prod.

## Points à connaître

- **Les liens vidéo expirent en ~12h** (token Vidmoly). Rien n'est mis en cache :
  chaque lecture appelle `/api/getEpisodeLink`.
- **Les épisodes sont indexés à 0** côté API (`episode`), le champ `numero` porte
  le numéro affiché (1-based).
- **Les noms de saison varient** d'un anime à l'autre (« Saison 1 », mais aussi
  « Avec Fillers », « Kai »…). Ils viennent de `/api/getInfoAnime`, jamais devinés.
- **`type: "scan"`** = chapitres de manga, filtrés côté front : pas de vidéo.
- **hls.js pèse ~226 kB gzip** à lui seul. Le passer en `import()` dynamique est
  la première optimisation si le poids devient gênant.
