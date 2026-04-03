# Optional Services

All optional services are disabled by default. Enable them in **Settings → Services**. Vellicore checks each service's health on startup and shows status in the services panel.

---

## RAG Memory (ChromaDB)

**What it does:** Stores significant story events as vector embeddings in a local ChromaDB database. The DM automatically retrieves relevant past context when writing responses, enabling consistent memory across long campaigns.

**Without RAG:** The DM only has the recent conversation window. Long campaigns may lose continuity.

### Setup

1. Install ChromaDB:
   ```bash
   pip install chromadb
   ```
2. Create a start script (e.g. `start.bat` on Windows):
   ```bat
   chroma run --host 0.0.0.0 --port 8765 --path ./chroma_data
   ```
3. Start ChromaDB — it must be running before Vellicore launches
4. In Vellicore **Settings → Services**, enable **RAG Memory**

**Default port:** `8765`

### Notes

- ChromaDB data is stored wherever you point `--path` — back this up with your saves
- The embedding sidecar runs on port `8766` (managed by Vellicore internally)
- RAG is per-campaign — each campaign gets its own collection

---

## Image Generation (SDNext)

**What it does:** Generates scene illustrations, portraits, item images, and map art triggered by `[IMAGE:]` tags in DM responses.

### Requirements

- A GPU with enough VRAM for your chosen model (4GB minimum, 8GB+ recommended)
- [SDNext](https://github.com/vladmandic/sdnext) installed

### Setup

1. Install SDNext following its instructions
2. Start SDNext with the API enabled:
   ```bat
   :: NVIDIA
   webui.bat --api --listen
   
   :: AMD (ROCm on Linux/Windows)
   webui.bat --api --listen --use-rocm
   ```
3. Wait for SDNext to fully load (can take several minutes on first run)
4. In Vellicore **Settings → Services**, enable **Image Generation**
5. Select a model from the dropdown (fetched from SDNext)

**Default port:** `7860`

### Image Types

The DM can generate these image types via tags:

| Tag | Subject |
|-----|---------|
| `scene` | Current scene/environment |
| `portrait` | NPC or character portrait |
| `item` | Weapon, item, artifact |
| `map` | Location map |
| `action` | Action/combat moment |
| `atmosphere` | Mood/atmosphere piece |

### Notes

- Generation takes 5–60 seconds depending on your hardware and settings
- Images are saved alongside the campaign save data
- Adjust image dimensions and sampler steps in **Settings → Image Generation**
- If SDNext is slow, reduce steps (20 is a good baseline) or use a smaller model

---

## Voice Narration (TTS)

**What it does:** Narrates DM responses aloud. NPC dialogue is spoken by named voices; narration uses a default narrator voice. Triggered by `[VOICE:NPCName]"..."` tags.

### Kokoro FastAPI

Lightweight, multiple voice options, fast generation.

**Setup:**

1. Install [Kokoro FastAPI](https://github.com/remsky/Kokoro-FastAPI):
   ```bash
   git clone https://github.com/remsky/Kokoro-FastAPI
   cd Kokoro-FastAPI
   python -m venv venv
   venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   python serve.py
   ```
2. In Vellicore **Settings → Services**, select **Kokoro** and enable TTS

**Default port:** `8880`

**Voice selection:** Voices are listed in Settings once Kokoro is running. Different voices can be assigned to different NPCs in campaign settings.

---

### Chatterbox

More expressive TTS with natural prosody. Supports **Turbo mode** for faster generation at some quality cost.

**Setup:**

1. Install [Chatterbox](https://github.com/resemble-ai/chatterbox):
   ```bash
   git clone https://github.com/resemble-ai/chatterbox
   cd chatterbox
   python -m venv venv
   venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   python app.py
   ```
2. In Vellicore **Settings → Services**, select **Chatterbox** and enable TTS

**Default port:** `8004`

**Turbo mode:** Toggle in **Settings → TTS**. Faster but slightly less natural output.

---

## Service Status Panel

The services panel (accessible from the main nav) shows live status for each service:

| State | Meaning |
|-------|---------|
| Green | Service is running and healthy |
| Yellow | Service is starting or intermittently reachable |
| Red | Service is unreachable — check that it's running |
| Grey | Service is disabled in settings |

If a service goes red mid-session, Vellicore disables that feature gracefully — image generation and TTS are skipped, RAG retrieval returns empty results — without crashing the session.
