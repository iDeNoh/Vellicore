import React, { useEffect, useState, useCallback, Component } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameStore, useAppStore } from '@/store/appStore'
import { campaigns as campaignDb, characters as characterDb } from '@/services/db/database'
import { useDm } from '@/hooks/useDm'
import { useAutopilot } from '@/hooks/useAutopilot'
import { rollDice } from '@/lib/rules/rules'
import { useSessionMemory } from '@/hooks/useSessionMemory'
import { useGamePersistence, restoreCampaignState } from '@/hooks/useGamePersistence'
import { useImagePipeline } from '@/hooks/useImagePipeline'
import { useCombat } from '@/hooks/useCombat'
import CombatTracker from '@/components/game/CombatTracker'

import GameToolbar from '@/components/game/GameToolbar'
import ChatPanel from '@/components/game/ChatPanel'
import CharacterPanel from '@/components/game/CharacterPanel'
import WorldPanel from '@/components/game/WorldPanel'
import MapPanel from '@/components/map/MapPanel'
import StoryBiblePanel from '@/components/game/StoryBiblePanel'
import NarrationPanel from '@/components/game/NarrationPanel'
import EndScreen from '@/pages/EndScreen'
import { useGameStore as useGS } from '@/store/appStore'
import WorldGenStatus from '@/components/ui/WorldGenStatus'
import clsx from 'clsx'

class GameErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[GamePage] Render error:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center bg-ink-950 p-8">
          <div className="panel p-8 max-w-md text-center">
            <div className="text-4xl mb-4">⚠</div>
            <h2 className="font-display text-xl text-parchment-100 mb-2">Something went wrong</h2>
            <p className="font-body text-parchment-400 mb-2 text-sm">{this.state.error.message}</p>
            <p className="font-body text-parchment-500 mb-6 text-xs">Check the DevTools console for details.</p>
            <button className="btn-secondary" onClick={() => window.location.hash = '/lobby'}>← Back to Lobby</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function GamePageInner() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const config = useAppStore(s => s.config)

  const {
    campaign, setCampaign,
    characters, setCharacters,
    messages, addMessage,
    isDmThinking, resetGame,
    setWorld, setStory,
    gameOver, clearGameOver,
    dmInitialised,
  } = useGameStore()

  const { initCampaign, sendPlayerAction, submitRolls } = useDm()
  const { autoMode, toggleAutoMode } = useAutopilot({ sendPlayerAction, submitRolls })
  const { isNearBudget, budgetUsed, summariseAndCompress } = useSessionMemory(campaignId)
  useImagePipeline()  // auto-generates NPC portraits and location images
  const { initCombat } = useCombat()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activePanel, setActivePanel] = useState('chat')
  const [isGeneratingWorld, setIsGeneratingWorld] = useState(false)
  const [combatOpen, setCombatOpen] = useState(false)
  const [showEndScreen, setShowEndScreen] = useState(false)

  useGamePersistence(campaignId, loading)

  // Show end screen 2 s after GAME_OVER fires (lets the player read the final message)
  useEffect(() => {
    if (gameOver) {
      const t = setTimeout(() => setShowEndScreen(true), 2000)
      return () => clearTimeout(t)
    } else {
      setShowEndScreen(false)
    }
  }, [gameOver])

  // ── Boot ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function boot() {
      try {
        resetGame()
        const camp = await campaignDb.getById(campaignId)
        if (!camp) throw new Error('Campaign not found')
        setCampaign(camp)

        const chars = await characterDb.getByCampaign(campaignId)
        const charsMap = {}
        chars.forEach(c => {
          charsMap[c.id] = {
            id: c.id,
            name: c.name || 'Unnamed Hero',
            ancestry: c.ancestry || 'human',
            background: c.background || 'adventurer',
            stats: c.stats || { body: 2, mind: 2, spirit: 2 },
            hp: c.hp ?? (c.stats?.body || 2) * 4,
            maxHp: c.maxHp ?? (c.stats?.body || 2) * 4,
            conditions: c.conditions || [],
            abilities: c.abilities || [],
            inventory: c.inventory || [
              { name: "Traveller's pack", type: 'gear', qty: 1, notable: false },
              { name: 'Gold coins', type: 'gold', qty: 10, notable: false },
            ],
            notes: c.notes || '',
            portraitBase64: c.portraitBase64 || null,
          }
        })

        // Dev fallback: default character if none created yet
        if (Object.keys(charsMap).length === 0) {
          const id = crypto.randomUUID()
          charsMap[id] = {
            id, name: 'The Adventurer', ancestry: 'human', background: 'wanderer',
            stats: { body: 2, mind: 2, spirit: 3 },
            hp: 8, maxHp: 8, conditions: [], abilities: ['lucky'],
            inventory: [
              { name: 'Iron sword', type: 'weapon', qty: 1, notable: true },
              { name: 'Leather armour', type: 'armor', qty: 1, notable: true },
              { name: 'Gold coins', type: 'gold', qty: 15, notable: false },
            ],
            notes: '', portraitBase64: null,
          }
        }

        setCharacters(charsMap)

        // Restore persisted world state + messages
        const saved = await restoreCampaignState(campaignId)
        if (saved.worldData?.world) {
          setWorld(saved.worldData.world)
          if (saved.worldData.story) setStory(saved.worldData.story)
        }
        if (saved.messages?.length > 0) {
          // Reload persisted messages into store
          useGameStore.setState(state => { state.messages = saved.messages })
        }
        if (saved.npcList?.length > 0) {
          useGameStore.setState(state => {
            saved.npcList.forEach(npc => { state.world.npcs[npc.id] = npc })
          })
        }

        setLoading(false)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }
    boot()
  }, [campaignId])

  // ── Combat trigger detection
  useEffect(() => {
    const state = useGameStore.getState()
    const pending = state._pendingCombat
    if (pending?.length > 0) {
      useGameStore.setState(s => { s._pendingCombat = null })
      const worldNpcs = useGameStore.getState().world.npcs || {}
      const enemies = pending.map(e => {
        const npc = Object.values(worldNpcs).find(n => n.name?.toLowerCase().includes(e.name?.toLowerCase()))
        return npc ? { ...npc, threatLevel: e.threatLevel } : { id: crypto.randomUUID(), name: e.name, threatLevel: e.threatLevel, role: e.role }
      })
      initCombat(enemies)
      setCombatOpen(true)
    }
  }, [messages.length])

  // ── Init DM opening ───────────────────────────────────────────────────────

  useEffect(() => {
    if (loading || dmInitialised || !campaign || isDmThinking) return
    if (!config) return  // config loads async from Electron — wait for it
    // Mark as initialised immediately (in Zustand store — survives HMR remounts)
    useGameStore.setState(s => { s.dmInitialised = true })
    if (messages.length > 0) return  // resuming an existing session — skip opening scene

    const llmReady =
      (config?.llm?.provider === 'claude' && config?.llm?.claudeApiKey) ||
      config?.llm?.provider === 'ollama' ||
      config?.llm?.provider === 'lmstudio' ||
      (config?.llm?.provider === 'openai-compat' && config?.llm?.openAiCompatUrl)

    if (!llmReady) {
      addMessage({
        role: 'assistant',
        content: `Welcome to **${campaign.name}**.\n\nNo LLM is configured. Go to **Settings** to connect a language model and begin your adventure.`,
        streaming: false,
      })
      return
    }

    setIsGeneratingWorld(true)
    initCampaign().finally(() => setIsGeneratingWorld(false))
  }, [loading, campaign, dmInitialised, config])

  // ── Manual roll from character panel stat click ───────────────────────────

  const handleManualRoll = useCallback(({ character, stat, reason }) => {
    const chars = useGameStore.getState().characters
    const char = Object.values(chars).find(c => c.name === character)
    if (!char) return
    const statVal = char.stats?.[stat] || 2
    const result = rollDice(statVal)
    submitRolls([{ character, stat, reason, ...result }])
  }, [submitRolls])

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-ink-950">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🕯</div>
        <p className="font-body text-parchment-400">Loading campaign…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="h-full flex items-center justify-center bg-ink-950 p-8">
      <div className="panel p-8 max-w-sm text-center">
        <div className="text-4xl mb-4">⚠</div>
        <h2 className="font-display text-xl text-parchment-100 mb-2">Something went wrong</h2>
        <p className="font-body text-parchment-400 mb-6 text-sm">{error}</p>
        <button className="btn-secondary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
    </div>
  )

  // ── Game layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-ink-950">
      <GameToolbar activePanel={activePanel} onPanelChange={setActivePanel} autoMode={autoMode} onToggleAutoMode={toggleAutoMode} />

      <div className="flex-1 overflow-hidden flex">
        {/* Mobile: single panel view */}
        <div className="flex-1 overflow-hidden lg:border-r lg:border-ink-700 relative">
          <WorldGenStatus visible={isGeneratingWorld} />
          {/* Chat: always visible on desktop when world/character are active (those live in sidebar).
               Hides on desktop when map/story take over the main area. */}
          <div className={clsx('h-full',
            activePanel === 'chat' ? '' :
            (activePanel === 'world' || activePanel === 'character') ? 'hidden lg:block' :
            'hidden'
          )}>
            <ChatPanel onSendAction={sendPlayerAction} onSubmitRolls={submitRolls} />
          </div>
          <div className={clsx('h-full', activePanel !== 'map' && 'hidden')}>
            <MapPanel />
          </div>
          {/* World/Character: mobile-only in main area; desktop always uses the right sidebar */}
          <div className={clsx('h-full', activePanel !== 'world' ? 'hidden' : 'lg:hidden')}>
            <WorldPanel />
          </div>
          <div className={clsx('h-full', activePanel !== 'character' ? 'hidden' : 'lg:hidden')}>
            <CharacterPanel onRoll={handleManualRoll} />
          </div>
          <div className={clsx('h-full', activePanel !== 'story' && 'hidden')}>
            <StoryBiblePanel isGenerating={isGeneratingWorld} />
          </div>
          <div className={clsx('h-full', activePanel !== 'narration' && 'hidden')}>
            <NarrationPanel />
          </div>
        </div>

        {/* Desktop: persistent right sidebar split into character + world */}
        <div className="hidden lg:flex flex-col w-72 min-w-0">
          <div className="flex-1 overflow-hidden border-b border-ink-700" style={{ maxHeight: '55%' }}>
            <div className="panel-header">
              <span className="text-xs font-ui text-parchment-400 uppercase tracking-wider">Character</span>
            </div>
            <div className="overflow-y-auto h-[calc(100%-41px)]">
              <CharacterPanel onRoll={handleManualRoll} />
            </div>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <div className="panel-header">
              <span className="text-xs font-ui text-parchment-400 uppercase tracking-wider">World</span>
            </div>
            <div className="overflow-y-auto h-[calc(100%-41px)]">
              <WorldPanel />
            </div>
          </div>
        </div>
      </div>

      {/* End screen overlay — appears 2 s after GAME_OVER tag fires */}
      {showEndScreen && gameOver && (
        <EndScreen
          gameOver={gameOver}
          onContinue={() => { clearGameOver(); setShowEndScreen(false) }}
        />
      )}
    </div>
  )
}

export default function GamePage(props) {
  return <GameErrorBoundary><GamePageInner {...props} /></GameErrorBoundary>
}
