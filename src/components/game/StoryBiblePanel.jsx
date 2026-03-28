import React, { useState } from 'react'
import { useGameStore } from '@/store/appStore'
import clsx from 'clsx'

export default function StoryBiblePanel({ isGenerating = false }) {
  const world = useGameStore(s => s.world)
  const story = useGameStore(s => s.story)
  const [tab, setTab] = useState('narrative')

  const tabs = [
    { id: 'narrative', label: 'Narrative' },
    { id: 'npcs', label: 'NPCs' },
    { id: 'locations', label: 'Locations' },
    { id: 'events', label: 'Events' },
  ]

  if (!world?.name) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className={clsx('text-3xl mb-3', isGenerating && 'animate-pulse')}>🔮</div>
        <p className="font-body text-parchment-400 text-sm">
          {isGenerating ? 'Building the world…' : 'World not yet generated — start a new session to generate the world.'}
        </p>
        {isGenerating && (
          <p className="font-body text-parchment-500 text-xs mt-2">
            The Story Bible will populate once world generation completes.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar - same pattern as WorldPanel */}
      <div className="flex border-b border-ink-700 px-2 pt-2 gap-0.5 flex-wrap">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'narrative' && <NarrativeTab world={world} story={story} />}
        {tab === 'npcs' && <NpcsTab world={world} story={story} />}
        {tab === 'locations' && <LocationsTab world={world} />}
        {tab === 'events' && <EventsTab world={world} story={story} />}
      </div>
    </div>
  )
}

// ── Narrative tab ─────────────────────────────────────────────────────────────

