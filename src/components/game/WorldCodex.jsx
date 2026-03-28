import React, { useState, useMemo } from 'react'
import { useGameStore } from '@/store/appStore'
import clsx from 'clsx'

const TABS = ['locations', 'npcs', 'factions', 'lore', 'quests']

const TAB_LABELS = {
  locations: 'Locations',
  npcs: 'People',
  factions: 'Factions',
  lore: 'Lore',
  quests: 'Quests',
}

export default function WorldCodex({ onClose }) {
  const { world, story, campaign } = useGameStore()
  const [tab, setTab] = useState('locations')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const locations = Object.values(world.locations || {})
  const npcs = Object.values(world.npcs || {})
  const factions = Object.values(world.factions || {})
  const lore = world.discoveredLore || []
  const activeQuests = story.activeQuests || []
  const completedQuests = story.completedQuests || []

  const counts = {
    locations: locations.length,
    npcs: npcs.length,
    factions: factions.length,
    lore: lore.length,
    quests: activeQuests.length + completedQuests.length,
  }

  function filter(items, keys) {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(item =>
      keys.some(k => (item[k] || '').toLowerCase().includes(q))
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-full max-w-3xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-ink-700">
          <div>
            <h2 className="font-display text-xl text-parchment-100">World Codex</h2>
            <p className="font-body text-sm text-parchment-400 mt-0.5">
              {world.name || campaign?.name} — {world.tagline || ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm mt-1">✕</button>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center gap-2 px-4 pt-3 border-b border-ink-700">
          <div className="flex gap-0.5">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setSelected(null) }}
                className={clsx('px-3 py-1.5 text-xs font-ui rounded-t transition-colors',
                  tab === t
                    ? 'bg-ink-700 text-parchment-100 border border-b-ink-700 border-ink-600'
                    : 'text-parchment-400 hover:text-parchment-200'
                )}>
                {TAB_LABELS[t]}
                <span className="ml-1 text-parchment-500">({counts[t]})</span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <input className="input text-xs py-1.5 w-44"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* List */}
          <div className="w-56 border-r border-ink-700 overflow-y-auto py-2 shrink-0">
            {tab === 'locations' && filter(locations, ['name', 'type', 'description']).map(loc => (
              <CodexListItem key={loc.id} title={loc.name} subtitle={loc.type}
                active={selected?.id === loc.id} isCurrentLocation={loc.id === world.currentLocation}
                onClick={() => setSelected(loc)} />
            ))}
            {tab === 'npcs' && filter(npcs, ['name', 'role', 'personality']).map(npc => (
              <CodexListItem key={npc.id} title={npc.name} subtitle={npc.role}
                accent={dispositionColor(npc.disposition)} accentText={npc.disposition}
                active={selected?.id === npc.id}
                hasImage={!!npc.portraitBase64}
                onClick={() => setSelected(npc)} />
            ))}
            {tab === 'factions' && filter(factions, ['name', 'description', 'type']).map(fac => (
              <CodexListItem key={fac.id} title={fac.name} subtitle={fac.type}
                active={selected?.id === fac.id} onClick={() => setSelected(fac)} />
            ))}
            {tab === 'lore' && filter(lore, ['title', 'text']).map((entry, i) => (
              <CodexListItem key={i} title={entry.title} active={selected === entry}
                onClick={() => setSelected(entry)} />
            ))}
            {tab === 'quests' && (
              <>
                {activeQuests.length > 0 && (
                  <p className="px-3 pt-2 pb-1 text-xs text-gold-400 font-ui uppercase tracking-wider">Active</p>
                )}
                {filter(activeQuests, ['title', 'description']).map(q => (
                  <CodexListItem key={q.id} title={q.title} subtitle={q.urgency}
                    accent={q.urgency === 'urgent' ? '#e05c5c' : '#e8c14d'}
                    active={selected?.id === q.id} onClick={() => setSelected(q)} />
                ))}
                {completedQuests.length > 0 && (
                  <p className="px-3 pt-3 pb-1 text-xs text-parchment-500 font-ui uppercase tracking-wider">Completed</p>
                )}
                {filter(completedQuests, ['title', 'description']).map(q => (
                  <CodexListItem key={q.id} title={q.title}
                    active={selected?.id === q.id} muted onClick={() => setSelected(q)} />
                ))}
              </>
            )}

            {/* Empty state */}
            {!selected && counts[tab] === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="font-body text-xs text-parchment-500">
                  Nothing discovered yet
                </p>
              </div>
            )}
          </div>

          {/* Detail pane */}
          <div className="flex-1 overflow-y-auto p-5">
            {selected ? (
              <CodexDetail item={selected} tab={tab} currentLoc={world.currentLocation} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  {world.description ? (
                    <div className="max-w-md">
                      <h3 className="font-display text-lg text-parchment-200 mb-3">{world.name}</h3>
                      {world.tagline && <p className="font-body text-sm text-gold-400 italic mb-3">{world.tagline}</p>}
                      <p className="font-body text-sm text-parchment-300 leading-relaxed">{world.description}</p>
                      {world.geography && (
                        <p className="font-body text-xs text-parchment-400 mt-3">{world.geography}</p>
                      )}
                    </div>
                  ) : (
                    <p className="font-body text-sm text-parchment-500">Select an entry to read more</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Detail pane ───────────────────────────────────────────────────────────────

function CodexDetail({ item, tab, currentLoc }) {
  if (tab === 'locations') return <LocationDetail loc={item} isCurrent={item.id === currentLoc} />
  if (tab === 'npcs') return <NpcDetail npc={item} />
  if (tab === 'factions') return <FactionDetail faction={item} />
  if (tab === 'lore') return <LoreDetail entry={item} />
  if (tab === 'quests') return <QuestDetail quest={item} />
  return null
}

function LocationDetail({ loc, isCurrent }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl text-parchment-100">{loc.name}</h3>
            {isCurrent && <span className="text-xs px-2 py-0.5 rounded-full bg-gold-500/20 text-gold-300 font-ui">Current</span>}
          </div>
          <p className="font-body text-sm text-parchment-400 capitalize">{loc.type}</p>
        </div>
      </div>
      {loc.imageBase64 && (
        <img src={`data:image/png;base64,${loc.imageBase64}`} alt={loc.name}
          className="w-full rounded-lg border border-ink-700 object-cover max-h-48" />
      )}
      {loc.description && <p className="font-body text-sm text-parchment-300 leading-relaxed">{loc.description}</p>}
      {loc.atmosphere && (
        <div className="border-l-2 border-gold-500/30 pl-3">
          <p className="font-body text-xs text-parchment-400 italic">{loc.atmosphere}</p>
        </div>
      )}
      {loc.exits?.length > 0 && (
        <div>
          <p className="label">Connected to</p>
          <div className="flex flex-wrap gap-1.5">
            {loc.exits.map(e => <span key={e} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui">{e}</span>)}
          </div>
        </div>
      )}
      {loc.pointsOfInterest?.length > 0 && (
        <div>
          <p className="label">Points of interest</p>
          <div className="space-y-2">
            {loc.pointsOfInterest.map((poi, i) => (
              <div key={i} className="border-l-2 border-ink-600 pl-3">
                <p className="font-ui text-xs text-parchment-200 font-medium">{poi.name}</p>
                <p className="font-body text-xs text-parchment-400 mt-0.5">{poi.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NpcDetail({ npc }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {npc.portraitBase64 && (
          <img src={`data:image/png;base64,${npc.portraitBase64}`} alt={npc.name}
            className="w-24 h-28 object-cover rounded-lg border border-ink-600 shrink-0" />
        )}
        <div>
          <h3 className="font-display text-xl text-parchment-100">{npc.name}</h3>
          {npc.role && <p className="font-body text-sm text-parchment-400">{npc.role}</p>}
          {npc.ancestry && <p className="font-body text-xs text-parchment-500 capitalize">{npc.ancestry}</p>}
          {npc.disposition && (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-ui capitalize"
              style={{ background: dispositionBg(npc.disposition), color: dispositionColor(npc.disposition) }}>
              {npc.disposition}
            </span>
          )}
        </div>
      </div>
      {npc.appearance && <DetailRow label="Appearance" text={npc.appearance} />}
      {npc.personality && <DetailRow label="Personality" text={npc.personality} />}
      {npc.speech && <DetailRow label="Manner of speaking" text={npc.speech} />}
      {npc.motivation && <DetailRow label="Wants" text={npc.motivation} />}
      {npc.memories?.length > 0 && (
        <div>
          <p className="label">Knows</p>
          <ul className="space-y-1">
            {npc.memories.map((m, i) => (
              <li key={i} className="font-body text-xs text-parchment-400 flex items-start gap-2">
                <span className="text-parchment-600 shrink-0">·</span>{m.text || m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {npc.currentMood && (
        <DetailRow label="Current mood" text={npc.currentMood} />
      )}
    </div>
  )
}

function FactionDetail({ faction }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl text-parchment-100">{faction.name}</h3>
        <p className="font-body text-sm text-parchment-400 capitalize">{faction.type}</p>
      </div>
      {faction.description && <p className="font-body text-sm text-parchment-300 leading-relaxed">{faction.description}</p>}
      {faction.attitude && <DetailRow label="Attitude toward party" text={faction.attitude} />}
      {faction.powerLevel !== undefined && (
        <div>
          <p className="label">Power level</p>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(pip => (
              <div key={pip} className={clsx('w-6 h-2 rounded-full', pip <= faction.powerLevel ? 'bg-gold-500' : 'bg-ink-600')} />
            ))}
          </div>
        </div>
      )}
      {faction.knownMembers?.length > 0 && (
        <div>
          <p className="label">Known members</p>
          <div className="flex flex-wrap gap-1.5">
            {faction.knownMembers.map(m => (
              <span key={m} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui">{m}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LoreDetail({ entry }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl text-parchment-100">{entry.title}</h3>
      <p className="font-body text-sm text-parchment-300 leading-relaxed">{entry.text}</p>
    </div>
  )
}

function QuestDetail({ quest }) {
  const isComplete = !!quest.completedAt
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl text-parchment-100">{quest.title}</h3>
          {isComplete && <span className="text-xs px-2 py-0.5 rounded-full bg-forest-600/20 text-forest-300 font-ui">Complete</span>}
          {!isComplete && quest.urgency === 'urgent' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-crimson-600/20 text-crimson-300 font-ui">Urgent</span>
          )}
        </div>
        <p className="font-body text-sm text-parchment-400 capitalize">{quest.type} quest</p>
      </div>
      {quest.description && <p className="font-body text-sm text-parchment-300 leading-relaxed">{quest.description}</p>}
      {!isComplete && quest.currentObjective && (
        <div className="border-l-2 border-gold-500/50 pl-3">
          <p className="font-ui text-xs text-parchment-400 mb-0.5">Current objective</p>
          <p className="font-body text-sm text-parchment-200">{quest.currentObjective}</p>
        </div>
      )}
      {quest.reward && <DetailRow label="Reward" text={quest.reward} />}
      {isComplete && (
        <p className="font-body text-xs text-parchment-500 italic">
          Completed {new Date(quest.completedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function CodexListItem({ title, subtitle, accent, accentText, active, muted, onClick, isCurrentLocation, hasImage }) {
  return (
    <button onClick={onClick}
      className={clsx('w-full text-left px-3 py-2.5 border-b border-ink-700/50 transition-colors last:border-0',
        active ? 'bg-ink-700' : 'hover:bg-ink-700/50'
      )}>
      <div className="flex items-center gap-2">
        {hasImage && <span className="w-1.5 h-1.5 rounded-full bg-arcane-400 shrink-0" />}
        <p className={clsx('font-ui text-xs truncate',
          muted ? 'text-parchment-500 line-through' :
          active ? 'text-parchment-100' : 'text-parchment-300'
        )}>
          {title}
        </p>
        {isCurrentLocation && <span className="shrink-0 text-gold-400 text-xs">●</span>}
      </div>
      {(subtitle || accentText) && (
        <p className="font-body text-xs mt-0.5 truncate" style={{ color: accent || undefined }}>
          {accentText || subtitle}
        </p>
      )}
      {subtitle && !accentText && (
        <p className="font-body text-xs text-parchment-500 mt-0.5 truncate capitalize">{subtitle}</p>
      )}
    </button>
  )
}

function DetailRow({ label, text }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="font-body text-sm text-parchment-300 leading-relaxed">{text}</p>
    </div>
  )
}

function dispositionColor(d) {
  const m = { devoted:'#5dab7a', friendly:'#5dab7a', neutral:'#888', suspicious:'#e8c14d', hostile:'#e05c5c', fearful:'#9b7fe8' }
  return m[d] || '#888'
}

function dispositionBg(d) {
  const m = { devoted:'rgba(93,171,122,0.15)', friendly:'rgba(93,171,122,0.15)', neutral:'rgba(136,136,136,0.1)', suspicious:'rgba(232,193,77,0.15)', hostile:'rgba(224,92,92,0.15)', fearful:'rgba(155,127,232,0.15)' }
  return m[d] || 'rgba(136,136,136,0.1)'
}
