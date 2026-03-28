/**
 * useCombat — React hook that manages combat flow.
 *
 * Responsibilities:
 *  - Detect [COMBAT:] tags in DM responses and initialise combat
 *  - Run initiative rolling
 *  - Process player combat actions
 *  - Request enemy AI decisions and resolve them
 *  - Apply damage, conditions, and deaths to the store
 *  - Detect end-of-combat conditions and clean up
 */

import { useCallback } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import {
  rollInitiative,
  resolveAttack,
  getResultConditions,
  tickConditions,
  getEnemyAction,
  buildCombatant,
  buildCombatNarration,
  formatCombatLogEntry,
  generateEnemyStats,
} from '@/lib/combat/combatEngine'

export function useCombat() {
  const config = useAppStore(s => s.config)
  const {
    combat, characters, world, campaign, story, messages,
    startCombat, endCombat, nextCombatTurn, setCombatPhase,
    updateCombatant, removeCombatant, addCombatLogEntry,
    updateCharacter, addMessage, setGlobalFlag,
  } = useGameStore()

  const gameState = { campaign, world, characters, story, messages }

  // ── Start combat ─────────────────────────────────────────────────────────

  const initCombat = useCallback((enemyList) => {
    const playerCombatants = Object.values(characters).map(c => buildCombatant(c, 'player'))

    const enemyCombatants = enemyList.map(e => buildCombatant({
      ...e,
      stats: e.stats || generateEnemyStats(e.threatLevel || 'normal'),
      hp: e.hp || generateEnemyStats(e.threatLevel || 'normal').hp,
      maxHp: e.maxHp || generateEnemyStats(e.threatLevel || 'normal').maxHp,
    }, 'enemy'))

    const all = rollInitiative([...playerCombatants, ...enemyCombatants])

    startCombat(all)

    // Log initiative order
    addMessage({
      role: 'system',
      type: 'combat-start',
      content: 'Combat begins!',
      combatants: all.map(c => ({
        name: c.name,
        type: c.type,
        initiative: c.initiativeRoll,
        dice: c.initiativeDice,
      })),
    })

    return all
  }, [characters, startCombat, addMessage])

  // ── Player attack ─────────────────────────────────────────────────────────

  const playerAttack = useCallback((attackerId, targetId, mode = 'melee', abilityKey = null) => {
    if (!combat) return null

    const attacker = combat.combatants.find(c => c.id === attackerId)
    const target = combat.combatants.find(c => c.id === targetId)
    if (!attacker || !target) return null

    const resolution = resolveAttack(attacker, target, mode, abilityKey)
    const logEntry = formatCombatLogEntry(attacker, target, resolution)

    // Apply damage or healing
    if (resolution.isHeal) {
      const newHp = Math.min(target.maxHp, target.hp + resolution.damage)
      updateCombatant(targetId, { hp: newHp })
      if (target.type === 'player') updateCharacter(targetId, { hp: newHp })
    } else if (resolution.damage > 0) {
      const newHp = Math.max(0, target.hp - resolution.damage)
      updateCombatant(targetId, { hp: newHp })
      if (target.type === 'player') updateCharacter(targetId, { hp: newHp })

      // Apply result conditions (stun on critical, etc.)
      const newConditions = getResultConditions(resolution.outcome, abilityKey)
      if (newConditions.length > 0) {
        const current = target.conditions || []
        const updated = [...new Set([...current, ...newConditions])]
        updateCombatant(targetId, { conditions: updated })
        if (target.type === 'player') updateCharacter(targetId, { conditions: updated })
      }

      // Check death
      if (newHp <= 0) {
        logEntry.defeated = true
        handleDefeat(target)
      }
    }

    // Apply battle_fury condition to attacker if damaged
    if (abilityKey === 'battle_fury' && resolution.damage > 0) {
      const current = attacker.conditions || []
      updateCombatant(attackerId, { conditions: [...current, 'inspired'] })
    }

    addCombatLogEntry(logEntry)
    addMessage({
      role: 'system',
      type: 'combat-action',
      content: logEntry.description,
      combatLog: logEntry,
    })

    return resolution
  }, [combat, updateCombatant, updateCharacter, addCombatLogEntry, addMessage])

  // ── Enemy turn ────────────────────────────────────────────────────────────

  const runEnemyTurn = useCallback(async (enemyId) => {
    if (!combat) return

    const enemy = combat.combatants.find(c => c.id === enemyId)
    if (!enemy || enemy.hp <= 0) {
      nextCombatTurn()
      return
    }

    setCombatPhase('resolving')

    // Tick conditions (burning damage, etc.)
    const { damage: burnDamage, conditionsToRemove } = tickConditions(enemy)
    if (burnDamage > 0) {
      const newHp = Math.max(0, enemy.hp - burnDamage)
      updateCombatant(enemyId, { hp: newHp })
      addCombatLogEntry({ type: 'condition-tick', description: `${enemy.name} takes ${burnDamage} burning damage.`, entityId: enemyId })
      if (newHp <= 0) { handleDefeat(enemy); nextCombatTurn(); return }
    }
    if (conditionsToRemove.length > 0) {
      const updated = (enemy.conditions || []).filter(c => !conditionsToRemove.includes(c))
      updateCombatant(enemyId, { conditions: updated })
    }

    // Skip if stunned
    if (enemy.conditions?.includes('stunned')) {
      const updated = (enemy.conditions || []).filter(c => c !== 'stunned')
      updateCombatant(enemyId, { conditions: updated })
      addCombatLogEntry({ type: 'skipped', description: `${enemy.name} is stunned and skips their turn.`, entityId: enemyId })
      nextCombatTurn()
      return
    }

    // Get enemy AI decision
    const players = combat.combatants.filter(c => c.type === 'player' && c.hp > 0)
    if (players.length === 0) { nextCombatTurn(); return }

    try {
      const decision = await getEnemyAction({ enemy, players, gameState, config })

      if (decision.action === 'flee') {
        addCombatLogEntry({ type: 'flee', description: `${enemy.name} attempts to flee!`, entityId: enemyId })
        removeCombatant(enemyId)
        addMessage({ role: 'system', type: 'combat-action', content: `${enemy.name} flees the battle!` })
        if (checkCombatEnd()) return
        nextCombatTurn()
        return
      }

      if (decision.action === 'attack' || decision.action === 'use_ability') {
        const targetId = decision.target
        const target = combat.combatants.find(c => c.id === targetId) || players[0]
        if (!target) { nextCombatTurn(); return }

        const resolution = resolveAttack(enemy, target, decision.mode || 'melee', decision.abilityKey)
        const logEntry = formatCombatLogEntry(enemy, target, resolution, decision.description)

        if (resolution.damage > 0 && !resolution.isHeal) {
          const newHp = Math.max(0, target.hp - resolution.damage)
          updateCombatant(target.id, { hp: newHp })
          updateCharacter(target.id, { hp: newHp })

          const newConds = getResultConditions(resolution.outcome, decision.abilityKey)
          if (newConds.length > 0) {
            const updated = [...new Set([...(target.conditions || []), ...newConds])]
            updateCombatant(target.id, { conditions: updated })
            updateCharacter(target.id, { conditions: updated })
          }

          if (newHp <= 0) { logEntry.defeated = true; handleDefeat(target) }
        }

        addCombatLogEntry(logEntry)
        addMessage({ role: 'system', type: 'combat-action', content: logEntry.description, combatLog: logEntry })
      } else {
        // Taunt / defend — just log the description
        addMessage({ role: 'system', type: 'combat-action', content: decision.description })
      }
    } catch (err) {
      console.warn('[Combat] Enemy turn error:', err.message)
    }

    setCombatPhase('player_action')
    nextCombatTurn()
  }, [combat, gameState, config, updateCombatant, updateCharacter, addCombatLogEntry, addMessage, nextCombatTurn, removeCombatant, setCombatPhase])

  // ── End turn ──────────────────────────────────────────────────────────────

  const endTurn = useCallback(() => {
    if (!combat) return

    // Tick player conditions on their turn end
    const active = combat.combatants[combat.activeIndex]
    if (active?.type === 'player') {
      const { damage: burnDamage, conditionsToRemove } = tickConditions(active)
      if (burnDamage > 0) {
        const newHp = Math.max(0, active.hp - burnDamage)
        updateCombatant(active.id, { hp: newHp })
        updateCharacter(active.id, { hp: newHp })
        addCombatLogEntry({ type: 'condition-tick', description: `${active.name} takes ${burnDamage} burning damage.` })
      }
      if (conditionsToRemove.length > 0) {
        const updated = (active.conditions || []).filter(c => !conditionsToRemove.includes(c))
        updateCombatant(active.id, { conditions: updated })
        updateCharacter(active.id, { conditions: updated })
      }
    }

    if (!checkCombatEnd()) nextCombatTurn()
  }, [combat, updateCombatant, updateCharacter, addCombatLogEntry, nextCombatTurn])

  // ── Victory / defeat check ────────────────────────────────────────────────

  function checkCombatEnd() {
    if (!combat) return true
    const currentCombatants = useGameStore.getState().combat?.combatants || []
    const livingEnemies = currentCombatants.filter(c => c.type === 'enemy' && c.hp > 0)
    const livingPlayers = currentCombatants.filter(c => c.type === 'player' && c.hp > 0)

    if (livingEnemies.length === 0) {
      endCombat()
      setGlobalFlag('last_combat_result', 'victory')
      addMessage({
        role: 'system',
        type: 'combat-end',
        content: 'Victory! All enemies are defeated.',
        result: 'victory',
      })
      return true
    }

    if (livingPlayers.length === 0) {
      endCombat()
      setGlobalFlag('last_combat_result', 'defeat')
      addMessage({
        role: 'system',
        type: 'combat-end',
        content: 'The party has been defeated…',
        result: 'defeat',
      })
      return true
    }

    return false
  }

  function handleDefeat(combatant) {
    if (combatant.type === 'enemy') {
      // Enemy dies — remove from combat, mark dead in world
      removeCombatant(combatant.id)
      setGlobalFlag(`${combatant.id}_defeated`, true)
      addMessage({
        role: 'system',
        type: 'combat-action',
        content: `${combatant.name} has been defeated!`,
      })
    } else {
      // Player goes down — apply dying condition
      updateCombatant(combatant.id, { conditions: ['dying'] })
      updateCharacter(combatant.id, { conditions: ['dying'], hp: 0 })
      addMessage({
        role: 'system',
        type: 'combat-action',
        content: `${combatant.name} has fallen!`,
      })
    }
  }

  return { combat, initCombat, playerAttack, runEnemyTurn, endTurn }
}
