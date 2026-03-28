/**
 * Character Creation Service — Module 4
 *
 * Handles the AI-assisted parts of character creation:
 *  - Backstory generation from name + ancestry + background
 *  - Portrait prompt generation for SDNext
 *  - Starting inventory suggestion based on background
 *  - Character validation and finalisation
 */

import { sendToLlm } from '@/services/llm/llmService'
import { ANCESTRIES, BACKGROUNDS, calcMaxHp } from '@/lib/rules/rules'
import { generateImage, cropToToken } from '@/services/image/imageService'

// ── Traits formatter ──────────────────────────────────────────────────────────

/**
 * Format structured traits object into a readable string for LLM prompts.
 * Also accepts legacy string traits (passes through unchanged).
 */
function formatTraitsForPrompt(traits) {
  if (!traits) return 'none specified'
  if (typeof traits === 'string') return traits || 'none specified'
  const parts = []
  if (traits.personality?.length) parts.push(`personality: ${traits.personality.join(', ')}`)
  if (traits.flaw) parts.push(`flaw: ${traits.flaw}`)
  if (traits.motivation) parts.push(`motivation: ${traits.motivation}`)
  if (traits.bond) parts.push(`bond: ${traits.bond}`)
  if (traits.secret) parts.push(`secret: ${traits.secret}`)
  return parts.length ? parts.join(' | ') : 'none specified'
}

// ── Name generation ───────────────────────────────────────────────────────────

/**
 * Generate a list of name suggestions for a character.
 * Returns an array of name strings (typically 8).
 */
