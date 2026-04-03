/**
 * petricoreService.js — generation orchestration for the Petricore dataset tool.
 *
 * Uses window.tavern.llm.send() via sendToLlm() exactly as the DM does.
 * All DB writes go through window.tavern.petricore IPC bridge.
 */

import { sendToLlm } from '@/services/llm/llmService'
import { validateExample } from './validator'
import { assignNames } from './nameGenerator'
import usePetricoreStore from '@/store/petricoreStore'
import { useAppStore } from '@/store/appStore'
import { refreshCoverage } from './coverageTracker'

// ── Module-level control flags ─────────────────────────────────────────────────

let _running = false
let _paused  = false
let _stop    = false

export const isRunning  = () => _running
export const isPaused   = () => _paused

export function pauseGeneration() {
  _paused = true
  usePetricoreStore.getState().setGeneration({ paused: true })
}

export function resumeGeneration() {
  _paused = false
  usePetricoreStore.getState().setGeneration({ paused: false })
}

export function stopGeneration() {
  _stop   = true
  _paused = false
  _running = false
  usePetricoreStore.getState().setGeneration({ running: false, paused: false })
}

// ── Plan compilation ───────────────────────────────────────────────────────────

const STORY_STYLES = ['living_world', 'guided_fate', 'open_road']

const DIALOGUE_KEYS = ['noDialogue', 'singleNpcOne', 'singleNpcMulti', 'multiNpc', 'withParaling']
const DIALOGUE_STRUCT_MAP = {
  noDialogue:     'none',
  singleNpcOne:   'single_one',
  singleNpcMulti: 'single_multi',
  multiNpc:       'multi_npc',
  withParaling:   'with_paralinguistic',
}

