@echo off
chcp 65001 >nul
title Veilreach Launcher
cd /d "C:\Users\User\Desktop\Claude\idle-rpg"

echo Starting frontend (port 8765)...
netstat -ano | findstr ":8765 " | findstr "LISTENING" >nul
if errorlevel 1 (
  start "veilreach-frontend" /MIN cmd /c "python -m http.server 8765"
) else (
  echo   already running
)

echo Starting backend (port 8766)...
netstat -ano | findstr ":8766 " | findstr "LISTENING" >nul
if errorlevel 1 (
  start "veilreach-backend" /MIN cmd /c "cd /d C:\Users\User\Desktop\Claude\idle-rpg\server && node server.js"
) else (
  echo   already running
)

timeout /t 3 /nobreak >nul
echo Opening browser...
start "" "http://localhost:8765/"
exit
