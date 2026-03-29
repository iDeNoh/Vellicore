/**
 * World Generator — Module 3
 *
 * Generates a full living world from campaign settings:
 *   1. World identity — name, geography, history, tone
 *   2. Starting region — 5–8 connected locations
 *   3. Factions — 2–4 groups with goals and relationships
 *   4. NPCs — key characters seeded across locations
 *   5. Five-act story skeleton — main plot arc with beats
 *   6. Starting quests — main quest + 1–2 side hooks
 *
 * All generation is a single structured LLM call returning JSON.
 * The world is then stored in the campaign record and incrementally
 * expanded as players explore (new locations, NPCs, secrets).
 */

import { sendToLlm } from '@/services/llm/llmService'
import { ensureCollections, deleteCollections, seedEntitiesFromWorld } from '@/services/rag/ragService'
import { useAppStore } from '@/store/appStore'

// ── Main world generation ─────────────────────────────────────────────────────

/**
 * Generate a complete starting world for a new campaign.
 * Returns a fully populated world object ready to load into the game store.
 */
export async function generateWorld({ campaign, characters, config, campaignId }) {
  console.log('[WorldGen] Generating world for:', campaign.name)

  const prompt = buildWorldGenPrompt(campaign, characters)

  let raw = ''
  await sendToLlm({
    system: WORLD_GEN_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    config: config.llm,
    maxTokens: 8000,  // generous budget — world JSON can be 2–3k tokens; reasoning models add overhead
    temperature: 0.92,
    onChunk: (chunk) => { raw += chunk },
  })

  const world = parseWorldJson(raw, campaign)
  console.log('[WorldGen] World generated:', world.name, '—', Object.keys(world.locations).length, 'locations,', Object.keys(world.npcs).length, 'NPCs')

  // Seed entity collection if RAG is available
  if (campaignId && useAppStore.getState().ragAvailable && useAppStore.getState().config?.rag?.enabled !== false) {
    try {
      await deleteCollections(campaignId)
      await ensureCollections(campaignId)
      await seedEntitiesFromWorld(campaignId, world)
      console.log('[RAG] Entity collection seeded from world state')
    } catch (err) {
      console.warn('[RAG] Entity seeding failed (non-fatal):', err.message)
    }
  }

  return world
}

// ── Location expansion ────────────────────────────────────────────────────────

/**
 * Called when a player enters a location that hasn't been fully detailed yet.
 * Generates full description, atmosphere, hidden details, and any NPCs present.
 */
export async function expandLocation({ locationId, locationName, world, campaign, config }) {
  console.log('[WorldGen] Expanding location:', locationName)

  const prompt = buildLocationExpandPrompt(locationId, locationName, world, campaign)

  let raw = ''
  await sendToLlm({
    system: LOCATION_EXPAND_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    config: config.llm,
    maxTokens: 2000,  // reasoning models need space for thinking chain
    temperature: 0.88,
    onChunk: (chunk) => { raw += chunk },
  })

  return parseLocationJson(raw, locationId, locationName)
}

// ── NPC generation ────────────────────────────────────────────────────────────

/**
 * Generate a new NPC on-demand when the DM mentions an unnamed character.
 * Gives them a full personality, history, and secrets.
 */
export async function generateNpc({ description, locationId, world, campaign, config }) {
  const prompt = buildNpcPrompt(description, locationId, world, campaign)

  let raw = ''
  await sendToLlm({
    system: NPC_GEN_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    config: config.llm,
    maxTokens: 2000,  // reasoning models need space for thinking chain
    temperature: 0.9,
    onChunk: (chunk) => { raw += chunk },
  })

  return parseNpcJson(raw, locationId)
}

// ── Story act advancement ─────────────────────────────────────────────────────

/**
 * Called when the DM signals an act transition.
 * Generates new plot hooks, complications, and updated quest objectives.
 */
