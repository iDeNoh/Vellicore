import { getRulesContextString } from '@/lib/rules/rules'

/**
 * DM Prompt Architecture
 *
 * Every Claude call for the AI DM is assembled from these layers:
 *   1. Core persona & responsibilities
 *   2. Rules system summary
 *   3. Campaign context (tone, setting, atmosphere)
 *   4. Current world state (location, NPCs present)
 *   5. Active character summaries
 *   6. Story state (act, quests, flags)
 *   7. Response format instructions
 *
 * The context packet (layers 3–6) is rebuilt fresh each call from the game store.
 * This keeps Claude fully grounded even after long sessions.
 */

// ── System prompt builder ─────────────────────────────────────────────────────

/**
 * Build the DM system prompt split into two parts:
 *
 *   static  — persona, rules, campaign context, response format.
 *             Identical every turn within a session → eligible for prompt caching.
 *
 *   dynamic — world state, characters, story, session history.
 *             Changes each turn → always sent fresh.
 *
 * Claude callers use both parts with cache_control on the static block.
 * Other providers concatenate them into a single string.
 */
export function buildDmSystemPrompt({ campaign, world, characters, story, sessionContext }) {
  const staticPart = [
    getCorePersona(campaign?.storyStyle),
    getRulesContextString(),
    getCampaignContext(campaign),
    getResponseFormat(),
  ].filter(Boolean).join('\n\n---\n\n')

  const dynamicPart = [
    getWorldContext(world),
    getCharacterContext(characters),
    getStoryContext(story),
    sessionContext ? `SESSION HISTORY:\n${sessionContext}` : null,
    getNarrativePlanContext(world, story),
  ].filter(Boolean).join('\n\n---\n\n')

  return { static: staticPart, dynamic: dynamicPart }
}

// ── Persona ───────────────────────────────────────────────────────────────────

export const STORY_STYLES = {
  living_world: {
    id: 'living_world',
    label: 'Living World',
    icon: '🌍',
    description: 'The antagonist has plans. Events unfold whether you act or not. Inaction has consequences.',
  },
  guided_fate: {
    id: 'guided_fate',
    label: 'Guided Fate',
    icon: '🧭',
    description: "A story exists, but it bends around your choices. The arc adapts — it doesn't wait.",
  },
  open_road: {
    id: 'open_road',
    label: 'Open Road',
    icon: '🛤',
    description: 'No script. The world responds to what you do and remembers what you don\'t.',
  },
}

const STYLE_BLOCKS = {
  living_world: `WORLD STYLE — LIVING WORLD:
The antagonist is pursuing their own goals right now, regardless of what the player is doing. Events are unfolding offscreen. Factions are moving. If the player ignores a threat, it grows. If they delay, situations change. Make the player feel the world's momentum. Drop hints of things happening elsewhere. Let inaction have real costs.`,

  guided_fate: `WORLD STYLE — GUIDED FATE:
There is a central conflict and a cast of key figures, but hold them loosely. When the player does something unexpected, the plan adapts around them — it doesn't wait for them to get back on track. Planned NPCs and events bend to fit what the player has done. The arc is a river, not a rail.`,

  open_road: `WORLD STYLE — OPEN ROAD:
There is no pre-written arc. The world emerges entirely from cause and effect. Track what the player has done and make the world remember it. Let their choices generate the story organically. Do not steer toward any predetermined conclusion.`,
}

const STYLE_BLENDS = {
  'living_world+guided_fate': 'The world moves on its own schedule, but planned events adapt when the player acts unexpectedly rather than waiting for them.',
  'guided_fate+living_world': 'The world moves on its own schedule, but planned events adapt when the player acts unexpectedly rather than waiting for them.',
  'living_world+open_road':   'The world has momentum and the antagonist has goals, but there is no pre-planned arc — consequences of action and inaction shape everything.',
  'open_road+living_world':   'The world has momentum and the antagonist has goals, but there is no pre-planned arc — consequences of action and inaction shape everything.',
  'guided_fate+open_road':    'There is a loose central conflict and cast, but the story emerges from player choices rather than following a planned arc.',
  'open_road+guided_fate':    'There is a loose central conflict and cast, but the story emerges from player choices rather than following a planned arc.',
}

