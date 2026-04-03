# Usage Guide

## Navigation

The main nav has four sections:

| Section | Purpose |
|---------|---------|
| **Campaigns** | Create, load, and play campaigns |
| **Settings** | Change AI provider, model, and service settings |
| **Petricore** | Dataset preparation tool |
| **Services panel** | Status indicators for optional background services |

---

## Starting a Campaign

1. Go to **Campaigns → New Campaign**
2. Fill in the world details — name, tone, genre, themes
3. Configure your player character — name, ancestry, background, stats
4. Optionally add lore documents (PDF or text) to give the DM context
5. Click **Begin** — the DM generates the opening scene

---

## Playing

The game interface has three main panels:

### Story Panel (center)
The DM's narration appears here as formatted text. Tags embedded in the DM's output drive the other systems:

| Tag | Effect |
|-----|--------|
| `[IMAGE: ...]` | Triggers image generation if enabled |
| `[VOICE:Name]"..."` | Triggers TTS narration for that NPC if enabled |
| `[ROLL: ...]` | Prompts a dice roll |
| `[COMBAT: ...]` | Adds an enemy to the combat tracker |
| `[QUEST: ...]` | Creates or updates a quest |
| `[FLAG: key=value]` | Sets a world state flag |
| `[LOCATION: ...]` | Updates the current location |
| `[LORE: ...]` | Adds an entry to the lore log |

### Action Panel (bottom)
Type your character's actions here and press Enter (or the send button) to submit them to the DM.

### Side Panel (right)
Shows the map, active quests, NPC tracker, combat status, and lore log. Tabs switch between each view.

---

## The Map

The map is a hex grid. The DM populates it via `[LOCATION:]` tags. You can also:

- Click a hex to view its description
- The DM may generate images for location discoveries when image generation is enabled
- Fog of war hides unvisited locations

---

## Dice System (Three Fates)

Vellicore uses the **Three Fates** system:

- Three stats: **Body**, **Mind**, **Spirit** — each has a pool of d6s
- Roll the pool, count dice showing 5 or 6 as successes
- The DM calls for rolls via `[ROLL: Character — Stat — reason]`
- You roll, the result feeds back into the DM's next response

---

## Combat

Combat is tracked automatically when the DM introduces enemies via `[COMBAT:]` tags:

- Enemies appear in the combat tracker with their threat level and role
- Use the combat panel to track HP and initiative
- The DM narrates outcomes based on your declared actions and roll results

---

## RAG Memory

When ChromaDB is running and RAG is enabled, Vellicore stores significant story events as vector embeddings. The DM retrieves relevant past context automatically when writing responses — this enables long-running campaigns with consistent world memory.

---

## Saving and Loading

All game state is automatically saved to SQLite after each exchange. To load a previous campaign, go to **Campaigns** and select it from the list.

---

## Autopilot

Autopilot mode lets the DM generate a series of responses automatically without player input — useful for watching a session unfold or testing prompts. Toggle it in the action panel.
