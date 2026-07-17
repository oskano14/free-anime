# Installation

Application **locale** : elle tourne sur ta machine, pour toi. Il n'y a rien à
déployer, aucun compte à créer, aucune clé d'API.

Deux conteneurs Docker : l'API Python qui scrape anime-sama, et le front React
servi par nginx. Une commande pour tout démarrer.

---

## Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| **Docker Desktop** | récent | tout tourne dedans, rien d'autre à installer |
| git | — | pour cloner le dépôt |

C'est tout. Pas besoin de Python ni de Node : ils sont dans les images.

> **Docker Desktop doit être lancé** avant les commandes qui suivent. Sur macOS,
> l'icône baleine doit être présente dans la barre de menus. Sinon toutes les
> commandes `docker` échouent avec *cannot connect to the Docker daemon*.

---

## Installation

```bash
git clone https://github.com/oskano14/AnimeSamaApi.git
cd AnimeSamaApi
docker compose up -d
```

Puis ouvre **<http://localhost:8080>**.

L'accueil s'affiche tout de suite (~2 s) : les catégories sont lues en direct
sur anime-sama. En revanche **ta première recherche prend ~10 s** — l'API en
profite pour construire son index local (~2300 titres). Les suivantes sont
instantanées (~10 ms), et l'index est stocké dans un volume Docker : il survit
aux redémarrages et se reconstruit seul au bout de 24 h.

---

## Utilisation au quotidien

Les conteneurs sont en `restart: unless-stopped` : ils repartent tout seuls
quand Docker Desktop démarre. En pratique tu n'as qu'à ouvrir l'URL.

```bash
docker compose up -d      # démarrer
docker compose stop       # arrêter (le catalogue est conservé)
docker compose logs -f    # voir ce qui se passe
docker compose down -v    # tout supprimer, catalogue compris
```

Après un `git pull`, reconstruis les images :

```bash
docker compose up -d --build
```

---

## Ce qui tourne

| Service | Port | Rôle |
|---|---|---|
| `web` | **8080** | le front, et le proxy `/api` vers l'API |
| `api` | 5001 | l'API seule, utile pour debug ou scripts |

Le front appelle `/api` en relatif ; nginx transmet à l'API sur le réseau
interne de Docker. Tout est en même origine, donc **aucun CORS à configurer**.

L'API reste joignable directement si tu veux jouer avec :

```bash
curl "http://localhost:5001/api/getSerchAnime?q=frieren"
curl "http://localhost:5001/api/getCatalogue?type=Anime&statut=En+cours"
```

Les endpoints sont documentés dans [README.md](README.md).

---

## Regarder hors ligne

Onglet **hors-ligne**. Sous le lecteur d'un épisode, deux boutons mettent
l'épisode en file. ffmpeg le mux en `.mp4` — en **copie de flux**, donc sans
ré-encodage ni perte : un épisode de 26 min prend moins d'une minute.

Une fois prêt, il se lit depuis l'onglet hors-ligne **sans aucune connexion**,
ou s'enregistre sur ton disque avec « enregistrer ».

| Qualité | Poids d'un épisode de 26 min |
|---|---|
| **480p** | ~110 Mo |
| **1080p** | ~700 Mo |

> **Attention à la place.** Une saison de 28 épisodes en 1080p, c'est ~20 Go.
> Les fichiers vivent dans un volume Docker : `docker compose down -v` efface
> tout, téléchargements compris.

Le reste de l'app (catalogue, recherche, scans, streaming) a besoin d'Internet
en permanence — seuls les épisodes téléchargés s'en passent.

---

## Réglages

Tous optionnels, à poser dans un fichier `.env` à la racine ou devant la commande.

| Variable | Défaut | Effet |
|---|---|---|
| `API_PORT` | `5001` | port hôte de l'API |
| `CATALOGUE_TTL_HOURS` | `24` | âge après lequel le catalogue est reconstruit. `0` désactive |
| `DOWNLOAD_DIR` | `src/data/videos` | où atterrissent les `.mp4` |
| `CORS_ORIGINS` | `*` | inutile en local (tout est en même origine) |

```bash
API_PORT=5002 docker compose up -d
```

---

## Problèmes courants

**« port is already allocated » sur 5000**
Sur macOS, le Centre de contrôle (Receiver AirPlay) occupe déjà le port 5000.
C'est pour ça que l'API est publiée sur **5001**. Si 5001 est pris aussi :
`API_PORT=5002 docker compose up -d`.

**« cannot connect to the Docker daemon »**
Docker Desktop n'est pas lancé. Ouvre-le et attends l'icône baleine.

**La page charge mais aucun anime n'apparaît**
`docker compose logs -f api` pour voir ce qui se passe. Si rien ne bouge,
anime-sama a peut-être changé de domaine : l'API le redétecte seule au
redémarrage (`docker compose restart api`).

**La première recherche est longue**
C'est normal, ~10 s : l'index local se construit. Une seule fois.

**Une vidéo ne se lance pas**
Certains épisodes n'ont aucun lecteur exploitable — la grille les barre. Sinon,
les liens vidéo expirent au bout de ~12 h : recharge la page, un lien frais est
résolu à chaque clic.

**Un scan affiche « Scans non disponibles »**
Environ 14 % des titres marqués « Scans » n'ont pas de fichiers hébergés côté
anime-sama — leur page est cassée sur le site lui-même. Rien à faire de notre
côté.

**« ffmpeg absent de l'image API »**
L'image date d'avant l'ajout des téléchargements : `docker compose up -d --build`.

**Plus de place sur le disque**
Les téléchargements s'accumulent dans le volume `videos`. Supprime-les depuis
l'onglet hors-ligne, ou vide tout : `docker volume rm animesamaapi_videos`.

---

## Sans Docker

Utile pour développer. Deux terminaux.

**Prérequis** : Python ≥ 3.9, Node ≥ 20.

```bash
# terminal 1 — l'API
pip install -r requirements.txt
python main.py                     # http://127.0.0.1:5000
```

```bash
# terminal 2 — le front
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

En dev, Vite proxifie `/api` vers `127.0.0.1:5000` (voir
[frontend/vite.config.js](frontend/vite.config.js)) : on reste en même origine,
donc pas de CORS à gérer non plus.

> Ici l'API tourne bien sur le port 5000 alors que Docker ne le peut pas :
> Flask se lie à `127.0.0.1` avec `SO_REUSEADDR` et cohabite avec AirPlay, là où
> le bind `0.0.0.0` de Docker échoue.

---

## Comment ça marche, en deux lignes

L'API scrape anime-sama : catalogue, saisons, épisodes, puis résout les liens
des lecteurs vidéo (Vidmoly, SendVid, StreamWish…) en flux `m3u8`/`mp4` directs.
Le front les lit dans un `<video>` avec hls.js — sans pop-up, sans lecteur tiers.

Les scans viennent de l'API interne d'anime-sama (`/s2/scans/`), lue de la même
façon.

Rien n'est stocké chez toi à part le catalogue et ta progression de lecture
(dans le `localStorage` du navigateur).
