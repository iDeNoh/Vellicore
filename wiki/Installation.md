# Installation

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Node.js | v18 | [nodejs.org](https://nodejs.org) |
| npm | v9 | Comes with Node.js |
| Git | any | For cloning |
| OS | Windows 10/11, macOS 12+, or Linux | Windows most tested |
| GPU | Optional | Only needed for SDNext image generation |

You do **not** need Python, Docker, or any other runtime just to run Vellicore itself. Optional services (TTS, image gen, RAG) have their own requirements documented in [Optional Services](Optional-Services.md).

---

## 1. Clone and Install

```bash
git clone <repo-url>
cd vellicore
npm install
```

`npm install` automatically runs `electron-rebuild` to compile `better-sqlite3` against your installed Electron version. This requires a C++ build toolchain:

- **Windows:** Install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) (select "Desktop development with C++")
- **macOS:** Run `xcode-select --install`
- **Linux:** `sudo apt install build-essential` (Debian/Ubuntu) or equivalent

If the rebuild fails, run it manually after fixing the toolchain:

```bash
npm run rebuild
```

---

## 2. First Launch

```bash
npm run dev
```

The Electron window opens to the **Setup** page. This is where you configure your AI provider — you must complete setup before a campaign can be started.

---

## 3. Setup Page

1. **Choose a provider** — Claude, OpenAI, Gemini, Ollama, LM Studio, or a custom OpenAI-compatible endpoint
2. **Enter your API key** (cloud providers) or **enter the base URL** (local providers)
3. **Select a model** — the app fetches available models from the provider
4. **Save** — you'll be taken to the main menu

Optional services (image generation, TTS, RAG) are configured separately in **Settings → Services** after the initial setup.

---

## 4. Using the Launcher Script (Windows)

`launch.bat` at the repo root starts optional background services before Vellicore. Before using it, open the file in a text editor and set the path variables at the top to match your installation:

```bat
set "CHROMADB_DIR=C:\path\to\your\chromadb"
set "SDNEXT_DIR=C:\path\to\your\SDNext"
set "KOKORO_DIR=C:\path\to\your\kokoro"
set "CHATTERBOX_DIR=C:\path\to\your\chatterbox"
```

Also set `SDNEXT_FLAGS` to the flags appropriate for your GPU:

```bat
:: NVIDIA
set "SDNEXT_FLAGS=--api --listen"

:: AMD (ROCm)
set "SDNEXT_FLAGS=--api --listen --use-rocm"
```

Then run:

```
launch.bat           start everything, wait for each service to be ready
launch.bat --quick   start everything without waiting (faster, services may not be ready immediately)
```

---

## 5. Building a Distributable

```bash
npm run build
```

Output goes to `dist-electron/`:

| Platform | Format |
|----------|--------|
| Windows | NSIS installer `.exe` |
| macOS | `.dmg` |
| Linux | AppImage |

To build only the Vite frontend (no Electron packaging):

```bash
npm run build:vite
```

---

## Updating

```bash
git pull
npm install
```

If `better-sqlite3` fails after a Node.js or Electron upgrade:

```bash
npm run rebuild
```
