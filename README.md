# Vellicore

An AI-powered solo tabletop RPG desktop app. Run full campaigns with a DM powered by any LLM, optional local image generation, local voice narration, and a built-in dataset preparation tool for fine-tuning your own TTRPG models.

---

## Requirements

- [Node.js](https://nodejs.org) v18 or higher
- [Git](https://git-scm.com)
- An AI provider (cloud API key **or** a local LLM server — see [LLM Providers](#llm-providers))

Optional (enable in Settings):

- [ChromaDB](https://www.trychroma.com) — persistent RAG memory across sessions
- [SDNext](https://github.com/vladmandic/sdnext) — local AI image generation (GPU required)
- [Kokoro FastAPI](https://github.com/remsky/Kokoro-FastAPI) or [Chatterbox](https://github.com/resemble-ai/chatterbox) — local TTS voice narration

---

## Installation

```bash
git clone <repo-url>
cd vellicore
npm install
```

On Windows, `npm install` automatically rebuilds `better-sqlite3` for your Electron version via the `postinstall` hook. If it fails, run manually:

```bash
npm run rebuild
```

---

## Running (Development)

```bash
npm run dev
```

This starts both the Vite dev server and the Electron window concurrently. The app will open automatically.

**First launch:** the Setup page opens — configure your AI provider and API key before starting a campaign.

---

## Running (Production Build)

```bash
npm run build
```

Produces a native installer in `dist-electron/`:

| Platform | Output |
|----------|--------|
| Windows | NSIS installer (`.exe`) |
| macOS | `.dmg` |
| Linux | AppImage |

---

## Launcher Script (Windows, Dev)

`launch.bat` starts optional background services before launching Vellicore. **Edit the path variables at the top of the file** to match where you installed each service on your machine, then run it instead of `npm run dev`.

```
launch.bat          — start everything (waits for each service)
launch.bat --quick  — start everything without waiting
```

---

## LLM Providers

| Provider | Type | Setup |
|----------|------|-------|
| [Claude](https://anthropic.com) (Haiku, Sonnet, Opus) | Cloud | API key from [console.anthropic.com](https://console.anthropic.com) |
| [OpenAI](https://openai.com) (GPT-4o, o1, etc.) | Cloud | API key from platform.openai.com |
| [Gemini](https://aistudio.google.com) (Flash, Pro) | Cloud | API key from aistudio.google.com |
| [Ollama](https://ollama.com) | Local | Install Ollama, pull a model |
| [LM Studio](https://lmstudio.ai) | Local | Install LM Studio, load a model, start server |
| Any OpenAI-compatible endpoint | Local/Cloud | Enter base URL in Settings |

Configure your provider and API key in the **Setup** page on first launch, or change it any time in **Settings**.

---

## Optional Services

All optional services are disabled by default. Enable them individually in **Settings → Services**.

### RAG Memory (ChromaDB)

Gives the DM persistent memory that persists across sessions using vector search.

1. Install [ChromaDB](https://www.trychroma.com)
2. Start it on port `8765` (default)
3. Enable RAG in Settings

### Image Generation (SDNext)

Generates scene illustrations during play.

1. Install [SDNext](https://github.com/vladmandic/sdnext)
2. Start it with `--api` flag on port `7860` (default)
3. Enable Image Generation in Settings, select a model

### Voice Narration (TTS)

Narrates DM responses using local TTS.

**Kokoro FastAPI** — multiple voices, lightweight:
1. Install [Kokoro FastAPI](https://github.com/remsky/Kokoro-FastAPI)
2. Start on port `8880` (default)

**Chatterbox** — expressive, supports Turbo mode:
1. Install [Chatterbox](https://github.com/resemble-ai/chatterbox)
2. Start on port `8004` (default)

---

## Petricore (Dataset Tool)

Petricore is a built-in dataset preparation tool for generating fine-tuning datasets for TTRPG AI dungeon master models. Access it via the **Petricore** link in the main nav.

See [wiki/Petricore.md](wiki/Petricore.md) for full documentation.

---

## Project Structure

```
electron/       Electron main process, IPC handlers, SQLite DB
src/
  components/   Shared UI components
  lib/          Game logic (combat, rules, story, world)
  pages/        Top-level pages (Setup, Settings, Campaign, Petricore)
  services/     External service integrations (LLM, image, TTS, RAG)
  store/        Zustand state stores
public/         Static assets
resources/      App icons and fonts
```

---

## Wiki

Full documentation is in the [`wiki/`](wiki/) folder:

- [Installation](wiki/Installation.md)
- [Usage Guide](wiki/Usage-Guide.md)
- [LLM Providers](wiki/LLM-Providers.md)
- [Optional Services](wiki/Optional-Services.md)
- [Petricore](wiki/Petricore.md)
- [Limitations](wiki/Limitations.md)
