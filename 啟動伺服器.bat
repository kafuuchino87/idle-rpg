@echo off
chcp 65001 >nul
title Veilreach Server Only (port 8766)
cd /d "C:\Users\User\Desktop\Claude\idle-rpg"

echo ==========================================
echo  Veilreach Backend Only (no browser)
echo  Port 8766 (Node + SQLite)
echo ==========================================
echo.

netstat -ano | findstr ":8766 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Backend already running on port 8766.
  echo Close that one first if you want to restart.
  pause
  exit
)

echo Starting backend...
echo.
cd /d "C:\Users\User\Desktop\Claude\idle-rpg\server"
node server.js
echo.
echo Server stopped.
pause
