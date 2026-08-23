@echo off
title Arret de Planning Medical
echo ========================================================
echo   Arret de l'application Planning Medical...
echo ========================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8083" ^| findstr "LISTENING"') do (
    echo Arret du Backend (PID %%a)...
    taskkill /F /PID %%a > nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo Arret du Frontend 5173 (PID %%a)...
    taskkill /F /PID %%a > nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174" ^| findstr "LISTENING"') do (
    echo Arret du Frontend 5174 (PID %%a)...
    taskkill /F /PID %%a > nul 2>&1
)

echo.
echo Tous les services ont ete arretes.
ping 127.0.0.1 -n 2 > nul
exit
