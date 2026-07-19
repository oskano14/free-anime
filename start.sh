#!/usr/bin/env bash
#
# Lance Free Anime SANS Docker : l'API Python + le front Vite, en une commande.
# Première exécution : crée le venv, installe les dépendances (Python + npm).
# Ensuite : démarre directement. Ctrl+C arrête proprement les deux.
#
#   ./start.sh
#
set -euo pipefail

# Toujours travailler depuis le dossier du script, quel que soit l'appelant.
cd "$(dirname "$0")"

API_PORT="${API_PORT:-5000}"
WEB_PORT="${WEB_PORT:-5173}"

say()  { printf "\033[1;35m▸ %s\033[0m\n" "$1"; }
die()  { printf "\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

# --- Prérequis -------------------------------------------------------------
command -v python3 >/dev/null 2>&1 || die "python3 introuvable. Installe Python ≥ 3.9."
command -v npm      >/dev/null 2>&1 || die "npm introuvable. Installe Node ≥ 20."

# --- API : venv + dépendances ---------------------------------------------
if [ ! -d .venv ]; then
  say "Création de l'environnement Python (.venv)…"
  python3 -m venv .venv
  # pip récent : requirements.txt épingle des versions que le pip par défaut
  # (ancien) ne sait pas résoudre.
  ./.venv/bin/pip install --quiet --upgrade pip
  say "Installation des dépendances Python…"
  ./.venv/bin/pip install --quiet -r requirements.txt
fi

# --- Front : node_modules --------------------------------------------------
if [ ! -d frontend/node_modules ]; then
  say "Installation des dépendances du front (npm)…"
  (cd frontend && npm install --silent)
fi

# --- Lancement -------------------------------------------------------------
# Tue un process ET toute sa descendance (Vite tourne sous npm sous un
# sous-shell : le tuer seul laisserait Vite orphelin sur le port).
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

pids=()
cleanup() {
  trap - INT TERM   # évite une double exécution
  say "Arrêt…"
  for pid in "${pids[@]}"; do
    kill_tree "$pid"
  done
  exit 0
}
trap cleanup INT TERM

say "Démarrage de l'API sur http://127.0.0.1:${API_PORT}"
# reload désactivé : le rechargeur Flask lance un process enfant, impossible à
# tuer proprement depuis ce script.
./.venv/bin/python -c "from main import Api; Api.launch(port=${API_PORT}, reload_status=False, debug_state=False)" &
pids+=($!)

say "Démarrage du front sur http://localhost:${WEB_PORT}"
(cd frontend && npm run dev -- --port "${WEB_PORT}") &
pids+=($!)

echo
say "Prêt → ouvre http://localhost:${WEB_PORT}"
say "Ctrl+C pour tout arrêter."

# Surveillance portable (macOS = bash 3.2, pas de `wait -n`) : tant que les deux
# tournent, on attend ; si l'un meurt, on coupe l'autre. Ctrl+C interrompt le
# sleep et déclenche le trap.
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do
  sleep 1
done
cleanup
