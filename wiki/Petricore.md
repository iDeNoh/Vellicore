# Petricore — Dataset Preparation Tool

Petricore is a built-in tool for generating fine-tuning datasets for TTRPG AI dungeon master models. It orchestrates LLM calls through Vellicore's existing AI infrastructure to produce structured, validated training examples in formats ready for fine-tuning pipelines.

Access it via the **Petricore** link in the main navigation.

---

## Overview

Petricore generates examples that simulate DM responses to player actions. Each example is a complete conversation containing:

- A system prompt (DM persona, world state, rules reference, NPC definitions)
- One or more player/DM exchange turns
- Correctly formatted DM tags (VOICE, ROLL, IMAGE, COMBAT, etc.)

Generated examples are stored locally in SQLite and can be exported in multiple formats for use with fine-tuning tools.

---

## Interface

Petricore has three sub-pages accessible from its sidebar:

### Plan Builder

Configure what gets generated before starting a run.

**Overview section:**
- Dataset name
- Total examples target (default: 3000)
- Output format (ShareGPT JSONL / ChatML / Alpaca / Unsloth JSONL)
- Additional instructions — appended to every generation prompt

**Tags section:** Configure which DM tags to include and at what frequency:

| Tag | What it represents |
|-----|--------------------|
| `VOICE` | NPC spoken dialogue |
| `NPC_UPDATE` | NPC state change |
| `ROLL` | Dice roll request |
| `ROLL_RESULTS` | Roll outcome |
| `IMAGE` | Scene/portrait/item image trigger |
| `FLAG` | World state flag |
| `QUEST` | New quest created |
| `QUEST_UPDATE` | Quest progress |
| `QUEST_DONE` | Quest completed |
| `LOCATION` | Location update |
| `LORE` | Lore entry added |
| `COMBAT` | Enemy introduced |
| `ACT_ADVANCE` | Story act advanced |
| `OOC` | Out-of-character note |
| `GAME_OVER` | Campaign ending |

Each tag has a target count, and min/max per example controls.

**Genres section:** 32 genre presets with individual enable toggles and weight sliders. Weight controls relative proportion — higher weight = more examples in that genre. Genres span: classic fantasy, dark fantasy, cyberpunk, cosmic horror, steampunk, wuxia, noir mystery, cozy, and more.

**Generation parameters:**
- Exchange length (min/max turns per example)
- Length tier distribution (Terse / Normal / Extended)
- Dialogue structure distribution (no dialogue / single NPC / multi-NPC / with paralinguistic cues)
- Name pool configuration

---

### Name Pool

Before generating examples, Petricore generates a pool of NPC names via a single LLM call. Names are then assigned deterministically — the model never invents its own NPC names during generation, which prevents famous fictional names and ensures diversity.

- Default pool size: 200 names
- Names are diverse by cultural origin, gender, and genre fit
- The pool is stored in SQLite and reused across generation runs
- Click **Generate Name Pool** in Plan Builder before starting generation

---

### Generation

Runs the generation loop with live feedback.

**Left panel:** Overall progress, stats (generated / failed / rejected / errors), estimated time remaining, estimated API cost, and controls (Pause / Resume / Stop). A speed slider controls the delay between LLM calls.

**Center panel:** Live preview of the most recently completed example. Each DM tag is colour-highlighted:

| Tag | Colour |
|-----|--------|
| `[VOICE:...]"..."` | Blue |
| `[ROLL:...]` | Amber |
| `[FLAG:...]` | Green |
| `[IMAGE:...]` | Purple |
| `[COMBAT:...]` | Red |
| `[QUEST:...]` | Teal |
| Other tags | Grey |

Each example in the live preview has **Accept / Reject / Skip** buttons. Rejected examples are flagged with a reason.

**Right panel:** Live coverage statistics — tag coverage vs. target, genre distribution, NPC name frequency, length distribution.

---

### Dataset Viewer

Browse, inspect, filter, and manage all generated examples.

**Filters:** Genre, status (all/pending/accepted/rejected/has errors), tags, NPC name, exchange count, response length, dialogue structure, sort order.

**Example list:** Cards showing genre, tags, exchange count, NPC names, status, and a preview of the first DM response.

**Detail panel:** Full conversation with tag highlighting, metadata, error list, raw LLM output toggle, and Accept/Reject/Undo controls.

**Export:** Three export buttons in the footer — export current filter, export all accepted, or export all.

---

## Export Formats

| Format | File | Use with |
|--------|------|----------|
| ShareGPT JSONL | `vellicore_dataset.jsonl` | Axolotl, LLaMA-Factory |
| ChatML | `vellicore_dataset.txt` | Most fine-tuning frameworks |
| Alpaca JSON | `vellicore_dataset_alpaca.json` | Alpaca-style trainers |
| Unsloth JSONL | `vellicore_dataset_unsloth.jsonl` | [Unsloth](https://github.com/unslothai/unsloth) |

The export modal lets you choose format, which examples to include, output filename, and output folder.

---

## Conversation Schema

Each example uses ShareGPT format internally:

```json
{
  "conversations": [
    { "from": "system", "value": "...DM system prompt..." },
    { "from": "human",  "value": "...player action..." },
    { "from": "gpt",    "value": "...DM response with tags..." }
  ]
}
```

Multiple player/DM turns follow the system entry. For ChatML export, `human` → `user` and `gpt` → `assistant`.

---

## Validation

Every generated example is automatically validated before being saved:

- Required fields and correct JSON structure
- Correct exchange count
- Every NPC dialogue line has a `[VOICE:]` tag
- NPC names in `[VOICE:]` tags match the pre-assigned name pool
- Tag syntax matches exact patterns
- No forbidden patterns (XML tags, markdown headers, "what do you do?" endings)
- Dialogue structure matches the declared structure
- `[GAME_OVER:]` outcomes are valid values

**Errors** (hard failures) are flagged with red indicators. **Warnings** are softer flags visible in the viewer but don't prevent the example from being accepted.

---

## Tips

- **Start with a small target** (100–200 examples) to tune your plan configuration before committing to a full 3000-example run
- **Generate the name pool first** — generation will prompt you if you haven't
- **Use Additional Instructions** to steer tone or constrain content for your specific fine-tuning goal
- **Monitor NPC name frequency** in the coverage panel — if one name is appearing far more than others, regenerate the name pool
- **Claude Sonnet or GPT-4o** produce the highest-quality examples; local models work but output more validation errors
- **Pause and review** examples periodically in the Dataset Viewer — rejecting low-quality examples early keeps your dataset clean
- **Export incrementally** — you can export accepted examples while generation is still running
