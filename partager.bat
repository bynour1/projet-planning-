@echo off
title Partage Mobile GMT Ariana
echo ========================================================
echo   Generation du lien public HTTPS pour smartphone...
echo ========================================================
echo.
echo Veuillez patienter quelques secondes...
echo Le lien HTTPS s'affichera ci-dessous :
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:5173
pause
