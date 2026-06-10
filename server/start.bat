@echo off
chcp 65001 >nul
title Veilreach Server (port 8766)
cd /d "%~dp0"

echo ==========================================
echo  Veilreach Server (Node + SQLite)
echo  Port 8766
echo ==========================================
echo.

node server.js
echo.
echo Server stopped.
pause
