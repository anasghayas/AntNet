@echo off
title AntNet Worker Auto-Setup
color 0A

echo ===================================================
echo      ANTNET WORKER: AUTO INSTALLATION
echo ===================================================
echo.

:: -----------------------------------------------------
:: STEP 1: CHECK FOR OLLAMA
:: -----------------------------------------------------
echo [1/3] Checking system requirements...
where ollama >nul 2>nul
if %errorlevel% equ 0 (
    echo    - Ollama is already installed. Good.
    goto :PullModel
)

:: -----------------------------------------------------
:: STEP 2: AUTO-INSTALL OLLAMA (If missing)
:: -----------------------------------------------------
echo    - Ollama NOT found. Starting auto-installer...
echo.
echo    [Downloading OllamaSetup.exe...]
:: Use PowerShell to download the official installer
powershell -Command "Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile 'OllamaSetup.exe'"

echo    [Running Installer...]
echo    PLEASE FOLLOW THE OLLAMA INSTALLER ON YOUR SCREEN.
echo    When the installation finishes, come back here.
echo.

:: Run the installer and wait for it to close
start /wait OllamaSetup.exe

:: Cleanup the installer file to keep things clean
del OllamaSetup.exe

echo.
echo    [IMPORTANT]
echo    If you just installed Ollama, Windows might not see it yet.
echo    We will try to continue. If it fails, just close this and run setup.bat again.
echo.
pause

:: -----------------------------------------------------
:: STEP 3: PULL THE MODEL
:: -----------------------------------------------------
:PullModel
echo.
echo [2/3] Verifying AI Brain (phi3:mini)...
echo    - This ensures you have the correct neural network.
echo    - If missing, it will download (~2.3GB).
echo    - Please wait...
echo.

:: We use 'call' to ensure the script doesn't exit if ollama updates itself
call ollama pull phi3:mini

:: -----------------------------------------------------
:: STEP 4: LAUNCH WORKER
:: -----------------------------------------------------
echo.
echo [3/3] System Ready!
echo 🚀 Launching AntNet Worker...
echo.
antnet-worker.exe

:: Keep window open if it crashes
pause