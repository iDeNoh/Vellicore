import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useAppStore } from '@/store/appStore'
import { stopSpeaking } from '@/services/tts/ttsService'
import { useSessionMemory } from '@/hooks/useSessionMemory'
import ImageGenIndicator from '@/components/game/ImageGenIndicator'
import TtsControls from '@/components/game/TtsControls'
import CombatTracker from '@/components/game/CombatTracker'
import WorldCodex from '@/components/game/WorldCodex'
import SessionHistory from '@/components/game/SessionHistory'
import clsx from 'clsx'

export default function GameToolbar({ activePanel, onPanelChange, autoMode, onToggleAutoMode }) {
  const navigate = useNavigate()
  const [ttsOpen, setTtsOpen] = useState(false)
  const [combatOpen, setCombatOpen] = useState(false)
  const [codexOpen, setCodexOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const campaign = useGameStore(s => s.campaign)
  const combat = useGameStore(s => s.combat)
  const campaignId = campaign?.id
  const { isNearBudget, budgetUsed, summariseAndCompress } = useSessionMemory(campaignId)
  const isDmThinking = useGameStore(s => s.isDmThinking)
  const isSpeaking = useGameStore(s => s.isSpeaking)
  const isGeneratingImage = useGameStore(s => s.isGeneratingImage)
  const config = useAppStore(s => s.config)

  const panels = [
    { id: 'chat', label: 'Narrative', icon: '📜' },
    { id: 'map', label: 'Map', icon: '🗺' },
    { id: 'world', label: 'World', icon: '⚔' },
    { id: 'character', label: 'Character', icon: '◈' },
    { id: 'story', label: 'Story Bible', icon: '🔮' },
    { id: 'narration', label: 'Narration', icon: '⚡' },
  ]

  return (
    <>
    <div className="flex items-center gap-2 px-3 py-2 bg-ink-900 border-b border-ink-700 drag-region">
      {/* Back button */}
      <button
        onClick={() => navigate('/lobby')}
        className="no-drag btn-ghost text-xs px-2 py-1"
      >
        ← Lobby
      </button>

      <div className="w-px h-5 bg-ink-700 mx-1" />

      {/* Campaign name */}
      <span className="no-drag font-display text-sm text-parchment-300 tracking-wide truncate max-w-[180px]">
        {campaign?.name || 'Unnamed Campaign'}
      </span>

      {/* Status indicators */}
      <div className="flex items-center gap-2 ml-1">
        {isDmThinking && (
          <span className="text-xs text-gold-400 font-ui animate-pulse">DM thinking…</span>
        )}
        {isGeneratingImage && (
          <span className="text-xs text-arcane-400 font-ui animate-pulse">Generating image…</span>
        )}
        <button
          onClick={() => setTtsOpen(true)}
          className={clsx(
            'no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui transition-all',
            isSpeaking
              ? 'text-gold-300 bg-gold-500/10 border border-gold-500/30'
              : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
          )}
          title="Voice settings"
        >
          {isSpeaking
            ? <><span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />Speaking</>
            : <>◉ Voice</>
          }
        </button>
        <div className="no-drag">
          <ImageGenIndicator />
        </div>
      </div>

      {/* Memory indicator */}
      {isNearBudget && (
        <button
          onClick={summariseAndCompress}
          title={`Context ${Math.round(budgetUsed * 100)}% full — click to compress`}
          className="no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 transition-all"
        >
          ◈ {Math.round(budgetUsed * 100)}% full
        </button>
      )}

      {/* Combat indicator */}
      {combat && (
        <button
          onClick={() => setCombatOpen(true)}
          className="no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui
            border border-crimson-600/50 bg-crimson-600/15 text-crimson-300 hover:bg-crimson-600/25 transition-all animate-pulse-slow"
        >
          ⚔ Round {combat.round}
        </button>
      )}

      {/* Autopilot toggle */}
      <button
        onClick={onToggleAutoMode}
        className={clsx(
          'no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui transition-all',
          autoMode
            ? 'text-arcane-300 bg-arcane-500/15 border border-arcane-500/40 animate-pulse-slow'
            : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
        )}
        title={autoMode ? 'Autopilot on — click to stop' : 'Enable autopilot mode'}
      >
        {autoMode ? '⏵ Auto' : '⏵ Auto'}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Codex & history buttons */}
      <div className="no-drag flex gap-0.5 mr-2">
        <button onClick={() => setCodexOpen(true)}
          className="px-2 py-1 rounded text-xs font-ui text-parchment-500 hover:text-parchment-200 hover:bg-ink-800 transition-all"
          title="World codex">
          📖 Codex
        </button>
        <button onClick={() => setHistoryOpen(true)}
          className="px-2 py-1 rounded text-xs font-ui text-parchment-500 hover:text-parchment-200 hover:bg-ink-800 transition-all"
          title="Session history">
          📜 History
        </button>
      </div>

      {/* Panel tabs */}
      <div className="no-drag flex gap-0.5">
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => onPanelChange(p.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-ui transition-all',
              activePanel === p.id
                ? 'bg-ink-700 text-parchment-100 border border-ink-500'
                : 'text-parchment-400 hover:text-parchment-200 hover:bg-ink-800'
            )}
          >
            <span>{p.icon}</span>
            <span className="hidden sm:inline">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Settings shortcut */}
      <div className="w-px h-5 bg-ink-700 mx-1" />
      <button
        onClick={() => navigate('/settings')}
        className="no-drag btn-ghost text-xs px-2 py-1"
        title="Settings"
      >
        ⚙
      </button>
    </div>

    {/* Modals — rendered outside the toolbar div but inside the fragment */}
    {ttsOpen && <TtsControls onClose={() => setTtsOpen(false)} />}
    {combatOpen && combat && <CombatTracker onClose={() => setCombatOpen(false)} />}
    {codexOpen && <WorldCodex onClose={() => setCodexOpen(false)} />}
    {historyOpen && <SessionHistory campaignId={campaignId} onClose={() => setHistoryOpen(false)} />}
    </>
  )
}
