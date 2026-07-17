"""File de téléchargements : mux d'un flux HLS/mp4 vers un .mp4 local.

ffmpeg travaille en copie de flux (`-c copy`) : aucun ré-encodage, donc ~10x
temps réel et aucune perte de qualité.
"""

import json, os, re, shutil, subprocess, threading, time, unicodedata, uuid
from queue import Queue

try:
    from .backend import Cardinal, PATH
except ImportError:
    from src.backend import Cardinal, PATH

# Le master.m3u8 de Vidmoly expose deux programmes : 0 = 1080p, 1 = 480p.
# ~691 Mo contre ~107 Mo pour un épisode de 26 min.
QUALITES = {"1080p": 0, "480p": 1}

DOWNLOAD_DIR = os.environ.get("DOWNLOAD_DIR", os.path.join(PATH, "data", "videos"))

# Un seul mux à la fois : le goulot est le réseau, paralléliser ne gagne rien
# et sature la connexion.
_queue = Queue()
_jobs = {}
_procs = {}
_lock = threading.Lock()
_worker = None


def _slug(text):
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "sans-titre"


def ffmpeg_dispo():
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _sidecar(fichier):
    return os.path.join(DOWNLOAD_DIR, fichier + ".json")


def _ecrire_sidecar(job):
    """Métadonnées à côté du .mp4 : c'est ce qui fait survivre la liste des
    téléchargements à un redémarrage du conteneur."""
    try:
        with open(_sidecar(job["fichier"]), "w", encoding="utf-8") as f:
            json.dump(job, f, ensure_ascii=False)
    except OSError:
        pass


def _duree(src):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", src],
            capture_output=True, text=True, timeout=90,
        )
        return float(out.stdout.strip())
    except (subprocess.SubprocessError, ValueError, OSError):
        return None


def _maj(job_id, **champs):
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.update(champs)


def _mux(job):
    job_id = job["id"]

    # Lien résolu maintenant, pas à la mise en file : le token ne vit que 12 h.
    data = Cardinal.getEpisodeLink(job["titre"], job["saison"], job["version"], job["episode"])
    if not data or "error" in data:
        _maj(job_id, statut="erreur", erreur=(data or {}).get("error", "Lien introuvable"))
        return

    src = data["url"]
    duree = _duree(src)
    _maj(job_id, duree=duree)

    tmp = os.path.join(DOWNLOAD_DIR, job["fichier"] + ".part")
    final = os.path.join(DOWNLOAD_DIR, job["fichier"])

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
           "-progress", "pipe:1", "-i", src]

    if data.get("type") == "m3u8":
        p = QUALITES.get(job["qualite"], 0)
        cmd += ["-map", f"p:{p}:v", "-map", f"p:{p}:a"]
    else:
        # SendVid sert du mp4 direct : pas de programmes HLS à sélectionner.
        cmd += ["-map", "0:v:0", "-map", "0:a:0"]

    # aac_adtstoasc : l'AAC des segments TS n'est pas lisible tel quel en mp4.
    # -f mp4 explicite : ffmpeg déduit le format de l'extension, or le fichier
    # de travail finit en .part et ne lui évoque rien.
    cmd += ["-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart",
            "-f", "mp4", "-y", tmp]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except OSError as err:
        _maj(job_id, statut="erreur", erreur=f"ffmpeg indisponible : {err}")
        return

    with _lock:
        _procs[job_id] = proc

    for ligne in proc.stdout:
        if ligne.startswith("out_time_ms=") and duree:
            try:
                secondes = int(ligne.split("=", 1)[1]) / 1_000_000
                _maj(job_id, progres=min(99, round(secondes / duree * 100)))
            except ValueError:
                pass

    proc.wait()
    stderr = proc.stderr.read() if proc.stderr else ""

    with _lock:
        _procs.pop(job_id, None)
        annule = _jobs.get(job_id, {}).get("statut") == "annule"

    if annule:
        for p in (tmp, final):
            try:
                os.remove(p)
            except OSError:
                pass
        return

    if proc.returncode != 0 or not os.path.exists(tmp):
        try:
            os.remove(tmp)
        except OSError:
            pass
        _maj(job_id, statut="erreur", erreur=(stderr.strip().splitlines() or ["ffmpeg a échoué"])[-1][:200])
        return

    os.replace(tmp, final)
    _maj(job_id, statut="termine", progres=100, taille=os.path.getsize(final))

    with _lock:
        fini = dict(_jobs[job_id])
    _ecrire_sidecar(fini)


def _boucle():
    while True:
        job = _queue.get()
        try:
            with _lock:
                courant = _jobs.get(job["id"])
                if not courant or courant["statut"] == "annule":
                    continue
                courant["statut"] = "en_cours"
            _mux(_jobs[job["id"]])
        except Exception as err:  # un job cassé ne doit pas tuer le worker
            _maj(job["id"], statut="erreur", erreur=str(err)[:200])
        finally:
            _queue.task_done()


def _demarrer_worker():
    global _worker
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_boucle, daemon=True)
        _worker.start()


def charger_existants():
    """Reconstruit la liste depuis le disque au démarrage."""
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    for nom in os.listdir(DOWNLOAD_DIR):
        if not nom.endswith(".json"):
            continue
        try:
            with open(os.path.join(DOWNLOAD_DIR, nom), encoding="utf-8") as f:
                job = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue

        chemin = os.path.join(DOWNLOAD_DIR, job.get("fichier", ""))
        if not os.path.exists(chemin):
            continue  # sidecar orphelin : le .mp4 a été supprimé à la main

        job["taille"] = os.path.getsize(chemin)
        with _lock:
            _jobs[job["id"]] = job


def ajouter(titre, saison, version, episode, qualite="1080p"):
    if not ffmpeg_dispo():
        return {"error": "ffmpeg absent de l'image"}
    if qualite not in QUALITES:
        return {"error": f"Qualité inconnue (attendu : {', '.join(QUALITES)})"}

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    numero = int(episode) + 1
    fichier = f"{_slug(titre)}-{_slug(saison)}-{version}-ep{numero:02d}-{qualite}.mp4"

    # Déjà présent ou déjà en file : on ne relance pas.
    with _lock:
        for job in _jobs.values():
            if job["fichier"] == fichier and job["statut"] in ("en_attente", "en_cours", "termine"):
                return job

    job = {
        "id": uuid.uuid4().hex[:12],
        "titre": titre, "saison": saison, "version": version,
        "episode": int(episode), "numero": numero,
        "qualite": qualite,
        "statut": "en_attente", "progres": 0,
        "duree": None, "taille": None, "erreur": None,
        "fichier": fichier,
        "url": f"/videos/{fichier}",
        "cree": time.time(),
    }

    with _lock:
        _jobs[job["id"]] = job

    _demarrer_worker()
    _queue.put(job)
    return job


def lister():
    with _lock:
        jobs = list(_jobs.values())
    return sorted(jobs, key=lambda j: j["cree"], reverse=True)


def supprimer(job_id):
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return {"error": "Téléchargement inconnu"}
        job["statut"] = "annule"
        proc = _procs.get(job_id)

    if proc and proc.poll() is None:
        proc.terminate()  # le worker nettoiera le .part

    for p in (os.path.join(DOWNLOAD_DIR, job["fichier"]),
              os.path.join(DOWNLOAD_DIR, job["fichier"] + ".part"),
              _sidecar(job["fichier"])):
        try:
            os.remove(p)
        except OSError:
            pass

    with _lock:
        _jobs.pop(job_id, None)

    return {"ok": True}
