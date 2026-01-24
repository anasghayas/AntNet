@echo off
title AntNet Worker Launcher
color 0A

echo ===================================================
echo      ANTNET DISTRIBUTED WORKER
echo ===================================================
echo.

:: -----------------------------------------------------
:: STEP 1: SMART CHECK FOR OLLAMA (The Engine)
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
powershell -Command "Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile 'OllamaSetup.exe'"

echo    - Running Installer... (Please click Next/Install)
start /wait OllamaSetup.exe
del OllamaSetup.exe
echo    - Installation Complete.
echo.
echo    [NOTE] If the next step fails, close this window and run it again.
echo.

:: -----------------------------------------------------
:: STEP 2: SMART CHECK FOR MODEL (The Brain)
:: -----------------------------------------------------
:CheckModel
echo.
echo [2/3] Verifying AI Brain (phi3:mini)...
:: This command is safe: if you have the model, it finishes instantly.
call ollama pull phi3:mini >nul 2>nul
echo    - AI Model is ready.

:: -----------------------------------------------------
:: STEP 3: LAUNCH WORKER (The App)
:: -----------------------------------------------------
echo.
echo [3/3] Starting Worker...
echo ---------------------------------------------------
antnet-worker.exe

:: Keep window open if it crashes so you can see the error
pause