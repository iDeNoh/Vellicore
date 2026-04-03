/**
 * nameGenerator.js — generates and manages a pool of NPC names for Petricore.
 *
 * Names are generated once via a single LLM call before generation starts,
 * then assigned deterministically — the model never picks its own NPC names.
 */

import { sendToLlm } from '@/services/llm/llmService'

/**
 * generateNamePool()
 * Makes a single LLM call requesting diverse NPC names.
 * Saves to DB and updates the store's namePool.
 * Returns the array of name objects.
 */
export async function generateNamePool(targetCount = 200, llmConfig, onProgress) {
  onProgress?.('Sending name generation request to LLM…')

  const prompt = `Generate ${targetCount} unique NPC names for a tabletop RPG dataset.

Requirements:
- Diverse cultural origins: include names that feel European, East Asian, Middle Eastern, African, Latin American, Slavic, Norse, and invented/fantastical
- Mix of genders: roughly equal male/female/ambiguous
- Avoid famous fictional characters, real celebrities, or overused fantasy names (no Gandalf, Aragorn, Legolas, etc.)
- No two names should be too similar (no John and Jon, no Sara and Sarah)
- Include a range of feels: ancient/mythic, grounded/realistic, futuristic/invented, gritty/streetwise
- Some names should work across genres; some should be genre-specific

Respond with ONLY a JSON array. No explanation. No markdown fences. Each entry:
{"name":"Full Name","gender":"m|f|n","cultural_origin":"descriptor","genre_tags":["fantasy","horror","scifi","grounded","weird","any"]}`

  const raw = await sendToLlm({
    system: '',
    messages: [{ role: 'user', content: prompt }],
    config: llmConfig,
    maxTokens: 8192,
    temperature: 0.9,
  })

  onProgress?.('Parsing name list…')

  // Extract JSON array from the response
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('LLM did not return a JSON array for name pool')

  const parsed = JSON.parse(match[0])
  if (!Array.isArray(parsed)) throw new Error('Name pool response is not an array')

  // Deduplicate by name (case-insensitive)
  const seen = new Set()
  const names = parsed
    .filter(n => n?.name && typeof n.name === 'string')
    .filter(n => {
      const key = n.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(n => ({
      id: crypto.randomUUID(),
      name: n.name.trim(),
      gender: n.gender || 'n',
      cultural_origin: n.cultural_origin || '',
      genre_tags: Array.isArray(n.genre_tags) ? n.genre_tags : ['any'],
      use_count: 0,
      last_used_at: null,
    }))

  onProgress?.(`Generated ${names.length} names — saving to database…`)

  // Save to DB
  if (window.tavern?.petricore) {
    await window.tavern.petricore.saveNames(names)
  }

  return names
}

/**
 * assignNames()
 * Picks names appropriate for the genre from the pool.
 * Returns `count` names, avoiding any already used in this example.
 * Prioritises least-recently-used names.
 */
export function assignNames(namePool, genre, count = 1, usedInExample = []) {
  if (!namePool || namePool.length === 0) {
    // Fallback generic names if pool is empty
    return Array.from({ length: count }, (_, i) => `NPC${i + 1}`)
  }

  // Filter by genre compatibility — prefer names with a matching genre_tag or 'any'
  const compatible = namePool.filter(n =>
    !usedInExample.includes(n.name) &&
    (n.genre_tags?.includes('any') || n.genre_tags?.includes(genre) || n.genre_tags?.length === 0)
  )

  // Fall back to all names (excluding already used) if not enough compatible ones
  const pool = compatible.length >= count
    ? compatible
    : namePool.filter(n => !usedInExample.includes(n.name))

  // Sort by use_count ASC then last_used_at ASC (least used first)
  const sorted = [...pool].sort((a, b) => {
    if (a.use_count !== b.use_count) return a.use_count - b.use_count
    return (a.last_used_at || 0) - (b.last_used_at || 0)
  })

  return sorted.slice(0, count).map(n => n.name)
}