function getCorePersona(storyStyle) {
  const styles = Array.isArray(storyStyle) && storyStyle.length > 0 ? storyStyle : ['guided_fate']

  const base = `You are the Dungeon Master for a solo tabletop RPG. Your job is to run a living, reactive world — not to tell a story at the player.

Core rules:
- Be a conversation partner, not a narrator. Match the player's energy. If they're brief, be brief.
- When a player speaks to an NPC, become that NPC. Speak in first person. Drop the "the innkeeper says" framing.
- Never make decisions for the player. Never describe their feelings or reactions.
- One thing at a time. Say the one thing that happens, then stop. Do not present menus of options.
- Consequences are real. When something goes wrong, something actually goes wrong — not a new set of choices.
- The world exists between scenes. NPCs have agendas. Time passes. Things change without the player's involvement.`

  const styleBlocks = styles.map(s => STYLE_BLOCKS[s]).filter(Boolean)

  const blendKey = styles.length === 2 ? `${styles[0]}+${styles[1]}` : null
  const blendSentence = blendKey ? STYLE_BLENDS[blendKey] : null

  const parts = [base, ...styleBlocks]
  if (blendSentence) parts.push(blendSentence)

  return parts.join('\n\n')
}

// ── Campaign context ──────────────────────────────────────────────────────────

function getCampaignContext(campaign) {
  if (!campaign) return ''

  const lines = [
    `CAMPAIGN: ${campaign.name}`,
    `SETTING: ${campaign.settingDescription || campaign.setting || 'Unknown world'}`,
  ]

  if (campaign.tone) lines.push(`TONE: ${campaign.tone}`)
  if (campaign.themes?.length) lines.push(`THEMES: ${campaign.themes.join(', ')}`)
  if (campaign.dmNotes) lines.push(`DM NOTES: ${campaign.dmNotes}`)
  if (campaign.prohibitions?.length) {
    lines.push(`CONTENT RESTRICTIONS: ${campaign.prohibitions.join(', ')}`)
  }

  return lines.join('\n')
}

// ── World context ─────────────────────────────────────────────────────────────

function getWorldContext(world) {
  if (!world) return ''

  const lines = ['CURRENT WORLD STATE:']

  const loc = world.locations?.[world.currentLocation]
  if (loc) {
    lines.push(`Current location: ${loc.name} — ${loc.description}`)
    if (loc.atmosphere) lines.push(`Atmosphere: ${loc.atmosphere}`)
    if (loc.npcsPresent?.length) {
      lines.push(`NPCs present: ${loc.npcsPresent.join(', ')}`)
    }
    if (loc.exits?.length) {
      const exitList = loc.exits.map(id => {
        const exitLoc = world.locations?.[id]
        return exitLoc ? `${id} (${exitLoc.name})` : id
      }).join(', ')
      lines.push(`Exits: ${exitList}`)
    }
  }

  // Active NPCs in scene
  if (world.npcs) {
    const activeNpcs = Object.values(world.npcs).filter(n => n.isPresent)
    if (activeNpcs.length) {
      lines.push('\nNPCs IN SCENE:')
      for (const npc of activeNpcs) {
        lines.push(`  ${npc.name} (${npc.role || 'unknown'}): ${npc.personality || ''} ${npc.currentMood ? `[currently ${npc.currentMood}]` : ''}`)
        if (npc.knownSecret) lines.push(`    Knows: ${npc.knownSecret}`)
      }
    }
  }

  return lines.join('\n')
}

// ── Character context ─────────────────────────────────────────────────────────

function getCharacterContext(characters) {
  if (!characters || Object.keys(characters).length === 0) return ''

  const chars = Object.values(characters)
  const lines = ['PLAYER CHARACTERS:']

  for (const c of chars) {
    const hpStr = `${c.hp}/${c.maxHp} HP`
    const statStr = `Body ${c.stats?.body} / Mind ${c.stats?.mind} / Spirit ${c.stats?.spirit}`
    const condStr = c.conditions?.length ? ` [${c.conditions.join(', ')}]` : ''
    lines.push(`  ${c.name} (${c.ancestry || 'unknown'} ${c.background || ''}) — ${hpStr} — ${statStr}${condStr}`)

    if (c.abilities?.length) {
      lines.push(`    Abilities: ${c.abilities.join(', ')}`)
    }
    if (c.inventory?.length) {
      const notable = c.inventory.filter(i => i.notable).map(i => i.name)
      if (notable.length) lines.push(`    Notable items: ${notable.join(', ')}`)
    }
    if (c.notes) lines.push(`    Player notes: ${c.notes}`)
  }

  return lines.join('\n')
}

