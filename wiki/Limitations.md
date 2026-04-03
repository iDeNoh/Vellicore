# Limitations

Current known constraints and caveats as of this version.

---

## AI / LLM

**Context window management is basic.** The DM prompt includes the system prompt, world state, and conversation history. For very long campaigns, older messages are trimmed from the history window. There's no smart summarisation — trimmed content is simply dropped. Enabling RAG memory mitigates this significantly.

**Local models produce lower narrative quality.** Small models (7B and under) frequently forget tag formats, invent NPC names, use incorrect syntax, or produce repetitive scenarios. 13B+ models are noticeably better; 70B+ models approach cloud quality. This is a model capability limitation, not a Vellicore limitation.

**No streaming for DM responses.** The full DM response arrives at once. On slow models or high latency connections this means a wait with no visible progress. A streaming mode is not currently implemented.

**Thinking models have higher latency.** Claude's extended thinking and OpenAI's o-series reasoning models may take 30–90+ seconds per response. This is expected.

---

## Image Generation

**SDNext only.** The image generation integration is built specifically for SDNext's API (`/sdapi/v1/txt2img`). AUTOMATIC1111, ComfyUI, and other backends are not currently supported, though SDNext is a drop-in replacement for A1111 for most workflows.

**No negative prompt control from the UI.** Negative prompts are hardcoded in the image service. Custom negative prompts per-scene are not configurable via the UI.

**Generation blocks the session briefly.** Image generation runs asynchronously but the UI shows a loading state while waiting for SDNext. On slow hardware this can be 30–90 seconds per image.

**Images are not embedded in exports.** If you export a campaign or share save data, images are not included — only the paths to local files.

---

## TTS / Voice

**No voice cloning or custom voice training.** Vellicore uses the voices provided by Kokoro or Chatterbox as-is. Adding custom trained voices requires setting them up in those tools separately, then they become available in Vellicore's voice selector.

**NPC voice assignment is per-name.** If the same NPC appears across multiple sessions under a slightly different name spelling, they may get a different voice.

**TTS latency varies.** Chatterbox in particular can be slow to initialise on first use. The Turbo mode helps significantly.

**No TTS for the player character.** Only DM narration and NPC dialogue (`[VOICE:]` tags) are narrated.

---

## RAG Memory

**ChromaDB must be running before Vellicore starts.** If ChromaDB crashes mid-session, RAG retrieval silently returns empty results — the session continues but without memory retrieval. Restarting ChromaDB and relaunching Vellicore restores it.

**RAG memory is not cross-campaign.** Each campaign has its own isolated ChromaDB collection.

**Embedding quality depends on the embedding model.** The default embedding model is loaded by the internal sidecar. Very long documents or highly technical lore may not retrieve well.

---

## Platform

**Windows is the primary tested platform.** The codebase and launcher script are Windows-first. macOS and Linux builds are supported by Electron and electron-builder but have received less testing. Issues on non-Windows platforms may exist.

**No mobile support.** Vellicore is a desktop app. While there is a remote companion mode (LAN access from a phone/tablet for the player view), this is a secondary interface and not a full mobile experience.

**SQLite database is single-file per app install.** All campaigns share the same database at `%APPDATA%\Vellicore\vellicore.db` (Windows). There's no multi-user support or cloud sync.

---

## Petricore (Dataset Tool)

**Requires a capable model for good results.** Claude Sonnet, GPT-4o, or a 70B+ local model are recommended. Smaller models produce frequent validation errors and lower-quality training examples.

**Generation is sequential.** Examples are generated one at a time. A 3000-example run at ~10 seconds per call takes roughly 8 hours. There is no parallel generation.

**Name pool must be regenerated if genres change significantly.** The name pool is genre-tagged but if you add many new genres after pool generation, you may get imbalanced name coverage.

**Export does not deduplicate.** If you export multiple times without clearing the dataset between runs, you may get duplicate examples in the output file.

---

## Not Yet Implemented

- Multiplayer / shared campaigns
- Campaign export/import between machines
- Custom tag definitions
- Mobile companion app
- Voice input (speech-to-text for player actions)
- ComfyUI image generation backend
- Automatic session summarisation for very long campaigns
