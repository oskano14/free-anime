# ffmpeg : mux des flux HLS vers .mp4 pour les téléchargements hors-ligne.
# Binaire statique plutôt que le paquet Debian : celui-ci tire toute une forêt
# de codecs et alourdit l'image de ~585 Mo, pour un usage en copie de flux.
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/

# Couche dépendances séparée : le code change souvent, pas les deps.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY wsgi.py main.py ./
COPY src ./src

# Le catalogue (~2300 animes) se reconstruit seul au premier appel, mais ça
# coûte ~20s de scraping : le volume évite de le refaire à chaque démarrage.
# /app/src/data/videos accueille les téléchargements (volume dédié).
VOLUME ["/app/src/data"]

EXPOSE 5000

# Pas de serveur de dev Flask ici. waitress est déjà dans requirements.txt.
CMD ["waitress-serve", "--listen=0.0.0.0:5000", "wsgi:app"]
