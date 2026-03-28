/**
 * DM Engine — orchestrates the AI DM.
 *
 * Responsibilities:
 *  - Initialise a new campaign (generate world + opening scene)
 *  - Process player input → stream DM response
 *  - Parse DM output for embedded tags ([ROLL:], [IMAGE:], [OOC:], [FLAG:])
 *  - Apply roll results back into the narrative
 *  - Trigger image generation and TTS side-effects
 */

import { sendToLlm, buildContextPacket } from '@/services/llm/llmService'
import { buildDmSystemPrompt } from '@/lib/world/dmPrompts'
import { useGameStore } from '@/store/appStore'
import { rollDice, RESULT_LABELS } from '@/lib/rules/rules'
import { generateImage, buildDmTagPrompt, cropToToken } from '@/services/image/imageService'
import { speakDmResponse, extractSpeakableText, stopSpeaking } from '@/services/tts/ttsService'
import { generateWorld } from '@/lib/world/worldGenerator'
import { parseStoryTags, applyStoryUpdates, createQuest, calculateTension } from '@/lib/story/storyEngine'

// ── LLM narration log helpers ─────────────────────────────────────────────────

function logOutbound(system, messages, label) {
  try {
    const { addLlmLogEntry } = useGameStore.getState()
    const group = crypto.randomUUID()
    if (system) addLlmLogEntry({ direction: 'outbound', role: 'system', content: system, group, label })
    messages.forEach(msg => {
      addLlmLogEntry({ direction: 'outbound', role: msg.role, content: msg.content, group, label })
    })
    return group
  } catch { return null }
}

function logInbound(group, content) {
  try {
    const { addLlmLogEntry } = useGameStore.getState()
    addLlmLogEntry({ direction: 'inbound', role: 'assistant', content, group })
  } catch {}
}

// ── Tag patterns embedded in DM output ───────────────────────────────────────

const TAG_PATTERNS = {
  roll:  /\[ROLL:\s*([^\]]+)\]/gi,
  image: /\[IMAGE:\s*([^\]]+)\]/gi,
  ooc:   /\[OOC:\s*([^\]]+)\]/gi,
  flag:  /\[FLAG:\s*([^\]]+)\]/gi,
  quest: /\[QUEST:\s*([^\]]+)\]/gi,
}

// ── Campaign initialisation ───────────────────────────────────────────────────

/**
 * Phase 1: Generate the world structure (JSON, non-streamed)
 * Phase 2: Stream the opening scene narrative to the player
 */
export async function initialiseCampaign({ campaign, characters, config, onChunk, onWorldReady, onComplete }) {
  // Phase 1: World generation
  console.log('[DM Engine] Generating world...')
  let world = null
  try {
    world = await generateWorld({ campaign, characters, config, campaignId: campaign.id })
    onWorldReady?.(world)
    console.log('[DM Engine] World ready:', world.name)
  } catch (err) {
    console.warn('[DM Engine] World generation failed, using fallback:', err.message)
    world = buildFallbackWorld(campaign)
    onWorldReady?.(world)
  }

  // Phase 2: Opening scene narrative
  const story = {
    currentAct: 1,
    activeQuests: world.startingQuests || [],
    completedQuests: [],
    globalFlags: {},
    tension: 1,
  }

  const systemPrompt = buildDmSystemPrompt({ campaign, world, characters, story })
  const openingPrompt = buildOpeningPrompt(campaign, characters, world)
  const openingMessages = [{ role: 'user', content: openingPrompt }]

  const logGroup = logOutbound(systemPrompt, openingMessages, 'Opening scene')

  let fullText = ''
  await sendToLlm({
    system: systemPrompt,
    messages: openingMessages,
    config: config.llm,
    maxTokens: 3000,  // extra headroom for reasoning models
    temperature: 0.9,
    onChunk: (chunk) => {
      fullText += chunk
      onChunk?.(chunk)
    },
  })

  logInbound(logGroup, fullText)

  const parsed = parseDmResponse(fullText)
  const storyTags = parseStoryTags(fullText)

  onComplete?.({ parsed, world, story, storyTags })
  return { parsed, world, story }
}