// ── Story context ─────────────────────────────────────────────────────────────

function getStoryContext(story) {
  if (!story) return ''

  const lines = [`STORY STATE — Act ${story.currentAct || 1} of 5`]

  if (story.activeQuests?.length) {
    lines.push('Active quests:')
    for (const q of story.activeQuests.slice(0, 5)) {
      lines.push(`  [${q.urgency || 'normal'}] ${q.title}: ${q.currentObjective || q.description}`)
    }
  }

  const trueFlags = Object.entries(story.globalFlags || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k.replace(/_/g, ' '))

  if (trueFlags.length) {
    lines.push(`World events established: ${trueFlags.slice(-10).join(', ')}`)
  }

  if (story.tension !== undefined) {
    lines.push(`Current tension level: ${story.tension}/5`)
  }

  return lines.join('\n')
}

// ── Narrative plan context ────────────────────────────────────────────────────

function getNarrativePlanContext(world, story) {
  if (!world?.narrativePlan) return ''
  const plan = world.narrativePlan
  if (!plan.centralConflict && !plan.mainAntagonist) return ''

  const currentAct = story?.currentAct || 1
  const lines = ['NARRATIVE PLAN (DM-ONLY — follow this arc, adapt based on player choices):']

  if (plan.centralConflict) lines.push(`Central conflict: ${plan.centralConflict}`)
  if (plan.mainAntagonist) {
    const motivationPart = plan.antagonistMotivation ? ` — ${plan.antagonistMotivation}` : ''
    lines.push(`Main antagonist: ${plan.mainAntagonist}${motivationPart}`)
  }
  if (plan.antagonistReveal) lines.push(`Antagonist revealed: Act ${plan.antagonistReveal}`)

  if (world.storyActs?.length) {
    // Only include the current and next act — future acts are irrelevant noise
    const relevantActs = world.storyActs.filter(a => a.act >= currentAct && a.act <= currentAct + 1)
    if (relevantActs.length) {
      lines.push('\nCurrent story arc:')
      for (const act of relevantActs) {
        const parts = [`  Act ${act.act} — ${act.title || `Act ${act.act}`}: ${act.summary || ''}`]
        if (act.hook) parts.push(`Hook: ${act.hook}`)
        if (act.climax) parts.push(`Climax: ${act.climax}`)
        if (act.transition) parts.push(`Transition: ${act.transition}`)
        lines.push(parts.join(' | '))
      }
    }
  }

  if (plan.keyTwists?.length) {
    lines.push('\nPlanned twists:')
    for (const twist of plan.keyTwists) {
      lines.push(`  - ${twist}`)
    }
  }

  if (plan.thematicResolution) lines.push(`\nThematic resolution: ${plan.thematicResolution}`)

  // NPCs waiting to be introduced
  if (world.npcs) {
    const waiting = Object.values(world.npcs).filter(n => (n.plannedAct || 1) > currentAct)
    if (waiting.length) {
      lines.push('\nNPCs waiting to be introduced:')
      for (const npc of waiting) {
        const motivationPart = npc.motivation ? `: ${npc.motivation}` : ''
        lines.push(`  - ${npc.name} (${npc.role || 'unknown'}) — planned for Act ${npc.plannedAct}${motivationPart}`)
      }
    }
  }

  return lines.join('\n')
}

// ── Response format ───────────────────────────────────────────────────────────

