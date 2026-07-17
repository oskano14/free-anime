import json, os, re, time, cloudscraper, requests, unicodedata
from urllib.parse import urlencode, quote
from rapidfuzz import process, fuzz
from bs4 import BeautifulSoup

try :
    from .utils.resolvers import resolve_video_url
    from .utils.utils import Utils as SiteUtils
except ImportError:
    from src.utils.resolvers import resolve_video_url
    from src.utils.utils import Utils as SiteUtils

PATH = os.path.dirname(os.path.abspath(__file__))
PATH_DIR = os.path.join(PATH, "data", "json")
PATH_ANIME = os.path.join(PATH_DIR, "AnimeInfo.json")

# Garde-fou : le catalogue se termine sur un marqueur HTML, qui peut changer.
MAX_CATALOGUE_PAGES = 200

# Taille d'une page du catalogue anime-sama : en dessous, c'est la derniere.
PAGE_SIZE = 48

# Age au-dela duquel le catalogue local est reconstruit, sinon les nouveautes
# n'apparaissent jamais. 0 desactive la peremption par age.
CATALOGUE_TTL_HOURS = float(os.environ.get("CATALOGUE_TTL_HOURS", "24"))

CARD_SELECTOR = {"name": "div", "class_": "shrink-0 catalog-card card-base"}

# "video.sibnet.ru", "sibnet.ru" domaine sibnet il ne semble pas stable
ALLOWED_SITES = ["vidmoly.to", "vidmoly.net",
                 "smoothpre.com", "vidhide.com", "streamwish.com", "sendvid.com"]

scraper = cloudscraper.create_scraper()

_BASE_URL = None
_FILTERS = None


def get_base_url(force_refresh=False):
    """Domaine anime-sama actif, mis en cache.

    findLink() teste chaque domaine candidat avec un timeout : plusieurs
    secondes par appel, donc jamais à l'import ni à chaque requête.
    """
    global _BASE_URL
    if _BASE_URL is None or force_refresh:
        _BASE_URL = SiteUtils.findLink()
    return _BASE_URL


def _as_bool(value):
    return str(value).strip().lower() in ("true", "1", "yes", "oui")


def _chap_key(chapitre):
    """Tri des chapitres : numerique quand possible ('2' avant '10'), les
    libelles speciaux ('Special Kakashi') a la fin."""
    try:
        return (0, float(chapitre), "")
    except (TypeError, ValueError):
        return (1, 0.0, str(chapitre))


