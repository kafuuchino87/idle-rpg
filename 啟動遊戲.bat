@echo off
title Veilreach launcher
cd /d "C:\Users\User\Desktop\Claude\idle-rpg"
echo Starting server on port 8765...
start "veilreach-server" /MIN cmd /c "python -m http.server 8765"
timeout /t 2 /nobreak >nul
echo Opening browser...
start "" "http://localhost:8765/"
exit
