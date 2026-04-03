/**
 * nameGenerator.js — generates and manages a pool of NPC names for Petricore.
 *
 * Names are generated once via a single LLM call before generation starts,
 * then assigned deterministically — the model never picks its own NPC names.
 */

import { sendToLlm } from '@/services/llm/llmService'

const ORIGIN_LABELS = {
  european:       'European (Western, Central, Southern, Mediterranean)',
  east_asian:     'East Asian (Chinese, Japanese, Korean, Vietnamese)',
  middle_eastern: 'Middle Eastern & North African (Arabic, Persian, Turkish, Hebrew)',
  african:        'Sub-Saharan African (Yoruba, Swahili, Zulu, Amharic, etc.)',
  latin_american: 'Latin American & Indigenous American (Spanish-origin, Nahuatl, Quechua, etc.)',
  slavic:         'Slavic & Eastern European (Russian, Polish, Czech, Serbian, etc.)',
  norse:          'Norse & Old Germanic (Viking-era, Anglo-Saxon, Old Norse)',
  invented:       'Invented / Fantastical (no real-world cultural basis — sounds original and unplaceable)',
}

const STYLE_LABELS = {
  mythic:     'Ancient & mythic — evokes gods, heroes, lost civilisations; sounds weighty and timeless',
  grounded:   'Grounded & realistic — could belong to an ordinary person in a historical setting',
  futuristic: 'Futuristic & coined — feels invented, sci-fi, or cyberpunk; may use unusual consonants or truncation',
  gritty:     'Gritty & streetwise — nicknames, underworld names, working-class; punchy and informal',
}

/**
 * extractNameArray()
 * Robustly extracts a JSON array from an LLM response that may contain
 * markdown fences, extra text, smart quotes, or individual malformed entries.
 */
function extractNameArray(raw) {
  // 1. Strip markdown code fences
  let text = raw.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()

  // 2. Normalise curly/smart quotes to straight quotes
  text = text
    .replace(/[\u2018\u2019]/g, "'")   // ' '  → '
    .replace(/\u201C/g, '"')            // "    → "
    .replace(/\u201D/g, '"')            // "    → "

  // 3. Find the outermost JSON array using balanced bracket walking
  const start = text.indexOf('[')
  if (start === -1) return null

  let depth = 0, inString = false, escape = false, end = -1
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\' && inString) { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '[') depth++
    else if (c === ']') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return null

  const jsonStr = text.slice(start, end + 1)

  // 4. Try to parse the full array first
  try {
    const arr = JSON.parse(jsonStr)
    return Array.isArray(arr) ? arr : null
  } catch (_) {
    // 5. Fallback: parse entry by entry — find each {...} object and try individually
    const results = []
    const objRe = /\{[^{}]*\}/g
    let m
    while ((m = objRe.exec(jsonStr)) !== null) {
      try {
        const entry = JSON.parse(m[0])
        if (entry?.name) results.push(entry)
      } catch (_) { /* skip malformed entry */ }
    }
    return results.length > 0 ? results : null
  }
}

/**
 * generateNamePool()
 * Makes a single LLM call requesting diverse NPC names based on config.
 * Saves to DB and returns the array of name objects.
 */
export async function generateNamePool(namePoolConfig, llmConfig, onProgress) {
  const {
    totalNames = 200,
    origins = {},
    genderSplit = { m: 40, f: 40, n: 20 },
    styles = {},
    nameInstructions = '',
  } = namePoolConfig

  onProgress?.('Building generation prompt…')

  // Build origin lines with weight multipliers
  const enabledOrigins = Object.entries(origins).filter(([, v]) => v.enabled)
  const originLines = enabledOrigins.length > 0
    ? enabledOrigins.map(([k, v]) =>
        `  - ${ORIGIN_LABELS[k] || k}${v.weight > 1 ? ` (weight ${v.weight}× — generate proportionally more of these)` : ''}`
      ).join('\n')
    : '  - Any cultural origin (no restrictions)'

  // Build gender instruction
  const gTotal = genderSplit.m + genderSplit.f + genderSplit.n
  const mPct = gTotal > 0 ? Math.round(genderSplit.m * 100 / gTotal) : 34
  const fPct = gTotal > 0 ? Math.round(genderSplit.f * 100 / gTotal) : 33
  const nPct = 100 - mPct - fPct

  // Build style lines
  const enabledStyles = Object.entries(styles).filter(([, v]) => v.enabled)
  const styleLines = enabledStyles.length > 0
    ? enabledStyles.map(([k, v]) =>
        `  - ${STYLE_LABELS[k] || k}${v.weight > 1 ? ` (weight ${v.weight}×)` : ''}`
      ).join('\n')
    : '  - Mix of all feels (mythic, grounded, futuristic, gritty)'

  const prompt = `Generate ${totalNames} unique NPC names for a tabletop RPG fine-tuning dataset.

CULTURAL ORIGINS — distribute names across these origins (higher weight = more names from that origin):
${originLines}

GENDER — target distribution: ~${mPct}% male (m), ~${fPct}% female (f), ~${nPct}% neutral/ambiguous (n)
Use exactly "m", "f", or "n" for the gender field.

NAME FEEL — draw from these styles (higher weight = more of that style):
${styleLines}

HARD RULES:
- No famous fictional characters, real celebrities, or iconic fantasy names (no Gandalf, Aragorn, Legolas, Hermione, Drizzt, Geralt, etc.)
- No two names too similar in spelling or sound (no John and Jon, no Sara and Sarah, no Kael and Kael)
- Each name should be distinct in rhythm and feel from the others — avoid repeating the same root or suffix pattern too often
- Mix of first-name-only (e.g. "Tomas") and full two-part names (e.g. "Sera Vann") — roughly equal split
- Names should feel like real characters, not word salad

${nameInstructions.trim() ? `ADDITIONAL REQUIREMENTS:\n${nameInstructions.trim()}\n` : ''}
Respond with ONLY a JSON array. No explanation. No markdown fences. No text before or after the array.
Each entry must be exactly:
{"name":"Full Name","gender":"m|f|n","cultural_origin":"short descriptor","genre_tags":["fantasy","horror","scifi","grounded","weird","any"]}`

  onProgress?.('Sending name generation request to LLM…')

  const raw = await sendToLlm({
    system: '',
    messages: [{ role: 'user', content: prompt }],
    config: llmConfig,
    maxTokens: 8192,
    temperature: 0.9,
  })

  onProgress?.('Parsing name list…')

  const parsed = extractNameArray(raw)
  if (!parsed) throw new Error('LLM did not return a parseable JSON array for name pool')

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
    return Array.from({ length: count }, (_, i) => `NPC${i + 1}`)
  }

  const compatible = namePool.filter(n =>
    !usedInExample.includes(n.name) &&
    (n.genre_tags?.includes('any') || n.genre_tags?.includes(genre) || n.genre_tags?.length === 0)
  )

  const pool = compatible.length >= count
    ? compatible
    : namePool.filter(n => !usedInExample.includes(n.name))

  const sorted = [...pool].sort((a, b) => {
    if (a.use_count !== b.use_count) return a.use_count - b.use_count
    return (a.last_used_at || 0) - (b.last_used_at || 0)
  })

  return sorted.slice(0, count).map(n => n.name)
}
