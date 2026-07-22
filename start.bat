@echo off
setlocal EnableDelayedExpansion

REM Toujours travailler depuis le dossier du script
cd /d "%~dp0"

REM Configuration
if "%API_PORT%"=="" set API_PORT=5000
if "%WEB_PORT%"=="" set WEB_PORT=5173

echo.
echo ================================
echo      Free Anime Launcher
echo ================================
echo.

REM Vérification de Python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python introuvable. Installe Python 3.9 ou supérieur.
    pause
    exit /b 1
)

REM Vérification de npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] npm introuvable. Installe Node.js 20 ou supérieur.
    pause
    exit /b 1
)

REM Création du venv si nécessaire
if not exist ".venv\" (
    echo [INFO] Création de l'environnement Python...
    python -m venv .venv

    echo [INFO] Mise à jour de pip...
    call ".venv\Scripts\python.exe" -m pip install --upgrade pip

    echo [INFO] Installation des dépendances Python...
    call ".venv\Scripts\pip.exe" install -r requirements.txt
)

REM Installation des dépendances frontend
if not exist "frontend\node_modules\" (
    echo [INFO] Installation des dépendances npm...
    pushd frontend
    call npm install
    popd
)

echo.
echo [INFO] Démarrage de l'API...
start "Free Anime API" cmd /k ".venv\Scripts\python.exe -c "from main import Api; Api.launch(port=%API_PORT%, reload_status=False, debug_state=False)""

echo [INFO] Démarrage du Frontend...
start "Free Anime Frontend" cmd /k "cd /d frontend && npm run dev -- --port %WEB_PORT%"

echo.
echo ============================================
echo Application prête !
echo.
echo Frontend : http://localhost:%WEB_PORT%
echo API      : http://127.0.0.1:%API_PORT%
echo ============================================
echo.
echo Fermez les deux fenêtres ouvertes pour arrêter l'application.
pause