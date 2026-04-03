Petricore — Dataset Preparation Tool
Claude Code Implementation Brief
Read this entire brief before writing any code. Plan your implementation order before starting.

Overview
Petricore is a dataset preparation tool built into Vellicore as a new top-level page alongside Settings and Campaigns. It generates fine-tuning datasets for TTRPG AI dungeon master models by orchestrating LLM calls through Vellicore's existing API infrastructure.
The tool has three sub-pages accessible via a sidebar nav:

Plan Builder — configure what gets generated
Generation — run generation with live preview and progress
Dataset Viewer — browse, inspect, filter, and reject examples


Architecture
Where it lives
src/pages/PetricorePage.jsx          — top-level page shell with sidebar
src/pages/petricore/
  PlanBuilder.jsx                    — plan configuration UI
  Generation.jsx                     — generation runner with live preview
  DatasetViewer.jsx                  — browse/filter/reject examples
src/services/petricore/
  petricoreService.js                — generation orchestration
  nameGenerator.js                   — NPC name pool generation
  formatters.js                      — output format writers
  validator.js                       — example validation
  coverageTracker.js                 — statistics engine
src/store/petricoreStore.js          — Zustand store for all Petricore state
Data flow
PlanBuilder → petricoreStore (plan config)
petricoreStore → petricoreService.generateDataset()
petricoreService → LLM (via existing window.tavern.llm)
LLM response → validator → coverageTracker → petricoreStore (examples)
petricoreStore → Generation (live preview) + DatasetViewer (browse)
DatasetViewer → export via formatters.js
Storage
All generated examples are stored in SQLite via a new petricore_examples table. The dataset viewer queries this table. Exports are written to disk via a new IPC handler petricore:export.

Part 1 — Routing and Shell
App.jsx
Add Petricore to the router. It requires an active config (same gate as Settings) but does not require an active campaign.
jsximport PetricorePage from '@/pages/PetricorePage'
// Add to router:
{ path: '/petricore', element: <PetricorePage /> }
Navigation
Add a Petricore link to the main navigation alongside Settings. Use a flask or DNA icon (Lucide FlaskConical or Dna). Label: Petricore.

