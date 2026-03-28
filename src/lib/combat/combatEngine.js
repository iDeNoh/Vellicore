/**
 * Combat Engine — Module 9
 *
 * Implements Three Fates combat using the existing rules system:
 *
 *   Initiative: each combatant rolls Spirit dice → sorted by successes
 *   Attack: attacker rolls Body (melee) or Mind (ranged/magic)
 *   Defense: defender rolls Body
 *   Damage: net successes above defense
 *   Abilities modify rolls per their descriptions
 *   Conditions apply die penalties
 *
 * Enemy AI: the DM is asked for enemy intent each turn, then we
 * resolve mechanically and feed results back for narration.
 */

import { rollDice, opposedRoll, getResultTier, CONDITIONS } from '@/lib/rules/rules'
import { sendToLlm } from '@/services/llm/llmService'
import { buildDmSystemPrompt } from '@/lib/world/dmPrompts'

// ── Initiative ─────────────────────────────────────────────────────────────────

/**
 * Roll initiative for all combatants.
 * Returns combatants sorted highest → lowest with their rolls attached.
 *
 * @param {Array} entities - [{id, name, type, stats, conditions, abilities, hp, maxHp}]
 * @returns {Array} sorted combatants with initiativeRoll and initiativeDice
 */
export function rollInitiative(entities) {
  return entities
    .map(entity => {
      const spiritStat = Math.max(1, (entity.stats?.spirit || 2) - getConditionPenalty(entity, 'spirit'))
      const roll = rollDice(spiritStat)
      return {
        ...entity,
        initiativeRoll: roll.successes,
        initiativeDice: roll.rolls,
        // Tie-breaker: use raw spirit stat
        initiativeTiebreak: entity.stats?.spirit || 2,
      }
    })
    .sort((a, b) =>
      b.initiativeRoll !== a.initiativeRoll
        ? b.initiativeRoll - a.initiativeRoll
        : b.initiativeTiebreak - a.initiativeTiebreak
    )
}

// ── Attack resolution ──────────────────────────────────────────────────────────

/**
 * Resolve an attack between attacker and defender.
 *
 * @param {object} attacker - combatant object
 * @param {object} defender - combatant object
 * @param {string} mode     - 'melee' | 'ranged' | 'magic'
 * @param {string} [abilityKey] - optional ability being used
 * @returns {object} resolution result
 */
export function resolveAttack(attacker, defender, mode = 'melee', abilityKey = null) {
  // Determine attack and defense stats
  const attackStat = getAttackStat(attacker, mode)
  const defenseStat = getDefenseStat(defender, mode)

  // Apply condition penalties
  const attackDice = Math.max(1, attackStat - getConditionPenalty(attacker, statForMode(mode)))
  const defenseDice = Math.max(1, defenseStat - getConditionPenalty(defender, 'body'))

  // Apply ability bonuses
  const attackBonus = getAbilityBonus(attacker, abilityKey, 'attack')
  const defenseBonus = getAbilityBonus(defender, null, 'defense')

  const finalAttackDice = Math.max(1, attackDice + attackBonus)
  const finalDefenseDice = Math.max(1, defenseDice + defenseBonus)

  // Roll
  const attackRoll = rollDice(finalAttackDice)
  const defenseRoll = rollDice(finalDefenseDice)
  const net = attackRoll.successes - defenseRoll.successes

  // Determine damage
  let damage = 0
  let outcome = 'miss'

  if (net <= 0) {
    outcome = 'miss'
    damage = 0
  } else if (net === 1) {
    outcome = 'partial'
    damage = 1
  } else if (net === 2) {
    outcome = 'hit'
    damage = net
  } else if (net === 3) {
    outcome = 'strong_hit'
    damage = net
  } else {
    outcome = 'critical'
    damage = net
  }

  // Special ability effects
  const effects = []
  if (abilityKey === 'cleave' && outcome === 'strong_hit') effects.push('cleave')
  if (abilityKey === 'battle_fury') effects.push('battle_fury_triggered')
  if (abilityKey === 'arcane_bolt' && mode === 'magic') damage = Math.max(2, damage)

  // Mend heals instead of damages
  if (abilityKey === 'mend') {
    damage = rollDice(attacker.stats?.mind || 2).successes + 1
    outcome = damage > 0 ? 'heal' : 'partial'
    return {
      attackRoll, defenseRoll, net,
      outcome, damage, effects,
      attackDice: finalAttackDice,
      defenseDice: finalDefenseDice,
      mode,
      abilityKey,
      isHeal: true,
    }
  }

  return {
    attackRoll,
    defenseRoll,
    net,
    outcome,
    damage,
    effects,
    attackDice: finalAttackDice,
    defenseDice: finalDefenseDice,
    mode,
    abilityKey,
    isHeal: false,
  }
}