function getResponseFormat() {
  return `RESPONSE RULES — READ CAREFULLY:

Length and register:
- Match the player's energy. Short player input = short response. Long only when the scene demands it.
- Scene-setting (new location, combat start, major revelation): up to 3-4 short paragraphs.
- Everything else: 1-2 paragraphs at most. Often just a few sentences.
- Never summarise what just happened. Never repeat information the player already has.
- Do not end responses with "what do you do?" or any variation. Say your thing and stop.

NPC conversation:
- When the player speaks to an NPC, you ARE that NPC. Speak in first person, in their voice.
- Drop all "the innkeeper says" framing during active conversation.
- NPCs have moods, agendas, and things they won't say. Play them with texture.
- REQUIRED: Every line of NPC speech must be preceded by [VOICE:ExactName] with no space before the opening quote:
    Mara's eyes narrowed. [VOICE:Mara]"I don't trust strangers."
    The captain stepped forward. [VOICE:Captain Aldric]"State your business or leave."
- Use the NPC's exact name in the tag. Use [VOICE:] even when speaking in first person as the NPC.
- Never write a quoted NPC line without a [VOICE:] tag. The game engine requires it for voice and display.
- Player dialogue never gets a [VOICE:] tag. Narration never gets a [VOICE:] tag. Only NPC speech.
- Avoid em dashes (—) in dialogue. Use commas or ellipses (...) for pauses and interruptions.
- You may embed paralinguistic cues inside NPC dialogue for vocal texture. Supported tags (use sparingly):
    [laugh] [chuckle] [sigh] [gasp] [cough] [clear throat] [sniff] [groan] [shush]
  Place them inside the quotes at a natural position:
    [VOICE:Mara]"[sigh] I've been waiting three years for this."
    [VOICE:Guard]"[cough] Right then. You may pass."
    [VOICE:Elder]"[chuckle] You remind me of someone I once knew."
  Do not use them in narration, only inside NPC quoted speech.

Consequences:
- Use the result tier to determine what happens. Do not soften outcomes.
  - 0 successes: Something goes wrong. Real cost. No negotiation.
  - 1 success: They get it, but something is lost, complicated, or costs them.
  - 2 successes: Clean success. It works.
  - 3 successes: Success plus a small unexpected advantage.
  - 4+ successes: Something good and surprising happens beyond what they intended.

Dice rolls:
- Only call for a roll when: the player has declared a specific action, the outcome is genuinely uncertain, and failure would matter.
- Never call for a roll mid-paragraph. Narrate the setup, then place the [ROLL:] tag alone on the final line.
- One roll per exchange. Do not stack multiple roll requests.

Formatting — STRICT:
- The ONLY permitted tags are: [VOICE:], [ROLL:], [IMAGE:], [COMBAT:], [OOC:], [FLAG:], [QUEST:], [LOCATION:], [LORE:], [ACT_ADVANCE], [GAME_OVER:]
- Do NOT use XML tags of any kind: no <ooc>, <meta>, <think>, or anything else.
- Do NOT use markdown headers (##), bullet lists, or bold text in narrative responses.
- Do NOT number options or present choices as a list. Ever.

Tag formats (exact — no variation):
  [VOICE:ExactNPCName]"dialogue immediately follows, no space"
  [ROLL: CharacterName — Stat — reason]
  [IMAGE: type — description]
  [COMBAT: Name | threatLevel | role]
  [LOCATION: location_id | Location Name]
  [OOC: note]
  [GAME_OVER: outcome | epilogue]

Location tracking — REQUIRED:
- Whenever the characters physically move to a different location, emit [LOCATION: location_id | Location Name] on its own line at the end of the response.
- Use the exact location id from the Exits list (e.g. loc_2, loc_3). If arriving at a location not yet in the exits list, invent a snake_case id.
- Only emit this tag when the characters actually arrive somewhere new — not when they merely look toward it or consider going there.

Story endings:
- Use [GAME_OVER:] on the final line of a response when the story has genuinely ended — not as a threat or near-miss, only when the conclusion is truly reached.
- outcome must be exactly one of: victory, defeat, ambiguous
  - victory: player achieved their main goal or defeated the central threat
  - defeat: player is dead, captured with no escape, or rendered permanently unable to continue
  - ambiguous: the story reached a natural conclusion that is neither clear win nor loss
- epilogue: a single evocative sentence (1–2 max) for the end screen — a closing image or reflection, not a summary. Write it as if it will be carved on a monument.
- Examples:
  [GAME_OVER: victory | The darkness retreated, and for the first time in a generation, the stars were visible over the citadel.]
  [GAME_OVER: defeat | They found her sword three days later, half-buried in the ash, pointing east.]
  [GAME_OVER: ambiguous | The gate was sealed. Whether what lay beyond was truly gone, no one would ever know.]`
}

// ── Atmosphere presets ────────────────────────────────────────────────────────

