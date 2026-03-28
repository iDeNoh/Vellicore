import React, { useState } from 'react'
import { useGameStore } from '@/store/appStore'
import clsx from 'clsx'

export default function AddTokenModal({ onClose }) {
  const { characters, world, setTokenPosition, map, revealRadius } = useGameStore()
  const charList = Object.values(characters)
  const npcList = Object.values(world.npcs || {})

  const [tab, setTab] = useState('characters')

  function place(entity, type) {
    // Find a free cell near the center
    const col = Math.floor(map.mapWidth / 2)
    const row = Math.floor(map.mapHeight / 2)

    setTokenPosition(entity.id, {
      col, row,
      x: col * map.gridSize,
      y: row * map.gridSize,
      visible: true,
      type,
      label: entity.name,
      color: type === 'character' ? '#d4a520' : dispositionColor(entity.disposition),
    })
    revealRadius(col, row, 3)
    onClose()
  }

  const tabs = [
    { id: 'characters', label: `Characters (${charList.length})` },
    { id: 'npcs', label: `NPCs (${npcList.length})` },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-80 max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
          <h3 className="font-display text-base text-parchment-100">Place Token</h3>
          <button onClick={onClose} className="text-parchment-500 hover:text-parchment-300 text-sm">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-700 px-2 pt-2 gap-0.5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('px-3 py-1.5 text-xs font-ui rounded-t transition-colors',
                tab === t.id
                  ? 'bg-ink-700 text-parchment-100 border border-b-ink-700 border-ink-600'
                  : 'text-parchment-400 hover:text-parchment-200'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {tab === 'characters' && (
            <div className="space-y-1">
              {charList.length === 0 && (
                <p className="text-xs text-parchment-500 font-ui text-center py-4">No characters</p>
              )}
              {charList.map(char => {
                const placed = !!map.tokenPositions[char.id]
                return (
                  <button key={char.id}
                    onClick={() => place(char, 'character')}
                    className={clsx('w-full text-left px-3 py-2 rounded border text-sm flex items-center gap-3 transition-all',
                      placed
                        ? 'border-gold-500/30 bg-gold-500/5 text-parchment-300'
                        : 'border-ink-600 bg-ink-700 text-parchment-200 hover:border-ink-500'
                    )}>
                    <span className="text-lg">
                      {char.tokenBase64 || char.portraitBase64
                        ? <img src={`data:image/png;base64,${char.tokenBase64 || char.portraitBase64}`}
                            className="w-8 h-8 rounded-full border border-ink-600 object-cover" alt="" />
                        : '👤'}
                    </span>
                    <div>
                      <p className="font-ui text-xs font-medium">{char.name}</p>
                      <p className="font-body text-xs text-parchment-500 capitalize">
                        {[char.ancestry, char.background].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {placed && <span className="ml-auto text-xs text-gold-400 font-ui">On map</span>}
                  </button>
                )
              })}
            </div>
          )}

          {tab === 'npcs' && (
            <div className="space-y-1">
              {npcList.length === 0 && (
                <p className="text-xs text-parchment-500 font-ui text-center py-4">
                  No NPCs discovered yet
                </p>
              )}
              {npcList.map(npc => {
                const placed = !!map.tokenPositions[npc.id]
                return (
                  <button key={npc.id}
                    onClick={() => place(npc, 'npc')}
                    className={clsx('w-full text-left px-3 py-2 rounded border text-sm flex items-center gap-3 transition-all',
                      placed
                        ? 'border-ink-600 bg-ink-700/50 text-parchment-400'
                        : 'border-ink-600 bg-ink-700 text-parchment-200 hover:border-ink-500'
                    )}>
                    <div className="w-8 h-8 rounded-full border border-ink-600 bg-ink-600 flex items-center justify-center text-xs font-ui shrink-0"
                      style={{ borderColor: dispositionColor(npc.disposition) }}>
                      {npc.name?.[0]}
                    </div>
                    <div>
                      <p className="font-ui text-xs font-medium">{npc.name}</p>
                      <p className="font-body text-xs text-parchment-500">{npc.role}</p>
                    </div>
                    <span className="ml-auto text-xs font-ui capitalize"
                      style={{ color: dispositionColor(npc.disposition) }}>
                      {npc.disposition}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function dispositionColor(d) {
  const m = { devoted:'#5dab7a', friendly:'#5dab7a', neutral:'#888', suspicious:'#e8c14d', hostile:'#e05c5c', fearful:'#9b7fe8' }
  return m[d] || '#888'
}
