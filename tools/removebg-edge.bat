@echo off
title Background Removal - Edge Flood
cd /d "%~dp0\.."
if "%~1"=="" goto :help
:loop
if "%~1"=="" goto :done
echo Processing: %~1
python tools\removebg.py "%~1" "%~dpn1_nobg.png" 40 edge
if errorlevel 1 echo *** Error %errorlevel% ***
shift
goto :loop
:help
echo Drag PNG files onto this .bat
python --version
pause
exit /b
:done
echo Done.
pause