Part 2 — Petricore Store (petricoreStore.js)
javascriptconst usePetricoreStore = create((set, get) => ({

  // ── Plan config ────────────────────────────────────────────────────────
  plan: {
    // Tag configuration
    tags: {
      // key: tag name, value: { enabled, targetCount, minPerExample, maxPerExample }
      VOICE:        { enabled: true,  targetCount: 300, minPerExample: 1, maxPerExample: 4 },
      NPC_UPDATE:   { enabled: true,  targetCount: 200, minPerExample: 1, maxPerExample: 2 },
      ROLL:         { enabled: true,  targetCount: 200, minPerExample: 1, maxPerExample: 1 },
      ROLL_RESULTS: { enabled: true,  targetCount: 200, minPerExample: 1, maxPerExample: 1 },
      IMAGE:        { enabled: true,  targetCount: 150, minPerExample: 1, maxPerExample: 2 },
      FLAG:         { enabled: true,  targetCount: 150, minPerExample: 1, maxPerExample: 3 },
      QUEST:        { enabled: true,  targetCount: 100, minPerExample: 1, maxPerExample: 1 },
      QUEST_UPDATE: { enabled: true,  targetCount: 80,  minPerExample: 1, maxPerExample: 1 },
      QUEST_DONE:   { enabled: true,  targetCount: 60,  minPerExample: 1, maxPerExample: 1 },
      LOCATION:     { enabled: true,  targetCount: 100, minPerExample: 1, maxPerExample: 1 },
      LORE:         { enabled: true,  targetCount: 80,  minPerExample: 1, maxPerExample: 1 },
      COMBAT:       { enabled: true,  targetCount: 100, minPerExample: 1, maxPerExample: 3 },
      ACT_ADVANCE:  { enabled: true,  targetCount: 50,  minPerExample: 1, maxPerExample: 1 },
      OOC:          { enabled: true,  targetCount: 40,  minPerExample: 1, maxPerExample: 1 },
      GAME_OVER:    { enabled: true,  targetCount: 40,  minPerExample: 1, maxPerExample: 1 },
    },

    // Genre distribution
    genres: {
      // key: genre id, value: { enabled, weight }
      // weight controls relative proportion — higher = more examples
      classic_fantasy:      { enabled: true, weight: 1 },
      dark_fantasy:         { enabled: true, weight: 1 },
      sword_and_sorcery:    { enabled: true, weight: 1 },
      mythic:               { enabled: true, weight: 1 },
      fairy_tale:           { enabled: true, weight: 1 },
      wuxia:                { enabled: true, weight: 1 },
      steampunk:            { enabled: true, weight: 1 },
      cosmic_horror:        { enabled: true, weight: 1 },
      gothic_horror:        { enabled: true, weight: 1 },
      survival_horror:      { enabled: true, weight: 1 },
      psychological_horror: { enabled: true, weight: 1 },
      folk_horror:          { enabled: true, weight: 1 },
      southern_gothic:      { enabled: true, weight: 1 },
      space_opera:          { enabled: true, weight: 1 },
      cyberpunk:            { enabled: true, weight: 1 },
      post_apocalyptic:     { enabled: true, weight: 1 },
      dystopian:            { enabled: true, weight: 1 },
      dungeon_crawler:      { enabled: true, weight: 1 },
      solarpunk:            { enabled: true, weight: 1 },
      biopunk:              { enabled: true, weight: 1 },
      noir_mystery:         { enabled: true, weight: 1 },
      political_intrigue:   { enabled: true, weight: 1 },
      swashbuckling:        { enabled: true, weight: 1 },
      heist_crime:          { enabled: true, weight: 1 },
      war:                  { enabled: true, weight: 1 },
      espionage:            { enabled: true, weight: 1 },
      weird_fiction:        { enabled: true, weight: 1 },
      cosmic_weird:         { enabled: true, weight: 1 },
      cozy:                 { enabled: true, weight: 1 },
      isekai:               { enabled: true, weight: 1 },
      mythpunk:             { enabled: true, weight: 1 },
      magical_realism:      { enabled: true, weight: 1 },
    },

    // Exchange length controls
    length: {
      minExchanges: 2,    // minimum player/dm turns per example
      maxExchanges: 7,    // maximum player/dm turns per example
      // Length tier distribution — must sum to 100
      tierWeights: {
        terse:    20,   // 1-2 sentence DM responses
        normal:   50,   // 2-4 sentence DM responses
        extended: 30,   // 3-5 paragraph DM responses
      },
    },

    // Dialogue structure distribution
    dialogue: {
      // What percentage of DM responses have each structure
      // Must sum to 100
      noDialogue:     15,   // pure narration, no NPC speech
      singleNpcOne:   25,   // one NPC, one line
      singleNpcMulti: 25,   // one NPC, multiple lines
      multiNpc:       20,   // two or more NPCs speaking
      withParaling:   15,   // any of the above + paralinguistic cues
    },

    // Name pool config
    namePool: {
      totalNames: 200,
      generated: false,
      names: [],    // populated by generateNamePool()
    },

    // Additional instructions
    additionalNotes: '',

    // Output format
    outputFormat: 'sharegpt',  // 'sharegpt' | 'chatml' | 'alpaca' | 'unsloth'

    // Total target examples
    totalExamples: 3000,
  },

  // ── Generation state ───────────────────────────────────────────────────
  generation: {
    running: false,
    paused: false,
    progress: 0,           // 0-100
    generated: 0,
    failed: 0,
    rejected: 0,
    currentExample: null,  // the example being generated right now
    errors: [],
  },

  // ── Examples ───────────────────────────────────────────────────────────
  // Loaded from SQLite for the viewer — not kept all in memory
  viewerFilters: {
    genre: null,
    tags: [],
    npcName: null,
    exchangeCount: null,
    responseLength: null,   // 'terse' | 'normal' | 'extended'
    hasErrors: null,
    status: 'all',          // 'all' | 'accepted' | 'rejected' | 'pending'
    sortBy: 'created_at',
    sortDir: 'desc',
    page: 0,
    pageSize: 20,
  },

  // ── Coverage stats ────────────────────────────────────────────────────
  coverage: {
    byTag: {},
    byGenre: {},
    byNpcName: {},
    byExchangeCount: {},
    byResponseLength: {},
    byDialogueStructure: {},
    byStoryStyle: {},
    errorRate: 0,
    rejectionRate: 0,
    totalTokensUsed: 0,
  },

  // ── Actions ────────────────────────────────────────────────────────────
  setPlan: (updates) => set(s => ({ plan: { ...s.plan, ...updates } })),
  setTagConfig: (tag, config) => set(s => ({
    plan: { ...s.plan, tags: { ...s.plan.tags, [tag]: { ...s.plan.tags[tag], ...config } } }
  })),
  setGenreConfig: (genre, config) => set(s => ({
    plan: { ...s.plan, genres: { ...s.plan.genres, [genre]: { ...s.plan.genres[genre], ...config } } }
  })),
  setGeneration: (updates) => set(s => ({ generation: { ...s.generation, ...updates } })),
  setCoverage: (coverage) => set({ coverage }),
  setViewerFilters: (filters) => set(s => ({ viewerFilters: { ...s.viewerFilters, ...filters, page: 0 } })),
}))