function buildOpeningPrompt(campaign, characters, world) {
  const charList = Object.values(characters || {})
    .map(c => `${c.name} (${c.ancestry} ${c.background})`)
    .join(', ')

  const startLoc = world?.locations?.start
  const firstNpcs = (startLoc?.npcsPresent || [])
    .map(id => world?.npcs?.[id])
    .filter(Boolean)
    .map(n => `${n.name} (${n.role})`)
    .join(', ')

  return `Begin the campaign. The world is ${world?.name || campaign.name}.

Characters present: ${charList || 'A lone adventurer'}
Opening location: ${startLoc?.name || 'unknown'} — ${startLoc?.description || ''}
${firstNpcs ? `NPCs present: ${firstNpcs}` : ''}
${world?.storyActs?.[0] ? `Act 1 hook: ${world.storyActs[0].hook}` : ''}

Describe the opening scene vividly. Show the characters already in the moment — not arriving, but there.
Engage at least one NPC if present. Introduce the opening hook naturally through what the characters see and hear.
End with an immediate, specific invitation to act.

Include: [IMAGE: scene — ${startLoc?.imagePrompt || startLoc?.atmosphere || 'opening scene'}]
Do NOT call for dice rolls yet. Do NOT explain the rules.`
}

function buildFallbackWorld(campaign) {
  return {
    name: `The World of ${campaign.name}`,
    tagline: 'A world of adventure and mystery.',
    description: '', geography: '', history: '',
    currentLocation: 'start',
    locations: {
      start: {
        id: 'start', name: "The Wanderer's Rest", type: 'tavern',
        description: 'A warm tavern where your journey begins.',
        atmosphere: 'candlelit, smoky, full of quiet conversations',
        secrets: [], exits: [], npcsPresent: [],
        imagePrompt: 'cosy medieval tavern interior, warm firelight, wooden beams',
        expanded: true,
      }
    },
    npcs: {}, factions: {}, discoveredLore: [],
    storyActs: [], startingQuests: [],
  }
}

// ── Player turn ───────────────────────────────────────────────────────────────

/**
 * Process a player action and stream the DM response.
 */
export async function playerTurn({
  input,
  gameState,
  config,
  onChunk,
  onComplete,
  onRollRequest,
  sessionContext,
  ragContext,
}) {
  const { campaign, world, characters, story, messages } = gameState

  const systemPrompt = buildDmSystemPrompt({ campaign, world, characters, story, sessionContext })

  // Build conversation history (last 12 exchanges to manage token budget)
  const history = buildHistory(messages)

  // Append the player's action
  const userMessage = { role: 'user', content: input.trim() }
  const turnMessages = ragContext
    ? [...history, { role: 'assistant', content: ragContext }, userMessage]
    : [...history, userMessage]

  const logGroup = logOutbound(systemPrompt, turnMessages, 'Player turn')

  let fullText = ''

  await sendToLlm({
    system: systemPrompt,
    messages: turnMessages,
    config: config.llm,
    maxTokens: 2000,  // extra headroom for reasoning models
    temperature: 0.88,
    onChunk: (chunk) => {
      fullText += chunk
      onChunk?.(chunk)
    },
  })

  logInbound(logGroup, fullText)

  const parsed = parseDmResponse(fullText)

  // Fire roll requests
  if (parsed.rolls.length > 0) {
    onRollRequest?.(parsed.rolls)
  }

  onComplete?.(parsed)
  return parsed
}

/**
 * Submit dice roll results back to the DM for resolution.
 */
export async function resolveRolls({
  rollResults,
  gameState,
  config,
  onChunk,
  onComplete,
  sessionContext,
}) {
  const { campaign, world, characters, story, messages } = gameState
  const systemPrompt = buildDmSystemPrompt({ campaign, world, characters, story, sessionContext })
  const history = buildHistory(messages)

  // Format roll results as a system message
  const rollSummary = rollResults
    .map(r => `${r.character} rolled ${r.stat}: [${r.rolls.join(', ')}] → ${r.successes} success${r.successes !== 1 ? 'es' : ''} (${r.result})`)
    .join('\n')

  const resolveMessage = {
    role: 'user',
    content: `[ROLL RESULTS]\n${rollSummary}\n\nResolve these rolls and continue the narrative.`,
  }

  const resolveMessages = [...history, resolveMessage]
  const logGroup = logOutbound(systemPrompt, resolveMessages, 'Roll resolution')

  let fullText = ''

  await sendToLlm({
    system: systemPrompt,
    messages: resolveMessages,
    config: config.llm,
    maxTokens: 2000,  // extra headroom for reasoning models
    temperature: 0.88,
    onChunk: (chunk) => {
      fullText += chunk
      onChunk?.(chunk)
    },
  })

  logInbound(logGroup, fullText)

  const parsed = parseDmResponse(fullText)
  onComplete?.(parsed)
  return parsed
}