export async function generateNames({ ancestry, background, traits, config }) {
  const context = [
    ancestry && ancestry !== 'custom' ? `ancestry: ${ancestry}` : null,
    background && background !== 'custom' ? `background: ${background}` : null,
    traits ? `traits: ${formatTraitsForPrompt(traits)}` : null,
  ].filter(Boolean).join(', ') || 'generic fantasy character'

  let raw = ''
  try {
    raw = await sendToLlm({
      system: 'You are a TTRPG name generator. Respond ONLY with a JSON array of strings — no markdown, no explanation. Start with [ and end with ].',
      messages: [{ role: 'user', content: `Generate 8 varied fantasy character names for: ${context}. Mix of styles — some simple, some compound, some with titles or epithets. Respond ONLY with a JSON array like: ["Name One","Name Two",...]` }],
      config: config.llm,
      maxTokens: 300,
      temperature: 0.9,
    })
  } catch (err) {
    throw new Error('Name generation failed: ' + err.message)
  }

  // Extract JSON array
  try {
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start !== -1 && end !== -1) {
      const names = JSON.parse(raw.slice(start, end + 1))
      if (Array.isArray(names) && names.length > 0) return names.filter(n => typeof n === 'string' && n.trim())
    }
  } catch { /* fall through */ }

  // Plain text fallback: split on newlines/commas
  return raw.split(/[\n,]+/).map(s => s.replace(/^[\d.\-*"'\s]+|["'\s]+$/g, '').trim()).filter(Boolean).slice(0, 8)
}

// ── Backstory options generation ──────────────────────────────────────────────

/**
 * Generate 3 distinct backstory options in one LLM call.
 * Returns an array of backstory objects: [{ backstory, personalityNote, hook, portraitPrompt }, ...]
 * Falls back to 3 parallel single-backstory calls if JSON array parsing fails.
 */
export async function generateBackstoryOptions({ name, ancestry, background, traits, campaign, config }) {
  let raw = ''
  try {
    raw = await sendToLlm({
      system: 'You are a TTRPG character creator. Respond ONLY with a JSON object — no markdown, no explanation. Start with { and end with }.',
      messages: [{ role: 'user', content: buildBackstoryOptionsPrompt({ name, ancestry, background, traits, campaign }) }],
      config: config.llm,
      maxTokens: 3000,
      temperature: 0.85,
    })
  } catch (err) {
    throw new Error('Backstory generation failed: ' + err.message)
  }

  // Try parsing as a { options: [...] } array
  try {
    const cleaned = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/```\s*$/im, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      const data = JSON.parse(cleaned.slice(start, end + 1))
      const options = data.options || data.backstories || data.choices
      if (Array.isArray(options) && options.length > 0) {
        return options.map(o => ({
          backstory:       o.backstory || o.Backstory || '',
          personalityNote: o.personalityNote || o.personality || '',
          hook:            o.hook || o.Hook || '',
          portraitPrompt:  o.portraitPrompt || o.portrait || `${ancestry} fantasy character portrait, ${name}`,
        })).filter(o => o.backstory.length > 20)
      }
    }
  } catch { /* fall through to parallel fallback */ }

  // Fallback: run 3 generateBackstory calls in parallel
  const results = await Promise.allSettled([
    generateBackstory({ name, ancestry, background, traits, campaign, config }),
    generateBackstory({ name, ancestry, background, traits, campaign, config }),
    generateBackstory({ name, ancestry, background, traits, campaign, config }),
  ])
  return results.filter(r => r.status === 'fulfilled').map(r => r.value)
}

function buildBackstoryOptionsPrompt({ name, ancestry, background, traits, campaign }) {
  return `Write 3 distinct backstory options for this TTRPG character. Each should have a different tone or origin angle (e.g. tragic, hopeful, mysterious).

Character: ${name}, ${ancestry || 'unknown ancestry'} ${background || ''}
Traits: ${formatTraitsForPrompt(traits)}
Setting: ${campaign?.name || 'a fantasy world'} — ${campaign?.tone || 'adventure'}

Respond ONLY with this JSON (no other text):
{"options":[
  {"backstory":"2-3 paragraphs","personalityNote":"one sentence defining trait","hook":"one sentence connecting to the campaign","portraitPrompt":"comma-separated SD tags: age, hair, eyes, skin, clothing, expression"},
  {"backstory":"2-3 paragraphs","personalityNote":"one sentence defining trait","hook":"one sentence","portraitPrompt":"SD tags"},
  {"backstory":"2-3 paragraphs","personalityNote":"one sentence defining trait","hook":"one sentence","portraitPrompt":"SD tags"}
]}`
}

// ── Backstory generation ──────────────────────────────────────────────────────

/**
 * Generate a character backstory using the LLM.
 * Returns a 2–3 paragraph backstory string and a portrait image prompt.
 */
export async function generateBackstory({ name, ancestry, background, traits, campaign, config }) {
  // Try JSON approach first, then fall back to plain text if JSON fails
  let raw = ''
  let parseError = null

  try {
    raw = await sendToLlm({
      system: BACKSTORY_SYSTEM_JSON,
      messages: [{ role: 'user', content: buildBackstoryPromptJson({ name, ancestry, background, traits, campaign }) }],
      config: config.llm,
      maxTokens: 2000,  // reasoning models need extra tokens for their thinking chain
      temperature: 0.7,
    })
  } catch (err) {
    console.warn('[CharCreate] Backstory LLM call failed:', err.message)
    throw err
  }

  if (!raw?.trim()) {
    throw new Error('LLM returned an empty response. Check your LLM connection in Settings.')
  }

  // Try JSON parse
  const jsonResult = tryParseBackstoryJson(raw, name, ancestry)
  if (jsonResult) return jsonResult

  // If JSON parse fails, use plain-text extraction
  console.log('[CharCreate] JSON parse failed, using plain text extraction')
  return extractBackstoryFromPlainText(raw, name, ancestry, config)
}

// ── Two-pass generation ───────────────────────────────────────────────────────

// Pass 1: attempt JSON structured output
const BACKSTORY_SYSTEM_JSON = `You are a TTRPG character creator. Respond ONLY with a JSON object — no markdown, no explanation, no code fences.
Start your response with { and end with }. Nothing before or after the JSON.`

function buildBackstoryPromptJson({ name, ancestry, background, traits, campaign }) {
  return `Write a backstory for this TTRPG character and respond with ONLY a JSON object:

Character: ${name}, ${ancestry} ${background}
Traits: ${formatTraitsForPrompt(traits)}
Setting: ${campaign?.name || 'a fantasy world'} — ${campaign?.tone || 'adventure'}

JSON format (respond with ONLY this, no other text):
{"backstory":"2-3 paragraphs about their history and what drives them now","personalityNote":"one sentence about their defining trait","hook":"one sentence connecting them to the campaign","portraitPrompt":"comma-separated image tags for Stable Diffusion — physical features only: age descriptor, hair color and style, eye color, skin, clothing, expression, any scars or markings. Example: young woman, long auburn hair, green eyes, leather vest, smiling, freckles"}`
}

// Pass 2: plain prose prompt for models that won't do JSON
async function extractBackstoryFromPlainText(existingRaw, name, ancestry, config) {
  // First try to extract from what we already have
  const extracted = pullFieldsFromText(existingRaw, name, ancestry)
  if (extracted.backstory.length > 50) return extracted

  // If extraction failed, ask for plain prose and parse it ourselves
  let raw2 = ''
  try {
    raw2 = await sendToLlm({
      system: 'You are a TTRPG character creator. Write vivid, grounded backstories in plain text.',
      messages: [{ role: 'user', content: `Write a 2-paragraph backstory for ${name}, a ${ancestry} ${ancestry} character. Include their history, personality, and what drives them to adventure. Then on a new line starting with "PORTRAIT:" write a physical description for portrait painting.` }],
      config: config.llm,
      maxTokens: 600,
      temperature: 0.8,
    })
  } catch {
    // Return whatever we have from the first attempt
    return { backstory: existingRaw.trim(), personalityNote: '', hook: '', portraitPrompt: `${ancestry} fantasy character portrait, ${name}` }
  }

  return pullFieldsFromText(raw2, name, ancestry)
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function tryParseBackstoryJson(raw, name, ancestry) {
  try {
    let cleaned = raw
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim()

    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return null  // No JSON — caller will use fallback

    const jsonStr = cleaned.slice(start, end + 1)

    let data
    try {
      data = JSON.parse(jsonStr)
    } catch {
      // Try fixing unescaped newlines inside string values
      const fixed = jsonStr.replace(/:\s*"([\s\S]*?)"/g, (_, val) =>
        ': "' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'
      )
      data = JSON.parse(fixed)
    }

    const backstory = data.backstory || data.Backstory || data.background || ''
    if (!backstory) return null  // Parsed but empty — use fallback

    return {
      backstory,
      personalityNote: data.personalityNote || data.personality_note || data.personality || '',
      hook: data.hook || data.Hook || data.campaign_hook || '',
      portraitPrompt: data.portraitPrompt || data.portrait_prompt || data.portrait || data.appearance
        || `${ancestry} character named ${name}, fantasy portrait`,
    }
  } catch {
    return null  // JSON parse failed entirely
  }
}

// ── Plain text extractor ──────────────────────────────────────────────────────

function pullFieldsFromText(raw, name, ancestry) {
  // Extract portrait description if it's on its own labelled line
  let portraitPrompt = `${ancestry} fantasy character portrait, ${name}`
  const portraitMatch = raw.match(/portrait[: ]+(.+?)(?:\n|$)/i)
  if (portraitMatch) {
    portraitPrompt = portraitMatch[1].trim()
    raw = raw.replace(portraitMatch[0], '').trim()
  }

  // Clean up the remaining text as the backstory
  const backstory = raw
    .replace(/^(sure[!,]?\s*|here('s| is)\s*(the\s*)?backstory[:\s]*)/im, '')
    .replace(/```[^`]*```/gs, '')
    .trim()

  // Try to extract a personality sentence (often starts with "They are" or "Known for")
  const personalityMatch = backstory.match(/^.{0,200}(They are|Known for|[A-Z][^.]+is known)[^.]*\./im)
  const personalityNote = personalityMatch ? personalityMatch[0].trim() : ''

  return { backstory, personalityNote, hook: '', portraitPrompt }
}

// ── Legacy ────────────────────────────────────────────────────────────────────
// Keep old function name in case anything references it directly
function buildBackstoryPrompt({ name, ancestry, background, traits, campaign }) {
  return buildBackstoryPromptJson({ name, ancestry, background, traits, campaign })
}

const BACKSTORY_SYSTEM = BACKSTORY_SYSTEM_JSON

// ── Portrait prompt helpers ───────────────────────────────────────────────────

/**
 * Build a tag-based SD prompt from character fields.
 * Exported so the UI can pre-populate editable prompt fields.
 */
export function buildPortraitTags(portraitPrompt, ancestry, background) {
  return [
    portraitPrompt,
    ANCESTRY_TAGS[ancestry] || '',
    BACKGROUND_TAGS[background] || '',
  ].filter(s => s && s.trim()).join(', ')
}

// ── Portrait visual tag tables ────────────────────────────────────────────────

const ANCESTRY_TAGS = {
  elf:        'elf, pointed ears, slender',
  dwarf:      'dwarf, stocky build, beard',
  halfling:   'halfling, short stature, round face',
  orc:        'orc, tusks, (green skin:1.1), muscular',
  tiefling:   'tiefling, demon horns, (unusual skin color:1.1), tail',
  human:      'human',
  gnome:      'gnome, small stature, large eyes, curious expression',
  aasimar:    'aasimar, glowing eyes, (golden or silver skin:1.1), angelic features',
  dragonborn: 'dragonborn, (scales:1.2), reptilian features, proud bearing',
  changeling: 'changeling, pale skin, shifting eyes, androgynous features',
  dhampir:    'dhampir, pale skin, sharp fangs, hollow eyes, elegant bearing',
  automaton:  'automaton, (mechanical body:1.2), metal plating, glowing runes, constructed being',
  custom:     '',
}

const BACKGROUND_TAGS = {
  soldier:      '(armor:1.2), sword, warrior, military attire',
  scholar:      '(robes:1.1), book, scroll, academic clothing',
  rogue:        '(leather armor:1.2), hood, dark clothing, dagger',
  noble:        '(noble attire:1.2), fine clothing, elegant jewelry',
  priest:       '(holy robes:1.2), holy symbol, clerical vestments',
  ranger:       '(leather armor:1.1), (cloak:1.1), longbow, quiver',
  merchant:     'merchant clothing, coin purse, traveling clothes',
  criminal:     'dark worn clothing, concealed blade',
  sailor:       '(nautical coat:1.1), weathered, sea worn',
  artisan:      'work apron, craftsman tools, sturdy clothes',
  witch:        '(dark robes:1.1), herb pouches, mortar and pestle, wild hair',
  innkeeper:    'apron, warm clothing, friendly expression, tavern setting',
  hunter:       '(hunting cloak:1.1), crossbow, animal pelts, rugged gear',
  physician:    'medical kit, clean clothes, calm expression, bandages',
  pirate:       '(pirate coat:1.2), cutlass, sea worn, weathered skin',
  farmer:       'roughspun clothes, work worn hands, sun weathered skin',
  cartographer: 'ink stained fingers, maps, compass, traveling coat',
  custom:       '',
}

// ── Portrait generation ───────────────────────────────────────────────────────

/**
 * Generate a character portrait via SDNext and crop it to a token.
 * Returns { portraitBase64, tokenBase64 }
 */
export async function generatePortrait({ portraitPrompt, ancestry, background, config, overrides = {}, promptOverride, negPromptOverride }) {
  if (!config.image?.enabled) return { portraitBase64: null, tokenBase64: null }

  try {
    const tags = promptOverride ?? buildPortraitTags(portraitPrompt, ancestry, background)

    const portraitBase64 = await generateImage({
      prompt: tags,
      type: 'portrait',
      sdnextUrl: config.image.sdnextUrl,
      style: config.image.style,
      overrides: negPromptOverride != null ? { ...overrides, negPromptOverride } : overrides,
    })

    const tokenBase64 = await cropToToken(portraitBase64)

    return { portraitBase64, tokenBase64 }
  } catch (err) {
    console.warn('[CharCreate] Portrait generation failed:', err.message)
    return { portraitBase64: null, tokenBase64: null }
  }
}

// ── Starting inventory ────────────────────────────────────────────────────────

/**
 * Build a starting inventory appropriate for a background.
 * Returns array of item objects.
 */
export function buildStartingInventory(background, ancestry) {
  const base = [
    { name: 'Gold coins', type: 'gold', qty: 10, notable: false, description: '' },
    { name: "Traveller's pack", type: 'gear', qty: 1, notable: false, description: 'Rope, bedroll, torches, rations for 3 days.' },
  ]

  const byBackground = {
    soldier: [
      { name: 'Longsword', type: 'weapon', qty: 1, notable: true, description: 'A well-maintained blade.' },
      { name: 'Shield', type: 'armor', qty: 1, notable: true, description: 'Battered but solid.' },
      { name: 'Chain shirt', type: 'armor', qty: 1, notable: true, description: 'Worn but reliable.' },
    ],
    scholar: [
      { name: 'Spellbook', type: 'gear', qty: 1, notable: true, description: 'Filled with notes and half-finished theories.' },
      { name: 'Reading glasses', type: 'gear', qty: 1, notable: false, description: '' },
      { name: 'Dagger', type: 'weapon', qty: 1, notable: false, description: 'More for letters than fighting.' },
      { name: 'Ink and quill', type: 'gear', qty: 1, notable: false, description: '' },
    ],
    rogue: [
      { name: 'Shortsword', type: 'weapon', qty: 1, notable: true, description: 'Fast and quiet.' },
      { name: 'Lockpicks', type: 'gear', qty: 1, notable: true, description: 'A good set, hard-won.' },
      { name: 'Dark cloak', type: 'armor', qty: 1, notable: false, description: 'Useful for disappearing.' },
      { name: 'Throwing knives', type: 'weapon', qty: 3, notable: false, description: '' },
    ],
    noble: [
      { name: 'Fine rapier', type: 'weapon', qty: 1, notable: true, description: 'Engraved with a family crest.' },
      { name: 'Signet ring', type: 'gear', qty: 1, notable: true, description: 'Opens certain doors.' },
      { name: 'Fine clothes', type: 'gear', qty: 1, notable: false, description: '' },
      { name: 'Gold coins', type: 'gold', qty: 15, notable: false, description: '' },
    ],
    priest: [
      { name: 'Holy symbol', type: 'gear', qty: 1, notable: true, description: 'Worn close to the heart.' },
      { name: 'Mace', type: 'weapon', qty: 1, notable: false, description: 'Practical and blessed.' },
      { name: 'Healing salves', type: 'potion', qty: 3, notable: false, description: 'Restore 1 HP each.' },
      { name: 'Prayer book', type: 'gear', qty: 1, notable: false, description: '' },
    ],
    ranger: [
      { name: 'Hunting bow', type: 'weapon', qty: 1, notable: true, description: 'Accurate at long range.' },
      { name: 'Arrows', type: 'weapon', qty: 20, notable: false, description: '' },
      { name: 'Hunting knife', type: 'weapon', qty: 1, notable: false, description: '' },
      { name: 'Wilderness kit', type: 'gear', qty: 1, notable: false, description: 'Snares, fire-making, water purification.' },
    ],
    merchant: [
      { name: 'Counting scales', type: 'gear', qty: 1, notable: false, description: '' },
      { name: 'Trade ledger', type: 'gear', qty: 1, notable: false, description: 'Full of useful contacts.' },
      { name: 'Gold coins', type: 'gold', qty: 25, notable: false, description: '' },
      { name: 'Light crossbow', type: 'weapon', qty: 1, notable: false, description: 'For when negotiations fail.' },
    ],
    criminal: [
      { name: 'Stiletto', type: 'weapon', qty: 1, notable: true, description: 'For very close conversations.' },
      { name: 'Forged papers', type: 'gear', qty: 1, notable: true, description: 'Three different identities.' },
      { name: 'Lockpicks', type: 'gear', qty: 1, notable: false, description: '' },
      { name: 'Smoke bombs', type: 'gear', qty: 2, notable: false, description: 'Fill a room with thick smoke.' },
    ],
    sailor: [
      { name: 'Cutlass', type: 'weapon', qty: 1, notable: true, description: 'Salt-pitted but sharp.' },
      { name: 'Navigation tools', type: 'gear', qty: 1, notable: false, description: 'Compass and charts.' },
      { name: 'Belaying pin', type: 'weapon', qty: 1, notable: false, description: 'Doubles as a club.' },
      { name: 'Oilskin coat', type: 'gear', qty: 1, notable: false, description: 'Keeps out the rain.' },
    ],
    artisan: [
      { name: "Artisan's tools", type: 'gear', qty: 1, notable: true, description: 'Well-maintained craft tools.' },
      { name: 'Workshop knife', type: 'weapon', qty: 1, notable: false, description: '' },
      { name: 'Quality materials', type: 'gear', qty: 1, notable: false, description: 'Enough to craft something useful.' },
    ],
    custom: [
      { name: 'Personal weapon', type: 'weapon', qty: 1, notable: true, description: 'Something meaningful.' },
    ],
  }

  const backgroundItems = byBackground[background] || byBackground.custom

  // Deduplicate gold — backgrounds that add gold replace base gold
  const hasExtraGold = backgroundItems.some(i => i.type === 'gold')
  const filteredBase = hasExtraGold
    ? base.filter(i => i.type !== 'gold')
    : base

  return [...filteredBase, ...backgroundItems]
}

// ── Character finalisation ────────────────────────────────────────────────────

/**
 * Finalise a character object ready for saving to DB and loading into game.
 * Applies ancestry stat bonuses, calculates derived stats, assigns abilities.
 */
export function finaliseCharacter({
  id,
  campaignId,
  name,
  pronouns,
  ancestry,
  background,
  baseStats,        // { body, mind, spirit } — player-allocated
  chosenAbilities,  // array of ability keys
  traits,           // structured object { personality, flaw, motivation, bond, secret }
  backstory,
  personalityNote,
  hook,
  portraitBase64,
  tokenBase64,
  portraitPrompt,
  notes,
}) {
  const ancestryData = ANCESTRIES[ancestry] || ANCESTRIES.custom

  // Apply ancestry stat bonuses on top of base allocation
  const stats = { ...baseStats }
  Object.entries(ancestryData.statBonus || {}).forEach(([stat, bonus]) => {
    stats[stat] = Math.min(5, (stats[stat] || 2) + bonus)
  })

  // Ability list: chosen + ancestry ability (if any) + human bonus ability
  const abilities = [...new Set([
    ...chosenAbilities,
    ...(ancestryData.ability ? [ancestryData.ability] : []),
  ])]

  const maxHp = calcMaxHp(stats.body)

  return {
    id: id || crypto.randomUUID(),
    campaignId,
    name: name.trim(),
    pronouns: pronouns || '',
    ancestry,
    background,
    stats,
    hp: maxHp,
    maxHp,
    conditions: [],
    abilities,
    inventory: buildStartingInventory(background, ancestry),
    backstory: backstory || '',
    personalityNote: personalityNote || '',
    hook: hook || '',
    traits: traits || {},
    notes: notes || '',
    portraitBase64: portraitBase64 || null,
    tokenBase64: tokenBase64 || null,
    portraitPrompt: portraitPrompt || '',
    createdAt: Date.now(),
  }
}
