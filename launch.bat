@echo off
setlocal enabledelayedexpansion
title Vellicore Launcher
color 0A

:: ══════════════════════════════════════════════════════════════════════════════
:: CONFIGURE THESE PATHS — set each to the folder where you installed the service
:: Leave a path empty ("") to skip that service regardless of settings
:: ══════════════════════════════════════════════════════════════════════════════

set "VELLICORE_DIR=%~dp0"
set "CHROMADB_DIR=C:\AI\chromadb"
set "SDNEXT_DIR=C:\AI\SDNext"
set "KOKORO_DIR=C:\AI\kokoro"
set "CHATTERBOX_DIR=C:\AI\chatterbox"

:: SDNext launch flags — remove --use-rocm if you have an NVIDIA GPU
set "SDNEXT_FLAGS=--api --listen"

:: ══════════════════════════════════════════════════════════════════════════════

:: ── Parse arguments ───────────────────────────────────────────────────────────

set QUICK=0
for %%a in (%*) do (
    if /i "%%a"=="--quick" set QUICK=1
)

echo.
echo  -------------------------------------------------------
echo    V E L L I C O R E
if !QUICK!==1 echo    Quick Launch Mode
echo  -------------------------------------------------------
echo.

:: ── Read settings ─────────────────────────────────────────────────────────────
:: Config is stored by Electron at %APPDATA%\Vellicore\config.json

set "CFG=%APPDATA%\Vellicore\config.json"
set RAG_ENABLED=1
set IMG_ENABLED=0
set TTS_ENABLED=0
set TTS_PROVIDER=kokoro

if exist "%CFG%" (
    echo  Reading settings from %CFG%...
    for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { $j=(Get-Content '%CFG%' -Raw | ConvertFrom-Json); if($j.rag.enabled -eq $true){'1'}else{'0'} } catch {'1'}"`) do set RAG_ENABLED=%%v
    for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { $j=(Get-Content '%CFG%' -Raw | ConvertFrom-Json); if($j.image.enabled -eq $true){'1'}else{'0'} } catch {'0'}"`) do set IMG_ENABLED=%%v
    for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { $j=(Get-Content '%CFG%' -Raw | ConvertFrom-Json); if($j.tts.enabled -eq $true){'1'}else{'0'} } catch {'0'}"`) do set TTS_ENABLED=%%v
    for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { $j=(Get-Content '%CFG%' -Raw | ConvertFrom-Json); if($j.tts.provider){$j.tts.provider}else{'kokoro'} } catch {'kokoro'}"`) do set TTS_PROVIDER=%%v
    echo  RAG=!RAG_ENABLED! / Image=!IMG_ENABLED! / TTS=!TTS_ENABLED! / Provider=!TTS_PROVIDER!
) else (
    echo  No config found ^(first run^) — using defaults ^(RAG on, image+TTS off^)
)
echo.

:: ── 1. ChromaDB ──────────────────────────────────────────────────────────────

if !RAG_ENABLED!==0 (
    echo  [1/4] ChromaDB — skipped ^(RAG disabled in settings^)
    echo.
    goto CHROMA_DONE
)

echo  [1/4] ChromaDB (RAG Memory)...
curl -s --max-time 2 http://localhost:8765/api/v1/heartbeat >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] ChromaDB already running — skipping launch.
    echo.
    goto CHROMA_DONE
)

echo        Launching ChromaDB...
start "ChromaDB" cmd /k "cd /d !CHROMADB_DIR! && call start.bat"

if !QUICK!==1 (
    echo  [--quick] Skipping wait for ChromaDB.
    echo.
    goto CHROMA_DONE
)

echo  Waiting for ChromaDB...
set /a TRIES=0
:WAIT_CHROMA
set /a TRIES+=1
if !TRIES! GTR 15 (
    echo  [WARN] ChromaDB did not respond after 30s. RAG memory unavailable.
    echo.
    goto CHROMA_DONE
)
curl -s --max-time 2 http://localhost:8765/api/v1/heartbeat >nul 2>&1
if %errorlevel%==0 ( echo  [OK] ChromaDB ready. & echo. & goto CHROMA_DONE )
timeout /t 2 /nobreak >nul
goto WAIT_CHROMA
:CHROMA_DONE

:: ── 2. SDNext ────────────────────────────────────────────────────────────────

if !IMG_ENABLED!==0 (
    echo  [2/4] SDNext — skipped ^(image generation disabled in settings^)
    echo.
    goto SDNEXT_DONE
)

