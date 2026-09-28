@echo off
title Arret de Planning Medical
echo ========================================================
echo   Arret de Planning Medical...
echo ========================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8083 :5173 :5174" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a > nul 2>&1
)

echo Tous les services ont ete arretes.
ping 127.0.0.1 -n 2 > nul
exit