Part 3 — Database Schema (electron/db.js)
Add two new tables:
sql-- Stores generated examples
CREATE TABLE IF NOT EXISTS petricore_examples (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'pending',    -- 'pending' | 'accepted' | 'rejected'
  genre TEXT,
  task_type TEXT,
  tags_present TEXT,                -- JSON array
  exchange_count INTEGER,
  response_length_tier TEXT,        -- 'terse' | 'normal' | 'extended'
  dialogue_structure TEXT,          -- 'none' | 'single_one' | 'single_multi' | 'multi_npc' | 'with_paralingistic'
  npc_names TEXT,                   -- JSON array of NPC names appearing in example
  story_style TEXT,
  has_errors INTEGER DEFAULT 0,
  error_messages TEXT,              -- JSON array
  conversations TEXT NOT NULL,      -- JSON — the full ShareGPT conversations array
  raw_response TEXT,                -- the raw LLM output before parsing
  tokens_used INTEGER DEFAULT 0,
  rejection_reason TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Stores the generated name pool
CREATE TABLE IF NOT EXISTS petricore_names (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  cultural_origin TEXT,
  genre_tags TEXT,                  -- JSON array of genres this name fits
  use_count INTEGER DEFAULT 0,
  last_used_at INTEGER
);
Add IPC handlers in electron/main.js:
javascript// petricore:save-example   — saves a generated example
// petricore:update-example — update status or rejection_reason
// petricore:get-examples   — paginated query with filters
// petricore:get-coverage   — aggregate stats query
// petricore:export         — write dataset file to disk
// petricore:save-names     — save generated name pool
// petricore:get-names      — retrieve names with filters
Add to electron/preload.js:
javascriptpetricore: {
  saveExample:   (example) => ipcRenderer.invoke('petricore:save-example', example),
  updateExample: (id, updates) => ipcRenderer.invoke('petricore:update-example', id, updates),
  getExamples:   (filters) => ipcRenderer.invoke('petricore:get-examples', filters),
  getCoverage:   () => ipcRenderer.invoke('petricore:get-coverage'),
  export:        (opts) => ipcRenderer.invoke('petricore:export', opts),
  saveNames:     (names) => ipcRenderer.invoke('petricore:save-names', names),
  getNames:      (opts) => ipcRenderer.invoke('petricore:get-names', opts),
}

Part 4 — Name Generator (nameGenerator.js)
The name pool is generated once via an LLM call before any examples are produced. Names are then assigned deterministically — the model never chooses its own NPC names.
javascript/**
 * generateNamePool()
 * Makes a single LLM call requesting 200+ diverse NPC names.
 * Returns an array of name objects.
 */
export async function generateNamePool(config, targetCount = 200) {
  const prompt = `Generate ${targetCount} unique NPC names for a tabletop RPG dataset.

Requirements:
- Diverse cultural origins: include names that feel European, East Asian, Middle Eastern, African, Latin American, Slavic, Norse, and invented/fantastical
- Mix of genders: roughly equal male/female/ambiguous
- Avoid famous fictional characters, real celebrities, or overused fantasy names (no Gandalf, Aragorn, Legolas, etc.)
- No two names should be too similar (no John and Jon, no Sara and Sarah)
- Include a range of feels: ancient/mythic, grounded/realistic, futuristic/invented, gritty/streetwise
- Some names should work across genres; some should be genre-specific

Respond with ONLY a JSON array. No explanation. Each entry:
{"name":"Full Name","gender":"m|f|n","cultural_origin":"descriptor","genre_tags":["fantasy","horror","scifi","grounded","weird","any"]}`

  // Call via existing LLM service
  // Parse response
  // Validate uniqueness
  // Save to DB via window.tavern.petricore.saveNames()
}

/**
 * assignName()
 * Picks the least-recently-used name appropriate for the genre.
 * Never returns the same name twice in a row within the same example.
 */
export function assignName(genre, usedInExample = []) {
  // Query names from store, filter by genre_tags
  // Sort by use_count ASC, last_used_at ASC
  // Return first name not in usedInExample
}

Part 5 — Generation Service (petricoreService.js)
Generation plan compilation
Before generation starts, compile the plan config into a work queue — an ordered array of generation tasks with all parameters pre-resolved:
javascript/**
 * compilePlan(planConfig)
 * Turns the plan config into a flat array of generation tasks.
 * Each task has everything the prompt builder needs.
 */
export function compilePlan(plan) {
  const tasks = []

  // Calculate examples per genre based on weights
  const genreDistribution = calculateGenreDistribution(plan)

  // Calculate dialogue structure per example
  // Calculate length tier per example
  // Assign tag focus batches to ensure target counts are hit

  // Each task:
  return {
    id: uuid(),
    genre,
    tagFocus: [],         // tags this example should include
    lengthTier,           // 'terse' | 'normal' | 'extended'
    dialogueStructure,    // 'none' | 'single_one' | 'single_multi' | 'multi_npc' | 'with_paralinguistic'
    exchangeCount,        // exact number of turns
    npcNames: [],         // pre-assigned from name pool
    storyStyle,           // 'living_world' | 'guided_fate' | 'open_road' (randomised)
    additionalNotes: plan.additionalNotes,
  }
}
Meta-prompt builder
javascript/**
 * buildGenerationPrompt(task)
 * Builds the full meta-prompt for one generation task.
 * Every variable that could drift is explicitly controlled.
 */
export function buildGenerationPrompt(task) {
  const {
    genre, tagFocus, lengthTier, dialogueStructure,
    exchangeCount, npcNames, storyStyle, additionalNotes,
  } = task

  // Length tier instructions
  const lengthInstructions = {
    terse:    'DM responses must be 1-2 sentences maximum. Short, punchy, reactive.',
    normal:   'DM responses should be 2-4 sentences. Balanced narration.',
    extended: 'DM responses should be 3-5 paragraphs. Rich description, atmospheric.',
  }

  // Dialogue structure instructions
  const dialogueInstructions = {
    none:               'This example contains NO NPC dialogue. Pure narration only. Do not include any [VOICE:] tags.',
    single_one:         `One NPC speaks exactly once. NPC name: ${npcNames[0]}. Use [VOICE:${npcNames[0]}]"dialogue" format exactly.`,
    single_multi:       `One NPC speaks 2-4 times across the conversation. NPC name: ${npcNames[0]}. Each line must have its own [VOICE:${npcNames[0]}] tag.`,
    multi_npc:          `Two or more NPCs speak. NPC names: ${npcNames.slice(0, 3).join(', ')}. Each line gets its own [VOICE:Name] tag. Distribute lines between NPCs naturally.`,
    with_paralinguistic:`Include at least one paralinguistic cue inside NPC dialogue. Available cues: [laugh] [chuckle] [sigh] [gasp] [cough] [clear throat] [sniff] [groan] [shush]. Place INSIDE quotes only.`,
  }

  // Tag instructions
  const tagInstructions = tagFocus.length > 0
    ? `REQUIRED TAGS: The DM responses must include these tags used correctly: ${tagFocus.join(', ')}\n${buildTagFormatReminder(tagFocus)}`
    : 'TAG USAGE: Use whatever tags fit naturally. Include variety.'

  return `You are generating ONE training example for a TTRPG AI dungeon master system.

OUTPUT: A single valid JSON object. No explanation. No markdown. No text outside the JSON.

JSON SCHEMA:
{
  "task_type": "dm_play",
  "genre": "${genre}",
  "story_style": "${storyStyle}",
  "tags_present": ["array", "of", "tag", "names", "used"],
  "npc_names": ["array", "of", "NPC", "names", "appearing"],
  "conversations": [
    {"from": "system", "value": "...full DM system prompt..."},
    {"from": "player", "value": "...player action..."},
    {"from": "dm", "value": "...DM response..."}
  ]
}

EXCHANGE COUNT: Exactly ${exchangeCount} player/dm exchanges after the system entry.

LENGTH: ${lengthInstructions[lengthTier]}

DIALOGUE: ${dialogueInstructions[dialogueStructure]}

${tagInstructions}

SYSTEM PROMPT REQUIREMENTS (the "system" conversation entry must include):
- Core DM persona matching the ${genre} tone
- World Style block: ${storyStyle.replace('_', ' ').toUpperCase()}
- Rules system: Three Fates (Body/Mind/Spirit d6 pools, count 5s and 6s)
- Campaign name, tone, and themes appropriate to ${genre}
- Current location with name, description, atmosphere
- NPCs present (if any): use ONLY these pre-assigned names: ${npcNames.join(', ')}
- Player character with name, ancestry, background, HP, stats, abilities
- Story state: act number, active quests, tension level
- Full tag format reference

NPC NAME RULE: Use ONLY the pre-assigned names listed above. Do not invent additional names. Do not use names from well-known fiction.

GENRE: ${genre}
Tone, setting, themes, and world must be appropriate for ${genre}. Be specific and original — avoid generic tropes.

${additionalNotes ? `ADDITIONAL INSTRUCTIONS:\n${additionalNotes}` : ''}

TAG FORMAT REFERENCE (exact — no variation):
[VOICE:ExactNPCName]"dialogue immediately follows no space"
[ROLL: CharacterName — Stat — reason]
[IMAGE: type — description]  (types: scene/portrait/item/map/action/atmosphere)
[COMBAT: Name | threatLevel | role]  (levels: minion/normal/tough/elite/boss/legendary)
[FLAG: key=value]
[QUEST: title | objective]
[QUEST_UPDATE: title | new objective]
[QUEST_DONE: title]
[LOCATION: location_id | Location Name]
[NPC_UPDATE: name | field=value]
[LORE: title | text]
[ACT_ADVANCE]
[OOC: note]
[GAME_OVER: outcome | epilogue]  (outcomes: victory/defeat/ambiguous)

FORBIDDEN:
- Do not use XML tags of any kind
- Do not use markdown headers or bullet lists in narrative
- Do not end responses with "what do you do?"
- Do not invent NPC names beyond those provided
- Do not repeat the same scenario seed or NPC personality across examples`
}

Part 6 — Validator (validator.js)
Run on every generated example before it is saved. Returns { valid, errors, warnings }.
Checks:

JSON structure and required fields present
from values are only system, player, dm
Correct exchange count
Every quoted NPC line has a [VOICE:] tag immediately before it
No [VOICE:] tag is missing its paired quote
NPC names in [VOICE:] tags match the pre-assigned names for that example
Declared tags in tags_present are actually present in DM responses
Tag syntax matches exact patterns (no spaces in wrong places, correct delimiters)
No forbidden patterns (XML tags, markdown headers, what do you do? endings)
[GAME_OVER:] outcome is one of the three valid values
[ROLL:] tag is followed eventually by a [ROLL RESULTS] player message if ROLL_RESULTS is in tags_present
Dialogue structure matches the declared structure (no dialogue in none examples, etc.)
Response length tier is consistent with actual response lengths

Errors are hard failures — example is flagged has_errors: true.
Warnings are soft flags shown in the viewer but don't fail validation.

Part 7 — Coverage Tracker (coverageTracker.js)
Computes statistics from the SQLite table for display in both the Generation page and Dataset Viewer.
javascriptexport async function computeCoverage() {
  // Queries petricore_examples table
  // Returns:
  return {
    total: N,
    accepted: N,
    rejected: N,
    pending: N,
    withErrors: N,

    byTag: {
      VOICE: { count: N, targetCount: N, pct: N, status: 'ok|low|critical' },
      // ...
    },

    byGenre: {
      classic_fantasy: { count: N, pct: N },
      // ...
    },

    byNpcName: {
      // sorted by frequency — shows which names are overused
      'Mara': { count: N, examples: [id1, id2] },
      // ...
    },

    byExchangeCount: {
      2: N, 3: N, 4: N, 5: N, 6: N, 7: N
    },

    byResponseLength: {
      terse: N, normal: N, extended: N,
    },

    byDialogueStructure: {
      none: N, single_one: N, single_multi: N, multi_npc: N, with_paralinguistic: N,
    },

    byStoryStyle: {
      living_world: N, guided_fate: N, open_road: N,
    },

    byTaskType: {
      dm_play: N, world_generation: N, // etc
    },

    averageExchangeCount: N,
    averageResponseLength: N,   // in chars
    errorRate: N,               // pct
    rejectionRate: N,           // pct
    estimatedTokensUsed: N,
  }
}

Part 8 — Output Formatters (formatters.js)
javascript/**
 * Supported formats:
 *
 * sharegpt   — JSON array of {conversations:[{from,value}]}
 *              File: vellicore_dataset.json
 *
 * chatml     — Text file with <|im_start|>role\ncontent<|im_end|> format
 *              File: vellicore_dataset.txt
 *
 * jsonl      — One JSON object per line (ShareGPT schema)
 *              File: vellicore_dataset.jsonl
 *
 * alpaca     — {instruction, input, output} format
 *              File: vellicore_dataset_alpaca.json
 *
 * unsloth    — ShareGPT JSONL with Unsloth field naming conventions
 *              File: vellicore_dataset_unsloth.jsonl
 */

export function formatExample(example, format) { ... }
export async function exportDataset(examples, format, outputPath) { ... }
For ChatML, the field mapping is:

system → <|im_start|>system
player → <|im_start|>user
dm → <|im_start|>assistant

For Alpaca single-turn, the system prompt becomes instruction, the last player message becomes input, and the last DM response becomes output. Multi-turn examples are flattened.

Part 9 — UI: PetricorePage.jsx (shell)
A two-panel layout: narrow left sidebar with sub-page navigation, main content area.
Sidebar items:

Plan Builder (Sliders icon)
Generation (Play icon)
Dataset Viewer (Table icon)
Export (Download icon) — opens a modal, not a full page

The page header shows the dataset name (editable), total examples generated vs target, and a status badge (Idle / Generating / Paused / Complete).

Part 10 — UI: Plan Builder (PlanBuilder.jsx)
Four collapsible sections:
Section 1: Overview

Dataset name (text input)
Total examples target (number input, default 3000)
Output format selector (radio or dropdown): ShareGPT JSONL / ChatML / Alpaca / Unsloth JSONL
Additional notes (textarea, full width, labelled "Additional instructions for the LLM — these are appended to every generation prompt")

Section 2: Tags
A table with one row per tag. Columns:

Enabled toggle
Tag name (monospace label)
Target count (number input)
Min per example (number input, 1–5)
Max per example (number input, 1–5)
Current coverage (progress bar, filled as generation runs)

Include a "Select all / Deselect all" control and preset buttons: "All tags", "Core only" (VOICE, ROLL, FLAG, IMAGE), "Story tags only" (QUEST, LORE, ACT_ADVANCE, GAME_OVER).
Section 3: Genres
A grid of genre toggles (all 32 genres, matching ATMOSPHERE_PRESETS keys). Each genre tile shows:

Genre name
Enabled toggle
Weight slider (1–5, default 1)

Include "Enable all / Disable all" and "Balance weights" button that resets all weights to 1.
Section 4: Generation Parameters
Four sub-panels:
Length controls:

Min exchanges (slider 1–4)
Max exchanges (slider 4–10)
Length tier distribution — three sliders (Terse / Normal / Extended) that must sum to 100, shown as a stacked bar preview

Dialogue distribution:

Five sliders (No Dialogue / Single NPC One Line / Single NPC Multi-line / Multi-NPC / With Paralinguistic Cues) that must sum to 100, shown as a stacked bar preview

Name pool:

Total names to generate (number input, default 200)
"Generate Name Pool" button — calls generateNamePool(), shows progress, displays a preview table of the first 20 names when done
Pool status indicator: "Not generated" / "200 names ready" / "Regenerate"

Story styles:

Three checkboxes (Living World / Guided Fate / Open Road) with weight sliders, defaulting to equal distribution

At the bottom of the page: "Save Plan" button and "Start Generation" button (the latter navigates to the Generation sub-page).

Part 11 — UI: Generation (Generation.jsx)
Layout
Three-column layout:

Left: progress and controls
Center: live example preview
Right: coverage stats

Left panel: Progress

Large progress ring showing overall completion (generated / total)
Stats row: Generated / Failed / Rejected / Errors
Current task description: "Generating example 847 of 3000 — dark_fantasy — VOICE + NPC_UPDATE"
Estimated time remaining (based on average generation time)
Estimated API cost (tokens used × Sonnet rate)
Controls: Pause / Resume / Stop
Speed control: delay between calls (100ms – 2000ms slider)

Center panel: Live preview
Shows the most recently completed example in full. Structure:
┌─────────────────────────────────────────────────┐
│ EXAMPLE #847 — dark_fantasy — 4 exchanges       │
│ Tags: VOICE, NPC_UPDATE, FLAG                   │
│ NPCs: Serafin Voss, Kael Dunn  [Normal / Multi] │
├─────────────────────────────────────────────────┤
│ SYSTEM  [collapsed by default, expandable]      │
├─────────────────────────────────────────────────┤
│ PLAYER  "I approach the hooded figure..."       │
├─────────────────────────────────────────────────┤
│ DM      Full response text with tags            │
│         highlighted in different colours        │
├─────────────────────────────────────────────────┤
│ [Accept ✓]  [Reject ✗]  [Skip]                 │
└─────────────────────────────────────────────────┘
Tag highlighting in DM responses:

[VOICE:...]"..." — blue background on the whole unit
[ROLL:...] — amber
[FLAG:...] — green
[IMAGE:...] — purple
[COMBAT:...] — red
[QUEST:...] — teal
All other tags — grey

Errors flagged by the validator appear as inline red callouts below the relevant turn.
When rejecting, a small rejection reason dropdown appears: "Wrong tag syntax / Missing VOICE tag / Bad NPC name / Wrong length / Off genre / Other" with a text field for Other.
Right panel: Coverage stats
Live-updating as examples complete. Shows:
Tag coverage — compact table, tag name + progress bar + count/target
Genre distribution — horizontal bar chart
Length distribution — small pie or stacked bar (terse/normal/extended)
Dialogue distribution — small pie or stacked bar
NPC name frequency — top 20 most-used names, flags any name appearing more than 3× the average

Part 12 — UI: Dataset Viewer (DatasetViewer.jsx)
Filter bar (top)
Inline filter controls:

Genre dropdown (all / specific genre)
Status tabs: All / Pending / Accepted / Rejected / Has Errors
Tags filter (multi-select checkboxes)
NPC name search (text input)
Exchange count filter (any / 2 / 3 / 4 / 5 / 6 / 7)
Response length filter (any / terse / normal / extended)
Dialogue structure filter (any / no dialogue / single NPC / multi NPC / with paralinguistic)
Sort by: Created / Genre / Exchange Count / Response Length / Status
Sort direction toggle

Example list (left panel, ~40% width)
Scrollable list of example cards. Each card shows:

Example number and genre badge
Tag badges (colour-coded, same scheme as Generation preview)
Exchange count and length tier
NPC names
Status indicator (pending/accepted/rejected dot)
Error indicator if has_errors
First 80 chars of first DM response

Clicking a card loads it in the detail panel.
Detail panel (right panel, ~60% width)
Full example display, same tag highlighting as Generation preview. Shows:

All metadata at top
Full conversation with collapsible system prompt
Error list if any (each error links to the relevant turn)
Accept / Reject / Undo buttons
Rejection reason (if rejected)
Raw response toggle (shows the unprocessed LLM output)

Footer bar

Total examples in current filter / total in dataset
"Export current filter" button — exports only the filtered subset
"Export all accepted" button
"Export all" button

Each export button opens the Export modal.

Part 13 — Export Modal
Triggered from Dataset Viewer footer or the Export sidebar item.
Controls:

Format selector: ShareGPT JSONL / ChatML text / Alpaca JSON / Unsloth JSONL
Include: All / Accepted only / Accepted + Pending (exclude rejected)
Output filename (editable, defaults to vellicore_dataset_[timestamp])
Output path (folder picker via Electron dialog)
Preview: shows first 3 examples in the selected format
"Export" button — calls petricore:export IPC, shows progress


Part 14 — Implementation Order

Database schema additions and IPC handlers in main.js and preload.js
petricoreStore.js
validator.js and formatters.js (no UI dependencies, testable in isolation)
PetricorePage.jsx shell and routing
Plan Builder UI (no generation dependency)
nameGenerator.js and the name pool generation flow
petricoreService.js (compilePlan, buildGenerationPrompt, the generation loop)
coverageTracker.js
Generation page UI
Dataset Viewer UI
Export modal
Wire coverage stats into both Generation and Viewer
End-to-end test: generate 10 examples, verify they appear in Viewer, export in each format


Files to create
FileNotessrc/pages/PetricorePage.jsxShell with sidebar navsrc/pages/petricore/PlanBuilder.jsxPlan config UIsrc/pages/petricore/Generation.jsxLive generation UIsrc/pages/petricore/DatasetViewer.jsxBrowse/filter/reject UIsrc/services/petricore/petricoreService.jsGeneration orchestrationsrc/services/petricore/nameGenerator.jsName pool generationsrc/services/petricore/formatters.jsOutput format writerssrc/services/petricore/validator.jsExample validationsrc/services/petricore/coverageTracker.jsStatistics enginesrc/store/petricoreStore.jsZustand store
Files to modify
FileChangeelectron/db.jsAdd petricore_examples and petricore_names tableselectron/main.jsAdd petricore IPC handlerselectron/preload.jsAdd petricore bridgesrc/App.jsxAdd /petricore routeNavigation componentAdd Petricore link
What NOT to change

Existing LLM service — Petricore calls window.tavern.llm.send() exactly as the DM does
Existing campaign/game store
Existing settings page
Any game logic, combat engine, or RAG service