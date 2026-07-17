import subprocess, shutil, os


class Config:
    IP = "127.0.0.1"   # valeur par défaut
    PORT = 5000        # valeur par défaut


class Utils:

    MODULE_ROOT = os.path.dirname(os.path.abspath(__file__))

    @staticmethod
    def get_hash(ref):
        return subprocess.check_output(
            ['git', 'rev-parse', ref],
            cwd=Utils.MODULE_ROOT,
            stderr=subprocess.DEVNULL,
        ).decode().strip()

    @staticmethod
    def gitCheck():
        """Signale l'absence de git sans arreter l'API.

        La verification de version est un confort local : une image Docker
        python:slim n'embarque pas git, et l'API doit quand meme demarrer.
        """
        if shutil.which("git") is None:
            print("[version] git introuvable : verification ignoree")
            return False
        return True

    @staticmethod
    def hashCheck():
        """Compare HEAD au distant et avertit. Ne bloque jamais le demarrage :
        pas de input() (stdin n'est pas un TTY en conteneur -> EOFError).
        """
        if not Utils.gitCheck():
            return

        try:
            subprocess.run(
                ['git', 'fetch'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=Utils.MODULE_ROOT,
                timeout=15,
            )

            branch = subprocess.check_output(
                ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                cwd=Utils.MODULE_ROOT,
                stderr=subprocess.DEVNULL,
            ).decode().strip()

            local_hash = Utils.get_hash('HEAD')
            remote_hash = Utils.get_hash(f'origin/{branch}')
        except (subprocess.SubprocessError, OSError) as err:
            # Pas de .git (copie dans une image), pas de reseau, pas de remote...
            print(f"[version] verification impossible : {err}")
            return

        if local_hash != remote_hash:
            print("[version] Please update AnimeSamaApi : git pull origin main")
