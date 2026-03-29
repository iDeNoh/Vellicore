/**
 * TTS Service — Module 8
 *
 * Full Kokoro TTS pipeline:
 *  - Dialogue parsing — splits DM narration from NPC speech
 *  - Per-NPC voice assignment and persistence
 *  - Segment-by-segment streaming with minimal latency
 *  - Audio queue with proper cancellation
 *  - Volume, speed, and voice controls
 *  - Graceful fallback when Kokoro is unavailable
 */

// ── Voice registry ────────────────────────────────────────────────────────────

export const KOKORO_VOICES = {
  // American English
  af_sarah:   { label: 'Sarah',   gender: 'f', accent: 'american', description: 'Warm, friendly female' },
  af_bella:   { label: 'Bella',   gender: 'f', accent: 'american', description: 'Clear, bright female' },
  af_nicole:  { label: 'Nicole',  gender: 'f', accent: 'american', description: 'Soft, whispered female' },
  af_sky:     { label: 'Sky',     gender: 'f', accent: 'american', description: 'Airy, gentle female' },
  am_adam:    { label: 'Adam',    gender: 'm', accent: 'american', description: 'Deep, resonant male' },
  am_michael: { label: 'Michael', gender: 'm', accent: 'american', description: 'Rich, warm male' },
  // British English
  bf_emma:    { label: 'Emma',    gender: 'f', accent: 'british',  description: 'Refined British female' },
  bf_isabella:{ label: 'Isabella',gender: 'f', accent: 'british',  description: 'Elegant British female' },
  bm_george:  { label: 'George',  gender: 'm', accent: 'british',  description: 'Distinguished British male' },
  bm_lewis:   { label: 'Lewis',   gender: 'm', accent: 'british',  description: 'Measured British male' },
  bm_daniel:  { label: 'Daniel',  gender: 'm', accent: 'british',  description: 'Authoritative British male' },
}

export const VOICE_IDS = Object.keys(KOKORO_VOICES)
export const DEFAULT_DM_VOICE = 'bm_george'

// Chatterbox Turbo paralinguistic tags — embedded inside dialogue quotes.
// Kept in text sent to Chatterbox; stripped for Kokoro and all display.
export const PARALINGUISTIC_TAGS = ['laugh', 'chuckle', 'sigh', 'gasp', 'cough', 'clear throat', 'sniff', 'groan', 'shush']
export const PARALINGUISTIC_RE = /\[(?:laugh|chuckle|sigh|gasp|cough|clear\s+throat|sniff|groan|shush)\]/gi

// NPC voices — gender-split pools, DM voice excluded at assignment time
const NPC_FEMALE_VOICES = ['af_sarah', 'af_bella', 'af_nicole', 'af_sky', 'bf_emma', 'bf_isabella']
const NPC_MALE_VOICES   = ['am_adam', 'am_michael', 'bm_george', 'bm_lewis', 'bm_daniel']
const NPC_VOICE_POOL    = [...NPC_FEMALE_VOICES, ...NPC_MALE_VOICES]  // fallback (no gender)

// In-memory NPC voice assignment (npcId → voiceId)
const npcVoiceMap = {}
// Chatterbox NPC voice assignment (npcId → predefined_voice_id string)
const chatterboxNpcVoiceMap = {}

// ── Voice gender inference ────────────────────────────────────────────────────

// Common given-name lists for probabilistic gender inference from voice names.
// Short and focused — not exhaustive, but covers most TTS voice naming conventions.
const FEMALE_NAMES = new Set([
  'sarah','bella','nicole','sky','emma','isabella','alice','anna','amy','aria',
  'zoe','lily','rose','grace','ivy','luna','nova','aurora','eve','claire',
  'jane','kate','mary','sophie','julia','elena','diana','nadia','mia','lea',
  'sofia','ava','olivia','ella','emily','hannah','laura','helen','victoria',
  'scarlett','violet','ruby','amber','crystal','jade','jasmine','iris',
])
const MALE_NAMES = new Set([
  'adam','michael','george','lewis','daniel','james','john','david','robert',
  'william','thomas','henry','charles','edward','richard','joseph','benjamin',
  'samuel','matthew','andrew','christopher','anthony','mark','paul','ryan',
  'alex','eric','kevin','brian','scott','jason','tim','carl','sean','oscar',
  'victor','sebastian','ethan','noah','liam','oliver','leo','max','felix',
  'peter','simon','tony','derek','terry','gary','barry','neil','clint',
])
const NEUTRAL_NAMES = new Set([
  'river','alex','jordan','casey','sam','morgan','taylor','robin','quinn',
  'avery','sage','remi','remy','ash','charlie','drew','cameron','peyton',
  'skyler','emery','finley','harley','jesse','kai','kendall','kerry',
])

