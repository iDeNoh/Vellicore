/**
 * Quick Start Service
 *
 * Single LLM call that generates a complete, cohesive campaign concept
 * and starting character in one shot — ready to drop into a new game.
 */

import { sendToLlm } from '@/services/llm/llmService'

const VALID_ANCESTRIES   = ['human', 'elf', 'dwarf', 'halfling', 'orc', 'tiefling']
const VALID_BACKGROUNDS  = ['soldier', 'scholar', 'rogue', 'noble', 'priest', 'ranger', 'merchant', 'criminal', 'sailor', 'artisan']
const VALID_ABILITIES    = ['cleave', 'shield_wall', 'battle_fury', 'precise_shot', 'arcane_bolt', 'mend', 'ward', 'illusion', 'keen_senses', 'lucky', 'shadow_sense', 'stone_endurance', 'silver_tongue', 'inspire']
const VALID_ATMOSPHERES  = ['classic_fantasy', 'dark_fantasy', 'mystery', 'cosmic_horror', 'swashbuckling', 'post_apocalyptic', 'weird_fiction']

const SYSTEM = `You are a creative TTRPG campaign and character designer.
Your job is to generate a compelling, specific, atmospheric campaign concept and a matching starting character.
The campaign and character should feel made for each other — the character's backstory should connect to the world's themes.
Avoid generic defaults. Be surprising, specific, and evocative.
Respond ONLY with valid JSON — no preamble, no explanation, no markdown fences.`

export async function generateQuickStart({ config, hint = '' }) {
  const prompt = `Generate a complete TTRPG campaign concept and a starting character${hint ? ` inspired by: "${hint}"` : ''}.

RULES:
- Stats (body/mind/spirit) each start at 2. Allocate exactly 3 bonus points across them. Max 5 per stat.
- Ancestries: ${VALID_ANCESTRIES.join(', ')}
- Backgrounds: ${VALID_BACKGROUNDS.join(', ')}
- Abilities (choose 2, or 3 if the character is human): ${VALID_ABILITIES.join(', ')}
- Atmospheres: ${VALID_ATMOSPHERES.join(', ')}
- Danger levels: low, moderate, high, extreme

Respond with ONLY valid JSON matching this exact structure:
{
  "campaign": {
    "name": "evocative campaign name",
    "atmosphere": "one of the valid atmospheres",
    "tone": "one sentence describing the tone",
    "themes": ["theme1", "theme2", "theme3"],
    "dangerLevel": "low|moderate|high|extreme"
  },
  "character": {
    "name": "full character name",
    "pronouns": "she/her|he/him|they/them|any",
    "ancestry": "one of the valid ancestries",
    "background": "one of the valid backgrounds",
    "baseStats": { "body": 2, "mind": 2, "spirit": 3 },
    "abilities": ["ability_key", "ability_key"],
    "backstory": "2-3 paragraph backstory. Specific, grounded, with a clear motivation and personal history. Should connect to the campaign themes.",
    "personalityNote": "one vivid sentence capturing their defining trait",
    "hook": "one sentence connecting this character personally to the campaign's opening",
    "portraitPrompt": "comma-separated Stable Diffusion tags describing physical appearance only: age and gender descriptor, hair color and style, eye color, skin tone, clothing or armor type, expression, any scars or distinctive markings. Example: young woman, short auburn hair, sharp green eyes, pale skin, worn leather armor, determined expression, scar across left cheek"
  }
}`

  let raw = ''
  try {
    await sendToLlm({
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      config: config.llm,
      maxTokens: 2000,
      temperature: 0.92,
      onChunk: chunk => { raw += chunk },
    })
  } catch (err) {
    throw new Error(`Generation failed: ${err.message}`)
  }

  return parseQuickStartJson(raw)
}

function parseQuickStartJson(raw) {
  if (!raw?.trim()) throw new Error('LLM returned an empty response.')

  let cleaned = raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON found in LLM response.')

  let data
  try {
    data = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    try {
      const repaired = cleaned.slice(start, end + 1)
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      data = JSON.parse(repaired)
    } catch (e2) {
      throw new Error(`Could not parse generated content: ${e2.message}`)
    }
  }

  if (!data.campaign?.name) throw new Error('Generation incomplete: missing campaign name.')
  if (!data.character?.name) throw new Error('Generation incomplete: missing character name.')

  // Sanitise: clamp stats, validate keys
  const char = data.character
  const stats = char.baseStats || { body: 2, mind: 2, spirit: 2 }
  const clamp = v => Math.min(5, Math.max(1, Number(v) || 2))
  char.baseStats = { body: clamp(stats.body), mind: clamp(stats.mind), spirit: clamp(stats.spirit) }

  if (!VALID_ANCESTRIES.includes(char.ancestry)) char.ancestry = 'human'
  if (!VALID_BACKGROUNDS.includes(char.background)) char.background = 'soldier'
  if (!VALID_ATMOSPHERES.includes(data.campaign.atmosphere)) data.campaign.atmosphere = 'classic_fantasy'

  char.abilities = (char.abilities || []).filter(a => VALID_ABILITIES.includes(a)).slice(0, 3)
  if (char.abilities.length === 0) char.abilities = ['lucky']

  return data
}
