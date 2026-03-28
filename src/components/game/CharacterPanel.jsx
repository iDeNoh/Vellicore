import StateTracker from '@/components/game/StateTracker'
import React, { useState } from 'react'
import { useGameStore } from '@/store/appStore'
import { STAT_INFO, CONDITIONS, ABILITIES, rollDice } from '@/lib/rules/rules'
import clsx from 'clsx'

export default function CharacterPanel({ onRoll }) {
  const characters = useGameStore(s => s.characters)
  const isDmThinking = useGameStore(s => s.isDmThinking)
  const charList = Object.values(characters)

  const [activeCharId, setActiveCharId] = useState(charList[0]?.id || null)
  const [trackerOpen, setTrackerOpen] = useState(false)
  const char = characters[activeCharId] || charList[0]

  if (!char) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-3xl mb-3">⚔</div>
          <p className="font-body text-parchment-400 text-sm">No characters yet</p>
        </div>
      </div>
    )
  }

  const hpPercent = Math.max(0, Math.min(100, (char.hp / char.maxHp) * 100))

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Character tabs (if multiple) */}
      {charList.length > 1 && (
        <div className="flex border-b border-ink-700 px-2 pt-2 gap-1">
          {charList.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCharId(c.id)}
              className={clsx(
                'px-3 py-1.5 rounded-t text-xs font-ui transition-colors',
                activeCharId === c.id
                  ? 'bg-ink-700 text-parchment-100 border border-b-ink-700 border-ink-600'
                  : 'text-parchment-400 hover:text-parchment-200'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* StateTracker modal */}
        {trackerOpen && char && (
          <StateTracker characterId={char.id} onClose={() => setTrackerOpen(false)} />
        )}

        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Portrait */}
          <div className="w-14 h-14 rounded-full border-2 border-gold-500/60 overflow-hidden flex-shrink-0 bg-ink-700 flex items-center justify-center">
            {char.portraitBase64
              ? <img src={`data:image/png;base64,${char.portraitBase64}`} alt={char.name} className="w-full h-full object-cover" />
              : <span className="text-2xl">{ancestryIcon(char.ancestry)}</span>
            }
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base text-parchment-100 leading-tight">{char.name}</h3>
            <p className="font-body text-xs text-parchment-400 mt-0.5 capitalize">
              {[char.ancestry, char.background].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            onClick={() => setTrackerOpen(true)}
            title="Edit HP, conditions, inventory"
            className="btn-ghost text-xs px-2 py-1 shrink-0"
          >
            ✎
          </button>
        </div>

        {/* HP bar */}
        <div>
          <div className="flex justify-between text-xs font-ui mb-1">
            <span className="text-parchment-300">HP</span>
            <span className={clsx(
              'font-medium',
              hpPercent > 60 ? 'text-forest-300' :
              hpPercent > 30 ? 'text-gold-300' : 'text-crimson-300'
            )}>
              {char.hp} / {char.maxHp}
            </span>
          </div>
          <div className="h-2 bg-ink-700 rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-300',
                hpPercent > 60 ? 'bg-forest-500' :
                hpPercent > 30 ? 'bg-gold-500' : 'bg-crimson-500'
              )}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {['body', 'mind', 'spirit'].map(stat => {
            const info = STAT_INFO[stat]
            const value = char.stats?.[stat] || 1
            return (
              <button
                key={stat}
                onClick={() => !isDmThinking && onRoll?.({ character: char.name, stat, reason: `${stat} check` })}
                disabled={isDmThinking}
                title={`Roll ${info.label} (${value}d6)`}
                className={clsx(
                  'flex flex-col items-center p-2.5 rounded border transition-all',
                  'border-ink-600 bg-ink-800 hover:border-gold-500/50 hover:bg-ink-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'group cursor-pointer'
                )}
              >
                <span className="text-parchment-400 text-xs mb-0.5 font-ui group-hover:text-gold-400 transition-colors">
                  {info.icon}
                </span>
                <span className="font-display text-xl text-parchment-100 leading-none">{value}</span>
                <span className="font-ui text-xs text-parchment-400 mt-0.5 capitalize">{stat}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-ink-400 font-ui text-center -mt-2">Click stat to roll</p>

        {/* Conditions */}
        {char.conditions?.length > 0 && (
          <div>
            <p className="label">Conditions</p>
            <div className="flex flex-wrap gap-1.5">
              {char.conditions.map(c => {
                const info = CONDITIONS[c]
                return (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-crimson-600/20 text-crimson-300 border border-crimson-600/30 font-ui">
                    {info?.label || c}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Abilities */}
        {char.abilities?.length > 0 && (
          <div>
            <p className="label">Abilities</p>
            <div className="space-y-1.5">
              {char.abilities.map(a => {
                const info = ABILITIES[a]
                return (
                  <div key={a} className="text-xs bg-ink-800 border border-ink-700 rounded px-2.5 py-2">
                    <span className="font-ui text-arcane-300 capitalize">{info?.label || a}</span>
                    {info?.description && (
                      <p className="text-parchment-400 font-body mt-0.5">{info.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Inventory */}
        <InventorySection inventory={char.inventory} />

        {/* Notes */}
        {char.notes && (
          <div>
            <p className="label">Notes</p>
            <p className="font-body text-xs text-parchment-300 bg-ink-800 rounded px-3 py-2 border border-ink-700">
              {char.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inventory ─────────────────────────────────────────────────────────────────

function InventorySection({ inventory }) {
  const [open, setOpen] = useState(true)
  if (!inventory?.length) return null

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="label flex items-center gap-1 w-full hover:text-parchment-200 transition-colors"
      >
        <span>{open ? '▾' : '▸'}</span>
        Inventory ({inventory.length})
      </button>

      {open && (
        <div className="space-y-1 mt-1">
          {inventory.map((item, i) => (
            <div
              key={i}
              className={clsx(
                'flex items-start gap-2 text-xs px-2.5 py-1.5 rounded border',
                item.notable
                  ? 'border-gold-500/30 bg-gold-500/5 text-parchment-200'
                  : 'border-ink-700 bg-ink-800 text-parchment-300'
              )}
            >
              <span className="shrink-0 mt-0.5">{itemIcon(item)}</span>
              <div className="min-w-0">
                <span className="font-ui">{item.name}</span>
                {item.qty > 1 && <span className="text-parchment-400 ml-1">×{item.qty}</span>}
                {item.description && (
                  <p className="font-body text-parchment-400 mt-0.5 text-xs">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ancestryIcon(ancestry) {
  const icons = {
    elf: '🧝', dwarf: '⛏', halfling: '🍀',
    orc: '⚔', tiefling: '◈', human: '👤', custom: '✦',
  }
  return icons[(ancestry || '').toLowerCase()] || '👤'
}

function itemIcon(item) {
  if (item.type === 'weapon') return '⚔'
  if (item.type === 'armor') return '🛡'
  if (item.type === 'potion') return '⚗'
  if (item.type === 'gold' || item.name?.toLowerCase().includes('gold')) return '◎'
  if (item.notable) return '✦'
  return '·'
}