class Cardinal:

    @staticmethod
    def findLink():
        return {"url": get_base_url()}

    @staticmethod
    def _parse_card(card):
        """Extrait une carte du catalogue.

        Le HTML place le type dans <p class="info-value"> et la langue dans
        l'attribut title du drapeau (le drapeau lui-meme est un SVG inline).
        """
        title_tag = card.find('h2', class_="card-title")
        link_tag = card.find('a')
        if not title_tag or not link_tag or not link_tag.get('href'):
            return None

        img = card.find('img', class_="card-image")

        # Chaine brute, volontairement pas decoupee : le site separe par des
        # virgules mais les titres en contiennent ('Tis Time for "Torture,"
        # Princess) — aucun decoupage n'est fiable.
        alt = card.find('p', class_="alternate-titles")
        alt_text = alt.get_text(strip=True) if alt else ""

        # "Anime, Scans" -> ["Anime", "Scans"]
        types = []
        type_row = card.find('div', class_="type-row")
        if type_row:
            for p in type_row.find_all('p', class_="info-value"):
                types.extend(t.strip() for t in p.get_text(strip=True).split(',') if t.strip())

        # La carte plafonne l'affichage a 5 genres puis ajoute un tag "…".
        tags = [g.get_text(strip=True) for g in card.find_all('span', class_="genre-tag")]
        genres = [g for g in tags if g and g != "…"]

        return {
            "title": Cardinal.normalize_title(title_tag.get_text(strip=True)),
            "link": link_tag.get('href'),
            "image": img.get('src') if img else None,
            "alt_titles": alt_text,
            "genres": genres,
            "genres_tronques": len(tags) != len(genres),
            "types": types,
            "langues": [s.get('title') for s in card.find_all('span', class_="lang-flag") if s.get('title')],
        }

    @staticmethod
    def _read_catalogue():
        try:
            with open(PATH_ANIME, "r", encoding="utf-8") as data:
                content = json.load(data)
        except (OSError, json.JSONDecodeError):
            return []
        return content if isinstance(content, list) else []

    @staticmethod
    def _catalogue_age_hours():
        try:
            return (time.time() - os.path.getmtime(PATH_ANIME)) / 3600
        except OSError:
            return None

    @staticmethod
    def _catalogue_is_stale(anime_data, base_url):
        """Le catalogue stocke des liens absolus : ils pourrissent dès que
        anime-sama change de domaine."""
        if not anime_data:
            return True

        # Peremption par age : sans ca, les nouveaux titres n'arrivent jamais.
        age = Cardinal._catalogue_age_hours()
        if CATALOGUE_TTL_HOURS > 0 and age is not None and age > CATALOGUE_TTL_HOURS:
            return True

        # Catalogue ecrit avant l'enrichissement (image, genres, types...) :
        # sans ca un cache existant resterait pauvre indefiniment.
        if any("image" not in anime for anime in anime_data):
            return True

        base_domain = base_url.replace("https://", "").replace("http://", "").rstrip("/")
        return any(
            base_domain not in anime.get("link", "")
            for anime in anime_data
            if anime.get("link")
        )

    @staticmethod
    def getAllAnime(reset=False):

        base_url = get_base_url()
        if not base_url:
            return {"error": "Aucun domaine anime-sama actif trouve"}

        os.makedirs(PATH_DIR, exist_ok=True)

        if os.path.exists(PATH_ANIME) and not _as_bool(reset):
            return "Fichier deja existant, ajouter l'argument r=True pour tout actualiser"

        data = []

        for page in range(1, MAX_CATALOGUE_PAGES + 1):
            try:
                reponse = scraper.get(f"{base_url}/catalogue/?page={page}", timeout=15)
            except requests.exceptions.RequestException as err:
                return {"error": f"Catalogue injoignable (page {page}) : {err}"}

            if reponse.status_code != 200:
                return {"error": f"Catalogue page {page} : HTTP {reponse.status_code}"}

            soup = BeautifulSoup(reponse.content, 'lxml')

            # Page "aucun resultat" = fin du catalogue.
            if soup.find_all('p', class_="text-white font-bold text-2xl h-96 p-5"):
                break

            cards = soup.find_all(CARD_SELECTOR["name"], class_=CARD_SELECTOR["class_"])
            if not cards:
                break

            data.extend(c for c in (Cardinal._parse_card(x) for x in cards) if c)

        if not data:
            return {"error": "Aucun anime recupere, le HTML du catalogue a peut-etre change"}

        with open(PATH_ANIME, "w", encoding='utf-8') as t:
            json.dump(data, t, ensure_ascii=False, indent=2)

        return f"Recuperation achevee : {len(data)} animes"

    @staticmethod
    def getFilters():
        """Vocabulaire des filtres, lu dans le formulaire du catalogue.

        Scrape plutot que codage en dur : 109 genres, et c'est le site qui fait
        autorite. Mis en cache, ca ne bouge quasiment jamais.
        """
        global _FILTERS
        if _FILTERS is not None:
            return _FILTERS

        base_url = get_base_url()
        if not base_url:
            return {"error": "Aucun domaine anime-sama actif trouve"}

        try:
            r = scraper.get(f"{base_url}/catalogue/", timeout=20)
        except requests.exceptions.RequestException as err:
            return {"error": f"Catalogue injoignable : {err}"}

        soup = BeautifulSoup(r.content, 'lxml')
        form = soup.find('form')
        if not form:
            return {"error": "Formulaire de filtres introuvable"}

        found = {}
        for inp in form.find_all('input'):
            # bs4 peut rendre une liste sur les attributs multi-valeurs.
            name = str(inp.get('name') or '')
            value = inp.get('value')
            if name.endswith('[]') and value:
                found.setdefault(name[:-2], []).append(str(value))

        if not found.get('type'):
            return {"error": "Aucun filtre lu, le HTML du catalogue a change"}

        _FILTERS = {
            "types": found.get('type', []),
            "langues": found.get('langue', []),
            "statuts": found.get('current', []),
            "genres": found.get('genre', []),
        }
        return _FILTERS

    @staticmethod
    def getCatalogue(types=None, genres=None, langues=None, statuts=None, search=None, page=1, random=False):
        """Catalogue filtre. Les filtres sont appliques par anime-sama lui-meme
        (ils marchent en query params), donc jamais de cache a resynchroniser.

        random=True : le site renvoie une seule oeuvre au hasard (parametre
        maison), ce qui alimente le bouton "me surprendre".
        """
        base_url = get_base_url()
        if not base_url:
            return {"error": "Aucun domaine anime-sama actif trouve"}

        try:
            page = max(1, int(page))
        except (TypeError, ValueError):
            page = 1

        params = []
        if random:
            params.append(("random", "1"))
        for value in (types or []):
            params.append(("type[]", value))
        for value in (genres or []):
            params.append(("genre[]", value))
        for value in (langues or []):
            params.append(("langue[]", value))
        for value in (statuts or []):
            params.append(("current[]", value))
        if search:
            params.append(("search", search))
        params.append(("page", str(page)))

        try:
            r = scraper.get(f"{base_url}/catalogue/?{urlencode(params)}", timeout=20)
        except requests.exceptions.RequestException as err:
            return {"error": f"Catalogue injoignable : {err}"}

        if r.status_code != 200:
            return {"error": f"Catalogue : HTTP {r.status_code}"}

        soup = BeautifulSoup(r.content, 'lxml')
        cards = soup.find_all(CARD_SELECTOR["name"], class_=CARD_SELECTOR["class_"])
        items = [c for c in (Cardinal._parse_card(x) for x in cards) if c]

        return {
            "page": page,
            "total": len(items),
            # Le site sert 48 cartes par page : en dessous, on est au bout.
            # (random ne rend qu'une carte, d'ou derniere_page a True.)
            "derniere_page": len(cards) < PAGE_SIZE,
            "items": items,
        }

    @staticmethod
    def loadBaseAnimeData():
        if not os.path.exists(PATH_ANIME):
            detail = Cardinal.getAllAnime(reset=True)
            if not os.path.exists(PATH_ANIME):
                return {"error": "Catalogue indisponible", "detail": detail}

        anime_data = Cardinal._read_catalogue()

        base_url = get_base_url()
        if base_url and Cardinal._catalogue_is_stale(anime_data, base_url):
            Cardinal.getAllAnime(reset=True)
            anime_data = Cardinal._read_catalogue()

        return anime_data

    @staticmethod
    def normalize_title(title):
        if not title:
            return ""

        # Normalize les accents en standards
        title = unicodedata.normalize("NFKD", title)
        title = "".join([c for c in title if not unicodedata.combining(c)])

        # Converti les guillemets spéciaux en guillemets simples
        title = title.replace("“", "\"").replace("”", "\"")
        title = title.replace("‘", "'").replace("’", "'")

        # Remplacer les caractères interdits JSON ou filesystem
        forbidden = r'[\/\\\:\*\?\"\<\>\|]'
        title = re.sub(forbidden, " ", title)

        # Nettoyer les caractères non alphanumériques excessifs
        title = re.sub(r"[^a-zA-Z0-9\-\_\&\.\'\#\s]", " ", title)

        # Réduire espaces multiples
        title = re.sub(r"\s+", " ", title).strip()

        return title

    @staticmethod
    def clean_string(text):
        """Une fonction pour nettoyer et normaliser une chaîne de caractères."""
        if not text:
            return ""
        # Met tout en minuscule
        text = text.lower()
        # Ne garde que les lettres, les chiffres et les espaces
        text = re.sub(r'[^a-z0-9\s]', '', text)
        # Enlève les espaces en trop
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    @staticmethod
    def serchAnime(search, limit=5):  #Ajouter de quoi afficher sur la liste final les titre alternatif si il y en a
        animes_data = Cardinal.loadBaseAnimeData()
        if not isinstance(animes_data, list) or not animes_data:
            return []

        cleaned_search = Cardinal.clean_string(search)
        if not cleaned_search:
            return []

        # Utilisation de dictionnaires pour garantir l'unicité
        cleaned_to_anime = {
            Cardinal.clean_string(anime.get("title", "")): anime
            for anime in animes_data if anime.get("title")
        }

        cleaned_titles = list(cleaned_to_anime.keys())

        # On prend une marge plus large pour avoir assez de matière pour notre tri intelligent
        matches = process.extract(cleaned_search, cleaned_titles, scorer=fuzz.token_set_ratio, limit=15)

        temp_results = []

        for cleaned_title, score, _ in matches:
            if score < 75:
                continue

            # Logique de score intelligent
            length_ratio = len(cleaned_title) / len(cleaned_search) if len(cleaned_search) > 0 else 0
            specificity_bonus = 0
            if 0.9 <= length_ratio <= 1.1:
                specificity_bonus = 10
            elif length_ratio < 0.5:
                specificity_bonus = -15

            final_score = score + specificity_bonus

            anime = cleaned_to_anime.get(cleaned_title)

            if anime and anime.get("title") and anime.get("link"):
                temp_results.append({
                    "title": anime["title"],
                    "lien": anime["link"],
                    "image": anime.get("image"),
                    "genres": anime.get("genres", []),
                    "types": anime.get("types", []),
                    "langues": anime.get("langues", []),
                    "final_score": final_score
                })

        # Tri sur le score final
        temp_results.sort(key=lambda x: x["final_score"], reverse=True)

        # Logique anti-doublons et application de la limite
        final_results = []
        seen_ids = set()
        for res in temp_results:
            if len(final_results) >= limit:
                break
            if res["lien"] not in seen_ids:
                res['score'] = res.pop('final_score')
                final_results.append(res)
                seen_ids.add(res["lien"])

        return final_results

    @staticmethod
    def getInfoAnime(querry): # Voir pour proposer un lien de scan par défaut ou non
        animes = []

        data = Cardinal.serchAnime(querry, 5)
        if not data:
            return []

        base_url = data[0]["lien"]
        title = data[0]["title"]

        try:
            # 30s et pas 15 : au tout premier appel d'un process neuf,
            # cloudscraper doit négocier Cloudflare, ce qui dépassait le délai.
            reponse = scraper.get(base_url, timeout=30)
        except requests.exceptions.RequestException:
            return []

        soup = BeautifulSoup(reponse.text, 'html.parser')

        scripts = soup.find_all("script")
        # Le type de panneau est capture : panneauScan = chapitres de manga,
        # pas des episodes video. Aux consommateurs de filtrer.
        pattern = re.compile(r'panneau(Anime|Film|Scan|Visual)\s*\(\s*(["\'])(.*?)\2\s*,\s*(["\'])(.*?)\4\s*\)')

        for script in scripts:
            if script.text:  # Vérifie qu'il contient bien du texte
                text = re.sub(r'/\*.*?\*/', '', script.text, flags=re.DOTALL)
                matches = pattern.findall(text)
                for kind, _q1, nom, _q2, lien in matches:
                    if nom.lower() != "nom" and lien.lower() != "url":
                        saison_url = base_url.rstrip("/") + "/" + lien.lstrip("/")
                        animes.append({
                            "base_url": base_url,
                            "title": title,
                            "Saison": nom,
                            "type": kind.lower(),
                            "url": saison_url
                        })

        return animes

    @staticmethod
    def getSpecificAnime(nom, saison=None, version=None): # Syntaxe exemple nom, saison, version : spice%20and%20wolf&s=saison1&v=vostfr
        reponse = Cardinal.getInfoAnime(nom)
        if not reponse:
            return None

        if not saison:
            saison = "saison1"
        if not version:
            version = "vostfr"

        # Extraire toutes les saisons
        saisons = [item["Saison"] for item in reponse if "Saison" in item]

        # Normaliser les noms
        saisons_normalized = [s.strip().lower().replace(" ", "") for s in saisons]
        saison_norm = saison.strip().lower().replace(" ", "")

        for i, s in enumerate(saisons_normalized):
            if s == saison_norm:
                return reponse[i]

        return None

    @staticmethod
    def _episode_urls(link):
        """Récupère les listes d'episodes par lecteur depuis episodes.js."""
        try:
            second = scraper.get(link, timeout=15)
        except requests.exceptions.RequestException as err:
            return None, f"Page saison injoignable : {err}"

        soup = BeautifulSoup(second.text, 'html.parser')

        script_tag = soup.find("script", src=lambda s: bool(s) and "episodes.js" in s)
        if not script_tag or not script_tag.get("src"):
            return None, "episodes.js introuvable sur la page saison"

        jsfile = f"{link}/{script_tag.get('src')}"

        try:
            js_text = scraper.get(jsfile, timeout=15).text
        except requests.exceptions.RequestException as err:
            return None, f"episodes.js injoignable : {err}"

        matches = re.findall(r"var\s+(eps\d+)\s*=\s*\[(.*?)\];", js_text, re.DOTALL)

        all_eps = {
            name: re.findall(r"'(https?://[^']+)'", content)
            for name, content in matches
        }

        if not all_eps:
            return None, "Aucun lecteur trouve dans episodes.js"

        return all_eps, None

    @staticmethod
    def _scan_oeuvre(nom):
        """Nom de l'oeuvre cote /s2/scans/, lu sur la page scan.

        Pas deductible du slug : /catalogue/one-piece/ -> "One Piece Couleur".
        """
        panneaux = Cardinal.getInfoAnime(nom)
        if not panneaux:
            # getInfoAnime rend [] aussi bien quand le titre est inconnu que
            # quand sa page est injoignable : ne pas affirmer le premier.
            if Cardinal.serchAnime(nom, 1):
                return None, None, f"Page de '{nom}' injoignable, réessayez"
            return None, None, f"Titre '{nom}' introuvable"

        scan = next((p for p in panneaux if p.get("type") == "scan"), None)
        if not scan:
            return None, None, f"Aucun scan pour '{nom}'"

        try:
            r = scraper.get(scan["url"], timeout=15)
        except requests.exceptions.RequestException as err:
            return None, None, f"Page scan injoignable : {err}"

        soup = BeautifulSoup(r.text, 'html.parser')
        el = soup.find(id="titreOeuvre")
        if not el:
            return None, None, "titreOeuvre introuvable, le HTML a change"

        return el.get_text(strip=True), scan.get("title", nom), None

    @staticmethod
    def getScanChapitres(nom):
        """Chapitres d'une oeuvre et leur nombre de pages."""
        oeuvre, titre, err = Cardinal._scan_oeuvre(nom)
        if err or not oeuvre:
            return {"error": err or "Oeuvre introuvable"}

        base_url = get_base_url()
        if not base_url:
            return {"error": "Aucun domaine anime-sama actif trouve"}

        try:
            r = scraper.get(
                f"{base_url}/s2/scans/get_nb_chap_et_img.php?oeuvre={quote(oeuvre)}",
                timeout=20,
            )
            data = r.json()
        except (requests.exceptions.RequestException, ValueError) as err:
            return {"error": f"API scans injoignable : {err}"}

        # L'API repond HTTP 200 avec {"error": ...} quand les fichiers ne sont
        # pas heberges : ~14% des titres tagges "Scans" sont dans ce cas.
        if not isinstance(data, dict) or "error" in data:
            detail = data.get("error", "reponse inattendue") if isinstance(data, dict) else "reponse inattendue"
            return {"error": f"Scans non disponibles pour '{oeuvre}' ({detail})"}

        chapitres = [{"chapitre": k, "pages": v} for k, v in data.items()]
        chapitres.sort(key=lambda c: _chap_key(c["chapitre"]))

        return {
            "titre": titre,
            "oeuvre": oeuvre,
            "total": len(chapitres),
            "chapitres": chapitres,
        }

    @staticmethod
    def getScanPages(nom, chapitre):
        """URLs des images d'un chapitre, dans l'ordre."""
        data = Cardinal.getScanChapitres(nom)
        if "error" in data:
            return data

        match = next(
            (c for c in data["chapitres"] if str(c["chapitre"]) == str(chapitre)), None
        )
        if not match:
            return {"error": f"Chapitre '{chapitre}' introuvable"}

        base_url = get_base_url()
        oeuvre = quote(data["oeuvre"])
        chap = quote(str(chapitre))

        return {
            "titre": data["titre"],
            "oeuvre": data["oeuvre"],
            "chapitre": str(chapitre),
            "pages": match["pages"],
            "images": [
                f"{base_url}/s2/scans/{oeuvre}/{chap}/{i}.jpg"
                for i in range(1, match["pages"] + 1)
            ],
        }

    @staticmethod
    def _season_page(nom, saison, version):
        """Page saison + liste brute des episodes par lecteur.

        Aucune resolution ici : c'est l'etape rapide (2 requetes), celle qui
        permet d'afficher la grille d'episodes sans attendre les resolvers.
        """
        reponse = Cardinal.getSpecificAnime(nom, saison, version)
        if not reponse:
            return None, None, f"Saison '{saison}' introuvable pour '{nom}'"

        saison_num = saison.lower().replace(" ", "")
        version = version.lower().replace(" ", "")

        url = reponse["url"]
        if saison_num == "film":
            first_rewoks = url.lower().replace("//film", "/film")
            second_rewoks = first_rewoks.split("/vostfr")[0]
            link = f"{second_rewoks}/{version}"
        else:
            new_url = url.split("/vostfr")[0]
            link = f"{new_url}/{version}"

        all_eps, err = Cardinal._episode_urls(link)
        if err or not all_eps:
            return None, None, err or "Aucun lecteur trouve"

        return reponse, all_eps, None

    @staticmethod
    def _resolve_one(all_eps, episode):
        """Tente les lecteurs dans l'ordre, s'arrete au premier qui repond."""
        lecteurs = sorted(all_eps, key=lambda name: int(name[3:]))

        for lecteur in lecteurs:
            urls = all_eps.get(lecteur, [])
            if episode >= len(urls):
                continue

            url_ep = urls[episode]
            if not any(site in url_ep for site in ALLOWED_SITES):
                continue

            try:
                resolved = resolve_video_url(url_ep)
            except Exception:
                continue

            if resolved and resolved.get("url"):
                return {
                    "episode": episode,
                    "url": resolved["url"],
                    "type": resolved.get("type", "raw"),
                    "lecteur": lecteur,
                }

        return None

    @staticmethod
    def getEpisodes(nom, saison=None, version=None):
        """Liste les episodes d'une saison SANS resoudre les liens video.

        Les liens Vidmoly expirent en ~12h : les resoudre a l'avance pour toute
        une saison est du gaspillage. La grille s'affiche avec ca, la lecture
        appelle getEpisodeLink au clic.
        """
        saison = saison or "saison1"
        version = version or "vostfr"

        reponse, all_eps, err = Cardinal._season_page(nom, saison, version)
        if err or not all_eps or not reponse:
            return {"error": err or "Aucun lecteur trouve"}

        nombre_episodes = max(len(urls) for urls in all_eps.values())

        episodes = []
        for episode in range(nombre_episodes):
            dispo = [
                lecteur for lecteur in sorted(all_eps, key=lambda n: int(n[3:]))
                if episode < len(all_eps[lecteur])
                and any(site in all_eps[lecteur][episode] for site in ALLOWED_SITES)
            ]
            episodes.append({
                "episode": episode,
                "numero": episode + 1,
                "lecteurs": dispo,
                "lisible": bool(dispo),
            })

        return {
            "titre": reponse.get("title"),
            "saison": reponse.get("Saison"),
            "version": version.lower().replace(" ", ""),
            "total": nombre_episodes,
            "episodes": episodes,
        }

    @staticmethod
    def getEpisodeLink(nom, saison=None, version=None, episode=0):
        """Resout UN episode. C'est l'appel que fait le lecteur au clic."""
        saison = saison or "saison1"
        version = version or "vostfr"

        reponse, all_eps, err = Cardinal._season_page(nom, saison, version)
        if err or not all_eps or not reponse:
            return {"error": err or "Aucun lecteur trouve"}

        nombre_episodes = max(len(urls) for urls in all_eps.values())
        if not 0 <= episode < nombre_episodes:
            return {"error": f"Episode {episode} hors bornes (0-{nombre_episodes - 1})"}

        resolu = Cardinal._resolve_one(all_eps, episode)
        if not resolu:
            return {"error": f"Aucun lecteur exploitable pour l'episode {episode}"}

        resolu["numero"] = episode + 1
        resolu["titre"] = reponse.get("title")
        resolu["saison"] = reponse.get("Saison")
        return resolu

    @staticmethod
    def getAnimeLink(nom, saison=None, version=None): # Recupère les different lien disponible affin de retourner une playlist complete et prete a être télécharger

        saison = saison or "saison1"
        version = version or "vostfr"

        reponse, all_eps, err = Cardinal._season_page(nom, saison, version)
        if err or not all_eps or not reponse:
            return {"error": err or "Aucun lecteur trouve"}

        # eps1 sert de reference pour le nombre d'episodes ; les lecteurs
        # suivants ne sont pas garantis complets.
        nombre_episodes = max(len(urls) for urls in all_eps.values())

        resolus = {}
        for episode in range(nombre_episodes):
            resolu = Cardinal._resolve_one(all_eps, episode)
            if resolu:
                resolus[episode] = resolu

        episodes = [resolus[e] for e in sorted(resolus)]
        manquants = [e for e in range(nombre_episodes) if e not in resolus]

        return {
            "titre": reponse.get("title"),
            "saison": reponse.get("Saison"),
            "version": version.lower().replace(" ", ""),
            "total": nombre_episodes,
            "episodes": episodes,
            "manquants": manquants,
        }
