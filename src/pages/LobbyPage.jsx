import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { campaigns as campaignDb, characters as characterDb, sessions as sessionDb, worldState as worldStateDb, resources as resourcesDb } from '@/services/db/database'
import { indexResource, removeResourceChunks } from '@/services/resources/resourceService'
import { useAppStore } from '@/store/appStore'
import { deleteCollections } from '@/services/rag/ragService'
import { ATMOSPHERE_PRESETS, CAMPAIGN_TYPE_GROUPS, STORY_STYLES } from '@/lib/world/dmPrompts'
import { ANCESTRIES, BACKGROUNDS } from '@/lib/rules/rules'
import QuickStartFlow from '@/components/ui/QuickStartFlow'
import LoreDocumentsPicker from '@/components/ui/LoreDocumentsPicker'
import { useIsMobile } from '@/hooks/useIsMobile'
import clsx from 'clsx'

export default function LobbyPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { setActiveCampaign } = useAppStore()
  const [campaignList, setCampaignList] = useState([])
  const [selected, setSelected] = useState(null)  // expanded campaign
  const [showNew, setShowNew] = useState(false)
  const [newFromSource, setNewFromSource] = useState(null)  // campaign to clone design from
  const [showQuickStart, setShowQuickStart] = useState(false)
  const [loading, setLoading] = useState(true)

  // On mobile, track whether the detail pane is visible (true = showing detail/new, false = showing list)
  const mobileShowDetail = isMobile && (selected || showNew || newFromSource || showQuickStart)

  useEffect(() => {
    campaignDb.getAll().then(list => { setCampaignList(list); setLoading(false) })
  }, [])

  async function deleteCampaign(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this campaign? All progress, characters, history, and memories will be lost.')) return

    // Clean up RAG collections (non-fatal if ChromaDB is down)
    try {
      await deleteCollections(id)
    } catch (err) {
      console.warn('[RAG] Collection cleanup failed:', err.message)
    }

    await campaignDb.delete(id)
    setCampaignList(l => l.filter(c => c.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  function openCampaign(id) {
    setActiveCampaign(id)
    navigate(`/game/${id}`)
  }

  function addCharacter(campaign) {
    setActiveCampaign(campaign.id)
    navigate(`/character/create/${campaign.id}`)
  }

  return (
    <div className="h-full flex overflow-hidden bg-ink-950">
      {/* ── Left: Campaign list ── */}
      <div className={clsx(
        'border-r border-ink-700 flex flex-col shrink-0',
        'w-full md:w-72',                          // full-width on mobile, fixed sidebar on desktop
        isMobile && mobileShowDetail && 'hidden',  // hide list when detail is open on mobile
      )}>
        <div className="p-5 border-b border-ink-700">
          <h1 className="font-display text-xl text-parchment-100 tracking-wide mb-1">Vellicore</h1>
          <p className="font-body text-xs text-parchment-500">Your campaigns</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading && (
            <p className="px-5 py-4 text-xs text-parchment-500 font-ui">Loading…</p>
          )}

          {!loading && campaignList.length === 0 && !showNew && (
            <div className="px-5 py-8 text-center">
              <div className="text-3xl mb-3">🗺</div>
              <p className="font-body text-sm text-parchment-400 mb-4">No campaigns yet</p>
              <button className="btn-primary text-sm w-full" onClick={() => setShowNew(true)}>
                Create your first
              </button>
            </div>
          )}

          {campaignList.map(campaign => {
            const preset = ATMOSPHERE_PRESETS[campaign.atmosphere]
            const isSelected = selected?.id === campaign.id
            return (
              <button key={campaign.id}
                onClick={() => setSelected(isSelected ? null : campaign)}
                className={clsx('w-full text-left px-4 py-3 border-b border-ink-800 transition-colors',
                  isSelected ? 'bg-ink-700' : 'hover:bg-ink-800/60'
                )}>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg shrink-0">{preset?.icon || '⚔'}</span>
                  <div className="min-w-0">
                    <p className="font-display text-sm text-parchment-100 truncate">{campaign.name}</p>
                    <p className="font-body text-xs text-parchment-500 truncate">
                      {preset?.label || 'Custom'} · {campaign.sessionCount || 0} session{campaign.sessionCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="p-4 border-t border-ink-700 space-y-2">
          <button className="btn-primary w-full text-sm" onClick={() => { setShowQuickStart(true); setShowNew(false); setSelected(null) }}>
            ✦ Generate Everything
          </button>
          <button className="btn-secondary w-full text-sm" onClick={() => { setShowNew(true); setSelected(null); setShowQuickStart(false) }}>
            + New Campaign
          </button>
          <button className="btn-ghost w-full text-sm" onClick={() => navigate('/settings')}>
            ⚙ Settings
          </button>
          {typeof window !== 'undefined' && !!window.tavern && (
            <button
              className="btn-ghost w-full text-sm text-crimson-300 hover:text-crimson-200"
              onClick={() => window.tavern.app.relaunch()}
            >
              ↺ Restart Vellicore
            </button>
          )}
        </div>
      </div>

      {/* ── Right: Detail / new campaign ── */}
      <div className={clsx(
        'flex-1 overflow-y-auto flex flex-col',
        isMobile && !mobileShowDetail && 'hidden', // hide detail when list is shown on mobile
      )}>
        {showQuickStart ? (
          <>
          {isMobile && (
            <button onClick={() => setShowQuickStart(false)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-ui text-parchment-400 hover:text-parchment-200 border-b border-ink-700">
              ← Back
            </button>
          )}
          <QuickStartFlow onCancel={() => setShowQuickStart(false)} />
          </>
        ) : showNew || newFromSource ? (
          <>
          {isMobile && (
            <button onClick={() => { setShowNew(false); setNewFromSource(null) }}
              className="flex items-center gap-2 px-4 py-3 text-sm font-ui text-parchment-400 hover:text-parchment-200 border-b border-ink-700">
              ← Back
            </button>
          )}
          <NewCampaignForm
            initialValues={newFromSource}
            sourceId={newFromSource?.id}
            onCreated={(campaign, charsCopied) => {
              setCampaignList(l => [campaign, ...l])
              setShowNew(false)
              setNewFromSource(null)
              setActiveCampaign(campaign.id)
              if (charsCopied > 0) {
                setSelected(campaign)
              } else {
                navigate(`/character/create/${campaign.id}`)
              }
            }}
            onCancel={() => { setShowNew(false); setNewFromSource(null) }}
          />
          </>
        ) : selected ? (
          <>
          {isMobile && (
            <button onClick={() => setSelected(null)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-ui text-parchment-400 hover:text-parchment-200 border-b border-ink-700">
              ← Campaigns
            </button>
          )}
          <CampaignDetail
            campaign={selected}
            onPlay={() => openCampaign(selected.id)}
            onAddCharacter={() => addCharacter(selected)}
            onNewFrom={src => { setNewFromSource(src); setSelected(null) }}
            onDelete={e => deleteCampaign(selected.id, e)}
          />
          </>
        ) : (
          <WelcomePane
            onNewCampaign={() => setShowNew(true)}
            onQuickStart={() => setShowQuickStart(true)}
          />
        )}
      </div>
    </div>
  )
}

// ── Campaign detail ───────────────────────────────────────────────────────────

function CampaignDetail({ campaign, onPlay, onAddCharacter, onNewFrom, onDelete }) {
  const [chars, setChars] = useState([])
  const [sessions, setSessions] = useState([])
  const [worldData, setWorldData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaign?.id) return
    Promise.all([
      characterDb.getByCampaign(campaign.id),
      sessionDb.getByCampaign(campaign.id),
      worldStateDb.get(campaign.id),
    ]).then(([c, s, w]) => {
      setChars(c)
      setSessions(s)
      setWorldData(w)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [campaign.id])

  const preset = ATMOSPHERE_PRESETS[campaign.atmosphere]
  const playSessions = sessions.filter(s => s.type === 'play')
  const world = worldData?.world
  const story = worldData?.story

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      {/* Campaign header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <span className="text-5xl">{preset?.icon || '⚔'}</span>
          <div>
            <h2 className="font-display text-3xl text-parchment-100 tracking-wide">{campaign.name}</h2>
            <p className="font-body text-sm text-parchment-400 mt-0.5">
              {preset?.label || 'Custom'} · Danger: {campaign.dangerLevel || 'moderate'}
            </p>
            {campaign.lastPlayed && (
              <p className="font-ui text-xs text-parchment-500 mt-1">
                Last played {new Date(campaign.lastPlayed).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <button onClick={onPlay} className="btn-primary text-base px-6 py-2.5">
          ▶ Play
        </button>
      </div>

      {/* World overview */}
      {world?.name && (
        <div className="panel p-5 mb-5">
          <p className="label mb-2">World</p>
          <h3 className="font-display text-lg text-parchment-100">{world.name}</h3>
          {world.tagline && <p className="font-body text-sm text-gold-400 italic mt-0.5">{world.tagline}</p>}
          {world.description && (
            <p className="font-body text-sm text-parchment-300 mt-2 leading-relaxed line-clamp-3">{world.description}</p>
          )}
          {story && (
            <div className="mt-3 pt-3 border-t border-ink-700">
              <div className="flex items-center justify-between text-xs font-ui mb-1.5">
                <span className="text-parchment-400">Story progress</span>
                <span className="text-parchment-400">Act {story.currentAct || 1} of 5</span>
              </div>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(act => (
                  <div key={act} className={clsx('flex-1 h-1.5 rounded-full',
                    act < (story.currentAct || 1) ? 'bg-gold-500' :
                    act === (story.currentAct || 1) ? 'bg-gold-400 animate-pulse-slow' :
                    'bg-ink-600'
                  )} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard value={chars.length} label="Characters" />
        <StatCard value={playSessions.length} label="Sessions" />
        <StatCard value={story?.activeQuests?.length || 0} label="Active quests" />
      </div>

      {/* Characters */}
      <div className="panel mb-5">
        <div className="panel-header justify-between">
          <span className="font-ui text-xs text-parchment-400 uppercase tracking-wider">Characters</span>
          <button onClick={onAddCharacter} className="text-xs text-gold-400 hover:text-gold-300 font-ui">
            + Add
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-xs text-parchment-500 font-ui">Loading…</p>
          ) : chars.length === 0 ? (
            <div className="text-center py-4">
              <p className="font-body text-sm text-parchment-400 mb-3">No characters yet</p>
              <button onClick={onAddCharacter} className="btn-secondary text-sm">Create a character</button>
            </div>
          ) : (
            <div className="space-y-2">
              {chars.map(char => (
                <CharacterRow key={char.id} char={char} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sessions */}
      {playSessions.length > 0 && (
        <div className="panel mb-5">
          <div className="panel-header">
            <span className="font-ui text-xs text-parchment-400 uppercase tracking-wider">Recent sessions</span>
          </div>
          <div className="divide-y divide-ink-700">
            {playSessions.slice(0, 4).map((session, i) => (
              <div key={session.id} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-ui text-xs text-parchment-300">
                      Session {playSessions.length - i}
                    </p>
                    {session.location && (
                      <p className="font-body text-xs text-parchment-500 mt-0.5">{session.location}</p>
                    )}
                  </div>
                  <p className="font-ui text-xs text-parchment-500 shrink-0">
                    {new Date(session.startedAt || session.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {session.summary && (
                  <p className="font-body text-xs text-parchment-400 mt-1.5 line-clamp-2 italic">{session.summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lore documents */}
      <LoreDocumentsSection campaignId={campaign.id} />

      {/* Danger zone */}
      <div className="flex items-center justify-between">
        <button onClick={() => onNewFrom({
            id: campaign.id,
            atmosphere: campaign.atmosphere,
            customTone: campaign.tone,
            customThemes: Array.isArray(campaign.themes) ? campaign.themes.join(', ') : (campaign.themes || ''),
            danger: campaign.dangerLevel,
            storyStyle: campaign.storyStyle,
          })}
          className="text-xs text-parchment-500 hover:text-parchment-300 font-ui transition-colors">
          ⊕ New campaign from this…
        </button>
        <button onClick={onDelete}
          className="text-xs text-crimson-500 hover:text-crimson-300 font-ui transition-colors">
          Delete campaign
        </button>
      </div>
    </div>
  )
}

// ── Welcome pane ──────────────────────────────────────────────────────────────

function WelcomePane({ onNewCampaign, onQuickStart }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">⚔</div>
        <h2 className="font-display text-3xl text-parchment-100 mb-3 tracking-wide">
          Welcome to Vellicore
        </h2>
        <p className="font-body text-parchment-400 mb-2">
          An AI-powered tabletop RPG that runs entirely on your machine.
        </p>
        <p className="font-body text-sm text-parchment-500 mb-8">
          Select a campaign from the left, or start a new adventure.
        </p>

        <div className="flex flex-col gap-3 items-center">
          <button onClick={onQuickStart} className="btn-primary text-base px-8 py-3 w-full max-w-xs">
            ✦ Generate Everything
          </button>
          <button onClick={onNewCampaign} className="btn-secondary text-sm px-6 py-2 w-full max-w-xs">
            + Create Campaign Manually
          </button>
        </div>

        <p className="font-body text-xs text-parchment-500 mt-3 mb-8">
          Generate Everything creates a complete campaign world and character in one click.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          {[
            { icon: '🤖', label: 'AI Dungeon Master', desc: 'Claude or local LLM' },
            { icon: '🖼', label: 'Local images', desc: 'SDNext — free & offline' },
            { icon: '🔊', label: 'Voice narration', desc: 'Kokoro TTS — local' },
          ].map(f => (
            <div key={f.label} className="panel p-3">
              <div className="text-2xl mb-1">{f.icon}</div>
              <p className="font-ui text-xs text-parchment-300 font-medium">{f.label}</p>
              <p className="font-body text-xs text-parchment-500 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── New campaign form (same as before, inline here) ───────────────────────────

function NewCampaignForm({ onCreated, onCancel, initialValues, sourceId }) {
  const [name, setName] = useState('')
  const [atmosphere, setAtmosphere] = useState(initialValues?.atmosphere || 'classic_fantasy')
  const [customTone, setCustomTone] = useState(initialValues?.customTone || '')
  const [customThemes, setCustomThemes] = useState(initialValues?.customThemes || '')
  const [danger, setDanger] = useState(initialValues?.danger || 'moderate')
  const [storyStyle, setStoryStyle] = useState(initialValues?.storyStyle || ['guided_fate'])
  const [pendingDocs, setPendingDocs] = useState([])
  const [saving, setSaving] = useState(false)
  const ragAvailable = useAppStore(s => s.ragAvailable)

  function toggleStyle(id) {
    setStoryStyle(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1], id]  // drop oldest, add new
    })
  }

  async function create() {
    if (!name.trim()) return
    setSaving(true)
    const preset = ATMOSPHERE_PRESETS[atmosphere]
    const campaign = await campaignDb.create({
      name: name.trim(), atmosphere,
      tone: atmosphere === 'custom' ? customTone : preset.tone,
      themes: atmosphere === 'custom'
        ? customThemes.split(',').map(t => t.trim()).filter(Boolean)
        : preset.themes,
      dangerLevel: danger,
      storyStyle: storyStyle.length > 0 ? storyStyle : ['guided_fate'],
      sessionCount: 0, createdAt: Date.now(),
    })

    let charsCopied = 0
    if (sourceId) {
      try {
        const sourceChars = await characterDb.getByCampaign(sourceId)
        for (const ch of sourceChars) {
          const { id, campaignId, createdAt, ...rest } = ch
          await characterDb.create({ ...rest, campaignId: campaign.id, hp: ch.maxHp })
        }
        charsCopied = sourceChars.length
      } catch (err) {
        console.warn('Failed to copy characters:', err)
      }
    }

    // Index any pending lore documents
    for (const doc of pendingDocs) {
      try {
        const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        await resourcesDb.create({ id, campaignId: campaign.id, name: doc.name, type: doc.type, content: doc.content })
        if (ragAvailable) {
          const chunkCount = await indexResource({ campaignId: campaign.id, resourceId: id, resourceName: doc.name, content: doc.content })
          await resourcesDb.setIndexed(id, chunkCount)
        }
      } catch (err) {
        console.warn('[Resources] Failed to index lore doc (non-fatal):', err.message)
      }
    }

    setSaving(false)
    onCreated(campaign, charsCopied)
  }

  return (
    <div className="p-8 max-w-xl animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="btn-ghost text-sm px-2">← Back</button>
        <h2 className="font-display text-2xl text-parchment-100">
          {initialValues ? 'New Campaign Based On…' : 'New Campaign'}
        </h2>
      </div>

      <div className="space-y-5">
        <div>
          <label className="label">Campaign name</label>
          <input className="input text-lg font-body" placeholder="The Shattered Crown, Ashes of Valdros…"
            value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label">Campaign Type</label>
          <div className="space-y-3 mt-1">
            {CAMPAIGN_TYPE_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-xs text-parchment-500 font-ui uppercase tracking-wider mb-1.5">{group.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {group.keys.map(key => {
                    const preset = ATMOSPHERE_PRESETS[key]
                    if (!preset) return null
                    return (
                      <button key={key} onClick={() => setAtmosphere(key)}
                        className={clsx('text-left p-3 rounded border transition-all',
                          atmosphere === key ? 'border-gold-500 bg-ink-700 shadow-glow-gold' : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                        )}>
                        <div className="font-ui text-sm text-parchment-200">
                          <span className="mr-1.5">{preset.icon}</span>{preset.label}
                        </div>
                        <p className="font-body text-xs text-parchment-400 mt-1 line-clamp-2">{preset.description}</p>
                        {preset.references?.length > 0 && (
                          <p className="font-body text-xs text-parchment-600 mt-1 italic line-clamp-1">
                            {preset.references.join(', ')}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {atmosphere === 'custom' && (
          <div className="space-y-3">
            <div>
              <label className="label">Describe the tone</label>
              <input className="input" placeholder="e.g. gritty noir detective mystery in a steampunk city"
                value={customTone} onChange={e => setCustomTone(e.target.value)} />
            </div>
            <div>
              <label className="label">Themes (comma separated)</label>
              <input className="input" placeholder="e.g. betrayal, redemption, corporate greed"
                value={customThemes} onChange={e => setCustomThemes(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <label className="label">Danger level</label>
          <div className="flex gap-2 mt-1">
            {[
              { id: 'low', label: 'Heroic', desc: 'Low death risk' },
              { id: 'moderate', label: 'Balanced', desc: 'Standard' },
              { id: 'high', label: 'Grim', desc: 'Permadeath possible' },
              { id: 'extreme', label: 'Brutal', desc: 'Every choice matters' },
            ].map(opt => (
              <button key={opt.id} onClick={() => setDanger(opt.id)}
                className={clsx('flex-1 py-2 px-2 rounded border text-center transition-all',
                  danger === opt.id ? 'border-gold-500 bg-ink-700' : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                )}>
                <div className="font-ui text-xs text-parchment-200">{opt.label}</div>
                <div className="font-body text-xs text-parchment-400">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Story Style</label>
          <p className="font-body text-xs text-parchment-500 mb-2">Choose one or two. Your second choice flavours the first.</p>
          <div className="flex gap-2 mt-1">
            {Object.values(STORY_STYLES).map((style) => {
              const idx = storyStyle.indexOf(style.id)
              const isPrimary = idx === 0
              const isSecondary = idx === 1
              return (
                <button key={style.id} onClick={() => toggleStyle(style.id)}
                  className={clsx('flex-1 p-3 rounded border text-left transition-all',
                    isPrimary   ? 'border-gold-500 bg-ink-700 shadow-glow-gold' :
                    isSecondary ? 'border-gold-600/50 bg-ink-750' :
                    'border-ink-600 bg-ink-800 hover:border-ink-500'
                  )}>
                  <div className="font-ui text-xs text-parchment-200 mb-1">
                    <span className="mr-1.5">{style.icon}</span>{style.label}
                    {isSecondary && <span className="ml-1.5 text-parchment-500 text-xs">+blend</span>}
                  </div>
                  <p className="font-body text-xs text-parchment-400 leading-snug">{style.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="label">Source Lore <span className="text-parchment-500 text-xs font-body normal-case">(optional)</span></label>
          <p className="font-body text-xs text-parchment-500 mb-2">
            Upload lore documents, adventure modules, or setting guides — the DM will treat them as canonical source material when generating the world.
          </p>
          <LoreDocumentsPicker docs={pendingDocs} onChange={setPendingDocs} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={create} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create & Add Characters →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CharacterRow({ char }) {
  const ancestry = ANCESTRIES[char.ancestry]
  const background = BACKGROUNDS[char.background]
  const hpPct = Math.max(0, Math.min(100, (char.hp / char.maxHp) * 100))

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-10 h-10 rounded-full border border-ink-600 overflow-hidden bg-ink-700 flex items-center justify-center shrink-0">
        {char.portraitBase64
          ? <img src={`data:image/png;base64,${char.portraitBase64}`} className="w-full h-full object-cover" alt="" />
          : <span className="text-sm">{char.name?.[0]}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm text-parchment-200">{char.name}</p>
        <p className="font-body text-xs text-parchment-500 capitalize">
          {[ancestry?.label, background?.label].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-ui text-xs text-parchment-400">{char.hp}/{char.maxHp} HP</p>
        <div className="w-16 h-1 bg-ink-700 rounded-full mt-1 overflow-hidden">
          <div className={clsx('h-full rounded-full', hpPct > 60 ? 'bg-forest-500' : hpPct > 30 ? 'bg-gold-500' : 'bg-crimson-500')}
            style={{ width: `${hpPct}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Lore documents section (shown in campaign detail before world gen) ─────────

const RESOURCE_TYPES = [
  { value: 'lore',      label: 'Lore / Setting' },
  { value: 'adventure', label: 'Adventure / Module' },
  { value: 'rulebook',  label: 'Rulebook' },
  { value: 'character', label: 'Character Stories' },
  { value: 'text',      label: 'Other' },
]

function LoreDocumentsSection({ campaignId }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const ragAvailable = useAppStore(s => s.ragAvailable)

  useEffect(() => {
    if (!campaignId) return
    resourcesDb.byCampaign(campaignId)
      .then(list => { setResources(list || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [campaignId])

  async function handleDelete(res, e) {
    e.stopPropagation()
    if (!confirm(`Delete "${res.name}"?`)) return
    await removeResourceChunks({ campaignId, resourceId: res.id, chunkCount: res.chunk_count })
    await resourcesDb.delete(res.id)
    setResources(r => r.filter(x => x.id !== res.id))
  }

  async function handleAdded(res) {
    setResources(r => [res, ...r])
    setShowAdd(false)
  }

  return (
    <div className="panel mb-5">
      <div className="panel-header justify-between">
        <div>
          <span className="font-ui text-xs text-parchment-400 uppercase tracking-wider">Source Lore</span>
          {ragAvailable && resources.length > 0 && (
            <span className="ml-2 text-xs text-forest-400 font-ui">{resources.filter(r => r.indexed).length}/{resources.length} indexed</span>
          )}
        </div>
        <button onClick={() => setShowAdd(s => !s)} className="text-xs text-gold-400 hover:text-gold-300 font-ui">
          {showAdd ? '✕ Cancel' : '+ Add'}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {!ragAvailable && (
          <p className="text-xs text-gold-400 font-ui">
            ChromaDB offline — documents will be saved but not used for generation until ChromaDB is available.
          </p>
        )}

        {showAdd && (
          <LoreAddForm campaignId={campaignId} onAdded={handleAdded} onCancel={() => setShowAdd(false)} />
        )}

        {loading && <p className="text-xs text-parchment-500 font-ui">Loading…</p>}

        {!loading && resources.length === 0 && !showAdd && (
          <div className="text-center py-3">
            <p className="font-body text-sm text-parchment-400">No source documents yet</p>
            <p className="font-body text-xs text-parchment-500 mt-1">
              Upload lore, adventure modules, or stories and the DM will treat them as canonical source material when generating the world.
            </p>
          </div>
        )}

        {resources.map(res => {
          const typeLabel = RESOURCE_TYPES.find(t => t.value === res.type)?.label || res.type
          return (
            <div key={res.id} className="flex items-center gap-2 py-1 border-b border-ink-800 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="font-ui text-xs text-parchment-200 truncate">{res.name}</p>
                <p className="font-body text-xs text-parchment-500">{typeLabel} · {res.chunk_count > 0 ? `${res.chunk_count} chunks` : 'unindexed'}</p>
              </div>
              {res.indexed
                ? <span className="text-xs px-1.5 py-0.5 rounded font-ui text-forest-300 bg-forest-600/20 shrink-0">indexed</span>
                : <span className="text-xs px-1.5 py-0.5 rounded font-ui text-gold-300 bg-gold-500/20 shrink-0">pending</span>
              }
              <button onClick={e => handleDelete(res, e)} className="text-xs text-crimson-400 hover:text-crimson-300 shrink-0">✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoreAddForm({ campaignId, onAdded, onCancel }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('lore')
  const [content, setContent] = useState('')
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState('')
  const ragAvailable = useAppStore(s => s.ragAvailable)

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const baseName = file.name.replace(/\.[^.]+$/, '')
    if (!name) setName(baseName)

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setError('')
      setIndexing(true)
      try {
        const buffer = await file.arrayBuffer()
        const result = await window.tavern.fs.parsePdf(buffer)
        if (!result.ok) throw new Error(result.error || 'PDF extraction failed')
        setContent(result.text)
      } catch (err) {
        setError(`PDF error: ${err.message}`)
      } finally {
        setIndexing(false)
      }
    } else {
      const text = await file.text()
      setContent(text)
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required.'); return }
    if (!content.trim()) { setError('Content is required.'); return }
    setError('')
    setIndexing(true)
    try {
      const id = `res_${Date.now()}`
      const saved = await resourcesDb.create({ id, campaignId, name: name.trim(), type, content: content.trim() })
      let chunkCount = 0
      if (ragAvailable) {
        try {
          chunkCount = await indexResource({ campaignId, resourceId: id, resourceName: name.trim(), content: content.trim() })
          await resourcesDb.setIndexed(id, chunkCount)
        } catch (err) {
          console.warn('[Resources] Indexing failed (non-fatal):', err.message)
        }
      }
      onAdded({ ...saved, id, chunk_count: chunkCount, indexed: ragAvailable ? 1 : 0, created_at: Date.now() })
    } catch (err) {
      setError('Failed to save: ' + err.message)
      setIndexing(false)
    }
  }

  return (
    <div className="bg-ink-700 rounded border border-ink-600 p-3 space-y-3">
      <div>
        <label className="label">Name</label>
        <input className="input text-sm" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. World Lore, Adventure Module…" />
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input text-sm" value={type} onChange={e => setType(e.target.value)}>
          {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Content</label>
          <label className="text-xs text-parchment-500 hover:text-parchment-300 cursor-pointer font-ui">
            Upload file (.txt, .md, .pdf)
            <input type="file" accept=".txt,.md,.pdf" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
        <textarea className="input text-sm font-mono h-28 resize-none" value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Paste lore text here, or upload a file above…" />
        {content && <p className="text-xs text-parchment-500 mt-1 font-ui">{content.length.toLocaleString()} characters</p>}
      </div>
      {error && <p className="text-xs text-crimson-400 font-ui">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost text-sm flex-1" onClick={onCancel} disabled={indexing}>Cancel</button>
        <button className="btn-primary text-sm flex-1" onClick={handleSubmit} disabled={indexing}>
          {indexing ? 'Indexing…' : 'Add Document'}
        </button>
      </div>
    </div>
  )
}

function StatCard({ value, label }) {
  return (
    <div className="panel p-4 text-center">
      <p className="font-display text-3xl text-parchment-100">{value}</p>
      <p className="font-ui text-xs text-parchment-400 mt-0.5">{label}</p>
    </div>
  )
}
