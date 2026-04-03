// Two-pass NPC name tokenization filter.
// Pass 1: extract all [VOICE:Name] tags across the entire dataset, shatter each
//         name into lowercase tokens (minus ignored words), build a global freq map.
// Pass 2: purge any entry where a token in any NPC name exceeds the threshold.
// This catches variants like "Mira" and "Mira of the Woods" at the token level.

const IGNORE_WORDS = new Set([
  // Articles / prepositions
  'the', 'a', 'an', 'of', 'in', 'from', 'at', 'by', 'for', 'to', 'and', 'or',
  // Titles
  'captain', 'lord', 'lady', 'professor', 'doctor', 'dr', 'sir', 'dame',
  'master', 'mistress', 'elder', 'chief', 'king', 'queen', 'prince', 'princess',
  'duke', 'duchess', 'baron', 'baroness', 'count', 'countess', 'knight',
  'sergeant', 'general', 'admiral', 'commander', 'lieutenant', 'guard', 'herald',
  'witch', 'wizard', 'sage', 'hunter', 'ranger', 'priest', 'monk', 'bard',
])

const THRESHOLD = 3

const VOICE_RE = /\[VOICE:([^\]]+)\]/g

/** Extract the unique set of NPC names used in one example's conversations. */
function extractNames(conversations) {
  const names = new Set()
  for (const turn of conversations) {
    if (!turn.value) continue
    for (const m of turn.value.matchAll(VOICE_RE)) names.add(m[1])
  }
  return names
}

/** Break a name into lowercase non-ignored tokens. */
function shatter(name) {
  return name.toLowerCase().split(/[\s\-_'.,]+/).filter(t => t.length > 1 && !IGNORE_WORDS.has(t))
}

/**
 * Apply the two-pass name filter.
 * Returns { filtered: Example[], removed: number, tokenFreq: Map<string,number> }
 */
function applyNameFilter(examples) {
  // ── Pass 1: build global token frequency map ─────────────────────────────
  const freq = new Map()
  for (const ex of examples) {
    const names = extractNames(ex.conversations || [])
    // Count each token at most once per example so one entry can't inflate the map
    const seen = new Set()
    for (const name of names) {
      for (const token of shatter(name)) {
        if (!seen.has(token)) {
          freq.set(token, (freq.get(token) || 0) + 1)
          seen.add(token)
        }
      }
    }
  }

  // ── Pass 2: purge any entry with an over-represented name token ──────────
  const filtered = examples.filter(ex => {
    const names = extractNames(ex.conversations || [])
    for (const name of names) {
      for (const token of shatter(name)) {
        if ((freq.get(token) || 0) > THRESHOLD) return false
      }
    }
    return true
  })

  return { filtered, removed: examples.length - filtered.length, tokenFreq: freq }
}

module.exports = { applyNameFilter }
