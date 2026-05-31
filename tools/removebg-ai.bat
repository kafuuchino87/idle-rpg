@echo off
title Background Removal - AI Smart Mode
echo ===== AI Background Removal =====
echo.
cd /d "%~dp0\.."
echo Working dir: %CD%
if "%~1"=="" goto :help
:loop
if "%~1"=="" goto :done
echo ----------------------------------------
echo Input:  %~1
echo Output: %~dpn1_nobg.png
rembg i -m isnet-anime "%~1" "%~dpn1_nobg.png"
if errorlevel 1 echo *** rembg failed errorlevel %errorlevel% ***
shift
goto :loop
:help
echo.
echo   Drag PNG/JPG files onto this .bat
echo   AI mode is slower (model loads on first run)
echo.
echo [test] rembg --version:
rembg --version
echo.
pause
exit /b
:done
echo.
echo ========== All done. ==========
echo.
pause
