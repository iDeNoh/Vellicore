/**
 * NPC Persistence — Module 3
 *
 * NPCs are living entities whose state changes as the story progresses.
 * This module manages:
 *  - Disposition tracking (friendly → hostile based on player actions)
 *  - Memory flags (what each NPC knows about the players)
 *  - Presence tracking (which location each NPC is in)
 *  - Relationship web (how NPCs relate to each other and factions)
 *
 * NPC state is stored in the world.npcs map in the game store and
 * periodically saved to the DB so it survives session ends.
 */

// ── Disposition management ────────────────────────────────────────────────────

export const DISPOSITIONS = {
  devoted:   { label: 'Devoted',   color: 'forest',  description: 'Would do almost anything for the party' },
  friendly:  { label: 'Friendly',  color: 'forest',  description: 'Well-disposed, willing to help' },
  neutral:   { label: 'Neutral',   color: 'parchment', description: 'No strong feelings either way' },
  suspicious:{ label: 'Suspicious',color: 'gold',    description: 'Wary, watching carefully' },
  hostile:   { label: 'Hostile',   color: 'crimson', description: 'Actively opposed' },
  fearful:   { label: 'Fearful',   color: 'arcane',  description: 'Afraid — may flee or comply from fear' },
}

const DISPOSITION_SCALE = ['hostile', 'suspicious', 'neutral', 'friendly', 'devoted']

/**
 * Shift an NPC's disposition up or down the scale.
 * delta: positive = more friendly, negative = more hostile
 */
export function shiftDisposition(currentDisposition, delta) {
  const idx = DISPOSITION_SCALE.indexOf(currentDisposition)
  if (idx === -1) return 'neutral'
  const newIdx = Math.max(0, Math.min(DISPOSITION_SCALE.length - 1, idx + delta))
  return DISPOSITION_SCALE[newIdx]
}

// ── NPC memory ────────────────────────────────────────────────────────────────

/**
 * Add a memory to an NPC — something they now know about the players.
 */
export function addNpcMemory(npc, memory) {
  return {
    ...npc,
    memories: [...(npc.memories || []), {
      text: memory,
      timestamp: Date.now(),
    }].slice(-10),  // Keep last 10 memories per NPC
  }
}

/**
 * Build the NPC memory string for injection into the DM prompt.
 * Only included for NPCs currently present in the scene.
 */
export function getNpcMemoryContext(npc) {
  if (!npc.memories?.length) return ''
  return `Knows about players: ${npc.memories.map(m => m.text).join('; ')}`
}

// ── Presence tracking ─────────────────────────────────────────────────────────

/**
 * Move an NPC to a new location.
 */
export function moveNpc(npc, newLocationId) {
  return { ...npc, locationId: newLocationId, isPresent: false }
}

/**
 * Get all NPCs present in a given location.
 */
export function getNpcsAtLocation(npcs, locationId) {
  return Object.values(npcs || {}).filter(npc =>
    npc.locationId === locationId && npc.isPresent !== false
  )
}

// ── NPC summary for DM context ────────────────────────────────────────────────

/**
 * Build a compact NPC context string for the DM system prompt.
 * Only includes NPCs in the current scene — keeps token budget lean.
 */
export function buildNpcContextString(npcs, currentLocationId) {
  const present = getNpcsAtLocation(npcs, currentLocationId)
  if (present.length === 0) return ''

  const lines = ['NPCs IN SCENE:']
  present.forEach(npc => {
    let line = `  ${npc.name} (${npc.role || 'unknown'}, ${npc.disposition || 'neutral'})`
    if (npc.personality) line += ` — ${npc.personality}`
    if (npc.currentMood) line += ` [${npc.currentMood}]`
    lines.push(line)
    if (npc.memories?.length) {
      lines.push(`    ${getNpcMemoryContext(npc)}`)
    }
  })

  return lines.join('\n')
}

// ── Voice assignment ──────────────────────────────────────────────────────────

/**
 * Assign a Kokoro TTS voice to an NPC based on their characteristics.
 * Called once when an NPC is first generated.
 */
export function assignNpcVoice(npc) {
  const available = [
    'af_sarah', 'af_bella', 'am_adam', 'am_michael',
    'bf_emma', 'bm_george', 'bm_lewis',
  ]

  // Simple deterministic assignment based on name hash
  const hash = npc.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const voiceIdx = hash % available.length

  return available[voiceIdx]
}

// ── Faction relationship ──────────────────────────────────────────────────────

/**
 * Get an NPC's relationship to the player characters given faction standings.
 * Used to colour DM descriptions of NPC behaviour.
 */
export function getNpcFactionContext(npc, factions, playerFactionStandings) {
  if (!npc.factionId || !factions?.[npc.factionId]) return null

  const faction = factions[npc.factionId]
  const standing = playerFactionStandings?.[npc.factionId] || 'neutral'

  return {
    faction: faction.name,
    standing,
    description: faction.description,
  }
}
