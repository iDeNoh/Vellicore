/**
 * StateTracker — in-game panel for adjusting character HP, conditions, and inventory.
 *
 * Accessible from the CharacterPanel via a small edit button.
 * All changes write to the game store (and are auto-persisted by useGamePersistence).
 */

import React, { useState } from 'react'
import { useGameStore } from '@/store/appStore'
import { CONDITIONS, STAT_INFO, calcMaxHp } from '@/lib/rules/rules'
import clsx from 'clsx'

export default function StateTracker({ characterId, onClose }) {
  const { characters, updateCharacter } = useGameStore()
  const char = characters[characterId]
  const [hpInput, setHpInput] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [newItemType, setNewItemType] = useState('gear')

  if (!char) return null

  // ── HP adjustment ──────────────────────────────────────────────────────────

  function applyHpChange(delta) {
    const newHp = Math.max(0, Math.min(char.maxHp, char.hp + delta))
    updateCharacter(characterId, { hp: newHp })
  }

  function setHpDirectly() {
    const val = parseInt(hpInput)
    if (!isNaN(val)) {
      updateCharacter(characterId, { hp: Math.max(0, Math.min(char.maxHp, val)) })
      setHpInput('')
    }
  }

  function fullHeal() {
    updateCharacter(characterId, { hp: char.maxHp })
  }

  // ── Conditions ─────────────────────────────────────────────────────────────

  function toggleCondition(conditionKey) {
    const current = char.conditions || []
    const has = current.includes(conditionKey)
    updateCharacter(characterId, {
      conditions: has
        ? current.filter(c => c !== conditionKey)
        : [...current, conditionKey],
    })
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  function addItem() {
    if (!newItemName.trim()) return
    const item = {
      name: newItemName.trim(),
      type: newItemType,
      qty: 1,
      notable: false,
      description: '',
    }
    updateCharacter(characterId, {
      inventory: [...(char.inventory || []), item],
    })
    setNewItemName('')
  }

  function removeItem(index) {
    const updated = [...(char.inventory || [])]
    updated.splice(index, 1)
    updateCharacter(characterId, { inventory: updated })
  }

  function adjustItemQty(index, delta) {
    const updated = [...(char.inventory || [])]
    const item = { ...updated[index] }
    item.qty = Math.max(0, (item.qty || 1) + delta)
    if (item.qty === 0) updated.splice(index, 1)
    else updated[index] = item
    updateCharacter(characterId, { inventory: updated })
  }

  function toggleNotable(index) {
    const updated = [...(char.inventory || [])]
    updated[index] = { ...updated[index], notable: !updated[index].notable }
    updateCharacter(characterId, { inventory: updated })
  }

  const hpPercent = Math.max(0, Math.min(100, (char.hp / char.maxHp) * 100))

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <h3 className="font-display text-lg text-parchment-100">{char.name}</h3>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── HP ── */}
          <section>
            <p className="label">Hit Points</p>
            <div className="space-y-3">
              {/* HP bar */}
              <div className="h-3 bg-ink-700 rounded-full overflow-hidden">
                <div className={clsx('h-full rounded-full transition-all duration-300',
                  hpPercent > 60 ? 'bg-forest-500' :
                  hpPercent > 30 ? 'bg-gold-500' : 'bg-crimson-500'
                )} style={{ width: `${hpPercent}%` }} />
              </div>

              {/* HP number */}
              <div className="flex items-center justify-between">
                <span className="font-display text-3xl text-parchment-100">{char.hp}</span>
                <span className="font-ui text-sm text-parchment-400">/ {char.maxHp}</span>
              </div>

              {/* Quick adjust */}
              <div className="flex gap-2">
                {[-3,-2,-1,'+1','+2','+3'].map((v) => {
                  const delta = typeof v === 'string' ? parseInt(v) : v
                  const isHeal = delta > 0
                  return (
                    <button key={v} onClick={() => applyHpChange(delta)}
                      className={clsx('flex-1 py-2 rounded border text-sm font-ui font-medium transition-all',
                        isHeal
                          ? 'border-forest-600/40 bg-forest-600/10 text-forest-300 hover:bg-forest-600/20'
                          : 'border-crimson-600/40 bg-crimson-600/10 text-crimson-300 hover:bg-crimson-600/20'
                      )}>
                      {isHeal ? `+${delta}` : delta}
                    </button>
                  )
                })}
              </div>

              {/* Direct set + full heal */}
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  type="number"
                  placeholder="Set HP directly…"
                  value={hpInput}
                  onChange={e => setHpInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setHpDirectly()}
                  min={0} max={char.maxHp}
                />
                <button onClick={setHpDirectly} className="btn-secondary text-sm px-3">Set</button>
                <button onClick={fullHeal} className="btn-secondary text-sm px-3 text-forest-300">
                  Full heal
                </button>
              </div>
            </div>
          </section>

          {/* ── Conditions ── */}
          <section>
            <p className="label">Conditions</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(CONDITIONS).map(([key, cond]) => {
                const active = (char.conditions || []).includes(key)
                return (
                  <button key={key} onClick={() => toggleCondition(key)}
                    className={clsx('text-left px-3 py-2 rounded border text-xs transition-all',
                      active
                        ? 'border-crimson-600/60 bg-crimson-600/15 text-crimson-300'
                        : 'border-ink-600 bg-ink-700 text-parchment-400 hover:border-ink-500'
                    )}>
                    <div className="font-ui font-medium">{cond.label}</div>
                    <div className="text-parchment-500 mt-0.5 font-body">{cond.effect}</div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Inventory ── */}
          <section>
            <p className="label">Inventory</p>

            {/* Item list */}
            <div className="space-y-1 mb-3">
              {(char.inventory || []).map((item, i) => (
                <div key={i} className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded border text-sm',
                  item.notable
                    ? 'border-gold-500/30 bg-gold-500/5'
                    : 'border-ink-700 bg-ink-800'
                )}>
                  <button onClick={() => toggleNotable(i)}
                    title="Toggle notable"
                    className={clsx('text-xs shrink-0 transition-colors',
                      item.notable ? 'text-gold-400' : 'text-ink-500 hover:text-parchment-400'
                    )}>
                    {item.notable ? '✦' : '◇'}
                  </button>
                  <span className="flex-1 font-ui text-parchment-200 text-xs truncate">{item.name}</span>

                  {/* Qty controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => adjustItemQty(i, -1)}
                      className="w-5 h-5 rounded bg-ink-700 text-parchment-400 hover:bg-ink-600 text-xs">−</button>
                    <span className="w-5 text-center font-ui text-xs text-parchment-300">{item.qty || 1}</span>
                    <button onClick={() => adjustItemQty(i, 1)}
                      className="w-5 h-5 rounded bg-ink-700 text-parchment-400 hover:bg-ink-600 text-xs">+</button>
                  </div>

                  <button onClick={() => removeItem(i)}
                    className="text-ink-500 hover:text-crimson-400 transition-colors text-xs shrink-0">
                    ✕
                  </button>
                </div>
              ))}
              {(!char.inventory || char.inventory.length === 0) && (
                <p className="text-xs text-parchment-500 font-ui text-center py-2">No items</p>
              )}
            </div>

            {/* Add item */}
            <div className="flex gap-2">
              <select className="input text-xs w-28 shrink-0" value={newItemType}
                onChange={e => setNewItemType(e.target.value)}>
                <option value="weapon">Weapon</option>
                <option value="armor">Armour</option>
                <option value="potion">Potion</option>
                <option value="gear">Gear</option>
                <option value="gold">Gold</option>
                <option value="other">Other</option>
              </select>
              <input className="input text-xs flex-1" placeholder="Item name…"
                value={newItemName} onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()} />
              <button onClick={addItem} className="btn-secondary text-xs px-3">Add</button>
            </div>
          </section>

          {/* ── Notes ── */}
          <section>
            <p className="label">Notes</p>
            <textarea className="input text-sm font-body" rows={3}
              placeholder="Character notes, reminders…"
              value={char.notes || ''}
              onChange={e => updateCharacter(characterId, { notes: e.target.value })} />
          </section>

        </div>
      </div>
    </div>
  )
}
