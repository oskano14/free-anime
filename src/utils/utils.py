import cloudscraper, re, requests
from urllib.parse import urlparse

# Site "annuaire" qui liste les domaines actifs d'anime-sama.
URL_PW = "https://anime-sama.pw"

# Filet si l'annuaire est injoignable (bloqué, down, format changé) : on teste
# ces domaines connus en direct. À compléter au fil des changements de domaine.
FALLBACK_DOMAINS = [
    "anime-sama.to",
    "anime-sama.fr",
    "anime-sama.tv",
    "anime-sama.si",
    "anime-sama.org",
    "anime-sama.net",
]


class Utils:
    @staticmethod
    def _domaines_annuaire(scraper, url_pw):
        """Domaines candidats lus sur l'annuaire. [] si injoignable."""
        try:
            html = scraper.get(url_pw, timeout=10).text
        except requests.exceptions.RequestException:
            return []
        match = re.search(r"const domains = \[(.*?)\];", html, re.DOTALL)
        if not match:
            return []
        return re.findall(r"name: '([^']+)'", match.group(1))

    @staticmethod
    def _domaine_final(scraper, domain):
        """Domaine canonique (scheme://host) si le candidat répond 200, sinon None.

        On renvoie l'URL APRÈS redirection : anime-sama.si -> anime-sama.to, et
        un miroir qui redirige perd les query params (les filtres du catalogue
        cassent). On veut donc toujours le domaine d'atterrissage réel.
        """
        try:
            r = scraper.get(f"https://{domain}", timeout=6, allow_redirects=True)
        except requests.exceptions.RequestException:
            return None
        if r.status_code != 200:
            return None
        p = urlparse(r.url)
        return f"{p.scheme}://{p.netloc}"

    @staticmethod
    def findLink(URL_PW=URL_PW):
        """Domaine anime-sama actif, ou None. Ne lève jamais d'exception.

        1) domaines listés par l'annuaire, 2) domaines de secours en dur. Le
        premier qui répond 200 gagne. Tout None = anime-sama injoignable (le
        plus souvent : bloqué par le FAI / la région).
        """
        scraper = cloudscraper.create_scraper()

        candidats = Utils._domaines_annuaire(scraper, URL_PW)
        # On ajoute les secours sans doublonner, en gardant l'ordre.
        for d in FALLBACK_DOMAINS:
            if d not in candidats:
                candidats.append(d)

        for domain in candidats:
            final = Utils._domaine_final(scraper, domain)
            if final:
                return final

        return None