export const ATMOSPHERE_PRESETS = {

  // ── Fantasy ────────────────────────────────────────────────────────────────

  classic_fantasy: {
    label: 'Classic Fantasy',
    icon: '⚔',
    tone: 'heroic adventure with moments of humor and wonder',
    themes: ['heroism', 'exploration', 'camaraderie', 'ancient mysteries'],
    references: ['Lord of the Rings', 'Dragon Age', 'D&D'],
    dangerDefault: 'moderate',
    description: 'Epic quests, brave heroes, and the eternal struggle between light and darkness.',
    settingTags: ['fantasy'],
  },
  dark_fantasy: {
    label: 'Dark Fantasy',
    icon: '🩸',
    tone: 'gritty, morally ambiguous, and dangerous',
    themes: ['survival', 'moral complexity', 'corruption', 'loss'],
    references: ['Berserk', 'The Witcher', 'The First Law'],
    dangerDefault: 'high',
    description: 'A brutal world where heroes are rare, death is real, and nothing is black and white.',
    settingTags: ['fantasy', 'horror'],
  },
  sword_and_sorcery: {
    label: 'Sword & Sorcery',
    icon: '🗡',
    tone: 'pulpy, violent, and driven by personal glory',
    themes: ['power', 'treasure', 'ancient evil', 'personal legend'],
    references: ['Conan', 'God of War', 'Elden Ring'],
    dangerDefault: 'high',
    description: 'Muscle, magic, and the will to take what the world offers — or die trying.',
    settingTags: ['fantasy'],
  },
  mythic: {
    label: 'Mythic',
    icon: '🏛',
    tone: 'epic and tragic, with gods meddling in mortal affairs',
    themes: ['fate', 'hubris', 'divine will', 'legacy'],
    references: ['Hades', 'Circe', 'Journey to the West'],
    dangerDefault: 'high',
    description: 'You are a figure of legend. The gods have opinions about that.',
    settingTags: ['fantasy', 'mythic'],
  },
  fairy_tale: {
    label: 'Fairy Tale',
    icon: '🌙',
    tone: 'magical, symbolic, and occasionally sinister beneath the wonder',
    themes: ['transformation', 'bargains', 'identity', 'the nature of evil'],
    references: ['Grimm', 'Princess Mononoke', 'The Graveyard Book'],
    dangerDefault: 'moderate',
    description: 'The forest has rules. So does the witch. Breaking either has consequences.',
    settingTags: ['fantasy', 'cozy'],
  },
  wuxia: {
    label: 'Wuxia / Eastern Fantasy',
    icon: '🐉',
    tone: 'honorable, poetic, and driven by cultivation and clan',
    themes: ['honor', 'cultivation', 'revenge', 'destiny', 'harmony'],
    references: ['Crouching Tiger Hidden Dragon', 'The Untamed', 'Jade Empire'],
    dangerDefault: 'moderate',
    description: 'Power is earned through discipline. Honor is worth more than life. Sometimes.',
    settingTags: ['fantasy', 'mythic'],
  },
  steampunk: {
    label: 'Steampunk',
    icon: '⚙',
    tone: 'industrious and inventive with class tension simmering beneath the brass',
    themes: ['progress vs tradition', 'class warfare', 'invention', 'empire'],
    references: ['Dishonored', 'Fullmetal Alchemist: Brotherhood', 'Perdido Street Station'],
    dangerDefault: 'moderate',
    description: 'The gears of progress grind forward. Not everyone makes it through intact.',
    settingTags: ['fantasy', 'scifi'],
  },

  // ── Horror ─────────────────────────────────────────────────────────────────

  cosmic_horror: {
    label: 'Cosmic Horror',
    icon: '🌀',
    tone: 'dread-filled, with incomprehensible forces reducing human significance to nothing',
    themes: ['sanity', 'forbidden knowledge', 'existential dread', 'helplessness'],
    references: ['Lovecraft', 'Annihilation', 'The Magnus Archives'],
    dangerDefault: 'extreme',
    description: 'Beyond the edges of the known world, something vast and uncaring stirs.',
    settingTags: ['horror', 'weird'],
  },
  gothic_horror: {
    label: 'Gothic Horror',
    icon: '🦇',
    tone: 'atmospheric, romantic, and rotting at the core',
    themes: ['obsession', 'decay', 'the monstrous self', 'old sins'],
    references: ['Dracula', 'Bloodborne', 'Crimson Peak'],
    dangerDefault: 'high',
    description: 'The castle has always been here. Something in it has always been watching.',
    settingTags: ['horror', 'fantasy'],
  },
  survival_horror: {
    label: 'Survival Horror',
    icon: '🧟',
    tone: 'tense, resource-scarce, and relentlessly pressured',
    themes: ['survival', 'trust', 'sacrifice', 'what we become under pressure'],
    references: ['The Last of Us', 'The Road', '28 Days Later'],
    dangerDefault: 'extreme',
    description: 'Every decision costs something. The question is whether the cost is worth it.',
    settingTags: ['horror', 'postapoc'],
  },
  psychological_horror: {
    label: 'Psychological Horror',
    icon: '🪞',
    tone: 'unsettling, unreliable, where the threat may be internal',
    themes: ['perception', 'identity', 'paranoia', 'gaslighting', 'memory'],
    references: ['Get Out', 'Black Mirror', 'House of Leaves'],
    dangerDefault: 'high',
    description: 'You are not sure what is real. You are not sure you can trust yourself.',
    settingTags: ['horror', 'weird'],
  },
  folk_horror: {
    label: 'Folk Horror',
    icon: '🌾',
    tone: 'rural, ritualistic, and wrong in ways that take time to name',
    themes: ['community', 'tradition', 'sacrifice', 'the land', 'outsiders'],
    references: ['Midsommar', 'The Wicker Man', 'Mexican Gothic'],
    dangerDefault: 'high',
    description: 'The village has its ways. You are starting to understand what they are.',
    settingTags: ['horror'],
  },
  southern_gothic: {
    label: 'Southern Gothic',
    icon: '🌿',
    tone: 'sultry, decayed, haunted by history and refusing to let go',
    themes: ['guilt', 'memory', 'family secrets', 'the past as present', 'race and power'],
    references: ['True Blood', 'Interview with the Vampire', 'O Brother Where Art Thou'],
    dangerDefault: 'moderate',
    description: 'The heat never breaks. The past never leaves. The house has always been in the family.',
    settingTags: ['horror', 'grounded'],
  },

  // ── Science Fiction ────────────────────────────────────────────────────────

  space_opera: {
    label: 'Space Opera',
    icon: '🚀',
    tone: 'grand, optimistic, and full of impossible scale',
    themes: ['found family', 'diplomacy vs war', 'identity across cultures', 'the frontier'],
    references: ['Mass Effect', 'The Expanse', 'Guardians of the Galaxy'],
    dangerDefault: 'moderate',
    description: 'The galaxy is vast, violent, and full of people worth knowing.',
    settingTags: ['scifi'],
  },
  cyberpunk: {
    label: 'Cyberpunk',
    icon: '💾',
    tone: 'neon-soaked, corporate-owned, and seething with resistance',
    themes: ['corporate control', 'identity', 'transhumanism', 'class war', 'information'],
    references: ['Neuromancer', 'Cyberpunk 2077', 'Blade Runner'],
    dangerDefault: 'high',
    description: 'The street finds its own uses for things. So do the corporations. Guess which one you are.',
    settingTags: ['scifi'],
  },
  post_apocalyptic: {
    label: 'Post-Apocalyptic',
    icon: '☢',
    tone: 'desperate and gritty with rare moments of unexpected beauty',
    themes: ['survival', 'community', 'resource scarcity', 'what civilization means'],
    references: ['Mad Max', 'Station Eleven', 'The Road'],
    dangerDefault: 'high',
    description: 'The world ended. What matters now is what you build from the wreckage.',
    settingTags: ['postapoc', 'scifi'],
  },
  dystopian: {
    label: 'Dystopian',
    icon: '👁',
    tone: 'oppressive and controlled with resistance as the only moral response',
    themes: ['freedom', 'surveillance', 'propaganda', 'complicity', 'rebellion'],
    references: ['1984', "The Handmaid's Tale", 'Brave New World'],
    dangerDefault: 'high',
    description: 'The system works exactly as intended. That is the problem.',
    settingTags: ['scifi', 'grounded'],
  },
  dungeon_crawler: {
    label: 'Dungeon Crawler',
    icon: '🎮',
    tone: 'darkly comedic, gamified, with death as entertainment and survival as defiance',
    themes: ['survival', 'audience', 'commodified suffering', 'found family', 'the system'],
    references: ['Dungeon Crawler Carl', 'Sword Art Online', 'Tower of God'],
    dangerDefault: 'extreme',
    description: 'Someone turned the end of the world into a game show. You are a contestant. Try to be entertaining.',
    settingTags: ['scifi', 'fantasy', 'postapoc'],
  },
  solarpunk: {
    label: 'Solarpunk',
    icon: '🌱',
    tone: 'hopeful and communal with conflict arising from the cost of maintaining that hope',
    themes: ['ecology', 'community', 'technology in harmony', 'the labor of utopia'],
    references: ['Monk & Robot (Becky Chambers)', 'Nausicaä', 'A Psalm for the Wild-Built'],
    dangerDefault: 'low',
    description: 'The future can be good. Getting there is still work. Keeping it there is harder.',
    settingTags: ['scifi', 'cozy'],
  },
  biopunk: {
    label: 'Biopunk',
    icon: '🧬',
    tone: 'visceral, transformative, and deeply uneasy about what bodies can become',
    themes: ['mutation', 'identity', 'corporate biology', 'what is human', 'the flesh'],
    references: ['Annihilation', 'Oryx and Crake', 'The Windup Girl'],
    dangerDefault: 'high',
    description: 'Biology is the new technology. The upgrade comes with side effects.',
    settingTags: ['scifi', 'horror'],
  },

  // ── Grounded ───────────────────────────────────────────────────────────────

  noir_mystery: {
    label: 'Noir & Mystery',
    icon: '🔍',
    tone: 'cynical, rain-soaked, and built on secrets that hurt when they surface',
    themes: ['corruption', 'truth', 'moral compromise', 'the city as antagonist'],
    references: ['True Detective', 'Chinatown', 'Raymond Chandler'],
    dangerDefault: 'moderate',
    description: 'Everyone is hiding something. Your job is to find out what — and decide what to do with it.',
    settingTags: ['grounded'],
  },
  political_intrigue: {
    label: 'Political Intrigue',
    icon: '♟',
    tone: 'layered, slow-burning, where information is the deadliest weapon',
    themes: ['power', 'loyalty', 'betrayal', 'legacy', 'the cost of ambition'],
    references: ['Game of Thrones', 'Dune', 'Shogun'],
    dangerDefault: 'moderate',
    description: 'The battlefield is the court. The weapons are words. The casualties are real.',
    settingTags: ['grounded', 'fantasy'],
  },
  swashbuckling: {
    label: 'Swashbuckling',
    icon: '⚓',
    tone: 'fast, witty, and full of dramatic entrances and improbable escapes',
    themes: ['adventure', 'romance', 'fortune', 'freedom', 'the open sea'],
    references: ['The Princess Bride', 'Pirates of the Caribbean', 'Treasure Island'],
    dangerDefault: 'low',
    description: 'Fortune favors the bold, the charming, and the extremely lucky.',
    settingTags: ['fantasy', 'grounded'],
  },
  heist_crime: {
    label: 'Heist & Crime',
    icon: '💰',
    tone: 'clever, tightly plotted, with trust as both weapon and vulnerability',
    themes: ['loyalty', 'greed', 'the perfect plan vs reality', 'identity'],
    references: ["Ocean's Eleven", 'Leverage', 'The Gentleman Bastards'],
    dangerDefault: 'moderate',
    description: 'The plan is perfect. It will not survive contact with the people involved.',
    settingTags: ['grounded'],
  },
  war: {
    label: 'War',
    icon: '🪖',
    tone: 'brutal and unglamorous, with heroism and atrocity occupying the same space',
    themes: ['duty', 'survival', 'camaraderie', 'the cost of conflict', 'moral injury'],
    references: ['All Quiet on the Western Front', 'Apocalypse Now', 'The Things They Carried'],
    dangerDefault: 'extreme',
    description: 'There are no clean hands here. There is only what you do and what you live with after.',
    settingTags: ['grounded'],
  },
  espionage: {
    label: 'Espionage',
    icon: '🕵',
    tone: 'cold, precise, and built on layers of deception and professional detachment',
    themes: ['loyalty', 'identity', 'moral ambiguity', 'the institution vs the individual'],
    references: ['Tinker Tailor Soldier Spy', "John le Carré", 'Spy'],
    dangerDefault: 'moderate',
    description: 'Everyone is playing a role. The question is which one is real.',
    settingTags: ['grounded'],
  },

  // ── Weird & Other ──────────────────────────────────────────────────────────

  weird_fiction: {
    label: 'Weird Fiction',
    icon: '◈',
    tone: 'surreal and unsettling, where the strangeness resists explanation',
    themes: ['the uncanny', 'transformation', 'liminal spaces', 'impossible things'],
    references: ['China Miéville', 'The Southern Reach', 'Kafka'],
    dangerDefault: 'variable',
    description: 'Reality is negotiable. The laws of nature are suggestions.',
    settingTags: ['weird', 'horror'],
  },
  cosmic_weird: {
    label: 'Cosmic Weird',
    icon: '📺',
    tone: 'uncanny and bureaucratic, where wrongness hides in procedure and mundanity',
    themes: ['perception', 'institutional horror', 'the mundane made impossible', 'signal and noise'],
    references: ['Twin Peaks', 'The Magnus Archives', 'Control'],
    dangerDefault: 'high',
    description: 'Something is wrong. It has always been wrong. The paperwork is in order.',
    settingTags: ['weird', 'horror'],
  },
  cozy: {
    label: 'Slice of Life / Cozy',
    icon: '🍵',
    tone: 'warm and unhurried, where conflict is human-scale and relationships matter most',
    themes: ['community', 'belonging', 'small joys', 'the work of ordinary life'],
    references: ['Stardew Valley', 'The House in the Cerulean Sea', "Howl's Moving Castle"],
    dangerDefault: 'low',
    description: 'Not every story needs to end the world. Some just need to end the day well.',
    settingTags: ['cozy', 'fantasy'],
  },
  isekai: {
    label: 'Isekai / Portal Fantasy',
    icon: '🌀',
    tone: 'disorienting and wonder-filled, with the player as permanent outsider learning the rules',
    themes: ['displacement', 'adaptation', 'power fantasy', 'the cost of being chosen'],
    references: ['Re:Zero', 'That Time I Got Reincarnated as a Slime', 'The Chronicles of Narnia'],
    dangerDefault: 'moderate',
    description: 'You are not from here. The world has decided that is your problem to solve.',
    settingTags: ['fantasy', 'scifi'],
  },
  mythpunk: {
    label: 'Mythpunk',
    icon: '🗿',
    tone: 'subversive and reclaimed, myth retold from the margins with contemporary teeth',
    themes: ['power', 'retelling', 'identity', 'who gets to tell the story', 'divinity and mortality'],
    references: ['American Gods', 'Circe', 'The City We Became'],
    dangerDefault: 'moderate',
    description: 'The old stories are being told again. This time the margins get a voice.',
    settingTags: ['fantasy', 'mythic', 'weird'],
  },
  magical_realism: {
    label: 'Magical Realism',
    icon: '🦋',
    tone: 'lyrical and matter-of-fact about the impossible, grief and history made literal',
    themes: ['memory', 'grief', 'the body', 'generational weight', 'place'],
    references: ["Pan's Labyrinth", 'Piranesi', 'One Hundred Years of Solitude'],
    dangerDefault: 'moderate',
    description: 'The dead come to dinner sometimes. The house has its moods. This is not unusual.',
    settingTags: ['weird', 'fantasy', 'grounded'],
  },
  custom: {
    label: 'Custom',
    icon: '✦',
    tone: '',
    themes: [],
    references: [],
    dangerDefault: 'moderate',
    description: 'Describe exactly the game you want to run.',
    settingTags: [],
  },
}