// ── Condition application ──────────────────────────────────────────────────────

/**
 * Apply conditions that result from a hit.
 * Returns array of condition keys to add.
 */
export function getResultConditions(outcome, abilityKey) {
  const conditions = []
  if (outcome === 'critical') conditions.push('stunned')
  if (abilityKey === 'burning_arrow') conditions.push('burning')
  if (abilityKey === 'poison_strike') conditions.push('poisoned')
  return conditions
}

/**
 * Process end-of-turn condition ticks.
 * Returns {damageFromBurning, conditionsToRemove}
 */
export function tickConditions(combatant) {
  const damage = combatant.conditions?.includes('burning') ? 1 : 0
  const remove = combatant.conditions?.filter(c => {
    const info = CONDITIONS[c]
    return info?.duration === '1 turn'
  }) || []
  return { damage, conditionsToRemove: remove }
}

// ── Enemy AI ───────────────────────────────────────────────────────────────────

/**
 * Ask the DM (Claude) what action the current enemy takes.
 * Returns a structured action decision.
 *
 * @param {object} opts
 * @param {object} opts.enemy        - The acting enemy combatant
 * @param {Array}  opts.players      - Player character combatants
 * @param {object} opts.gameState    - Full game state for context
 * @param {object} opts.config       - App config
 * @returns {Promise<object>}        - { action, target, mode, abilityKey, description }
 */
export async function getEnemyAction({ enemy, players, gameState, config }) {
  const { campaign, world, story } = gameState

  const systemPrompt = `You are the combat AI for a TTRPG. Decide what action an enemy NPC takes on their turn.
Respond ONLY with valid JSON — no explanation, no markdown fences.`

  const activePlayers = players.filter(p => p.hp > 0)
  const weakest = [...activePlayers].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
  const strongest = [...activePlayers].sort((a, b) => b.stats?.body - a.stats?.body)[0]

  const prompt = `Enemy turn in combat.

ENEMY: ${enemy.name} (${enemy.role || 'unknown'})
  HP: ${enemy.hp}/${enemy.maxHp}
  Stats: Body ${enemy.stats?.body}, Mind ${enemy.stats?.mind}, Spirit ${enemy.stats?.spirit}
  Conditions: ${enemy.conditions?.join(', ') || 'none'}
  Personality: ${enemy.personality || 'aggressive'}

PLAYERS:
${activePlayers.map(p => `  ${p.name}: HP ${p.hp}/${p.maxHp}, conditions: ${p.conditions?.join(', ') || 'none'}`).join('\n')}

SITUATION: ${world?.locations?.[world?.currentLocation]?.name || 'unknown location'}

Decide the enemy's action. Respond with JSON:
{
  "action": "attack" | "defend" | "flee" | "taunt" | "use_ability",
  "target": "${activePlayers[0]?.id || 'player'}",
  "targetName": "${activePlayers[0]?.name || 'player'}",
  "mode": "melee" | "ranged" | "magic",
  "abilityKey": null,
  "description": "one sentence describing what the enemy does, in present tense",
  "reasoning": "brief tactical note"
}`

  try {
    let raw = ''
    await sendToLlm({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      config: config.llm,
      maxTokens: 200,
      temperature: 0.7,
      onChunk: (c) => { raw += c },
    })

    // Parse JSON
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON in response')

    const decision = JSON.parse(raw.slice(start, end + 1))
    return {
      action: decision.action || 'attack',
      target: decision.target || activePlayers[0]?.id,
      targetName: decision.targetName || activePlayers[0]?.name,
      mode: decision.mode || 'melee',
      abilityKey: decision.abilityKey || null,
      description: decision.description || `${enemy.name} attacks!`,
    }
  } catch (err) {
    console.warn('[CombatEngine] Enemy AI failed, using fallback:', err.message)
    // Fallback: attack the weakest player
    return {
      action: 'attack',
      target: weakest?.id || activePlayers[0]?.id,
      targetName: weakest?.name || 'the adventurer',
      mode: 'melee',
      abilityKey: null,
      description: `${enemy.name} lunges at ${weakest?.name || 'you'}!`,
    }
  }
}

// ── Combat result narration ────────────────────────────────────────────────────

/**
 * Build a narrative description of an attack result for the DM to use.
 */
