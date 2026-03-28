/**
 * Story Engine — Module 3
 *
 * Manages the living story state:
 *  - Quest lifecycle (discovery → active → complete/failed)
 *  - Act transitions (detect triggers, advance story)
 *  - Global flag interpretation (world event consequences)
 *  - Story tension tracking
 *  - Session summary generation
 *
 * The DM's responses drive story changes via embedded tags.
 * This engine interprets those tags and applies them to the game store.
 */

import { sendToLlm } from '@/services/llm/llmService'
import { advanceAct } from '@/lib/world/worldGenerator'

// ── Quest management ──────────────────────────────────────────────────────────

/**
 * Add a new quest discovered during play.
 * Called when DM emits [QUEST: title | objective]
 */
export function createQuest({ title, objective, description, type = 'side', urgency = 'normal', giver = null }) {
  return {
    id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    currentObjective: objective || description,
    description: description || objective,
    type,
    urgency,
    giver,
    discoveredAt: Date.now(),
    completedAt: null,
    failed: false,
  }
}

/**
 * Update a quest's current objective.
 */
export function updateQuestObjective(quests, questId, newObjective) {
  return quests.map(q =>
    q.id === questId ? { ...q, currentObjective: newObjective } : q
  )
}

/**
 * Mark a quest as complete.
 */
export function completeQuest(activeQuests, completedQuests, questId) {
  const quest = activeQuests.find(q => q.id === questId)
  if (!quest) return { activeQuests, completedQuests }
  return {
    activeQuests: activeQuests.filter(q => q.id !== questId),
    completedQuests: [...completedQuests, { ...quest, completedAt: Date.now() }],
  }
}

// ── Act transition detection ──────────────────────────────────────────────────

/**
 * Examine current game state to determine if an act transition is due.
 * Returns true if the DM should be prompted to advance the story.
 */
export function shouldAdvanceAct({ story, world }) {
  const { currentAct, globalFlags, completedQuests } = story

  if (currentAct >= 5) return false

  // Check for explicit act-advance flag
  if (globalFlags[`act_${currentAct}_complete`]) return true

  // Check if act's main quest is complete
  const actMainQuest = completedQuests?.find(
    q => q.type === 'main' && q.actNumber === currentAct
  )
  if (actMainQuest) return true

  return false
}

/**
 * Build the DM prompt addendum for an act transition.
 * Injected into the next DM system prompt.
 */
export function getActTransitionAddendum(newAct, actData) {
  if (!actData) return ''

  return `
ACT TRANSITION — The story is moving to Act ${newAct}: "${actData.title}"
${actData.hook ? `New hook: ${actData.hook}` : ''}
${actData.summary ? `What shifts: ${actData.summary}` : ''}
Weave this transition naturally into your next response. Don't announce it mechanically.
`.trim()
}

// ── Tension tracking ──────────────────────────────────────────────────────────

/**
 * Calculate the current story tension level (1–5).
 * Used to calibrate DM pacing — higher tension = shorter, punchier responses.
 */
export function calculateTension({ story, combat, messages }) {
  let tension = story.currentAct || 1

  // Combat raises tension
  if (combat) tension = Math.min(5, tension + 2)

  // Urgent quests raise tension
  const urgentQuests = (story.activeQuests || []).filter(q => q.urgency === 'urgent')
  if (urgentQuests.length > 0) tension = Math.min(5, tension + 1)

  // Recent failures raise tension
  const recentMessages = (messages || []).slice(-6)
  const recentFailures = recentMessages.filter(m =>
    m.type === 'roll-result' && m.rollData?.result === 'failure'
  ).length
  tension = Math.min(5, tension + Math.floor(recentFailures / 2))

  return tension
}

// ── Session summariser ────────────────────────────────────────────────────────

/**
 * Generate a compact session summary for long-campaign memory management.
 * Called at session end or when context window gets heavy.
 * The summary replaces old messages in the history to free token budget.
 */
export async function summariseSession({ messages, world, characters, story, config }) {
  const narrativeMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'PLAYER' : 'DM'}: ${m.content}`)
    .join('\n\n')

  if (!narrativeMessages.trim()) return null

  const charNames = Object.values(characters || {}).map(c => c.name).join(', ')

  const prompt = `Summarise this TTRPG session for "${world?.name || 'the campaign'}".
Characters: ${charNames}
Current location: ${world?.locations?.[world?.currentLocation]?.name || 'unknown'}

SESSION TRANSCRIPT:
${narrativeMessages.slice(0, 8000)}

Write a compact 3–5 sentence summary covering:
- What happened and where
- Key decisions the players made
- NPCs met and relationships formed
- Any quests started, advanced, or completed
- How the session ended

