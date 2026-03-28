import React, { useState, useEffect } from 'react'
import { useGameStore } from '@/store/appStore'
import { useCombat } from '@/hooks/useCombat'
import { ABILITIES } from '@/lib/rules/rules'
import clsx from 'clsx'

export default function CombatTracker({ onClose }) {
  const { combat, characters, world } = useGameStore()
  const { playerAttack, runEnemyTurn, endTurn } = useCombat()

  const [selectedAction, setSelectedAction] = useState(null)  // { type, mode, abilityKey }
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const { endCombat, addMessage } = useGameStore()

  if (!combat) return null

  const { combatants, activeIndex, round, phase, log } = combat
  const activeCombatant = combatants[activeIndex]
  const isPlayerTurn = activeCombatant?.type === 'player'
  const isResolving = phase === 'resolving'

  const players = combatants.filter(c => c.type === 'player')
  const enemies = combatants.filter(c => c.type === 'enemy')
  const activePlayer = isPlayerTurn ? characters[activeCombatant?.id] : null
  const playerAbilities = activePlayer?.abilities || []

  // Auto-run enemy turns
  useEffect(() => {
    if (!isPlayerTurn && !isResolving && activeCombatant?.hp > 0) {
      const timer = setTimeout(() => {
        runEnemyTurn(activeCombatant.id)
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [activeIndex, isPlayerTurn, activeCombatant?.id])

  function handleAttack(mode, abilityKey = null) {
    setSelectedAction({ mode, abilityKey })
    setSelectedTarget(null)
  }

  function handleTargetSelect(targetId) {
    if (!selectedAction || !activeCombatant) return
    playerAttack(activeCombatant.id, targetId, selectedAction.mode, selectedAction.abilityKey)
    setSelectedAction(null)
    setSelectedTarget(null)
    setTimeout(() => endTurn(), 300)
  }

  function handleForcedEnd() {
    endCombat()
    addMessage({ role: 'system', type: 'combat-end', content: 'Combat ended.', result: 'ended' })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-950/85 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700 bg-crimson-600/10">
          <div className="flex items-center gap-3">
            <span className="text-crimson-400 text-lg">⚔</span>
            <div>
              <h3 className="font-display text-base text-parchment-100">Combat — Round {round}</h3>
              <p className="font-ui text-xs text-parchment-400">
                {isPlayerTurn
                  ? `${activeCombatant?.name}'s turn`
                  : isResolving
                    ? 'Resolving…'
                    : `${activeCombatant?.name} is acting…`}
              </p>
            </div>
          </div>
          <button onClick={() => setConfirmEnd(true)} className="btn-ghost text-xs px-2">End combat</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col sm:flex-row gap-0 divide-y sm:divide-y-0 sm:divide-x divide-ink-700">

            {/* ── Left: Initiative order ── */}
            <div className="sm:w-48 p-4 space-y-2 shrink-0">
              <p className="label text-xs mb-3">Initiative</p>
              {combatants.map((c, i) => (
                <InitiativeRow
                  key={c.id}
                  combatant={c}
                  active={i === activeIndex}
                  isTarget={selectedAction && c.type === 'enemy' && c.hp > 0}
                  onTargetClick={() => selectedAction && c.type === 'enemy' && handleTargetSelect(c.id)}
                />
              ))}
            </div>

            {/* ── Right: Action area ── */}
            <div className="flex-1 p-4 space-y-4">

              {/* Player action panel */}
              {isPlayerTurn && activePlayer && !isResolving && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full border border-gold-500/40 overflow-hidden bg-ink-700 flex items-center justify-center text-sm">
                      {activePlayer.tokenBase64
                        ? <img src={`data:image/png;base64,${activePlayer.tokenBase64}`} className="w-full h-full object-cover" alt="" />
                        : activePlayer.name?.[0]}
                    </div>
                    <div>
                      <p className="font-display text-sm text-parchment-100">{activePlayer.name}</p>
                      <HpBar hp={activeCombatant.hp} maxHp={activeCombatant.maxHp} size="sm" />
                    </div>
                  </div>

                  {!selectedAction ? (
                    <>
                      <p className="font-ui text-xs text-parchment-400">Choose an action:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <ActionBtn onClick={() => handleAttack('melee')} icon="⚔" label="Melee attack" />
                        <ActionBtn onClick={() => handleAttack('ranged')} icon="🏹" label="Ranged attack" />
                        <ActionBtn onClick={() => handleAttack('magic')} icon="✦" label="Magic attack" />
                        <ActionBtn onClick={() => endTurn()} icon="↷" label="End turn" secondary />
                      </div>

                      {/* Ability actions */}
                      {playerAbilities.length > 0 && (
                        <div>
                          <p className="font-ui text-xs text-parchment-400 mb-2">Abilities:</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {playerAbilities.map(abilityKey => {
                              const ab = ABILITIES[abilityKey]
                              if (!ab) return null
                              const mode = ab.type === 'magic' ? 'magic' : ab.type === 'combat' ? 'melee' : null
                              if (!mode) return null
                              return (
                                <button key={abilityKey}
                                  onClick={() => handleAttack(mode, abilityKey)}
                                  className="text-left px-2.5 py-2 rounded border border-arcane-600/40 bg-arcane-600/10 hover:bg-arcane-600/20 transition-all">
                                  <p className="font-ui text-xs text-arcane-300">{ab.label}</p>
                                  <p className="font-body text-xs text-parchment-500 line-clamp-1">{ab.description}</p>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-ui text-sm text-gold-300">
                        Select a target for your {selectedAction.abilityKey ? ABILITIES[selectedAction.abilityKey]?.label : selectedAction.mode + ' attack'}:
                      </p>
                      <div className="space-y-1.5">
                        {enemies.filter(e => e.hp > 0).map(enemy => (
                          <button key={enemy.id}
                            onClick={() => handleTargetSelect(enemy.id)}
                            className="w-full text-left p-3 rounded border border-crimson-600/40 bg-crimson-600/10 hover:bg-crimson-600/20 transition-all">
                            <div className="flex items-center justify-between">
                              <span className="font-ui text-sm text-parchment-200">{enemy.name}</span>
                              <span className="text-xs text-crimson-300 font-ui">{enemy.hp}/{enemy.maxHp} HP</span>
                            </div>
                            <HpBar hp={enemy.hp} maxHp={enemy.maxHp} size="xs" color="crimson" />
                          </button>
                        ))}
                        <button onClick={() => setSelectedAction(null)}
                          className="btn-ghost text-xs w-full mt-1">
                          ← Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Enemy turn indicator */}
              {!isPlayerTurn && (
                <div className="flex items-center gap-3 py-4">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-2 h-2 rounded-full bg-crimson-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="font-body text-sm text-parchment-400 italic">
                    {activeCombatant?.name} is acting…
                  </span>
                </div>
              )}

              {/* Combat log */}
              <div>
                <p className="label text-xs mb-2">Combat log</p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {[...log].reverse().slice(0, 15).map(entry => (
                    <CombatLogRow key={entry.id} entry={entry} />
                  ))}
                  {log.length === 0 && (
                    <p className="text-xs text-parchment-500 font-ui italic">No actions yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Confirm end combat modal */}
        {confirmEnd && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950/80 rounded-xl">
            <div className="panel p-6 text-center max-w-xs">
              <p className="font-display text-base text-parchment-100 mb-2">End combat?</p>
              <p className="font-body text-sm text-parchment-400 mb-4">
                This will end the combat encounter immediately.
              </p>
              <div className="flex gap-2 justify-center">
                <button className="btn-ghost text-sm" onClick={() => setConfirmEnd(false)}>Cancel</button>
                <button className="btn-danger text-sm" onClick={handleForcedEnd}>End combat</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InitiativeRow({ combatant, active, isTarget, onTargetClick }) {
  const hpPct = Math.max(0, (combatant.hp / combatant.maxHp) * 100)

  return (
    <div
      onClick={onTargetClick}
      className={clsx('flex items-center gap-2 px-2 py-2 rounded border transition-all',
        active ? 'border-gold-500/60 bg-gold-500/10' :
        isTarget ? 'border-crimson-500/50 bg-crimson-500/10 cursor-pointer hover:bg-crimson-500/20' :
        'border-ink-700 bg-ink-800/50'
      )}>
      {/* Portrait */}
      <div className={clsx('w-7 h-7 rounded-full border overflow-hidden flex items-center justify-center text-xs flex-shrink-0',
        combatant.type === 'player' ? 'border-gold-500/60' :
        combatant.type === 'enemy' ? 'border-crimson-500/60' : 'border-ink-600'
      )}>
        {combatant.tokenBase64
          ? <img src={`data:image/png;base64,${combatant.tokenBase64}`} className="w-full h-full object-cover" alt="" />
          : <span className="text-parchment-400">{combatant.name?.[0]}</span>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={clsx('font-ui text-xs truncate',
            active ? 'text-gold-300 font-medium' : 'text-parchment-300'
          )}>
            {combatant.name}
          </span>
          <span className="text-xs text-parchment-500 font-ui ml-1 shrink-0">{combatant.initiativeRoll}</span>
        </div>
        {/* HP micro-bar */}
        <div className="h-1 bg-ink-700 rounded-full mt-0.5 overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all',
            hpPct > 60 ? 'bg-forest-500' :
            hpPct > 30 ? 'bg-gold-500' : 'bg-crimson-500'
          )} style={{ width: `${hpPct}%` }} />
        </div>
      </div>

      {/* Conditions */}
      {combatant.conditions?.length > 0 && (
        <span className="text-xs text-crimson-400 shrink-0" title={combatant.conditions.join(', ')}>!</span>
      )}
    </div>
  )
}

function HpBar({ hp, maxHp, size = 'md', color }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const barColor = color
    ? `bg-${color}-500`
    : pct > 60 ? 'bg-forest-500' : pct > 30 ? 'bg-gold-500' : 'bg-crimson-500'

  return (
    <div className={clsx('bg-ink-700 rounded-full overflow-hidden', size === 'xs' ? 'h-1 mt-1' : 'h-1.5 mt-1')}>
      <div className={clsx('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function ActionBtn({ onClick, icon, label, secondary }) {
  return (
    <button onClick={onClick}
      className={clsx('flex items-center gap-2 px-3 py-2.5 rounded border text-sm font-ui transition-all',
        secondary
          ? 'border-ink-600 bg-ink-700 text-parchment-400 hover:bg-ink-600'
          : 'border-gold-500/40 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20'
      )}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function CombatLogRow({ entry }) {
  const isHit = entry.outcome && !['miss'].includes(entry.outcome)
  const isHeal = entry.isHeal

  return (
    <div className={clsx('text-xs font-body px-2 py-1 rounded border-l-2',
      isHeal ? 'text-forest-300 border-forest-500' :
      entry.defeated ? 'text-crimson-300 border-crimson-500 font-medium' :
      isHit ? 'text-parchment-300 border-ink-600' :
      'text-parchment-500 border-ink-700'
    )}>
      {entry.description}
      {entry.damage > 0 && !isHeal && (
        <span className="ml-1 text-crimson-400 font-medium">({entry.damage} dmg)</span>
      )}
      {isHeal && entry.damage > 0 && (
        <span className="ml-1 text-forest-400 font-medium">(+{entry.damage} HP)</span>
      )}
    </div>
  )
}