function weightedPick(options) {
  // options: [{value, weight}]
  const total = options.reduce((s, o) => s + o.weight, 0)
  let r = Math.random() * total
  for (const o of options) {
    r -= o.weight
    if (r <= 0) return o.value
  }
  return options[options.length - 1].value
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function compilePlan(plan) {
  const enabledGenres = Object.entries(plan.genres)
    .filter(([, v]) => v.enabled)
    .map(([k, v]) => ({ genre: k, weight: v.weight }))

  if (enabledGenres.length === 0) throw new Error('No genres enabled')

  const total = plan.totalExamples
  const tasks = []

  // Assign genre to each task slot based on weights
  const genreAssignments = []
  for (let i = 0; i < total; i++) {
    genreAssignments.push(weightedPick(enabledGenres.map(g => ({ value: g.genre, weight: g.weight }))))
  }

  // Build tag demand pool
  const enabledTags = Object.entries(plan.tags)
    .filter(([, v]) => v.enabled)
    .map(([k, v]) => ({ tag: k, remaining: v.targetCount, max: v.maxPerExample }))

  // Distribute tags greedily across tasks
  const tagAssignments = Array.from({ length: total }, () => [])
  enabledTags.forEach(({ tag, remaining, max }) => {
    let left = remaining
    // Shuffle task indices so tags are spread across genres/styles
    const indices = [...Array(total).keys()].sort(() => Math.random() - 0.5)
    for (const idx of indices) {
      if (left <= 0) break
      if (tagAssignments[idx].length < max) {
        tagAssignments[idx].push(tag)
        left--
      }
    }
  })

  // Length tier options
  const tierOpts = Object.entries(plan.length.tierWeights)
    .map(([value, weight]) => ({ value, weight }))

  // Dialogue structure options
  const dialogueOpts = DIALOGUE_KEYS
    .map(k => ({ value: DIALOGUE_STRUCT_MAP[k], weight: plan.dialogue[k] }))
    .filter(o => o.weight > 0)

  // Story style options
  const styleOpts = Object.entries(plan.storyStyles || {})
    .filter(([, v]) => v.enabled)
    .map(([k, v]) => ({ value: k, weight: v.weight }))
  const storyStyleOpts = styleOpts.length > 0
    ? styleOpts
    : STORY_STYLES.map(s => ({ value: s, weight: 1 }))

  // Build each task
  for (let i = 0; i < total; i++) {
    const genre          = genreAssignments[i]
    const lengthTier     = weightedPick(tierOpts)
    const dialogueStruct = weightedPick(dialogueOpts)
    const exchangeCount  = randInt(plan.length.minExchanges, plan.length.maxExchanges)
    const storyStyle     = weightedPick(storyStyleOpts)
    const tagFocus       = tagAssignments[i]

    // Determine NPC count needed for this dialogue structure
    const npcCount = dialogueStruct === 'none' ? 0
      : dialogueStruct === 'multi_npc' ? randInt(2, 3)
      : 1

    tasks.push({
      id: crypto.randomUUID(),
      index: i,
      genre,
      tagFocus,
      lengthTier,
      dialogueStructure: dialogueStruct,
      exchangeCount,
      npcNames: [],   // filled in at generation time from name pool
      npcCount,
      storyStyle,
      additionalNotes: plan.additionalNotes || '',
    })
  }

  return tasks
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildTagFormatReminder(tags) {
  const formats = {
    VOICE:        `[VOICE:ExactNPCName]"dialogue immediately follows"`,
    ROLL:         `[ROLL: CharacterName — Stat — reason]`,
    ROLL_RESULTS: `[ROLL_RESULTS: outcome description]`,
    IMAGE:        `[IMAGE: type — description]  (types: scene/portrait/item/map/action/atmosphere)`,
    FLAG:         `[FLAG: key=value]`,
    QUEST:        `[QUEST: title | objective]`,
    QUEST_UPDATE: `[QUEST_UPDATE: title | new objective]`,
    QUEST_DONE:   `[QUEST_DONE: title]`,
    LOCATION:     `[LOCATION: location_id | Location Name]`,
    NPC_UPDATE:   `[NPC_UPDATE: name | field=value]`,
    LORE:         `[LORE: title | text]`,
    COMBAT:       `[COMBAT: Name | threatLevel | role]  (levels: minion/normal/tough/elite/boss/legendary)`,
    ACT_ADVANCE:  `[ACT_ADVANCE]`,
    OOC:          `[OOC: note]`,
    GAME_OVER:    `[GAME_OVER: outcome | epilogue]  (outcomes: victory/defeat/ambiguous)`,
  }
  return tags.filter(t => formats[t]).map(t => `  ${formats[t]}`).join('\n')
}

export function buildGenerationPrompt(task) {
  const { genre, tagFocus, lengthTier, dialogueStructure, exchangeCount, npcNames, storyStyle, additionalNotes } = task

  const lengthInstructions = {
    terse:    'DM responses must be 1-2 sentences maximum. Short, punchy, reactive.',
    normal:   'DM responses should be 2-4 sentences. Balanced narration.',
    extended: 'DM responses should be 3-5 paragraphs. Rich description, atmospheric.',
  }

  const dialogueInstructions = {
    none:               'This example contains NO NPC dialogue. Pure narration only. Do not include any [VOICE:] tags.',
    single_one:         `One NPC speaks exactly once. NPC name: ${npcNames[0] || 'NPC1'}. Use [VOICE:${npcNames[0] || 'NPC1'}]"dialogue" format exactly.`,
    single_multi:       `One NPC speaks 2-4 times across the conversation. NPC name: ${npcNames[0] || 'NPC1'}. Each line must have its own [VOICE:${npcNames[0] || 'NPC1'}] tag.`,
    multi_npc:          `Two or more NPCs speak. NPC names: ${npcNames.slice(0, 3).join(', ') || 'NPC1, NPC2'}. Each line gets its own [VOICE:Name] tag. Distribute lines between NPCs naturally.`,
    with_paralinguistic:`Include at least one paralinguistic cue inside NPC dialogue. Available cues: [laugh] [chuckle] [sigh] [gasp] [cough] [clear throat] [sniff] [groan] [shush]. Place INSIDE quotes only.`,
  }

  const tagInstructions = tagFocus.length > 0
    ? `REQUIRED TAGS: The DM responses must include these tags used correctly:\n${tagFocus.join(', ')}\n\nExact formats:\n${buildTagFormatReminder(tagFocus)}`
    : 'TAG USAGE: Use whatever tags fit naturally. Include variety.'

  const npcLine = npcNames.length > 0
    ? `NPCs present (if any): use ONLY these pre-assigned names: ${npcNames.join(', ')}`
    : 'No pre-assigned NPCs for this example.'

  return `You are generating ONE training example for a TTRPG AI dungeon master system.

OUTPUT: A single valid JSON object. No explanation. No markdown fences. No text outside the JSON.

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

DIALOGUE: ${dialogueInstructions[dialogueStructure] || dialogueInstructions.none}

${tagInstructions}

SYSTEM PROMPT REQUIREMENTS (the "system" conversation entry must include):
- Core DM persona matching the ${genre} tone
- World Style block: ${storyStyle.replace(/_/g, ' ').toUpperCase()}
- Rules system: Three Fates (Body/Mind/Spirit d6 pools, count 5s and 6s)
- Campaign name, tone, and themes appropriate to ${genre}
- Current location with name, description, atmosphere
- ${npcLine}
- Player character with name, ancestry, background, HP, stats, abilities
- Story state: act number, active quests, tension level
- Full tag format reference

NPC NAME RULE: Use ONLY the pre-assigned names listed above. Do not invent additional names. Do not use names from well-known fiction.

GENRE: ${genre}
Tone, setting, themes, and world must be appropriate for ${genre}. Be specific and original — avoid generic tropes.

${additionalNotes ? `ADDITIONAL INSTRUCTIONS:\n${additionalNotes}\n` : ''}
TAG FORMAT REFERENCE (exact — no variation):
[VOICE:ExactNPCName]"dialogue immediately follows no space"
[ROLL: CharacterName — Stat — reason]
[ROLL_RESULTS: outcome]
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

// ── Generation loop ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function startGeneration() {
  if (_running) return
  _running = true
  _stop    = false
  _paused  = false

  const store  = usePetricoreStore.getState()
  const config = useAppStore.getState().config
  const plan   = store.plan

  store.setGeneration({
    running: true, paused: false, progress: 0,
    generated: 0, failed: 0, rejected: 0,
    currentExample: null, errors: [],
  })

  // Get name pool — from store, DB, or skip
  let namePool = plan.namePool.generated ? plan.namePool.names : []
  if (namePool.length === 0 && window.tavern?.petricore) {
    namePool = await window.tavern.petricore.getNames({}) || []
    if (namePool.length > 0) {
      store.setNamePool({ ...plan.namePool, generated: true, names: namePool })
    }
  }

  let tasks
  try {
    tasks = compilePlan(plan)
  } catch (err) {
    store.setGeneration({ running: false, errors: [err.message] })
    _running = false
    return
  }

  const total = tasks.length

  for (let i = 0; i < tasks.length; i++) {
    if (_stop) break

    while (_paused && !_stop) await sleep(200)
    if (_stop) break

    const task = { ...tasks[i] }

    // Assign NPC names from pool
    if (task.npcCount > 0 && namePool.length > 0) {
      task.npcNames = assignNames(namePool, task.genre, task.npcCount)
    }

    const storeState = usePetricoreStore.getState()
    const delay = storeState.generation.callDelay ?? 500

    try {
      const example = await _generateOne(task, config.llm)

      const gen = usePetricoreStore.getState().generation
      usePetricoreStore.getState().setGeneration({
        currentExample: example,
        generated: gen.generated + 1,
        progress: Math.round((i + 1) / total * 100),
      })
    } catch (err) {
      const gen = usePetricoreStore.getState().generation
      usePetricoreStore.getState().setGeneration({
        failed: gen.failed + 1,
        progress: Math.round((i + 1) / total * 100),
        errors: [...gen.errors, `Example ${i + 1}: ${err.message}`].slice(-20),
      })
    }

    // Refresh coverage every 10 examples
    if ((i + 1) % 10 === 0) refreshCoverage()

    if (delay > 0 && i < tasks.length - 1 && !_stop) await sleep(delay)
  }

  _running = false
  _paused  = false
  await refreshCoverage()
  usePetricoreStore.getState().setGeneration({ running: false, paused: false })
}

async function _generateOne(task, llmConfig) {
  const prompt = buildGenerationPrompt(task)

  const raw = await sendToLlm({
    system: '',
    messages: [{ role: 'user', content: prompt }],
    config: llmConfig,
    maxTokens: 6000,
    temperature: 0.9,
  })

  // Extract JSON object from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON object found in LLM response')

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.conversations || !Array.isArray(parsed.conversations)) {
    throw new Error('Response missing conversations array')
  }

  const validation = validateExample(parsed, task)

  const example = {
    id: crypto.randomUUID(),
    status: 'pending',
    genre: task.genre,
    task_type: 'dm_play',
    tags_present: parsed.tags_present || [],
    exchange_count: task.exchangeCount,
    response_length_tier: task.lengthTier,
    dialogue_structure: task.dialogueStructure,
    npc_names: parsed.npc_names || task.npcNames,
    story_style: task.storyStyle,
    has_errors: validation.errors.length > 0,
    error_messages: validation.errors,
    conversations: parsed.conversations,
    raw_response: raw,
    tokens_used: 0,
    rejection_reason: null,
  }

  // Save to DB
  if (window.tavern?.petricore) {
    await window.tavern.petricore.saveExample({
      ...example,
      tags_present: JSON.stringify(example.tags_present),
      npc_names: JSON.stringify(example.npc_names),
      error_messages: JSON.stringify(example.error_messages),
      conversations: JSON.stringify(example.conversations),
    })
  }

  return example
}
