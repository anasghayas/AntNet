@echo off
title AntNet Worker Launcher
color 0A

echo ===================================================
echo      ANTNET DISTRIBUTED WORKER
echo ===================================================
echo.

:: -----------------------------------------------------
:: STEP 1: CHECK FOR OLLAMA
:: -----------------------------------------------------
echo [1/3] Checking system requirements...
where ollama >nul 2>nul
if %errorlevel% equ 0 (
    echo    - Ollama is ready.
    goto :CheckModel
)

:: --- IF OLLAMA IS MISSING, INSTALL IT ---
echo    - Ollama NOT found. Downloading installer...
echo.

:: curl -# gives a progress bar. -f fails on error.
curl -# -L -f -o "%TEMP%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"

echo.
echo    - Running Installer... (Please click "Install")
start /wait %TEMP%\OllamaSetup.exe

:: Verify Install
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo    [WARNING] Windows needs a restart or path update.
    echo    Please CLOSE this window and run it again.
    pause
    exit
)

echo    - Installation Complete.

:: -----------------------------------------------------
:: STEP 2: CHECK FOR MODEL (The Brain)
:: -----------------------------------------------------
:CheckModel
echo.
echo [2/3] Verifying AI Brain (phi3:mini)...

:: 1. Ensure Ollama Service is running
tasklist /FI "IMAGENAME eq ollama_app.exe" 2>NUL | find /I /N "ollama_app.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo    - Starting Ollama background service...
    start "" ollama serve
    timeout /t 5 >nul
)

:: 2. Pull the model
call ollama pull phi3:mini

:: 3. REAL ERROR CHECKING
if %errorlevel% neq 0 (
    echo.
    echo ===================================================
    echo [ERROR] FAILED to download the AI Model.
    echo ===================================================
    echo.
    echo Possible causes:
    echo  1. Internet connection is unstable.
    echo  2. VPN or Firewall is blocking ollama.ai - TLS Error
    echo.
    echo ACTION: Turn off VPN/Firewall and try again.
    pause
    exit
)

echo    - AI Model is ready.

:: -----------------------------------------------------
:: STEP 3: LAUNCH WORKER
:: -----------------------------------------------------
echo.
echo [3/3] Starting Worker...
echo ---------------------------------------------------
antnet-worker.exe

pause