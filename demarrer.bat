@echo off
title Lancement de Planning Medical
echo ========================================================
echo   Demarrage de l'application Planning Medical...
echo ========================================================
echo.

:: 1. Nettoyage des anciens processus pour liberer les ports
echo Nettoyage des anciens processus...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8083" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a > nul 2>&1
)

ping 127.0.0.1 -n 2 > nul

:: 2. Demarrage du Backend
echo [1/3] Demarrage du Backend (Port 8083)...
start "Backend-Planning" /min cmd /c "cd /d ""%~dp0backend"" && npm run dev"

:: 3. Demarrage du Frontend
echo [2/3] Demarrage du Frontend (Port 5173)...
start "Frontend-Planning" /min cmd /c "cd /d ""%~dp0frontend"" && npm run dev"

:: 4. Attente et ouverture
echo [3/3] Attente du demarrage des serveurs...
ping 127.0.0.1 -n 4 > nul

echo.
echo Application lancee avec succes !
echo Ouverture du navigateur sur http://localhost:5173 ...
start http://localhost:5173

exit