Write in past tense. Be specific — include character names, place names, and consequences.`

  let summary = ''
  await sendToLlm({
    system: 'You are summarising a TTRPG session. Be concise, specific, and capture the most story-relevant events. Write in past tense.',
    messages: [{ role: 'user', content: prompt }],
    config: config.llm,
    maxTokens: 300,
    temperature: 0.6,
    onChunk: (chunk) => { summary += chunk },
  })

  return {
    id: `summary_${Date.now()}`,
    createdAt: Date.now(),
    text: summary.trim(),
    messageCount: messages.length,
    act: story?.currentAct,
    location: world?.locations?.[world?.currentLocation]?.name,
  }
}

// ── DM response parser extensions ────────────────────────────────────────────

/**
 * Parse story-relevant tags from DM output beyond the base parser.
 * Handles quest updates, location changes, NPC disposition changes.
 */
export function parseStoryTags(raw) {
  const updates = {
    questUpdates: [],    // [QUEST_UPDATE: id | new objective]
    questComplete: [],   // [QUEST_DONE: id]
    locationChange: null, // [LOCATION: id | name]
    npcUpdates: [],      // [NPC_UPDATE: id | field=value]
    actAdvance: false,   // [ACT_ADVANCE]
    newLore: [],         // [LORE: title | text]
  }

  // Quest update
  const questUpdateRe = /\[QUEST_UPDATE:\s*([^\]]+)\]/gi
  let m
  while ((m = questUpdateRe.exec(raw)) !== null) {
    const [id, objective] = m[1].split('|').map(s => s.trim())
    updates.questUpdates.push({ id, objective })
  }

  // Quest complete
  const questDoneRe = /\[QUEST_DONE:\s*([^\]]+)\]/gi
  while ((m = questDoneRe.exec(raw)) !== null) {
    updates.questComplete.push(m[1].trim())
  }

  // Location change
  const locRe = /\[LOCATION:\s*([^\]]+)\]/i
  const locMatch = raw.match(locRe)
  if (locMatch) {
    const [id, name] = locMatch[1].split('|').map(s => s.trim())
    updates.locationChange = { id, name }
  }

  // NPC update (disposition, mood, etc.)
  const npcRe = /\[NPC_UPDATE:\s*([^\]]+)\]/gi
  while ((m = npcRe.exec(raw)) !== null) {
    const parts = m[1].split('|').map(s => s.trim())
    if (parts.length >= 2) {
      const [idOrName, ...fieldParts] = parts
      updates.npcUpdates.push({ idOrName, fields: fieldParts })
    }
  }

  // Act advance signal
  if (/\[ACT_ADVANCE\]/i.test(raw)) {
    updates.actAdvance = true
  }

  // New lore entry
  const loreRe = /\[LORE:\s*([^\]]+)\]/gi
  while ((m = loreRe.exec(raw)) !== null) {
    const [title, text] = m[1].split('|').map(s => s.trim())
    if (title && text) updates.newLore.push({ title, text })
  }

  return updates
}

/**
 * Apply parsed story tag updates to the game store state.
 * Returns a partial store update object.
 */
export function applyStoryUpdates(storyUpdates, currentStory, currentWorld) {
  let story = { ...currentStory }
  let world = { ...currentWorld }

  // Quest updates
  storyUpdates.questUpdates.forEach(({ id, objective }) => {
    story.activeQuests = updateQuestObjective(story.activeQuests || [], id, objective)
  })

  // Quest completions
  storyUpdates.questComplete.forEach(questId => {
    const result = completeQuest(
      story.activeQuests || [],
      story.completedQuests || [],
      questId
    )
    story.activeQuests = result.activeQuests
    story.completedQuests = result.completedQuests
  })

  // Location change
  if (storyUpdates.locationChange) {
    const { id, name } = storyUpdates.locationChange
    world.currentLocation = id
    // Add stub location if it doesn't exist yet
    if (id && !world.locations?.[id]) {
      world.locations = {
        ...(world.locations || {}),
        [id]: {
          id,
          name: name || id,
          type: 'location',
          description: '',
          expanded: false,  // Will be expanded when player arrives
        },
      }
    }
  }

  // NPC updates
  storyUpdates.npcUpdates.forEach(({ idOrName, fields }) => {
    const npcId = Object.keys(world.npcs || {}).find(id =>
      id === idOrName || world.npcs[id]?.name?.toLowerCase() === idOrName.toLowerCase()
    )
    if (npcId && world.npcs) {
      world.npcs = { ...world.npcs }
      fields.forEach(field => {
        const [key, value] = field.split('=').map(s => s.trim())
        if (key) world.npcs[npcId] = { ...world.npcs[npcId], [key]: value }
      })
    }
  })

  // New lore
  storyUpdates.newLore.forEach(entry => {
    world.discoveredLore = [...(world.discoveredLore || []), entry]
  })

  return { story, world }
}