export function buildCombatNarration(attacker, defender, resolution) {
  const { outcome, damage, isHeal, mode, abilityKey } = resolution

  if (isHeal) {
    return `${attacker.name} heals ${defender.name} for ${damage} HP.`
  }

  const weaponDesc = mode === 'magic' ? 'spell' : mode === 'ranged' ? 'ranged attack' : 'attack'

  switch (outcome) {
    case 'miss':
      return `${attacker.name}'s ${weaponDesc} misses ${defender.name}.`
    case 'partial':
      return `${attacker.name} grazes ${defender.name} for ${damage} damage — a partial hit.`
    case 'hit':
      return `${attacker.name} hits ${defender.name} for ${damage} damage.`
    case 'strong_hit':
      return `${attacker.name} strikes ${defender.name} hard — ${damage} damage!`
    case 'critical':
      return `${attacker.name} lands a devastating blow on ${defender.name} — ${damage} damage!`
    default:
      return `${attacker.name} attacks ${defender.name}.`
  }
}

/**
 * Format a combat result as a chat message for the log.
 */
export function formatCombatLogEntry(attacker, defender, resolution, extraDesc = '') {
  const { attackRoll, defenseRoll, damage, outcome, isHeal } = resolution

  return {
    attacker: attacker.name,
    defender: defender.name,
    attackDice: attackRoll.rolls,
    attackSuccesses: attackRoll.successes,
    defenseDice: defenseRoll.rolls,
    defenseSuccesses: defenseRoll.successes,
    damage,
    outcome,
    isHeal,
    description: extraDesc || buildCombatNarration(attacker, defender, resolution),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAttackStat(combatant, mode) {
  if (mode === 'magic' || mode === 'ranged') return combatant.stats?.mind || 2
  return combatant.stats?.body || 2
}

function getDefenseStat(combatant, mode) {
  // Defenders always roll Body to resist
  let base = combatant.stats?.body || 2
  if (combatant.abilities?.includes('shield_wall')) base += 1
  return base
}

function statForMode(mode) {
  if (mode === 'magic' || mode === 'ranged') return 'mind'
  return 'body'
}

function getConditionPenalty(combatant, statKey) {
  const conditions = combatant.conditions || []
  let penalty = 0
  if (conditions.includes('poisoned')) penalty += 1
  if (conditions.includes('wounded') && statKey === 'body') penalty += 1
  if (conditions.includes('confused') && statKey === 'mind') penalty += 1
  if (conditions.includes('shaken') && statKey === 'spirit') penalty += 1
  if (conditions.includes('stunned')) penalty += 99  // effectively can't act
  return penalty
}

function getAbilityBonus(combatant, abilityKey, context) {
  let bonus = 0
  const abilities = combatant.abilities || []

  if (context === 'attack') {
    if (abilityKey === 'precise_shot' && combatant.abilities?.includes('precise_shot')) bonus += 0  // narrative only
    if (abilities.includes('battle_fury') && combatant.conditions?.includes('wounded')) bonus += 1
  }
  if (context === 'defense') {
    if (abilities.includes('stone_endurance')) bonus += 1
  }
  return bonus
}

// ── Enemy stat presets ─────────────────────────────────────────────────────────

/**
 * Generate enemy stats appropriate for a given threat level.
 * Used when the DM introduces enemies without explicit stats.
 */
export function generateEnemyStats(threatLevel = 'normal') {
  const presets = {
    minion:  { body: 1, mind: 1, spirit: 1, hp: 4,  maxHp: 4  },
    normal:  { body: 2, mind: 2, spirit: 2, hp: 8,  maxHp: 8  },
    tough:   { body: 3, mind: 2, spirit: 2, hp: 12, maxHp: 12 },
    elite:   { body: 3, mind: 3, spirit: 3, hp: 16, maxHp: 16 },
    boss:    { body: 4, mind: 3, spirit: 3, hp: 24, maxHp: 24 },
    legendary:{ body: 5, mind: 4, spirit: 4, hp: 32, maxHp: 32 },
  }
  return presets[threatLevel] || presets.normal
}

/**
 * Build a combatant object from a character or NPC.
 */
export function buildCombatant(entity, type = 'player') {
  return {
    id: entity.id,
    name: entity.name,
    type,  // 'player' | 'enemy' | 'ally'
    stats: entity.stats || { body: 2, mind: 2, spirit: 2 },
    hp: entity.hp || entity.maxHp || 8,
    maxHp: entity.maxHp || 8,
    conditions: [...(entity.conditions || [])],
    abilities: entity.abilities || [],
    portraitBase64: entity.portraitBase64 || null,
    tokenBase64: entity.tokenBase64 || null,
    role: entity.role || null,
    initiativeRoll: 0,
    initiativeDice: [],
  }
}