export async function advanceAct({ currentAct, world, campaign, story, config }) {
  const newAct = currentAct + 1
  if (newAct > 5) return null

  console.log('[WorldGen] Advancing to Act', newAct)

  const prompt = buildActAdvancePrompt(newAct, world, campaign, story)

  let raw = ''
  await sendToLlm({
    system: ACT_ADVANCE_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    config: config.llm,
    maxTokens: 2000,  // reasoning models need space for thinking chain
    temperature: 0.88,
    onChunk: (chunk) => { raw += chunk },
  })

  return parseActJson(raw, newAct)
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildWorldGenPrompt(campaign, characters) {
  const charList = Object.values(characters || {})
    .map(c => `${c.name} — ${c.ancestry} ${c.background}`)
    .join('\n')

  return `Generate a TTRPG campaign world skeleton. ALL string values must be 1 sentence max.

CAMPAIGN: "${campaign.name}"
ATMOSPHERE: ${campaign.tone || campaign.atmosphere || 'adventure'}
THEMES: ${(campaign.themes || []).join(', ') || 'discovery, conflict, wonder'}
DANGER: ${campaign.dangerLevel || 'moderate'}
CHARACTERS: ${charList || 'One unnamed adventurer'}

Respond with ONLY valid JSON in EXACTLY this field order (critical fields first):
{"name":"world name","tagline":"tagline","description":"1-2 sentences",
"locations":{
"start":{"id":"start","name":"name","type":"tavern|town|wilderness|dungeon|city|ruin|port|castle|other","description":"1 sentence","exits":["loc_2"],"npcsPresent":["npc_001"]},
"loc_2":{"id":"loc_2","name":"name","type":"type","description":"1 sentence","exits":["start"],"npcsPresent":[]},
"loc_3":{"id":"loc_3","name":"name","type":"type","description":"1 sentence","exits":["start"],"npcsPresent":[]}
},
"npcs":{
"npc_001":{"id":"npc_001","name":"name","gender":"m|f","role":"role","locationId":"start","motivation":"1 sentence","secret":"1 sentence","disposition":"friendly|neutral|hostile","plannedAct":1},
"npc_002":{"id":"npc_002","name":"name","gender":"m|f","role":"role","locationId":"loc_2","motivation":"1 sentence","secret":"1 sentence","disposition":"neutral","plannedAct":2},
"npc_003":{"id":"npc_003","name":"villain name","gender":"m|f","role":"antagonist role","locationId":"loc_3","motivation":"1 sentence","secret":"1 sentence","disposition":"hostile","plannedAct":3}
},
"factions":{
"faction_001":{"id":"faction_001","name":"name","type":"guild|cult|government|criminal|religious|other","description":"1 sentence","attitude":"friendly|neutral|hostile|hidden"}
},
"storyActs":[
{"act":1,"title":"title","summary":"1 sentence","mainObjective":"1 sentence","hook":"1 sentence"},
{"act":2,"title":"title","summary":"1 sentence","mainObjective":"1 sentence","hook":"1 sentence"},
{"act":3,"title":"title","summary":"1 sentence","mainObjective":"1 sentence","hook":"1 sentence"},
{"act":4,"title":"title","summary":"1 sentence","mainObjective":"1 sentence","hook":"1 sentence"},
{"act":5,"title":"title","summary":"1 sentence","mainObjective":"1 sentence","hook":"final confrontation"}
],
"startingQuests":[
{"id":"quest_main_001","title":"title","type":"main","description":"1 sentence","currentObjective":"first step","urgency":"normal","giver":"npc_001","reward":"1 sentence"}
]}

Rules:
- Replace ALL placeholder ids with real snake_case ids matching your content
- "start" location id must stay exactly "start"
- Optionally add 1-2 extra locations (total 4-5 max) after the 3 shown
- Make every name unique and specific to the campaign tone — no generic defaults
- Output fields in the order shown — locations and npcs are most critical`
}

function buildLocationExpandPrompt(locationId, locationName, world, campaign) {
  const adjacentLocs = Object.values(world.locations || {})
    .filter(l => l.exits?.includes(locationId) || world.locations?.[locationId]?.exits?.includes(l.id))
    .map(l => l.name)
    .join(', ')

  return `Expand this location for the campaign "${campaign.name}" (${campaign.tone || campaign.atmosphere}).

LOCATION: "${locationName}" (id: ${locationId})
WORLD: ${world.name} — ${world.tagline || ''}
ADJACENT TO: ${adjacentLocs || 'the starting area'}

Respond with ONLY valid JSON:
{
  "id": "${locationId}",
  "name": "${locationName}",
  "description": "rich 3–4 sentence description",
  "atmosphere": "sensory atmosphere — light, sound, smell, feel",
  "details": ["specific visual detail 1", "specific visual detail 2", "specific visual detail 3"],
  "secrets": ["hidden thing 1", "hidden thing 2"],
  "exits": ["existing_location_ids_plus_new_ones"],
  "npcsPresent": [],
  "pointsOfInterest": [
    { "name": "poi name", "description": "what it is and why it matters" }
  ],
  "imagePrompt": "detailed visual description for image generation, no people, focus on environment"
}`
}

function buildNpcPrompt(description, locationId, world, campaign) {
  const location = world.locations?.[locationId]

  return `Create an NPC for the campaign "${campaign.name}" (${campaign.tone || campaign.atmosphere}).

CONTEXT: ${description}
LOCATION: ${location?.name || 'unknown'} — ${location?.description || ''}
WORLD TONE: ${campaign.tone || campaign.atmosphere}

Respond with ONLY valid JSON:
{
  "id": "npc_${Date.now()}",
  "name": "full name",
  "role": "occupation",
  "locationId": "${locationId}",
  "ancestry": "species/ancestry",
  "appearance": "distinctive appearance details",
  "personality": "2–3 defining personality traits",
  "speech": "speech patterns and mannerisms",
  "motivation": "core desire or goal",
  "secret": "something hidden",
  "disposition": "friendly|neutral|hostile|fearful",
  "stats": { "body": 2, "mind": 2, "spirit": 2 },
  "hp": 8,
  "portraitPrompt": "portrait description for image generation, no background"
}`
}

function buildActAdvancePrompt(newAct, world, campaign, story) {
  const completedFlags = Object.entries(story?.globalFlags || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k.replace(/_/g, ' '))

  return `The campaign "${campaign.name}" is advancing to Act ${newAct} of 5.

WORLD: ${world.name}
COMPLETED STORY BEATS: ${completedFlags.join(', ') || 'none yet'}
PREVIOUS QUESTS: ${story?.completedQuests?.map(q => q.title).join(', ') || 'none'}

Generate Act ${newAct} details. Respond with ONLY valid JSON:
{
  "act": ${newAct},
  "title": "act title",
  "summary": "what shifts in the world for this act",
  "mainObjective": "what the players now need to do",
  "hook": "the inciting event that opens this act",
  "climax": "the pivotal moment or confrontation",
  "transition": "what triggers the move to act ${newAct + 1}",
  "newQuests": [
    {
      "id": "quest_act${newAct}_001",
      "title": "quest title",
      "type": "main|side",
      "description": "quest description",
      "currentObjective": "first objective",
      "urgency": "urgent|normal|low"
    }
  ],
  "worldChanges": [
    { "description": "something that has visibly changed in the world" }
  ]
}`
}

// ── System prompts for each generator ────────────────────────────────────────

const WORLD_GEN_SYSTEM = `You are a master worldbuilder creating a TTRPG campaign world.
Generate creative, specific, atmospheric content perfectly matched to the requested tone.
Avoid generic fantasy tropes unless specifically requested.
Make NPCs feel like real people with contradictions and hidden depths.
All locations should feel distinct and memorable.
Plan a complete five-act narrative arc with a clearly defined antagonist and plot twists. NPCs should have specific planned acts for their introduction.
Use UNIQUE, SPECIFIC names for every NPC, location, and faction — never reuse common names like "Elara", "Marcus", "Thorin", "The Rusty Anchor", "The Black Hand", etc. Invent names that fit the campaign's specific tone and culture.
Respond ONLY with valid JSON — no preamble, no explanation, no markdown code fences.`

const LOCATION_EXPAND_SYSTEM = `You are expanding a TTRPG location with rich sensory detail.
Make the location feel alive, specific, and full of story potential.
Include hidden details that reward careful exploration.
Respond ONLY with valid JSON — no preamble, no explanation, no markdown code fences.`

const NPC_GEN_SYSTEM = `You are creating a TTRPG non-player character.
Make them feel like a real person — specific, contradictory, with depth.
Their motivation should drive interesting interactions.
Their secret should be relevant to the campaign themes.
Respond ONLY with valid JSON — no preamble, no explanation, no markdown code fences.`

const ACT_ADVANCE_SYSTEM = `You are advancing a TTRPG campaign's story to its next act.
Build naturally on what has happened. Raise stakes appropriately.
New quests should feel like organic consequences of previous events.
Respond ONLY with valid JSON — no preamble, no explanation, no markdown code fences.`

// ── JSON parsers ──────────────────────────────────────────────────────────────

function parseWorldJson(raw, campaign) {
  const data = extractJson(raw)

  // Ensure required fields exist with fallbacks
  const world = {
    name: data.name || `The World of ${campaign.name}`,
    tagline: data.tagline || '',
    description: data.description || '',
    geography: data.geography || '',
    history: data.history || '',
    imagePrompt: data.imagePrompt || '',
    currentLocation: 'start',
    locations: {},
    npcs: {},
    factions: {},
    discoveredLore: [],
  }

  // Normalise locations
  const rawLocs = data.locations || {}
  Object.entries(rawLocs).forEach(([id, loc]) => {
    world.locations[id] = {
      id,
      name: loc.name || id,
      type: loc.type || 'location',
      description: loc.description || '',
      atmosphere: loc.atmosphere || '',
      secrets: loc.secrets || [],
      exits: loc.exits || [],
      npcsPresent: loc.npcsPresent || [],
      imagePrompt: loc.imagePrompt || '',
      expanded: true,
    }
  })

  // Ensure start location exists
  if (!world.locations.start) {
    world.locations.start = {
      id: 'start',
      name: 'Starting Location',
      type: 'tavern',
      description: 'Your adventure begins here.',
      atmosphere: '',
      secrets: [],
      exits: [],
      npcsPresent: [],
      imagePrompt: '',
      expanded: true,
    }
  }

  // Normalise NPCs
  const rawNpcs = data.npcs || {}
  Object.entries(rawNpcs).forEach(([id, npc]) => {
    world.npcs[id] = {
      id,
      name: npc.name || 'Unknown',
      role: npc.role || '',
      locationId: npc.locationId || 'start',
      ancestry: npc.ancestry || 'human',
      appearance: npc.appearance || '',
      personality: npc.personality || '',
      speech: npc.speech || '',
      gender: npc.gender || '',
      motivation: npc.motivation || '',
      secret: npc.secret || '',
      disposition: npc.disposition || 'neutral',
      stats: npc.stats || { body: 2, mind: 2, spirit: 2 },
      hp: npc.hp || 8,
      maxHp: npc.hp || 8,
      portraitPrompt: npc.portraitPrompt || npc.appearance || npc.name,
      isPresent: npc.locationId === 'start' || !npc.locationId,
      plannedAct: npc.plannedAct || 1,
    }
  })

  // Normalise factions
  const rawFactions = data.factions || {}
  Object.entries(rawFactions).forEach(([id, fac]) => {
    world.factions[id] = {
      id,
      name: fac.name || 'Unknown Faction',
      type: fac.type || 'other',
      description: fac.description || '',
      attitude: fac.attitude || 'neutral',
      powerLevel: fac.powerLevel || 1,
      knownMembers: fac.knownMembers || [],
    }
  })

  // Story data (stored on world for persistence, synced to story store)
  console.log('[WorldGen] Parsed:', Object.keys(world.locations).length, 'locations,', Object.keys(world.npcs).length, 'NPCs,', Object.keys(world.factions).length, 'factions')

  world.storyActs = (data.storyActs || []).map(act => ({
    act: act.act,
    title: act.title || `Act ${act.act}`,
    summary: act.summary || '',
    mainObjective: act.mainObjective || '',
    hook: act.hook || '',
    climax: act.climax || '',
    transition: act.transition || '',
  }))

  console.log('[WorldGen] Story acts:', world.storyActs.length, '| Starting quests raw:', (data.startingQuests || []).length)

  world.startingQuests = (data.startingQuests || []).map((q, i) => ({
    id: q.id || `quest_start_${i}`,
    title: q.title || 'Unknown Quest',
    type: q.type || 'side',
    description: q.description || '',
    currentObjective: q.currentObjective || '',
    urgency: q.urgency || 'normal',
    giver: q.giver || null,
    reward: q.reward || '',
  }))

  world.narrativePlan = {
    mainAntagonist: data.narrativePlan?.mainAntagonist || '',
    antagonistMotivation: data.narrativePlan?.antagonistMotivation || '',
    centralConflict: data.narrativePlan?.centralConflict || '',
    antagonistReveal: data.narrativePlan?.antagonistReveal || '',
    keyTwists: data.narrativePlan?.keyTwists || [],
    thematicResolution: data.narrativePlan?.thematicResolution || '',
  }

  return world
}

function parseLocationJson(raw, locationId, locationName) {
  const data = extractJson(raw)
  return {
    id: locationId,
    name: data.name || locationName,
    description: data.description || '',
    atmosphere: data.atmosphere || '',
    details: data.details || [],
    secrets: data.secrets || [],
    exits: data.exits || [],
    npcsPresent: data.npcsPresent || [],
    pointsOfInterest: data.pointsOfInterest || [],
    imagePrompt: data.imagePrompt || '',
    expanded: true,
  }
}

function parseNpcJson(raw, locationId) {
  const data = extractJson(raw)
  return {
    id: data.id || `npc_${Date.now()}`,
    name: data.name || 'Unknown',
    role: data.role || '',
    locationId: data.locationId || locationId,
    ancestry: data.ancestry || 'human',
    appearance: data.appearance || '',
    personality: data.personality || '',
    speech: data.speech || '',
    motivation: data.motivation || '',
    secret: data.secret || '',
    disposition: data.disposition || 'neutral',
    stats: data.stats || { body: 2, mind: 2, spirit: 2 },
    hp: data.hp || 8,
    maxHp: data.hp || 8,
    portraitPrompt: data.portraitPrompt || data.appearance || '',
    isPresent: true,
  }
}

function parseActJson(raw, actNumber) {
  const data = extractJson(raw)
  return {
    act: actNumber,
    title: data.title || `Act ${actNumber}`,
    summary: data.summary || '',
    mainObjective: data.mainObjective || '',
    hook: data.hook || '',
    climax: data.climax || '',
    transition: data.transition || '',
    newQuests: data.newQuests || [],
    worldChanges: data.worldChanges || [],
  }
}

// ── JSON extraction helper ────────────────────────────────────────────────────

/**
 * Robustly extract JSON from an LLM response.
 * Handles markdown code fences, leading/trailing text, partial truncation.
 * When the response is truncated (max_tokens hit), salvages all fully-written
 * top-level fields rather than returning an empty object.
 */
export function extractJson(raw) {
  if (!raw) return {}

  // Strip thinking tokens (Qwen 3, DeepSeek-R1, etc.)
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/think>/gi, '')  // orphaned closing tag
    .trim()

  // Strip markdown fences (with multiline flag so ^ matches after newlines too)
  cleaned = cleaned
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim()

  const start = cleaned.indexOf('{')
  if (start === -1) {
    console.warn('[WorldGen] No JSON object found in response')
    return {}
  }

  const candidate = cleaned.slice(start)

  // 1. Try verbatim parse
  try { return JSON.parse(candidate) } catch { /* fall through */ }

  // 2. Strip trailing commas (common LLM error)
  try {
    return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'))
  } catch { /* fall through */ }

  // 3. Truncation repair — find the last position where the brace depth returned
  //    to 1 (meaning a complete top-level key:value was just closed).
  //    Slice there and close the outer object.
  const salvaged = repairTruncatedJson(candidate)
  if (salvaged) {
    try { return JSON.parse(salvaged) } catch { /* fall through */ }
  }

  console.warn('[WorldGen] Failed to parse JSON, raw starts with:', candidate.slice(0, 200))
  return {}
}

/**
 * Walk the JSON string tracking brace/bracket depth.
 * Each time depth returns to exactly 1 (just finished a top-level value),
 * record that position as a candidate truncation point.
 * Returns the repaired string up to the last safe candidate + closing `}`,
 * or null if no candidate was found.
 */
function repairTruncatedJson(jsonStr) {
  let depth = 0
  let inString = false
  let escape = false
  let lastSafePos = -1   // position after last complete top-level value

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i]

    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue

    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 1) lastSafePos = i + 1  // just closed a top-level value
      if (depth === 0) return null            // already a complete object
    }
  }

  // If we never got past depth 1, nothing is salvageable
  if (lastSafePos === -1) return null

  // Slice to last safe position, strip trailing comma if present, close outer object
  const truncated = jsonStr.slice(0, lastSafePos).replace(/,\s*$/, '')
  return truncated + '}'
}