// ── Response parser ───────────────────────────────────────────────────────────

/**
 * Parse the DM's raw text output into structured data.
 * Extracts embedded tags and returns clean narrative text + metadata.
 */
export function parseDmResponse(raw) {
  const rolls = []
  const images = []
  const oocNotes = []
  const flags = []
  const quests = []

  // Extract [ROLL: CharName — Stat — reason]
  let match
  const rollRegex = /\[ROLL:\s*([^\]]+)\]/gi
  while ((match = rollRegex.exec(raw)) !== null) {
    const parts = match[1].split(/[—–-]/).map(s => s.trim())
    rolls.push({
      raw: match[0],
      character: parts[0] || 'Player',
      stat: normaliseStat(parts[1] || 'body'),
      reason: parts[2] || '',
    })
  }

  // Extract [IMAGE: type — description]
  const imageRegex = /\[IMAGE:\s*([^\]]+)\]/gi
  while ((match = imageRegex.exec(raw)) !== null) {
    const parts = match[1].split(/[—–-]/).map(s => s.trim())
    images.push({
      raw: match[0],
      type: parts[0] || 'scene',
      description: parts[1] || parts[0] || '',
    })
  }

  // Extract [OOC: note]
  const oocRegex = /\[OOC:\s*([^\]]+)\]/gi
  while ((match = oocRegex.exec(raw)) !== null) {
    oocNotes.push(match[1].trim())
  }

  // Extract [FLAG: key=value] — world state flags
  const flagRegex = /\[FLAG:\s*([^\]]+)\]/gi
  while ((match = flagRegex.exec(raw)) !== null) {
    const [key, value] = match[1].split('=').map(s => s.trim())
    flags.push({ key, value: value ?? 'true' })
  }

  // Extract [QUEST: title | objective]
  const questRegex = /\[QUEST:\s*([^\]]+)\]/gi
  while ((match = questRegex.exec(raw)) !== null) {
    const [title, objective] = match[1].split('|').map(s => s.trim())
    quests.push({ title, objective })
  }

  // Extract [COMBAT: name | threatLevel] — signals combat should begin
  const combat = []
  const combatRegex = /\[COMBAT:\s*([^\]]+)\]/gi
  while ((match = combatRegex.exec(raw)) !== null) {
    const parts = match[1].split('|').map(s => s.trim())
    combat.push({
      raw: match[0],
      name: parts[0] || 'Enemy',
      threatLevel: parts[1] || 'normal',
      role: parts[2] || null,
    })
  }

  // Extract [GAME_OVER: outcome | epilogue] — signals end of story
  let gameOver = null
  const gameOverRegex = /\[GAME_OVER:\s*([^\]|]+)(?:\|([^\]]+))?\]/i
  const goMatch = gameOverRegex.exec(raw)
  if (goMatch) {
    const outcome = goMatch[1].trim().toLowerCase()
    gameOver = {
      outcome: ['victory', 'defeat', 'ambiguous'].includes(outcome) ? outcome : 'ambiguous',
      epilogue: goMatch[2]?.trim() || '',
    }
  }

  // Clean text — remove all tags for display
  const cleanText = raw
    .replace(/\[ROLL:[^\]]*\]/gi, '')
    .replace(/\[IMAGE:[^\]]*\]/gi, '')
    .replace(/\[FLAG:[^\]]*\]/gi, '')
    .replace(/\[QUEST:[^\]]*\]/gi, '')
    .replace(/\[COMBAT:[^\]]*\]/gi, '')
    .replace(/\[GAME_OVER:[^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Keep OOC notes visible but styled differently
  const displayText = cleanText
    .replace(/\[OOC:\s*([^\]]+)\]/gi, '<ooc>$1</ooc>')

  return {
    raw,
    displayText,
    cleanText,
    rolls,
    images,
    oocNotes,
    flags,
    quests,
    combat,
    gameOver,
    speakableText: extractSpeakableText(cleanText),
  }
}

// ── History builder ───────────────────────────────────────────────────────────

function buildHistory(messages, limit = 12) {
  // Convert store messages to LLM message format.
  // Drop empty messages (streaming placeholders, failed turns, etc.)
  const raw = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
    .slice(-limit)
    .map(m => ({ role: m.role, content: m.content.trim() }))

  // Enforce strict alternation required by chat models:
  // merge consecutive same-role messages; skip exact duplicates.
  const merged = []
  for (const msg of raw) {
    const prev = merged[merged.length - 1]
    if (prev && prev.role === msg.role) {
      if (prev.content !== msg.content) {
        prev.content += '\n\n' + msg.content
      }
      // exact duplicate — silently drop
    } else {
      merged.push({ ...msg })
    }
  }

  // Most models require history to start with a user message.
  // If the first message is an assistant (opening scene), prepend a synthetic
  // user turn so the opening narration stays in context.
  if (merged.length > 0 && merged[0].role === 'assistant') {
    merged.unshift({ role: 'user', content: '[Adventure begins]' })
  }

  return merged
}

// ── Memory summarisation ──────────────────────────────────────────────────────

/**
 * Distil a player/DM exchange into a short factual statement for RAG storage.
 * Fires a small non-streaming LLM call (≤100 tokens). Returns null on failure
 * so callers can skip storage gracefully.
 */
export async function summariseForMemory(playerInput, dmResponse, config) {
  const prompt = `You are a game note-taker. Extract only concrete facts from this RPG exchange.

Player: ${playerInput.slice(0, 300)}

DM: ${dmResponse.slice(0, 600)}

Write 1–3 short factual statements (not narrative prose). Focus on:
• names, locations visited, items obtained or given
• decisions made, alliances formed, information revealed
• time references, quest updates, world state changes

Facts:`

  let summary = ''
  try {
    await sendToLlm({
      system: 'You extract concise facts from tabletop RPG exchanges. Be brief and factual.',
      messages: [{ role: 'user', content: prompt }],
      config: config.llm,
      maxTokens: 100,
      temperature: 0.2,
      onChunk: (chunk) => { summary += chunk },
    })
  } catch {
    return null
  }

  const trimmed = summary.trim()
  return trimmed.length >= 20 ? trimmed : null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseStat(raw) {
  const s = (raw || '').toLowerCase().trim()
  if (s.includes('body') || s.includes('str') || s.includes('phys')) return 'body'
  if (s.includes('mind') || s.includes('int') || s.includes('wis') || s.includes('mag')) return 'mind'
  if (s.includes('spirit') || s.includes('cha') || s.includes('dex') || s.includes('spd')) return 'spirit'
  return 'body'
}

// ── Side effects ──────────────────────────────────────────────────────────────

/**
 * Fire image generation for all [IMAGE:] tags in a parsed DM response.
 * Uses campaign-aware prompt building. Non-blocking.
 */
export async function generateResponseImages({ parsed, config, campaign, onImage }) {
  if (!config.image?.enabled || !parsed.images?.length) return

  for (const imgTag of parsed.images) {
    try {
      const { prompt, styleKey } = buildDmTagPrompt(imgTag, campaign)

      const base64 = await generateImage({
        prompt,
        type: styleKey,
        sdnextUrl: config.image.sdnextUrl,
        model: config.image.defaultModel,
        style: config.image.style,
      })

      onImage?.({ tag: imgTag, base64, type: styleKey })
    } catch (err) {
      console.warn('[ImageGen] Failed:', err.message)
    }
  }
}

/**
 * Speak a DM message via Kokoro TTS.
 * Routes narration to the DM voice, dialogue to per-NPC voices.
 */
export async function speakDmMessage({ text, config, npcs = {}, onStart, onEnd }) {
  if (!config.tts?.enabled || !config.app?.autoTts) return

  try {
    await speakDmResponse({ text, config, npcs, onStart, onEnd })
  } catch (err) {
    console.warn('[TTS] Failed:', err.message)
  }
}
