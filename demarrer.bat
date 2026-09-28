@echo off
title Demarrage Planning Medical
echo ========================================================
echo   Demarrage Rapide - Planning Medical (PC & Mobile)
echo ========================================================
echo.

:: 1. Verification et liberation rapide des ports (8083, 5173, 5174)
echo [1/3] Verification des ports...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8083 :5173 :5174" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a > nul 2>&1
)

:: 2. Demarrage des serveurs Backend et Frontend
echo [2/3] Lancement des serveurs...
start "Backend-Planning" /min cmd /c "cd /d ""%~dp0backend"" && node server.js"
start "Frontend-Planning" /min cmd /c "cd /d ""%~dp0frontend"" && npx vite --host"

:: 3. Attente active (ouverture des que le serveur repond)
echo [3/3] Connexion a l'application...
powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i=0; $i -lt 40; $i++) { try { $tcp = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 5173); $tcp.Close(); break } catch { Start-Sleep -Milliseconds 150 } }"

echo.
echo Application prete ! Ouverture de http://localhost:5173 ...
start http://localhost:5173

exit