function NarrativeTab({ world, story }) {
  const plan = world?.narrativePlan
  const currentAct = story?.currentAct || 1
  // world.storyActs is the primary source; story.storyActs is the fallback for
  // campaigns saved before the setWorld fix preserved these fields
  const storyActs = (world?.storyActs?.length > 0 ? world.storyActs : story?.storyActs) || []
  const factions = Object.values(world?.factions || {})

  return (
    <div className="space-y-4">
      {/* World overview */}
      <div className="bg-ink-800 rounded border border-ink-700 p-3">
        <h4 className="font-display text-sm text-parchment-100 mb-0.5">{world.name}</h4>
        {world.tagline && (
          <p className="font-body text-xs text-gold-400 italic mb-2">{world.tagline}</p>
        )}
        {world.description && (
          <p className="font-body text-xs text-parchment-300 leading-relaxed">{world.description}</p>
        )}
        {world.geography && (
          <p className="font-body text-xs text-parchment-400 mt-2 leading-relaxed">
            <span className="text-parchment-500">Geography: </span>{world.geography}
          </p>
        )}
        {world.history && (
          <p className="font-body text-xs text-parchment-400 mt-1 leading-relaxed">
            <span className="text-parchment-500">History: </span>{world.history}
          </p>
        )}
      </div>

      {/* Factions */}
      {factions.length > 0 && (
        <div className="space-y-2">
          <p className="label">Factions</p>
          {factions.map(fac => (
            <FactionCard key={fac.id} fac={fac} world={world} />
          ))}
        </div>
      )}

      {/* Narrative Plan card */}
      {plan && (plan.centralConflict || plan.mainAntagonist) && (
        <div className="bg-ink-800 rounded border border-ink-700 p-3 space-y-2">
          <h4 className="font-display text-sm text-parchment-100">Narrative Plan</h4>
          {plan.centralConflict && (
            <div>
              <p className="label">Central Conflict</p>
              <p className="font-body text-xs text-parchment-300">{plan.centralConflict}</p>
            </div>
          )}
          {plan.mainAntagonist && (
            <div>
              <p className="label">Main Antagonist</p>
              <p className="font-body text-xs text-parchment-300">{plan.mainAntagonist}</p>
              {plan.antagonistMotivation && (
                <p className="font-body text-xs text-parchment-400 mt-0.5 italic">{plan.antagonistMotivation}</p>
              )}
            </div>
          )}
          {plan.antagonistReveal && (
            <div>
              <p className="label">Antagonist Revealed</p>
              <p className="font-body text-xs text-parchment-300">Act {plan.antagonistReveal}</p>
            </div>
          )}
          {plan.keyTwists?.length > 0 && (
            <div>
              <p className="label">Planned Twists</p>
              <ul className="space-y-1">
                {plan.keyTwists.map((twist, i) => (
                  <li key={i} className="font-body text-xs text-parchment-300 flex gap-1.5">
                    <span className="text-parchment-500 shrink-0">—</span>
                    <span>{twist}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.thematicResolution && (
            <div>
              <p className="label">Thematic Resolution</p>
              <p className="font-body text-xs text-parchment-300 italic">{plan.thematicResolution}</p>
            </div>
          )}
        </div>
      )}

      {/* Story acts */}
      {storyActs.length === 0 && (
        <div className="bg-ink-800 rounded border border-ink-700/50 border-dashed p-3 text-center">
          <p className="font-body text-xs text-parchment-500">
            Story acts not generated — the LLM response may have been truncated.
            Start a new campaign to regenerate, or increase your model's max output tokens.
          </p>
        </div>
      )}
      {storyActs.length > 0 && (
        <div className="space-y-2">
          <p className="label">Story Acts</p>
          {storyActs.map(act => {
            const isCurrent = act.act === currentAct
            const isCompleted = act.act < currentAct
            const isUpcoming = act.act > currentAct

            return (
              <div key={act.act}
                className={clsx(
                  'bg-ink-800 rounded border p-3 space-y-1.5',
                  isCurrent ? 'border-gold-500/50' :
                  isCompleted ? 'border-ink-600 opacity-70' :
                  'border-ink-700 opacity-60'
                )}>
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'font-display text-sm',
                    isCurrent ? 'text-parchment-100' : 'text-parchment-300'
                  )}>
                    Act {act.act} — {act.title}
                  </span>
                  {isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-ui text-gold-300 bg-gold-500/20 border border-gold-500/30">
                      CURRENT
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-ui text-parchment-500 bg-ink-700">
                      COMPLETED
                    </span>
                  )}
                  {isUpcoming && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-ui text-parchment-600 bg-ink-800 border border-ink-700">
                      UPCOMING
                    </span>
                  )}
                </div>
                {act.summary && (
                  <p className="font-body text-xs text-parchment-300">{act.summary}</p>
                )}
                {act.mainObjective && (
                  <p className="font-body text-xs text-parchment-400">
                    <span className="text-parchment-500">Objective: </span>{act.mainObjective}
                  </p>
                )}
                {act.hook && (
                  <p className="font-body text-xs text-parchment-400">
                    <span className="text-parchment-500">Hook: </span>{act.hook}
                  </p>
                )}
                {act.climax && (
                  <p className="font-body text-xs text-parchment-400">
                    <span className="text-parchment-500">Climax: </span>{act.climax}
                  </p>
                )}
                {act.transition && (
                  <p className="font-body text-xs text-parchment-400">
                    <span className="text-parchment-500">Transition: </span>{act.transition}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── NPCs tab ──────────────────────────────────────────────────────────────────

function NpcsTab({ world, story }) {
  const currentAct = story?.currentAct || 1
  const allNpcs = Object.values(world?.npcs || {})

  const inScene = allNpcs.filter(n => n.isPresent)
  const introduced = allNpcs.filter(n => !n.isPresent && ((n.plannedAct || 1) <= 1 || n.locationId === 'start'))
  const inReserve = allNpcs.filter(n => !n.isPresent && (n.plannedAct || 1) > 1)

  // Group reserve NPCs by plannedAct
  const reserveByAct = {}
  for (const npc of inReserve) {
    const act = npc.plannedAct || 1
    if (!reserveByAct[act]) reserveByAct[act] = []
    reserveByAct[act].push(npc)
  }

  return (
    <div className="space-y-4">
      {inScene.length > 0 && (
        <div>
          <p className="label">In Scene</p>
          <div className="space-y-2">
            {inScene.map(npc => <NpcBibleCard key={npc.id} npc={npc} />)}
          </div>
        </div>
      )}

      {introduced.length > 0 && (
        <div>
          <p className="label">Introduced</p>
          <div className="space-y-2">
            {introduced.map(npc => <NpcBibleCard key={npc.id} npc={npc} />)}
          </div>
        </div>
      )}

      {Object.entries(reserveByAct).sort(([a], [b]) => Number(a) - Number(b)).map(([act, npcs]) => (
        <div key={act}>
          <p className="label">In Reserve — Act {act}</p>
          <div className="space-y-2">
            {npcs.map(npc => <NpcBibleCard key={npc.id} npc={npc} />)}
          </div>
        </div>
      ))}

      {allNpcs.length === 0 && (
        <div className="text-center py-8">
          <p className="font-body text-parchment-400 text-sm">No NPCs generated yet</p>
        </div>
      )}
    </div>
  )
}

function NpcBibleCard({ npc }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded border border-ink-700 bg-ink-800">
      <div
        className="flex items-center gap-2 cursor-pointer px-3 py-2"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="shrink-0">
          {npc.tokenBase64 ? (
            <img src={`data:image/png;base64,${npc.tokenBase64}`}
              className="w-7 h-7 rounded-full border border-ink-600 object-cover"
              alt={npc.name} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center text-xs text-parchment-300">
              {npc.name?.[0] || '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-ui text-xs text-parchment-200">{npc.name}</span>
          {npc.role && <span className="text-parchment-500 font-body text-xs ml-1.5">· {npc.role}</span>}
        </div>
        {npc.disposition && (
          <span className={clsx(
            'shrink-0 text-xs px-1.5 py-0.5 rounded font-ui',
            npc.disposition === 'friendly' ? 'text-forest-300 bg-forest-600/20' :
            npc.disposition === 'hostile' ? 'text-crimson-300 bg-crimson-600/20' :
            'text-parchment-400 bg-ink-700'
          )}>
            {npc.disposition}
          </span>
        )}
        <span className="text-parchment-600 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-ink-700 space-y-1.5">
          {npc.appearance && (
            <p className="font-body text-xs text-parchment-300">
              <span className="text-parchment-500">Appearance: </span>{npc.appearance}
            </p>
          )}
          {npc.personality && (
            <p className="font-body text-xs text-parchment-300">
              <span className="text-parchment-500">Personality: </span>{npc.personality}
            </p>
          )}
          {npc.motivation && (
            <p className="font-body text-xs text-parchment-300">
              <span className="text-parchment-500">Motivation: </span>{npc.motivation}
            </p>
          )}
          {npc.secret && (
            <p className="font-body text-xs text-parchment-400 italic">
              <span className="text-parchment-500 not-italic">Secret: </span>{npc.secret}
            </p>
          )}
          {npc.speech && (
            <p className="font-body text-xs text-parchment-400">
              <span className="text-parchment-500">Speech: </span>{npc.speech}
            </p>
          )}
          {npc.plannedAct && (
            <p className="font-body text-xs text-parchment-500">
              Planned for Act {npc.plannedAct}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function FactionCard({ fac, world }) {
  const [expanded, setExpanded] = useState(false)
  const members = (fac.knownMembers || []).map(id => world?.npcs?.[id]).filter(Boolean)
  const attitudeColor = {
    friendly: 'text-forest-300 bg-forest-600/20',
    hostile: 'text-crimson-300 bg-crimson-600/20',
    hidden: 'text-gold-300 bg-gold-500/20',
    neutral: 'text-parchment-400 bg-ink-700',
  }[fac.attitude || 'neutral']

  return (
    <div className="rounded border border-ink-700 bg-ink-800">
      <div
        className="flex items-center gap-2 cursor-pointer px-3 py-2"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <span className="font-ui text-xs text-parchment-200">{fac.name}</span>
          {fac.type && <span className="text-parchment-500 font-body text-xs ml-1.5 capitalize">· {fac.type}</span>}
        </div>
        {fac.attitude && (
          <span className={clsx('shrink-0 text-xs px-1.5 py-0.5 rounded font-ui', attitudeColor)}>
            {fac.attitude}
          </span>
        )}
        <span className="text-parchment-600 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-ink-700 space-y-1.5">
          {fac.description && (
            <p className="font-body text-xs text-parchment-300">{fac.description}</p>
          )}
          {fac.powerLevel !== undefined && (
            <p className="font-body text-xs text-parchment-400">
              <span className="text-parchment-500">Power Level: </span>{'◆'.repeat(fac.powerLevel)}{'◇'.repeat(Math.max(0, 5 - fac.powerLevel))}
            </p>
          )}
          {members.length > 0 && (
            <div>
              <p className="label">Known Members</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map(npc => (
                  <span key={npc.id} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui">
                    {npc.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Locations tab ─────────────────────────────────────────────────────────────

function LocationsTab({ world }) {
  const locations = Object.values(world?.locations || {})
  const currentLocationId = world?.currentLocation

  if (locations.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="font-body text-parchment-400 text-sm">No locations generated yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {locations.map(loc => (
        <LocationCard key={loc.id} loc={loc} world={world} isCurrent={loc.id === currentLocationId} />
      ))}
    </div>
  )
}

function LocationCard({ loc, world, isCurrent }) {
  const [expanded, setExpanded] = useState(false)
  const npcsHere = (loc.npcsPresent || []).map(id => world?.npcs?.[id]).filter(Boolean)

  return (
    <div className={clsx(
      'bg-ink-800 rounded border p-3',
      isCurrent ? 'border-gold-500/50' : 'border-ink-700'
    )}>
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-display text-sm text-parchment-100">{loc.name}</h4>
            {loc.type && (
              <span className="text-xs px-1.5 py-0.5 rounded font-ui text-parchment-400 bg-ink-700 capitalize">
                {loc.type}
              </span>
            )}
            {isCurrent && (
              <span className="text-xs px-1.5 py-0.5 rounded font-ui text-gold-300 bg-gold-500/20 border border-gold-500/30">
                ◉ Current
              </span>
            )}
          </div>
          {loc.description && (
            <p className="font-body text-xs text-parchment-300 mt-1 leading-relaxed">{loc.description}</p>
          )}
        </div>
        <span className="text-parchment-600 text-xs shrink-0 mt-0.5">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-ink-700 space-y-2">
          {loc.atmosphere && (
            <p className="font-body text-xs text-parchment-400 italic">{loc.atmosphere}</p>
          )}

          {loc.secrets?.length > 0 && (
            <div>
              <p className="label">Secrets</p>
              <ul className="space-y-1">
                {loc.secrets.map((secret, i) => (
                  <li key={i} className="font-body text-xs text-parchment-300 flex gap-1.5">
                    <span className="text-parchment-500 shrink-0">•</span>
                    <span>{secret}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loc.pointsOfInterest?.length > 0 && (
            <div>
              <p className="label">Points of Interest</p>
              <div className="space-y-1">
                {loc.pointsOfInterest.map((poi, i) => (
                  <div key={i}>
                    <span className="font-ui text-xs text-parchment-300">{poi.name}</span>
                    {poi.description && (
                      <p className="font-body text-xs text-parchment-400 mt-0.5">{poi.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {npcsHere.length > 0 && (
            <div>
              <p className="label">NPCs Present</p>
              <div className="flex flex-wrap gap-1.5">
                {npcsHere.map(npc => (
                  <span key={npc.id} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui">
                    {npc.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loc.exits?.length > 0 && (
            <div>
              <p className="label">Exits</p>
              <div className="flex flex-wrap gap-1.5">
                {loc.exits.map(exit => (
                  <span key={exit} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui">
                    {exit}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Events tab ────────────────────────────────────────────────────────────────

function EventsTab({ world, story }) {
  const activeQuests = story?.activeQuests || []
  const completedQuests = story?.completedQuests || []
  const globalFlags = story?.globalFlags || {}
  const tension = story?.tension

  const flagEntries = Object.entries(globalFlags)

  return (
    <div className="space-y-4">
      {/* Tension */}
      {tension !== undefined && (
        <div className="bg-ink-800 rounded border border-ink-700 p-3">
          <p className="label">Tension Level</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex gap-1 flex-1">
              {[1,2,3,4,5].map(n => (
                <div key={n}
                  className={clsx(
                    'flex-1 h-1.5 rounded-full',
                    n <= tension ? 'bg-crimson-500' : 'bg-ink-600'
                  )}
                />
              ))}
            </div>
            <span className="font-ui text-xs text-parchment-400 shrink-0">{tension}/5</span>
          </div>
        </div>
      )}

      {/* Active quests */}
      {activeQuests.length > 0 && (
        <div>
          <p className="label">Active Quests</p>
          <div className="space-y-2">
            {activeQuests.map((quest, i) => (
              <QuestBibleCard key={quest.id || i} quest={quest} />
            ))}
          </div>
        </div>
      )}

      {activeQuests.length === 0 && (
        <div className="text-center py-4">
          <p className="font-body text-parchment-400 text-sm">No active quests</p>
        </div>
      )}

      {/* Completed quests */}
      {completedQuests.length > 0 && (
        <div>
          <p className="label">Completed Quests</p>
          <div className="space-y-1.5">
            {completedQuests.map((q, i) => (
              <div key={q.id || i} className="flex items-start gap-2 text-xs font-ui py-1 text-parchment-500">
                <span className="text-forest-500 shrink-0">✓</span>
                <span className="line-through">{q.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global flags */}
      {flagEntries.length > 0 && (
        <div>
          <p className="label">World Events</p>
          <div className="bg-ink-800 rounded border border-ink-700 p-3 space-y-1">
            {flagEntries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={clsx(
                  'shrink-0 text-xs',
                  value === true ? 'text-forest-400' :
                  value === false ? 'text-crimson-400' :
                  'text-gold-400'
                )}>
                  {value === true ? '◉' : value === false ? '○' : '◈'}
                </span>
                <span className="font-ui text-xs text-parchment-300 capitalize">
                  {key.replace(/_/g, ' ')}
                </span>
                {typeof value !== 'boolean' && (
                  <span className="font-body text-xs text-parchment-500 ml-auto">{String(value)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuestBibleCard({ quest }) {
  const [expanded, setExpanded] = useState(false)
  const urgencyColor = {
    urgent: 'text-crimson-300 border-crimson-600/40',
    normal: 'text-gold-300 border-gold-500/30',
    low: 'text-parchment-400 border-ink-600',
  }[quest.urgency || 'normal']

  return (
    <div className={clsx('rounded border p-3 bg-ink-800 cursor-pointer', urgencyColor)}
      onClick={() => setExpanded(e => !e)}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-sm text-parchment-200">{quest.title}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {quest.urgency === 'urgent' && (
            <span className="text-xs text-crimson-300 font-ui">Urgent</span>
          )}
          {quest.type && (
            <span className="text-xs text-parchment-500 font-ui capitalize">{quest.type}</span>
          )}
          <span className="text-parchment-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {quest.currentObjective && (
        <p className="font-body text-xs text-parchment-300 mt-1.5">
          <span className="text-parchment-500">→ </span>
          {quest.currentObjective}
        </p>
      )}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-ink-700 space-y-1.5">
          {quest.description && (
            <p className="font-body text-xs text-parchment-400">{quest.description}</p>
          )}
          {quest.reward && (
            <p className="font-body text-xs text-parchment-400">
              <span className="text-parchment-500">Reward: </span>{quest.reward}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
