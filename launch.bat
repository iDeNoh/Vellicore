@echo off
setlocal enabledelayedexpansion
title Tavern AI Launcher
color 0A

:: ── Parse arguments ───────────────────────────────────────────────────────────

set QUICK=0
for %%a in (%*) do (
    if /i "%%a"=="--quick" set QUICK=1
)

echo.
echo  -------------------------------------------------------
echo    T A V E R N   A I
if !QUICK!==1 echo    Quick Launch Mode
echo  -------------------------------------------------------
echo.

:: ── 1. ChromaDB ──────────────────────────────────────────────────────────────

echo  [1/4] ChromaDB (RAG Memory)...

curl -s --max-time 2 http://localhost:8765/api/v1/heartbeat >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] ChromaDB already running — skipping launch.
    echo.
    goto CHROMA_DONE
)

echo        Launching ChromaDB...
start "ChromaDB" cmd /k "cd /d C:\AI\chromadb && call start.bat"

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
    echo  [WARN] ChromaDB did not respond after 30 seconds.
    echo         RAG memory will be unavailable.
    echo.
    goto CHROMA_DONE
)
curl -s --max-time 2 http://localhost:8765/api/v1/heartbeat >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] ChromaDB is ready.
    echo.
    goto CHROMA_DONE
)
timeout /t 2 /nobreak >nul
goto WAIT_CHROMA
:CHROMA_DONE

:: ── 2. SDNext ────────────────────────────────────────────────────────────────

echo  [2/4] SDNext (Stable Diffusion)...

:: Check if SDNext is already running by hitting its API
curl -s --max-time 2 http://localhost:7860/sdapi/v1/sd-models >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] SDNext already running — skipping launch.
    echo.
    goto SDNEXT_DONE
)

echo        Launching SDNext...
start "SDNext" cmd /k "cd /d E:\AI\SDNext && webui.bat --debug --use-rocm --listen --insecure"

if !QUICK!==1 (
    echo  [--quick] Skipping wait for SDNext.
    echo.
    goto SDNEXT_DONE
)

:: Poll the SDNext API — up to 3 minutes (60 x 3s)
echo  Waiting for SDNext API...
set /a TRIES=0
:WAIT_SDNEXT
set /a TRIES+=1
if !TRIES! GTR 60 (
    echo  [WARN] SDNext did not respond after 3 minutes.
    echo         Continuing — check the SDNext window for errors.
    echo.
    goto SDNEXT_DONE
)
curl -s --max-time 2 http://localhost:7860/sdapi/v1/sd-models >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] SDNext is ready.
    echo.
    goto SDNEXT_DONE
)
timeout /t 3 /nobreak >nul
goto WAIT_SDNEXT
:SDNEXT_DONE

:: ── 3. Kokoro TTS ─────────────────────────────────────────────────────────────

echo  [3/4] Kokoro TTS...

:: Check if Kokoro is already running
curl -s --max-time 2 http://localhost:8880/health >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] Kokoro already running — skipping launch.
    echo.
    goto KOKORO_DONE
)

echo        Launching Kokoro TTS...
start "Kokoro TTS" cmd /k "cd /d C:\AI\kokoro && call venv\Scripts\activate && python serve.py"

if !QUICK!==1 (
    echo  [--quick] Skipping wait for Kokoro.
    echo.
    goto KOKORO_DONE
)

:: Poll Kokoro health — up to 30 seconds (15 x 2s)
echo  Waiting for Kokoro TTS...
set /a TRIES=0
:WAIT_KOKORO
set /a TRIES+=1
if !TRIES! GTR 15 (
    echo  [WARN] Kokoro did not respond after 30 seconds.
    echo         Continuing — TTS will be unavailable until it starts.
    echo.
    goto KOKORO_DONE
)
curl -s --max-time 2 http://localhost:8880/health >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] Kokoro TTS is ready.
    echo.
    goto KOKORO_DONE
)
timeout /t 2 /nobreak >nul
goto WAIT_KOKORO
:KOKORO_DONE

:: ── 4. Tavern AI ──────────────────────────────────────────────────────────────

echo  [4/4] Launching Tavern AI...
echo.

cd /d E:\AI\tavern-ai
set ELECTRON_NO_DEVTOOLS=1
call npm run dev

:: ── Done ──────────────────────────────────────────────────────────────────────

echo.
echo  Tavern AI has closed.
echo  ChromaDB, SDNext and Kokoro are still running in their windows.
echo  Close those windows manually when you are finished.
echo.
pause
endlocal