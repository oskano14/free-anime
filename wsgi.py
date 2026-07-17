"""Point d'entrée WSGI (waitress, gunicorn…).

main.py lance le serveur de dev Flask : pratique en local, pas en conteneur.
Ici on expose juste l'app, le serveur WSGI s'occupe du reste.
"""

import os

from src.api import Yui
from src.utils.config import Config

# Purement cosmétique depuis que l'API ne s'appelle plus elle-même en HTTP :
# seule la route '/' les affiche encore.
Config.IP = os.environ.get("API_HOST", "0.0.0.0")
Config.PORT = int(os.environ.get("API_PORT", "5000"))

app = Yui.app
