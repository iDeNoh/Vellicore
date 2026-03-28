import { useImagePipeline } from '@/hooks/useImagePipeline'
import React, { useState } from 'react'
import { useGameStore } from '@/store/appStore'
import clsx from 'clsx'

export default function WorldPanel() {
  const world = useGameStore(s => s.world)
  const factions = useGameStore(s => s.world.factions)
  const { regenerateNpcPortrait, isEnabled: imageEnabled } = useImagePipeline()
  const story = useGameStore(s => s.story)
  const campaign = useGameStore(s => s.campaign)
  const [tab, setTab] = useState('location')

  const currentLoc = world.locations?.[world.currentLocation]
  const npcsHere = currentLoc?.npcsPresent?.map(id => world.npcs?.[id]).filter(Boolean) || []

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-ink-700 px-2 pt-2 gap-0.5">
        {[
          { id: 'location', label: 'Location' },
          { id: 'quests', label: `Quests ${story.activeQuests?.length ? `(${story.activeQuests.length})` : ''}` },
          { id: 'lore', label: 'Lore' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'px-3 py-1.5 text-xs font-ui rounded-t transition-colors',
              tab === t.id
                ? 'bg-ink-700 text-parchment-100 border border-b-ink-700 border-ink-600'
                : 'text-parchment-400 hover:text-parchment-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Location tab ── */}
        {tab === 'location' && (
          <>
            {currentLoc ? (
              <div className="space-y-3">
                <div>
                  <h3 className="font-display text-base text-parchment-100">{currentLoc.name}</h3>
                  <p className="font-body text-xs text-parchment-400 capitalize">{currentLoc.type}</p>
                </div>

                {currentLoc.imageBase64 && (
                  <img
                    src={`data:image/png;base64,${currentLoc.imageBase64}`}
                    alt={currentLoc.name}
                    className="w-full rounded border border-ink-700 object-cover max-h-36"
                  />
                )}

                <p className="font-body text-sm text-parchment-300">{currentLoc.description}</p>

                {currentLoc.atmosphere && (
                  <p className="font-body text-xs text-parchment-400 italic">{currentLoc.atmosphere}</p>
                )}

                {/* NPCs present */}
                {npcsHere.length > 0 && (
                  <div>
                    <p className="label">Present</p>
                    <div className="space-y-2">
                      {npcsHere.map(npc => (
                        <NpcCard key={npc.id} npc={npc} onRegen={imageEnabled ? regenerateNpcPortrait : null} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Exits */}
                {currentLoc.exits?.length > 0 && (
                  <div>
                    <p className="label">Exits</p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentLoc.exits.map(exit => (
                        <span key={exit} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui">
                          {exit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🗺</div>
                <p className="font-body text-parchment-400 text-sm">Location unknown</p>
                <p className="font-body text-parchment-500 text-xs mt-1">
                  It will appear as the DM establishes the scene
                </p>
              </div>
            )}

            {/* Story act indicator */}
            <div className="pt-2 border-t border-ink-700">
              <div className="flex justify-between items-center mb-2">
                <span className="label m-0">Story progress</span>
                <span className="text-xs text-parchment-400 font-ui">Act {story.currentAct} of 5</span>
              </div>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(act => (
                  <div
                    key={act}
                    className={clsx(
                      'flex-1 h-1.5 rounded-full',
                      act < story.currentAct ? 'bg-gold-500' :
                      act === story.currentAct ? 'bg-gold-400 animate-pulse-slow' :
                      'bg-ink-600'
                    )}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Quests tab ── */}
        {tab === 'quests' && (
          <div className="space-y-3">
            {story.activeQuests?.length > 0 ? (
              story.activeQuests.map((quest, i) => (
                <QuestCard key={i} quest={quest} />
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📜</div>
                <p className="font-body text-parchment-400 text-sm">No active quests</p>
                <p className="font-body text-parchment-500 text-xs mt-1">
                  Quests will appear as you discover them
                </p>
              </div>
            )}

            {story.completedQuests?.length > 0 && (
              <div>
                <p className="label">Completed</p>
                <div className="space-y-2">
                  {story.completedQuests.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-parchment-500 font-ui py-1">
                      <span className="text-forest-500">✓</span>
                      <span className="line-through">{q.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Lore tab ── */}
        {tab === 'lore' && (
          <div className="space-y-3">
            {/* World overview — populated after world generation */}
            {world.name && (
              <div className="bg-ink-800 rounded border border-ink-700 p-3">
                <h4 className="font-display text-sm text-parchment-100 mb-0.5">{world.name}</h4>
                {world.tagline && (
                  <p className="font-body text-xs text-gold-400 italic mb-2">{world.tagline}</p>
                )}
                {world.description && (
                  <p className="font-body text-xs text-parchment-300 leading-relaxed">{world.description}</p>
                )}
                {world.geography && (
                  <p className="font-body text-xs text-parchment-400 mt-2">{world.geography}</p>
                )}
              </div>
            )}
            {!world.name && campaign && (
              <div className="bg-ink-800 rounded border border-ink-700 p-3">
                <h4 className="font-display text-sm text-parchment-200 mb-1">{campaign.name}</h4>
                <p className="font-body text-xs text-parchment-400">
                  {campaign.tone || 'A world of adventure and mystery.'}
                </p>
              </div>
            )}

            {world.discoveredLore?.length > 0 ? (
              world.discoveredLore.map((entry, i) => (
                <div key={i} className="border-l-2 border-ink-600 pl-3">
                  <p className="font-ui text-xs text-parchment-300 font-medium">{entry.title}</p>
                  <p className="font-body text-xs text-parchment-400 mt-0.5">{entry.text}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📖</div>
                <p className="font-body text-parchment-400 text-sm">No lore discovered yet</p>
                <p className="font-body text-parchment-500 text-xs mt-1">
                  Explore the world to uncover its secrets
                </p>
              </div>
            )}

            {/* Known NPCs */}
            {Object.keys(world.npcs).length > 0 && (
              <div>
                <p className="label">Known people</p>
                <div className="space-y-2">
                  {Object.values(world.npcs).map(npc => (
                    <NpcCard key={npc.id} npc={npc} compact onRegen={imageEnabled ? regenerateNpcPortrait : null} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── NPC card ──────────────────────────────────────────────────────────────────

function NpcCard({ npc, compact, onRegen }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={clsx(
        'rounded border border-ink-700 bg-ink-800 transition-all',
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      )}
    >
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => !compact && setExpanded(e => !e)}
      >
        <div className="relative">
          {npc.tokenBase64 ? (
            <img src={`data:image/png;base64,${npc.tokenBase64}`}
              className="w-7 h-7 rounded-full border border-ink-600 object-cover"
              alt={npc.name} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center text-xs">
              {npc.name?.[0] || '?'}
            </div>
          )}
          {onRegen && !npc.portraitBase64 && (
            <button onClick={e => { e.stopPropagation(); onRegen(npc.id) }}
              title="Generate portrait"
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-ink-600 border border-ink-500 text-parchment-400 hover:text-parchment-200 text-xs flex items-center justify-center">
              ◈
            </button>
          )}
        </div>
        <div>
          <span className="font-ui text-xs text-parchment-200">{npc.name}</span>
          {npc.role && <span className="text-parchment-500 font-body text-xs ml-1.5">· {npc.role}</span>}
        </div>
        {npc.disposition && (
          <span className={clsx(
            'ml-auto text-xs px-1.5 py-0.5 rounded font-ui',
            npc.disposition === 'friendly' ? 'text-forest-300 bg-forest-600/20' :
            npc.disposition === 'hostile' ? 'text-crimson-300 bg-crimson-600/20' :
            'text-parchment-400 bg-ink-700'
          )}>
            {npc.disposition}
          </span>
        )}
      </div>

      {expanded && !compact && (
        <div className="mt-2 pt-2 border-t border-ink-700">
          {npc.description && (
            <p className="font-body text-xs text-parchment-300">{npc.description}</p>
          )}
          {npc.currentMood && (
            <p className="font-body text-xs text-parchment-400 mt-1 italic">Currently: {npc.currentMood}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Quest card ────────────────────────────────────────────────────────────────

function QuestCard({ quest }) {
  const urgencyColor = {
    urgent: 'text-crimson-300 border-crimson-600/40',
    normal: 'text-gold-300 border-gold-500/30',
    low: 'text-parchment-400 border-ink-600',
  }[quest.urgency || 'normal']

  return (
    <div className={clsx('rounded border p-3 bg-ink-800', urgencyColor)}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-sm text-parchment-200">{quest.title}</h4>
        {quest.urgency === 'urgent' && (
          <span className="text-xs text-crimson-300 font-ui shrink-0">Urgent</span>
        )}
      </div>
      {quest.currentObjective && (
        <p className="font-body text-xs text-parchment-300 mt-1.5">
          <span className="text-parchment-500">→ </span>
          {quest.currentObjective}
        </p>
      )}
      {quest.description && (
        <p className="font-body text-xs text-parchment-400 mt-1">{quest.description}</p>
      )}
    </div>
  )
}