echo  [2/4] SDNext (Image Generation)...
curl -s --max-time 2 http://localhost:7860/sdapi/v1/sd-models >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] SDNext already running — skipping launch.
    echo.
    goto SDNEXT_DONE
)

echo        Launching SDNext...
start "SDNext" cmd /k "cd /d !SDNEXT_DIR! && webui.bat !SDNEXT_FLAGS!"

if !QUICK!==1 (
    echo  [--quick] Skipping wait for SDNext.
    echo.
    goto SDNEXT_DONE
)

echo  Waiting for SDNext API (up to 3 minutes)...
set /a TRIES=0
:WAIT_SDNEXT
set /a TRIES+=1
if !TRIES! GTR 60 (
    echo  [WARN] SDNext did not respond after 3 minutes. Check the SDNext window.
    echo.
    goto SDNEXT_DONE
)
curl -s --max-time 2 http://localhost:7860/sdapi/v1/sd-models >nul 2>&1
if %errorlevel%==0 ( echo  [OK] SDNext ready. & echo. & goto SDNEXT_DONE )
timeout /t 3 /nobreak >nul
goto WAIT_SDNEXT
:SDNEXT_DONE

:: ── 3. TTS ────────────────────────────────────────────────────────────────────

if !TTS_ENABLED!==0 (
    echo  [3/4] TTS — skipped ^(TTS disabled in settings^)
    echo.
    goto TTS_DONE
)

if /i "!TTS_PROVIDER!"=="kokoro" (
    echo  [3/4] Kokoro TTS...
    curl -s --max-time 2 http://localhost:8880/health >nul 2>&1
    if !errorlevel!==0 (
        echo  [OK] Kokoro already running — skipping launch.
        echo.
        goto TTS_DONE
    )
    echo        Launching Kokoro TTS...
    start "Kokoro TTS" cmd /k "cd /d !KOKORO_DIR! && call venv\Scripts\activate && python serve.py"

    if !QUICK!==1 ( echo  [--quick] Skipping wait for Kokoro. & echo. & goto TTS_DONE )

    echo  Waiting for Kokoro TTS...
    set /a TRIES=0
    :WAIT_KOKORO
    set /a TRIES+=1
    if !TRIES! GTR 15 ( echo  [WARN] Kokoro did not respond after 30s. & echo. & goto TTS_DONE )
    curl -s --max-time 2 http://localhost:8880/health >nul 2>&1
    if !errorlevel!==0 ( echo  [OK] Kokoro ready. & echo. & goto TTS_DONE )
    timeout /t 2 /nobreak >nul
    goto WAIT_KOKORO
)

if /i "!TTS_PROVIDER!"=="chatterbox" (
    echo  [3/4] Chatterbox TTS...
    curl -s --max-time 2 http://localhost:8004/health >nul 2>&1
    if !errorlevel!==0 (
        echo  [OK] Chatterbox already running — skipping launch.
        echo.
        goto TTS_DONE
    )
    echo        Launching Chatterbox...
    start "Chatterbox TTS" cmd /k "cd /d !CHATTERBOX_DIR! && call venv\Scripts\activate && python app.py"

    if !QUICK!==1 ( echo  [--quick] Skipping wait for Chatterbox. & echo. & goto TTS_DONE )

    echo  Waiting for Chatterbox...
    set /a TRIES=0
    :WAIT_CHATTERBOX
    set /a TRIES+=1
    if !TRIES! GTR 20 ( echo  [WARN] Chatterbox did not respond after 40s. & echo. & goto TTS_DONE )
    curl -s --max-time 2 http://localhost:8004/health >nul 2>&1
    if !errorlevel!==0 ( echo  [OK] Chatterbox ready. & echo. & goto TTS_DONE )
    timeout /t 2 /nobreak >nul
    goto WAIT_CHATTERBOX
)

echo  [3/4] TTS — unknown provider (!TTS_PROVIDER!), skipping.
echo.
:TTS_DONE

:: ── 4. Vellicore ──────────────────────────────────────────────────────────────

echo  [4/4] Launching Vellicore...
echo.

cd /d !VELLICORE_DIR!
set ELECTRON_NO_DEVTOOLS=1
call npm run dev

:: ── Done ──────────────────────────────────────────────────────────────────────

echo.
echo  Vellicore has closed.
echo  Background services are still running in their windows.
echo  Close those windows manually when you are finished.
echo.
pause
endlocal