/**
 * Infer the likely gender of a TTS voice from its name/filename.
 *
 * Returns a probability distribution: { female, male, neutral }
 * where all three sum to 1.0. "neutral" covers agender/nonbinary/ambiguous voices.
 *
 * Handles:
 *  - Kokoro-style prefixes: af_/bf_ = female, am_/bm_ = male
 *  - Explicit gender substrings: _female, _male, female_, male_, _f_, _m_
 *  - Common name lists (above)
 *  - Fallback: equal probability
 */
export function inferVoiceGender(voiceName) {
  if (!voiceName) return { female: 0.33, male: 0.33, neutral: 0.34 }

  const raw = typeof voiceName === 'string' ? voiceName : (voiceName.display_name || voiceName.filename || '')
  const lower = raw.toLowerCase().replace(/[^a-z0-9]/g, '_')

  // Kokoro-style two-letter prefix: af_/bf_ = female, am_/bm_ = male
  if (/^[ab]f[_\s]/.test(lower)) return { female: 0.95, male: 0.02, neutral: 0.03 }
  if (/^[ab]m[_\s]/.test(lower)) return { female: 0.02, male: 0.95, neutral: 0.03 }

  // Explicit gender words
  if (/\b(female|woman|girl|feminine|femme)\b/.test(lower)) return { female: 0.92, male: 0.03, neutral: 0.05 }
  if (/\b(male|man|boy|masculine|masc)\b/.test(lower)) return { female: 0.03, male: 0.92, neutral: 0.05 }

  // Standalone _f_ or _m_ tokens (not inside longer words)
  if (/(?:^|_)f(?:_|$)/.test(lower)) return { female: 0.82, male: 0.05, neutral: 0.13 }
  if (/(?:^|_)m(?:_|$)/.test(lower)) return { female: 0.05, male: 0.82, neutral: 0.13 }

  // Extract word tokens and check name lists
  const tokens = raw.toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 2)
  let femaleScore = 0, maleScore = 0, neutralScore = 0

  for (const token of tokens) {
    if (FEMALE_NAMES.has(token)) femaleScore += 1
    else if (MALE_NAMES.has(token)) maleScore += 1
    else if (NEUTRAL_NAMES.has(token)) neutralScore += 1
  }

  if (femaleScore > 0 || maleScore > 0 || neutralScore > 0) {
    const total = femaleScore + maleScore + neutralScore
    return {
      female: femaleScore / total,
      male: maleScore / total,
      neutral: neutralScore / total,
    }
  }

  // Tonal/acoustic descriptors that lean gender
  if (/\b(deep|bass|baritone|gruff|raspy|gravelly|rough)\b/.test(lower)) return { female: 0.08, male: 0.77, neutral: 0.15 }
  if (/\b(soprano|alto|bright|light|airy|delicate|sweet)\b/.test(lower)) return { female: 0.75, male: 0.10, neutral: 0.15 }

  return { female: 0.33, male: 0.33, neutral: 0.34 }
}

// ── Chatterbox voice cache ────────────────────────────────────────────────────
// Populated on first use or when settings are tested. Keyed by URL so switching
// servers invalidates automatically.

let _chatterboxUrl = ''
let _chatterboxVoices = []  // array of predefined_voice_id strings

export function getChatterboxVoices() { return _chatterboxVoices }

export function setChatterboxVoicesCache(voices) {
  if (Array.isArray(voices)) _chatterboxVoices = voices
}

// Extract the API voice ID from a voice entry (string or { filename, display_name })
function chatterboxVoiceId(v) {
  return typeof v === 'string' ? v : (v?.filename || v?.display_name || '')
}

