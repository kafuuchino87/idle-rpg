@echo off
REM 幻域編年史後端啟動腳本
REM 雙擊執行即可
cd /d "%~dp0"
title 幻域編年史後端 (localhost:8766)
echo ==========================================
echo  Veilreach Server (Node + SQLite)
echo ==========================================
echo.
node server.js
pause
