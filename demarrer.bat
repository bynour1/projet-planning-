@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
title Demarrage Planning Medical
echo ========================================================
echo   Demarrage Rapide - Planning Medical (PC et Mobile)
echo ========================================================
echo.

:: 1. Liberation des ports (8083, 5173, 5174)
echo [1/3] Verification des ports...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8083,5173,5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

:: 1b. Verification et lancement de MySQL si besoin
echo [1b] Verification de MySQL...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue; if (-not $c -and (Test-Path 'C:\xampp\mysql\bin\mysqld.exe')) { Start-Process -FilePath 'C:\xampp\mysql\bin\mysqld.exe' -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini --standalone' -WindowStyle Hidden; Start-Sleep -Seconds 2 }"

:: 2. Demarrage des serveurs Backend et Frontend
echo [2/3] Lancement des serveurs Backend et Frontend...
start "Backend-Planning" /min cmd /c "set PATH=C:\Program Files\nodejs;%%PATH%% & cd /d ""%~dp0backend"" & node server.js"
start "Frontend-Planning" /min cmd /c "set PATH=C:\Program Files\nodejs;%%PATH%% & cd /d ""%~dp0frontend"" & npm run dev -- --host"

:: 3. Attente active (ouverture des que le serveur repond)
echo [3/3] Connexion a l'application...
powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i=0; $i -lt 40; $i++) { try { $tcp = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 5173); $tcp.Close(); break } catch { Start-Sleep -Milliseconds 250 } }"

echo.
echo Application prete ! Ouverture de http://localhost:5173 ...
start http://localhost:5173

exit