// Extract a human-readable label from a voice entry
export function chatterboxVoiceLabel(v) {
  return typeof v === 'string' ? v : (v?.display_name || v?.filename || '')
}

export async function fetchChatterboxVoices(url) {
  const base = (url || '').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/get_predefined_voices`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json().catch(() => null)
    const voices = Array.isArray(data) ? data : (data?.voices || [])
    _chatterboxUrl = base
    _chatterboxVoices = voices.filter(v => chatterboxVoiceId(v).length > 0)
    return _chatterboxVoices
  } catch {
    return []
  }
}

/**
 * Get or assign a voice for an NPC.
 * Assignment is deterministic by name hash and respects NPC gender when available.
 */
export function getNpcVoice(npc, dmVoice = DEFAULT_DM_VOICE) {
  if (npc.voiceId && KOKORO_VOICES[npc.voiceId]) return npc.voiceId
  if (npcVoiceMap[npc.id]) return npcVoiceMap[npc.id]

  const gender = (npc.gender || '').toLowerCase()
  let basePool
  if (gender === 'f' || gender === 'female') basePool = NPC_FEMALE_VOICES
  else if (gender === 'm' || gender === 'male') basePool = NPC_MALE_VOICES
  else basePool = NPC_VOICE_POOL

  const pool = basePool.filter(v => v !== dmVoice)
  const safePool = pool.length > 0 ? pool : NPC_VOICE_POOL.filter(v => v !== dmVoice)

  const hash = (npc.name || npc.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const voice = safePool[hash % safePool.length]
  npcVoiceMap[npc.id] = voice
  return voice
}

export function setNpcVoice(npcId, voiceId) {
  npcVoiceMap[npcId] = voiceId
}

export function clearVoiceAssignments() {
  Object.keys(npcVoiceMap).forEach(k => delete npcVoiceMap[k])
  Object.keys(chatterboxNpcVoiceMap).forEach(k => delete chatterboxNpcVoiceMap[k])
}

/**
 * Get or assign a Chatterbox predefined voice for an NPC.
 * Uses gender inference to prefer voices that match the NPC's gender,
 * falling back to hash-based selection when no gender match is found.
 */
export function getNpcVoiceChatterbox(npc, dmVoice, voices = []) {
  if (chatterboxNpcVoiceMap[npc.id]) return chatterboxNpcVoiceMap[npc.id]
  if (!voices.length) return dmVoice || ''

  const pool = voices.filter(v => chatterboxVoiceId(v) !== dmVoice)
  const safePool = pool.length > 0 ? pool : voices

  const npcGender = (npc.gender || '').toLowerCase()
  const hash = (npc.name || npc.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)

  // Try to find a gender-matched voice using inference
  let selectedVoice = null
  if (npcGender === 'f' || npcGender === 'female') {
    const femalePool = safePool.filter(v => {
      const g = inferVoiceGender(v)
      return g.female > 0.6
    })
    if (femalePool.length > 0) selectedVoice = femalePool[hash % femalePool.length]
  } else if (npcGender === 'm' || npcGender === 'male') {
    const malePool = safePool.filter(v => {
      const g = inferVoiceGender(v)
      return g.male > 0.6
    })
    if (malePool.length > 0) selectedVoice = malePool[hash % malePool.length]
  } else if (npcGender === 'n' || npcGender === 'nonbinary' || npcGender === 'neutral') {
    const neutralPool = safePool.filter(v => {
      const g = inferVoiceGender(v)
      return g.neutral > 0.4
    })
    if (neutralPool.length > 0) selectedVoice = neutralPool[hash % neutralPool.length]
  }

  // Fallback: hash-based pick from full pool
  if (!selectedVoice) selectedVoice = safePool[hash % safePool.length]

  const id = chatterboxVoiceId(selectedVoice)
  chatterboxNpcVoiceMap[npc.id] = id
  return id
}

// ── Dialogue parser ───────────────────────────────────────────────────────────

/**
 * A segment of a DM response for TTS purposes.
 */
// { type: 'narration' | 'dialogue', text: string, speaker: string | null }

/**
 * Split a DM response into narration and dialogue segments.
 *
 * Detects speech patterns:
 *   "Hello there," said the innkeeper.
 *   The guard growled, "Stand back!"
 *   "We must hurry," Mira whispered.
 *   *The ancient dragon bellowed:* "Foolish mortals!"
 *
 * Returns an array of segments, each with a type and optional speaker name.
 */
export function parseDialogueSegments(text, knownNpcs = {}) {
  if (!text?.trim()) return []

  const segments = []
  const lines = text.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const lineSegs = parseLineSegments(line, knownNpcs)
    segments.push(...lineSegs)
  }

  // Merge consecutive narration segments
  const merged = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && last.type === 'narration' && seg.type === 'narration') {
      last.text += ' ' + seg.text
    } else {
      merged.push({ ...seg })
    }
  }

  // Multi-pass speaker identification across segment boundaries.
  // Dialogue can be attributed before OR after the quote across line breaks:
  //   "Hello." Mara said.          ← attribution after, same line (handled by line parser)
  //   Mara stepped forward.        ← attribution before, different line
  //   "I know the way."
  for (let i = 0; i < merged.length; i++) {
    if (merged[i].type !== 'dialogue' || merged[i].speaker) continue

    // Look up to 2 narration segments before
    for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
      if (merged[j]?.type === 'narration') {
        const found = identifySpeaker(merged[j].text, knownNpcs)
        if (found) { merged[i].speaker = found; break }
      }
    }

    // Still unidentified — look up to 2 narration segments after
    if (!merged[i].speaker) {
      for (let j = i + 1; j <= Math.min(merged.length - 1, i + 2); j++) {
        if (merged[j]?.type === 'narration') {
          const found = identifySpeaker(merged[j].text, knownNpcs)
          if (found) { merged[i].speaker = found; break }
        }
      }
    }
  }

  // Final fallback: if exactly ONE NPC is mentioned anywhere in the entire response,
  // attribute all remaining unidentified dialogue to them.
  // This handles first-person NPC mode where the DM speaks AS the NPC — the name
  // may only appear once in an action beat far from the dialogue.
  const unidentified = merged.filter(s => s.type === 'dialogue' && !s.speaker)
  if (unidentified.length > 0) {
    const allNarration = merged.filter(s => s.type === 'narration').map(s => s.text).join(' ')
    const mentioned = Object.values(knownNpcs).filter(npc => {
      const full = npc.name.toLowerCase()
      const lower = allNarration.toLowerCase()
      if (lower.includes(full)) return true
      const first = full.split(' ')[0]
      return first.length > 2 && lower.includes(first)
    })
    if (mentioned.length === 1) {
      for (const seg of unidentified) {
        seg.speaker = mentioned[0].id
      }
    }
  }

  return merged.filter(s => s.text.trim().length > 0)
}

function parseLineSegments(line, knownNpcs) {
  const segments = []
  const normalizedLine = line
    .replace(/[\u201C\u201D\u201E\u201F\u275D\u275E]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u275B\u275C]/g, "'")

  // Match optional [VOICE:Name] tag (with optional trailing space) then a quoted string.
  // The tag provides explicit speaker attribution from the DM.
  const tokenRe = /(?:\[VOICE:([^\]]*)\]\s*)?("(?:[^"\\]|\\.)*")/g
  let lastIndex = 0
  let match

  while ((match = tokenRe.exec(normalizedLine)) !== null) {
    // Narration before this token — strip any orphaned [VOICE:] tags and emphasis markers
    const narrationRaw = normalizedLine.slice(lastIndex, match.index)
      .replace(/\[VOICE:[^\]]*\]/g, '')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_{2}[^_]+_{2}/g, '')
    if (narrationRaw.trim()) {
      segments.push({ type: 'narration', text: narrationRaw.trim(), speaker: null })
    }

    const voiceName = match[1]?.trim() || null
    const dialogueText = match[2].slice(1, -1)

    // [VOICE:Name] takes priority; fall back to name-in-narration heuristic
    let speaker = voiceName ? findNpcByName(voiceName, knownNpcs) : null
    if (!speaker) speaker = identifySpeaker(narrationRaw, knownNpcs)

    segments.push({ type: 'dialogue', text: dialogueText, speaker })
    lastIndex = match.index + match[0].length
  }

  // Remaining narration
  const remaining = normalizedLine.slice(lastIndex)
    .replace(/\[VOICE:[^\]]*\]/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{2}[^_]+_{2}/g, '')
  if (remaining.trim()) {
    segments.push({ type: 'narration', text: remaining.trim(), speaker: null })
  }

  return segments
}

/** Match a [VOICE:Name] tag value to a known NPC id. */
function findNpcByName(name, knownNpcs) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  for (const npc of Object.values(knownNpcs)) {
    if (npc.name.toLowerCase() === lower) return npc.id
    const first = npc.name.toLowerCase().split(' ')[0]
    if (first.length > 2 && first === lower) return npc.id
  }
  return null
}

function identifySpeaker(surroundingText, knownNpcs) {
  if (!surroundingText) return null
  const text = surroundingText.toLowerCase()

  for (const npc of Object.values(knownNpcs)) {
    const fullName = npc.name.toLowerCase()
    if (text.includes(fullName)) return npc.id
    // Also match first name alone (e.g. "Mara" when NPC is "Mara Chen")
    const firstName = fullName.split(' ')[0]
    if (firstName.length > 2 && text.includes(firstName)) return npc.id
  }

  return null
}

// ── Audio engine ──────────────────────────────────────────────────────────────

// Circuit breaker: set to true after a connection failure so we stop hammering
// a TTS server that isn't running. Cleared when the user explicitly tests the
// connection from Settings (call clearTtsCircuitBreaker()).
let _providerDown = false
export function clearTtsCircuitBreaker() { _providerDown = false }

let _state = {
  currentAudio: null,
  abortController: null,
  isPlaying: false,
  volume: 1.0,
  onStateChange: null,
}

function notifyStateChange() {
  _state.onStateChange?.(_state.isPlaying)
}

export function onSpeakingStateChange(cb) {
  _state.onStateChange = cb
}

/**
 * Speak a full DM response, routing narration and dialogue to correct voices.
 *
 * @param {object} opts
 * @param {string}   opts.text         - Full DM response text
 * @param {object}   opts.config       - App config
 * @param {object}   opts.npcs         - World NPCs map (id → npc)
 * @param {function} [opts.onStart]    - Called when audio starts
 * @param {function} [opts.onEnd]      - Called when all audio finishes
 * @param {function} [opts.onSegment]  - Called with each segment as it starts
 */
export async function speakDmResponse({ text, config, npcs = {}, onStart, onEnd, onSegment }) {
  if (!config.tts?.enabled) return
  if (!text?.trim()) return
  if (_providerDown) return

  // Cancel any in-progress speech
  stopSpeaking()

  const controller = new AbortController()
  _state.abortController = controller
  _state.isPlaying = true
  notifyStateChange()
  onStart?.()

  try {
    const cleanText = extractSpeakableText(text)
    const segments = parseDialogueSegments(cleanText, npcs)

    // Build a flat list of { text, voice } items across all segments/chunks
    const provider = config.tts?.provider || 'kokoro'
    const isChatterbox = provider === 'chatterbox'
    const dmVoice = isChatterbox
      ? (config.tts.chatterboxDmVoice || '')
      : (config.tts.dmVoice || DEFAULT_DM_VOICE)

    // Chatterbox requires a configured voice — bail with a clear console warning
    if (isChatterbox && !dmVoice) {
      console.warn('[TTS] Chatterbox: no DM voice configured. Go to Settings → Voice Narration to select one.')
      return
    }

    // Lazy-fetch Chatterbox voices if not yet loaded (e.g. auto-connect failed or wasn't fast enough)
    if (isChatterbox && _chatterboxVoices.length === 0 && config.tts.chatterboxUrl) {
      try {
        await fetchChatterboxVoices(config.tts.chatterboxUrl)
      } catch { /* silent */ }
    }

    const items = []
    for (const segment of segments) {
      if (!segment.text.trim()) continue
      let voice
      if (segment.type === 'dialogue' && segment.speaker) {
        const npc = npcs[segment.speaker] || { id: segment.speaker, name: segment.speaker }
        voice = isChatterbox
          ? getNpcVoiceChatterbox(npc, config.tts.chatterboxDmVoice, _chatterboxVoices)
          : getNpcVoice(npc, config.tts.dmVoice)
      } else {
        voice = dmVoice
      }
      onSegment?.({ segment, voice })
      const emo = inferEmotionalParams(segment.text)
      for (const chunk of chunkText(segment.text, 180)) {
        items.push({ text: chunk, voice, temperature: emo.temperature, speedFactor: emo.speedFactor })
      }
    }

    // Pipeline: prefetch next chunk's audio while current chunk is playing.
    // This hides Kokoro's generation latency behind playback, eliminating gaps.
    if (items.length === 0) return

    let nextFetch = fetchChunkAudio({ text: items[0].text, voice: items[0].voice, config, temperature: items[0].temperature, speedFactor: items[0].speedFactor })

    for (let i = 0; i < items.length; i++) {
      if (controller.signal.aborted) break

      // Wait for current chunk's audio to be ready
      const blob = await nextFetch

      // Kick off next chunk fetch immediately (overlaps with playback below)
      if (i + 1 < items.length && !controller.signal.aborted) {
        const next = items[i + 1]
        nextFetch = fetchChunkAudio({ text: next.text, voice: next.voice, config, temperature: next.temperature, speedFactor: next.speedFactor })
      }

      // Play current chunk — next chunk is fetching in the background
      await playBlob(blob, controller.signal)
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[TTS] Speak error:', err.message)
      // Connection failure — stop retrying until the user re-enables from Settings
      if (err.message?.includes('fetch failed') || err.message?.includes('Failed to fetch') || err.message?.includes('ECONNREFUSED')) {
        _providerDown = true
        console.warn('[TTS] Provider unreachable — TTS disabled for this session. Re-test the connection in Settings to re-enable.')
      }
    }
  } finally {
    _state.isPlaying = false
    _state.currentAudio = null
    _state.abortController = null
    notifyStateChange()
    onEnd?.()
  }
}

// ── Emotional TTS variation ───────────────────────────────────────────────────

/**
 * Analyse a text segment and return emotional TTS parameters.
 *   temperature : 0.75–1.25  (expressiveness/affect — higher = more animated)
 *   speedFactor : 0.80–1.00  (multiplied against the user's configured speed)
 *
 * Detected emotion categories, in priority order:
 *   urgent (!!+) → combat/action → anger → fear → sadness → whisper →
 *   mysterious → question → neutral
 */
function inferEmotionalParams(text) {
  if (!text) return { temperature: 0.88, speedFactor: 0.92 }
  const t = text.toLowerCase()

  // Multiple exclamation marks — maximum urgency
  if (/!!+/.test(text))
    return { temperature: 1.22, speedFactor: 1.00 }

  // Combat / urgent action words
  if (/\b(attack|charge|run|flee|duck|dodge|fire|kill|fight|hurry|quick|move|behind you|ambush|retreat|danger)\b/.test(t))
    return { temperature: 1.18, speedFactor: 0.98 }

  // Anger / confrontation (single ! also lands here)
  if (/\b(rage|fury|furious|angry|growl|snarl|yell|shout|bellow|roar|glare|enough|how dare|insolent)\b/.test(t) || /!/.test(text))
    return { temperature: 1.15, speedFactor: 0.96 }

  // Fear / dread / panic
  if (/\b(fear|terror|dread|tremble|shudder|horror|panic|afraid|nightmare|screams?)\b/.test(t))
    return { temperature: 1.10, speedFactor: 0.94 }

  // Sadness / grief / loss
  if (/\b(weep|sob|mourn|grief|sorrow|tears|cry|lost|gone|sorry|forgive|miss|died|dead|farewell)\b/.test(t))
    return { temperature: 0.78, speedFactor: 0.82 }

  // Whisper / reverence / hushed
  if (/\b(whisper|murmur|breathes|softly|quietly|hush|silent|still|alone|careful|listen)\b/.test(t))
    return { temperature: 0.76, speedFactor: 0.84 }

  // Mysterious / ominous / prophetic
  if (/\b(shadow|ancient|forgotten|cursed|doom|fate|prophecy|omen|foretold|darkness|descends|awakens)\b/.test(t))
    return { temperature: 1.02, speedFactor: 0.86 }

  // Questions / uncertainty
  if (/\?/.test(text) || /\b(perhaps|maybe|wonder|curious|odd|strange|unusual)\b/.test(t))
    return { temperature: 0.90, speedFactor: 0.90 }

  // Calm narration — default
  return { temperature: 0.88, speedFactor: 0.92 }
}

/**
 * Map temperature (0.75–1.25) to Chatterbox exaggeration (0.30–0.70).
 * Used for non-Turbo Chatterbox only; Turbo ignores exaggeration.
 */
function temperatureToExaggeration(temperature) {
  if (temperature == null) return 0.5
  // linear: 0.75→0.30, 1.00→0.50, 1.25→0.70
  return Math.min(1.0, Math.max(0.0, (temperature - 0.75) * 0.8 + 0.30))
}

/**
 * Fetch audio for a chunk — dispatches to Kokoro or Chatterbox based on provider.
 * Returns a Blob. Separated from playback to allow prefetching.
 */
async function fetchChunkAudio({ text, voice, config, temperature, speedFactor }) {
  const provider = config.tts?.provider || 'kokoro'
  return provider === 'chatterbox'
    ? fetchChatterboxAudio({ text, voice, config, temperature, speedFactor })
    : fetchKokoroAudio({ text, voice, config, temperature, speedFactor })
}

async function fetchKokoroAudio({ text, voice, config, temperature, speedFactor }) {
  const { kokoroUrl, speed = 1.0 } = config.tts
  // Kokoro doesn't understand paralinguistic tags — strip them before sending
  const cleanInput = text.replace(PARALINGUISTIC_RE, '').replace(/\s{2,}/g, ' ').trim()
  const body = {
    model: 'kokoro',
    input: cleanInput,
    voice,
    speed: speed * (speedFactor ?? 0.92),
    ...(temperature != null && { temperature }),
    response_format: 'mp3',
  }

  if (typeof window !== 'undefined' && window.tavern?.tts) {
    const result = await window.tavern.tts.speak({ url: kokoroUrl, body })
    if (!result.ok) throw new Error(result.error || 'Kokoro TTS request failed')
    const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0))
    const mimeType = result.contentType?.includes('wav') ? 'audio/wav' : 'audio/mpeg'
    return new Blob([bytes], { type: mimeType })
  } else {
    const res = await fetch(`${kokoroUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`Kokoro ${res.status}: ${res.statusText}`)
    return res.blob()
  }
}