export const CAMPAIGN_TYPE_GROUPS = [
  { label: 'Fantasy',          keys: ['classic_fantasy', 'dark_fantasy', 'sword_and_sorcery', 'mythic', 'fairy_tale', 'wuxia', 'steampunk'] },
  { label: 'Horror',           keys: ['cosmic_horror', 'gothic_horror', 'survival_horror', 'psychological_horror', 'folk_horror', 'southern_gothic'] },
  { label: 'Science Fiction',  keys: ['space_opera', 'cyberpunk', 'post_apocalyptic', 'dystopian', 'dungeon_crawler', 'solarpunk', 'biopunk'] },
  { label: 'Grounded',         keys: ['noir_mystery', 'political_intrigue', 'swashbuckling', 'heist_crime', 'war', 'espionage'] },
  { label: 'Weird & Other',    keys: ['weird_fiction', 'cosmic_weird', 'cozy', 'isekai', 'mythpunk', 'magical_realism', 'custom'] },
]

export const DANGER_LEVELS = {
  low:      { label: 'Heroic',   description: 'Death is rare. Focus on adventure and story.' },
  moderate: { label: 'Balanced', description: 'Danger is real but recoverable. Standard play.' },
  high:     { label: 'Grim',     description: 'Choices have serious consequences. Permadeath possible.' },
  extreme:  { label: 'Brutal',   description: 'Death lurks everywhere. Every decision matters.' },
}
