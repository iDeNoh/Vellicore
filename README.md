# Vellicore

An AI-powered tabletop RPG that runs entirely on your machine. Fully local image generation (SDNext), local TTS (Kokoro), and your choice of local (Ollama) or cloud (Claude API) for the AI Dungeon Master.

## Architecture

```
vellicore/
├── electron/               # Electron main process
│   ├── main.js             # App window, IPC handlers, service health checks
│   └── preload.js          # Secure renderer bridge (window.tavern API)
│
├── src/
│   ├── components/
│   │   ├── ui/             # Reusable primitives (buttons, inputs, etc.)
│   │   ├── layout/         # AppShell, sidebars, panels
│   │   ├── game/           # Chat panel, dice roller, combat tracker [Module 2]
│   │   ├── character/      # Character sheet, creation wizard [Module 4]
│   │   ├── map/            # Konva map, token layer, fog of war [Module 6]
│   │   └── setup/          # First-run setup wizard
│   │
│   ├── pages/
│   │   ├── SetupPage.jsx   # First-run config wizard ✓
│   │   ├── LobbyPage.jsx   # Campaign list and creation ✓
│   │   ├── CharacterCreatePage.jsx  # [Module 4]
│   │   ├── GamePage.jsx    # Full game interface [Module 2]
│   │   └── SettingsPage.jsx         # Settings ✓
│   │
│   ├── store/
│   │   └── appStore.js     # Zustand — app state + game state ✓
│   │
│   ├── services/
│   │   ├── llm/            # LLM abstraction (Claude/Ollama/OpenAI-compat) ✓
│   │   ├── image/          # SDNext image generation ✓
│   │   ├── tts/            # Kokoro TTS ✓
│   │   └── db/             # SQLite (better-sqlite3) ✓
│   │
│   └── lib/
│       ├── rules/          # Three Fates rules system ✓
│       ├── world/          # DM prompts, world generator, atmosphere presets ✓
│       ├── story/          # Story engine [Module 3]
│       └── state/          # Game state utilities [Module 5]
```

## Module Roadmap

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 1 | Rules + DM Prompts | ✅ Done | Three Fates rules system, full DM prompt builder |
| scaffold | Electron Shell | ✅ Done | App structure, routing, stores, services |
| 2 | AI DM + Game Interface | 🔜 Next | Chat panel, DM responses, dice rolling, streaming |
| 3 | World & Story Engine | ⬜ | World gen, story arcs, location/NPC generation |
| 4 | Character Creation | ⬜ | Guided builder, stat allocation, portrait gen |
| 5 | Game State Tracker | ⬜ | SQLite schema, HP/inventory/position persistence |
| 6 | Map System | ⬜ | Konva canvas, tokens, fog of war |
| 7 | Image Generation | ⬜ | Full SDNext pipeline, prompt builders |
| 8 | TTS Integration | ⬜ | Kokoro streaming, per-NPC voices |
| 9 | Combat System | ⬜ | Initiative, turns, conditions |
| 10 | Session Memory | ⬜ | Summarization, long-campaign context management |
| 11 | Multiplayer | ⬜ | WebSockets, shared game state |
| 12 | Campaign Dashboard | ⬜ | Codex, session log, world map |

## Local Services Required

### Ollama (free local LLM)
```bash
# Install from https://ollama.com
ollama pull llama3.1          # 8B — fast, good quality
ollama pull mistral-nemo      # also excellent for roleplay
```

### SDNext (local image generation)
```bash
# Install from https://github.com/vladmandic/sdnext
# Launch with API enabled:
python launch.py --api --listen
```

### Kokoro TTS (local voice)
```bash
pip install kokoro
python -m kokoro.api --port 8880
```

## Development

```bash
npm install
npm run dev          # Starts Vite dev server + Electron
```

## Build

```bash
npm run build        # Builds Vite + packages with electron-builder
```

## Rules: Three Fates System

**Stats**: Body (physical), Mind (arcane/mental), Spirit (social/speed) — each 1–5

**Resolution**: Roll [stat] d6s. Count 5s and 6s as successes.
- 0 = Failure
- 1 = Partial success (success with cost or complication)
- 2 = Success
- 3 = Strong success (bonus effect)
- 4+ = Critical (exceptional narrative reward)

**Combat**: Initiative by Spirit roll. Melee = Body vs Body. Ranged/Magic = Mind vs Body. Net successes = damage. HP = Body × 4.

**Advancement**: Milestone-based. No XP tracking.
