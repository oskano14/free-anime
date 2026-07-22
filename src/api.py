import os

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from .backend import *
    # `import *` saute les noms préfixés d'un underscore : à importer à la main.
    from .backend import _as_bool
    from .utils.config import Config
    from . import downloads
except ImportError:
    from src.backend import *
    from src.backend import _as_bool
    from src.utils.config import Config
    from src import downloads

downloads.charger_existants()

# Le front (Vercel) et l'API (Infomaniak) sont deux origines distinctes :
# sans CORS le navigateur bloque chaque appel. CORS_ORIGINS restreint en prod.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

class Yui:

    app = Flask(__name__)
    app.json.ensure_ascii = False
    CORS(app, resources={r"/api/*": {"origins": CORS_ORIGINS}})

    @app.route('/', methods=["GET"])
    def home():
        q = request.args.get("q", "").strip()
        if not q:
            return jsonify({"error": "Paramètre 'q' manquant"}), 400
        else:
            cardinal = "Cardinal.test()"
            return jsonify({
                'Bonjours' : "Je suis une api...",
                'Valeur q ' : q,
                'Cardinal value' : cardinal
            })

    @app.route('/config', methods=["GET"])
    def config():
        return jsonify({
            'IP': Config.IP,
            'PORT': Config.PORT
        })
        
    @app.route('/health', methods=["GET"])
    def health():
        """Sonde du healthcheck Docker : aucun appel réseau, doit rester instantanée."""
        return jsonify({"status": "ok"})

    @app.route('/api/status', methods=["GET"]) # anime-sama est-il joignable ?
    def status():
        result = diagnostic()
        return jsonify(result), (200 if result.get("ok") else 503)

    @app.route('/api/getAnimeSamaURL', methods=["GET"])
    def getAnimeSamaURL():
        reponse = Cardinal.findLink()
        return jsonify(reponse)
    
    @app.route('/api/getAllAnime', methods=["GET"])
    def getAllAnime():
        reset = request.args.get("r", "").strip()

        reponse = Cardinal.getAllAnime(reset)
        return jsonify(reponse)
        
    @app.route('/api/loadBaseAnimeData', methods=["GET"])
    def loadBaseAnimeData():
        return jsonify(Cardinal.loadBaseAnimeData())
    
    @app.route('/api/getSerchAnime', methods=["GET"]) # Exemple de request : http://127.0.0.1:5000/api/getSerchAnime?q=Frieren
    def serchAnime():
        querry = request.args.get("q") or request.args.get("query") or request.args.get("search", "")
        querry = querry.strip()

        limit = request.args.get("l") or request.args.get("limit", "")
        limit = str(limit).strip()

        if not querry:
            return jsonify({"error": "Paramètre 'q' manquant"}), 400
        try:
            limit = int(limit) if limit else 5   # convertir en entier
        except ValueError:
            limit = 5 # valeur par défaut si l'argument est invalide
        return jsonify(Cardinal.serchAnime(querry, limit))
    
    @app.route('/api/getInfoAnime', methods=["GET"])
    def getInfoAnime():
        querry = request.args.get("q") or request.args.get("query") or request.args.get("n") or request.args.get("nom", "")
        querry = querry.strip()

        if not querry:
            return jsonify({"error": "Paramètre 'q' manquant"}), 400
                
        return jsonify(Cardinal.getInfoAnime(querry))
    
    @app.route('/api/getSpecificAnime', methods=["GET"])
    def getSpecificAnime():
        querry = request.args.get("q") or request.args.get("query") or request.args.get("n") or request.args.get("nom", "")
        querry = querry.strip()

        saison = request.args.get("s") or request.args.get("saison", "")
        saison = saison.strip() # saison1 par défaut
        
        version = request.args.get("v") or request.args.get("version", "")
        version = version.strip() # version sera en vostfr par défaut
    
        if not querry:
            return jsonify({"error": "Paramètre 'q' manquant"}), 400

        return jsonify(Cardinal.getSpecificAnime(querry, saison, version))
    
    @app.route('/api/getAnimeLink', methods=["GET"])
    def getAnimeLink():
        nom = request.args.get("n") or request.args.get("nom") or request.args.get("q") or request.args.get("query", "")
        nom = nom.strip()

        saison = request.args.get("s") or request.args.get("saison", "")
        saison = saison.strip() # saison1 par défaut

        version = request.args.get("v") or request.args.get("version", "")
        version = version.strip() # version sera en vostfr par défaut

        if not nom:
            return jsonify({"error": "Paramètre 'n' manquant"}), 400

        return jsonify(Cardinal.getAnimeLink(nom, saison, version))

    @app.route('/api/getFilters', methods=["GET"]) # Vocabulaire des filtres (types, langues, genres, statuts)
    def getFilters():
        result = Cardinal.getFilters()
        return jsonify(result), (502 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getCatalogue', methods=["GET"]) # Catalogue filtré : les catégories
    def getCatalogue():
        # Répétable : ?type=Anime&type=Film&genre=Action
        types = [v for v in request.args.getlist("type") if v.strip()]
        genres = [v for v in request.args.getlist("genre") if v.strip()]
        langues = [v for v in request.args.getlist("langue") if v.strip()]
        statuts = [v for v in request.args.getlist("statut") if v.strip()]
        search = request.args.get("q") or request.args.get("query") or request.args.get("search", "")
        search = search.strip()
        page = request.args.get("page", "1").strip()
        # random=1 : une seule oeuvre au hasard ("me surprendre").
        random = _as_bool(request.args.get("random", ""))

        result = Cardinal.getCatalogue(types, genres, langues, statuts, search, page, random)
        return jsonify(result), (502 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/downloads', methods=["GET"]) # Liste des téléchargements
    def listDownloads():
        return jsonify({
            "ffmpeg": downloads.ffmpeg_dispo(),
            "qualites": list(downloads.QUALITES),
            "items": downloads.lister(),
        })

    @app.route('/api/downloads', methods=["POST"]) # Mettre un épisode en file
    def addDownload():
        body = request.get_json(silent=True) or {}
        nom = str(body.get("n") or body.get("nom") or body.get("q") or "").strip()
        saison = str(body.get("s") or body.get("saison") or "").strip() or "saison1"
        version = str(body.get("v") or body.get("version") or "").strip() or "vostfr"
        qualite = str(body.get("q") or body.get("qualite") or "").strip() or "1080p"

        if not nom:
            return jsonify({"error": "Paramètre 'n' manquant"}), 400
        try:
            episode = int(body.get("e", body.get("episode", 0)))
        except (TypeError, ValueError):
            return jsonify({"error": "Paramètre 'e' invalide"}), 400

        result = downloads.ajouter(nom, saison, version, episode, qualite)
        return jsonify(result), (400 if isinstance(result, dict) and "error" in result else 202)

    @app.route('/api/downloads/<job_id>', methods=["DELETE"]) # Annuler ou supprimer
    def delDownload(job_id):
        result = downloads.supprimer(job_id)
        return jsonify(result), (404 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getSorties', methods=["GET"]) # Sorties du jour (anime + scan)
    def getSorties():
        result = Cardinal.getSorties()
        return jsonify(result), (502 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getSemaine', methods=["GET"]) # Planning : sorties de toute la semaine
    def getSemaine():
        result = Cardinal.getSemaine()
        return jsonify(result), (502 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getScanChapitres', methods=["GET"]) # Chapitres d'une oeuvre + nb de pages
    def getScanChapitres():
        nom = request.args.get("n") or request.args.get("nom") or request.args.get("q") or request.args.get("query", "")
        nom = nom.strip()
        if not nom:
            return jsonify({"error": "Paramètre 'n' manquant"}), 400

        result = Cardinal.getScanChapitres(nom)
        return jsonify(result), (404 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getScanPages', methods=["GET"]) # URLs des images d'un chapitre
    def getScanPages():
        nom = request.args.get("n") or request.args.get("nom") or request.args.get("q") or request.args.get("query", "")
        nom = nom.strip()
        chapitre = request.args.get("c") or request.args.get("chapitre", "")
        chapitre = str(chapitre).strip()

        if not nom:
            return jsonify({"error": "Paramètre 'n' manquant"}), 400
        if not chapitre:
            return jsonify({"error": "Paramètre 'c' manquant"}), 400

        result = Cardinal.getScanPages(nom, chapitre)
        return jsonify(result), (404 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getEpisodes', methods=["GET"]) # Grille d'episodes, sans resoudre les liens video
    def getEpisodes():
        nom = request.args.get("n") or request.args.get("nom") or request.args.get("q") or request.args.get("query", "")
        nom = nom.strip()

        saison = request.args.get("s") or request.args.get("saison", "")
        saison = saison.strip()

        version = request.args.get("v") or request.args.get("version", "")
        version = version.strip()

        if not nom:
            return jsonify({"error": "Paramètre 'n' manquant"}), 400

        result = Cardinal.getEpisodes(nom, saison, version)
        return jsonify(result), (404 if isinstance(result, dict) and "error" in result else 200)

    @app.route('/api/getEpisodeLink', methods=["GET"]) # Resout UN episode : appel du lecteur au clic
    def getEpisodeLink():
        nom = request.args.get("n") or request.args.get("nom") or request.args.get("q") or request.args.get("query", "")
        nom = nom.strip()

        saison = request.args.get("s") or request.args.get("saison", "")
        saison = saison.strip()
        
        version = request.args.get("v") or request.args.get("version", "")
        version = version.strip()
        
        episode = request.args.get("e") or request.args.get("episode", "0")
        episode = str(episode).strip()

        if not nom:
            return jsonify({"error": "Paramètre 'n' manquant"}), 400
        try:
            episode = int(episode)
        except ValueError:
            return jsonify({"error": "Paramètre 'e' invalide"}), 400

        result = Cardinal.getEpisodeLink(nom, saison, version, episode)
        return jsonify(result), (404 if isinstance(result, dict) and "error" in result else 200)