async function fetchChatterboxAudio({ text, voice, config, temperature, speedFactor }) {
  const resolvedVoice = chatterboxVoiceId(voice) || config.tts.chatterboxDmVoice || ''
  if (!resolvedVoice) throw new Error('Chatterbox: no voice selected — set a DM voice in Settings')
  const base = (config.tts.chatterboxUrl || 'http://localhost:8004').replace(/\/$/, '')
  const isTurbo = config.tts.chatterboxTurbo ?? true
  const baseSpeed = config.tts.speed ?? 1.0
  const body = {
    text: text.trim(),   // paralinguistic tags kept — Chatterbox Turbo handles them
    predefined_voice_id: resolvedVoice,
    voice_mode: 'predefined',
    // Turbo's time-stretch introduces artifacts at any speed other than 1.0.
    // Standard model uses emotion-scaled speed.
    speed_factor: isTurbo ? 1.0 : baseSpeed * (speedFactor ?? 0.92),
    output_format: 'wav',
    // Turbo model ignores these; only send for standard model
    ...(!isTurbo && {
      exaggeration: temperatureToExaggeration(temperature),
      cfg_weight:   config.tts.chatterboxCfgWeight ?? 0.5,
    }),
  }

  if (typeof window !== 'undefined' && window.tavern?.tts) {
    const result = await window.tavern.tts.speak({
      url: base, body, endpoint: '/tts', timeout: 60_000,
    })
    if (!result.ok) throw new Error(result.error || 'Chatterbox TTS request failed')
    const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0))
    return new Blob([bytes], { type: 'audio/wav' })
  } else {
    const res = await fetch(`${base}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`Chatterbox ${res.status}: ${res.statusText}`)
    return res.blob()
  }
}

/**
 * Play an audio Blob. Returns a promise that resolves when playback ends.
 */
function playBlob(blob, signal) {
  if (!blob || blob.size === 0) return Promise.resolve()

  const url = URL.createObjectURL(blob)

  return new Promise((resolve) => {
    if (signal?.aborted) { URL.revokeObjectURL(url); resolve(); return }

    const audio = new Audio(url)
    audio.volume = _state.volume
    _state.currentAudio = audio

    const cleanup = () => { URL.revokeObjectURL(url); _state.currentAudio = null }

    audio.onended = () => { cleanup(); resolve() }
    audio.onerror = (e) => { cleanup(); resolve() }

    signal?.addEventListener('abort', () => {
      audio.pause()
      cleanup()
      resolve()
    }, { once: true })

    audio.play().catch(() => { cleanup(); resolve() })
  })
}

/**
 * Speak a single text chunk — fetch then play.
 * Legacy wrapper kept for any direct callers.
 */
async function speakChunk({ text, voice, config, signal }) {
  const blob = await fetchChunkAudio({ text, voice, config })
  return playBlob(blob, signal)
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function stopSpeaking() {
  if (_state.abortController) {
    _state.abortController.abort()
    _state.abortController = null
  }
  if (_state.currentAudio) {
    _state.currentAudio.pause()
    _state.currentAudio = null
  }
  _state.isPlaying = false
  notifyStateChange()
}

export function isSpeaking() {
  return _state.isPlaying
}

export function setVolume(vol) {
  _state.volume = Math.max(0, Math.min(1, vol))
  if (_state.currentAudio) _state.currentAudio.volume = _state.volume
}

export function getVolume() {
  return _state.volume
}

// Legacy compat — keep old speak() signature working for existing callers
export async function speak({ text, kokoroUrl, voice, speed = 1.0, onStart, onEnd }) {
  return speakDmResponse({
    text,
    config: { tts: { enabled: true, kokoroUrl, dmVoice: voice, speed } },
    onStart,
    onEnd,
  })
}

// ── Text utilities ────────────────────────────────────────────────────────────

/**
 * Chunk text into segments short enough for low-latency TTS.
 * Splits on sentence boundaries, keeping chunks under maxLength chars.
 */
export function chunkText(text, maxLength = 180) {
  // Normalise whitespace
  const clean = text.replace(/\s+/g, ' ').trim()

  // Split on sentence-ending punctuation followed by whitespace
  const sentences = clean.split(/(?<=[.!?:])\s+/).filter(Boolean)

  const chunks = []
  let current = ''

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length > maxLength && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = candidate
    }
  }

  if (current.trim()) chunks.push(current.trim())

  // If no sentence breaks found, split on commas
  if (chunks.length === 1 && chunks[0].length > maxLength) {
    return chunks[0].split(/(?<=,)\s+/).filter(Boolean)
  }

  return chunks
}

/**
 * Strip all non-speakable content from DM response text.
 */
export function extractSpeakableText(raw) {
  return raw
    .replace(/[\u201C\u201D\u201E\u201F\u275D\u275E]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u275B\u275C]/g, "'")
    .replace(/\u2014/g, ', ')   // em dash → brief pause
    .replace(/\u2013/g, ', ')   // en dash → brief pause
    .replace(/\[OOC:[^\]]*\]/gi, '')
    .replace(/\[ROLL:[^\]]*\]/gi, '')
    .replace(/\[IMAGE:[^\]]*\]/gi, '')
    .replace(/\[FLAG:[^\]]*\]/gi, '')
    .replace(/\[QUEST[^\]]*\]/gi, '')
    .replace(/\[LOCATION:[^\]]*\]/gi, '')
    .replace(/\[NPC_UPDATE:[^\]]*\]/gi, '')
    .replace(/\[LORE:[^\]]*\]/gi, '')
    .replace(/\[ACT_ADVANCE\]/gi, '')
    .replace(/<ooc>[^<]*<\/ooc>/gi, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkKokoro(url) {
  if (typeof window !== 'undefined' && window.tavern?.health) {
    return window.tavern.health.checkKokoro(url)
  }
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
    return { ok: res.ok }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function checkChatterbox(url) {
  if (typeof window !== 'undefined' && window.tavern?.health) {
    return window.tavern.health.checkChatterbox(url)
  }
  try {
    const base = (url || '').replace(/\/$/, '')
    const res = await fetch(`${base}/api/ui/initial-data`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, voices: [] }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
