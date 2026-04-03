/**
 * validator.js — validates a generated Petricore example.
 * Returns { valid, errors, warnings }
 * Errors = hard failures (example flagged has_errors).
 * Warnings = soft flags shown in viewer.
 */

const TAG_PATTERNS = {
  VOICE:        /\[VOICE:[^\]]+\]"[^"]+"/,
  ROLL:         /\[ROLL:[^\]]+\]/,
  ROLL_RESULTS: /\[ROLL_RESULTS:[^\]]*\]|\[ROLL RESULTS\]/,
  IMAGE:        /\[IMAGE:[^\]]+\]/,
  FLAG:         /\[FLAG:[^\]]+\]/,
  QUEST:        /\[QUEST:[^\]]+\]/,
  QUEST_UPDATE: /\[QUEST_UPDATE:[^\]]+\]/,
  QUEST_DONE:   /\[QUEST_DONE:[^\]]+\]/,
  LOCATION:     /\[LOCATION:[^\]]+\]/,
  NPC_UPDATE:   /\[NPC_UPDATE:[^\]]+\]/,
  LORE:         /\[LORE:[^\]]+\]/,
  COMBAT:       /\[COMBAT:[^\]]+\]/,
  ACT_ADVANCE:  /\[ACT_ADVANCE\]/,
  OOC:          /\[OOC:[^\]]+\]/,
  GAME_OVER:    /\[GAME_OVER:[^\]]+\]/,
}

const FORBIDDEN_PATTERNS = [
  { re: /<[a-zA-Z][^>]*>/, label: 'XML/HTML tag' },
  { re: /what do you do\?/i, label: '"What do you do?" ending' },
  { re: /^#{1,6}\s/m, label: 'Markdown header' },
]

const VALID_GAME_OVER_OUTCOMES = ['victory', 'defeat', 'ambiguous']
const VALID_FROM_VALUES = ['system', 'player', 'dm']

export function validateExample(parsed, task) {
  const errors = []
  const warnings = []

  // 1. Required fields
  if (!parsed || typeof parsed !== 'object') {
    errors.push('Response is not a valid JSON object')
    return { valid: false, errors, warnings }
  }
  if (!Array.isArray(parsed.conversations) || parsed.conversations.length === 0) {
    errors.push('Missing or empty conversations array')
    return { valid: false, errors, warnings }
  }

  const convs = parsed.conversations
  const dmTurns = convs.filter(c => c.from === 'dm')
  const playerTurns = convs.filter(c => c.from === 'player')

  // 2. Valid `from` values
  convs.forEach((c, i) => {
    if (!VALID_FROM_VALUES.includes(c.from)) {
      errors.push(`Turn ${i}: invalid "from" value "${c.from}"`)
    }
    if (typeof c.value !== 'string' || c.value.trim() === '') {
      errors.push(`Turn ${i}: empty value`)
    }
  })

  // 3. Exchange count (player/dm pairs)
  const exchangeCount = Math.min(playerTurns.length, dmTurns.length)
  if (task?.exchangeCount && exchangeCount !== task.exchangeCount) {
    warnings.push(`Exchange count: expected ${task.exchangeCount}, got ${exchangeCount}`)
  }

  // 4. First turn should be system
  if (convs[0]?.from !== 'system') {
    warnings.push('First conversation turn is not "system"')
  }

  const dmText = dmTurns.map(t => t.value).join('\n')

  // 5. Forbidden patterns in DM text
  FORBIDDEN_PATTERNS.forEach(({ re, label }) => {
    if (re.test(dmText)) errors.push(`Forbidden pattern found: ${label}`)
  })

  // 6. Tag validation
  const declaredTags = Array.isArray(parsed.tags_present) ? parsed.tags_present : []

  declaredTags.forEach(tag => {
    const pattern = TAG_PATTERNS[tag]
    if (!pattern) {
      warnings.push(`Unknown tag declared: ${tag}`)
      return
    }
    if (!pattern.test(dmText)) {
      errors.push(`Tag ${tag} declared in tags_present but not found in DM responses`)
    }
  })

  // 7. VOICE tag pairing — every [VOICE:Name] must be immediately followed by "
  const voiceTagRe = /\[VOICE:[^\]]+\](?!")/g
  const unpaired = dmText.match(voiceTagRe)
  if (unpaired?.length) {
    errors.push(`${unpaired.length} [VOICE:] tag(s) not immediately followed by a quoted string`)
  }

  // 8. NPC names in VOICE tags must match pre-assigned names
  if (task?.npcNames?.length > 0) {
    const voiceNames = [...dmText.matchAll(/\[VOICE:([^\]]+)\]/g)].map(m => m[1].trim())
    voiceNames.forEach(name => {
      if (!task.npcNames.includes(name)) {
        errors.push(`VOICE tag uses unassigned NPC name: "${name}"`)
      }
    })
  }

  // 9. GAME_OVER outcome validation
  const gameOverMatch = dmText.match(/\[GAME_OVER:\s*([^|]+)/)
  if (gameOverMatch) {
    const outcome = gameOverMatch[1].trim().toLowerCase()
    if (!VALID_GAME_OVER_OUTCOMES.includes(outcome)) {
      errors.push(`[GAME_OVER] has invalid outcome: "${outcome}"`)
    }
  }

  // 10. Dialogue structure check
  const hasVoice = /\[VOICE:[^\]]+\]"/.test(dmText)
  if (task?.dialogueStructure === 'none' && hasVoice) {
    errors.push('Dialogue structure is "none" but VOICE tags found')
  }
  if (task?.dialogueStructure && task.dialogueStructure !== 'none' && !hasVoice) {
    warnings.push(`Dialogue structure is "${task.dialogueStructure}" but no VOICE tags found`)
  }

  // 11. IMAGE type validation
  const imageMatches = [...dmText.matchAll(/\[IMAGE:\s*([^|—\]]+)/g)]
  const validImageTypes = ['scene', 'portrait', 'item', 'map', 'action', 'atmosphere']
  imageMatches.forEach(m => {
    const imgType = m[1].trim().toLowerCase()
    if (!validImageTypes.includes(imgType)) {
      warnings.push(`[IMAGE] has unknown type: "${imgType}"`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
