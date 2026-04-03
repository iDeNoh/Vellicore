# Vellicore Wiki

Welcome to the Vellicore documentation.

Vellicore is an AI-powered solo tabletop RPG desktop app built with Electron + React. It connects to your choice of LLM backend (cloud or local), optionally generates scene images via a local diffusion server, and narrates with local TTS. All game state is stored in SQLite on your machine — no cloud account required beyond whichever AI API you choose.

---

## Quick Links

- [Installation](Installation.md) — prerequisites, setup, first launch
- [Usage Guide](Usage-Guide.md) — campaigns, the DM, maps, quests, and more
- [LLM Providers](LLM-Providers.md) — configuring each AI backend
- [Optional Services](Optional-Services.md) — image gen, TTS, RAG memory
- [Petricore](Petricore.md) — built-in dataset preparation tool
- [Limitations](Limitations.md) — known constraints and caveats

---

## Architecture at a Glance

```
Electron shell
├── main process  — IPC bridge, SQLite, file I/O, sidecar health checks
└── renderer      — React/Vite SPA
    ├── pages/    — Setup, Settings, Campaign, Petricore
    ├── services/ — LLM, image, TTS, RAG adapters
    ├── lib/      — game rules, combat, story engine
    └── store/    — Zustand state (persisted to SQLite)
```

Communication between renderer and main process is exclusively via `window.tavern.*` IPC bridges defined in `electron/preload.js`. The renderer never accesses the filesystem or SQLite directly.
