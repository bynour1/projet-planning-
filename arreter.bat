@echo off
title Arret de Planning Medical
echo ========================================================
echo   Arret de Planning Medical...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8083,5173,5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Tous les services ont ete arretes.
timeout /t 2 > nul
exit
