@echo off
title Background Removal - Chroma Key Mode
echo ===== Background Removal Tool =====
echo.
echo Current dir: %CD%
echo Script dir:  %~dp0
echo.
cd /d "%~dp0\.."
echo Changed to: %CD%
echo.
if "%~1"=="" goto :help
:loop
if "%~1"=="" goto :done
echo ----------------------------------------
echo Input file: %~1
echo Output to:  %~dpn1_nobg.png
echo Running python tools\removebg.py ...
python tools\removebg.py "%~1" "%~dpn1_nobg.png" 120 chroma
if errorlevel 1 echo *** Python exited with error code %errorlevel% ***
echo.
shift
goto :loop
:help
echo.
echo   Usage: drag PNG files onto this .bat
echo   Output: same folder with _nobg suffix
echo.
echo [test] python --version:
python --version
echo.
pause
exit /b
:done
echo.
echo ========== All done. ==========
echo.
pause
