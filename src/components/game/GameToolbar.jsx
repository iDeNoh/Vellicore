import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useAppStore } from '@/store/appStore'
import { stopSpeaking } from '@/services/tts/ttsService'
import { useSessionMemory } from '@/hooks/useSessionMemory'
import { useIsMobile } from '@/hooks/useIsMobile'
import ImageGenIndicator from '@/components/game/ImageGenIndicator'
import TtsControls from '@/components/game/TtsControls'
import CombatTracker from '@/components/game/CombatTracker'
import WorldCodex from '@/components/game/WorldCodex'
import SessionHistory from '@/components/game/SessionHistory'
import clsx from 'clsx'

export const PANELS = [
  { id: 'chat',      label: 'Narrative', icon: '📜' },
  { id: 'map',       label: 'Map',       icon: '🗺' },
  { id: 'world',     label: 'World',     icon: '⚔' },
  { id: 'character', label: 'Character', icon: '◈' },
  { id: 'story',     label: 'Story',     icon: '🔮' },
  { id: 'narration', label: 'Narration', icon: '⚡' },
]

export default function GameToolbar({ activePanel, onPanelChange, autoMode, onToggleAutoMode }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [ttsOpen,     setTtsOpen]     = useState(false)
  const [combatOpen,  setCombatOpen]  = useState(false)
  const [codexOpen,   setCodexOpen]   = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)

  const campaign    = useGameStore(s => s.campaign)
  const combat      = useGameStore(s => s.combat)
  const campaignId  = campaign?.id
  const { isNearBudget, budgetUsed, summariseAndCompress } = useSessionMemory(campaignId)
  const isDmThinking      = useGameStore(s => s.isDmThinking)
  const isSpeaking        = useGameStore(s => s.isSpeaking)
  const isGeneratingImage = useGameStore(s => s.isGeneratingImage)
  const config = useAppStore(s => s.config)

  function closeMenu() { setMenuOpen(false) }

  // ── Desktop toolbar ─────────────────────────────────────────────────────────
  const desktopBar = (
    <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-ink-900 border-b border-ink-700 drag-region">
      <button onClick={() => navigate('/lobby')} className="no-drag btn-ghost text-xs px-2 py-1">
        ← Lobby
      </button>
      <div className="w-px h-5 bg-ink-700 mx-1" />
      <span className="no-drag font-display text-sm text-parchment-300 tracking-wide truncate max-w-[180px]">
        {campaign?.name || 'Unnamed Campaign'}
      </span>

      <div className="flex items-center gap-2 ml-1">
        {isDmThinking && <span className="text-xs text-gold-400 font-ui animate-pulse">DM thinking…</span>}
        {isGeneratingImage && <span className="text-xs text-arcane-400 font-ui animate-pulse">Generating image…</span>}
        <button onClick={() => setTtsOpen(true)}
          className={clsx('no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui transition-all',
            isSpeaking ? 'text-gold-300 bg-gold-500/10 border border-gold-500/30'
                       : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
          )} title="Voice settings">
          {isSpeaking ? <><span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />Speaking</> : <>◉ Voice</>}
        </button>
        <div className="no-drag"><ImageGenIndicator /></div>
      </div>

      {isNearBudget && (
        <button onClick={summariseAndCompress}
          title={`Context ${Math.round(budgetUsed * 100)}% full — click to compress`}
          className="no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 transition-all">
          ◈ {Math.round(budgetUsed * 100)}% full
        </button>
      )}

      {combat && (
        <button onClick={() => setCombatOpen(true)}
          className="no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui border border-crimson-600/50 bg-crimson-600/15 text-crimson-300 hover:bg-crimson-600/25 transition-all animate-pulse-slow">
          ⚔ Round {combat.round}
        </button>
      )}

      <button onClick={onToggleAutoMode}
        className={clsx('no-drag flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui transition-all',
          autoMode ? 'text-arcane-300 bg-arcane-500/15 border border-arcane-500/40 animate-pulse-slow'
                   : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
        )} title={autoMode ? 'Autopilot on — click to stop' : 'Enable autopilot mode'}>
        ⏵ Auto
      </button>

      <div className="flex-1" />

      <div className="no-drag flex gap-0.5 mr-2">
        <button onClick={() => setCodexOpen(true)}
          className="px-2 py-1 rounded text-xs font-ui text-parchment-500 hover:text-parchment-200 hover:bg-ink-800 transition-all"
          title="World codex">📖 Codex</button>
        <button onClick={() => setHistoryOpen(true)}
          className="px-2 py-1 rounded text-xs font-ui text-parchment-500 hover:text-parchment-200 hover:bg-ink-800 transition-all"
          title="Session history">📜 History</button>
      </div>

      <div className="no-drag flex gap-0.5">
        {PANELS.map(p => (
          <button key={p.id} onClick={() => onPanelChange(p.id)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-ui transition-all',
              activePanel === p.id
                ? 'bg-ink-700 text-parchment-100 border border-ink-500'
                : 'text-parchment-400 hover:text-parchment-200 hover:bg-ink-800'
            )}>
            <span>{p.icon}</span>
            <span className="hidden sm:inline">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-ink-700 mx-1" />
      <button onClick={() => navigate('/settings')} className="no-drag btn-ghost text-xs px-2 py-1" title="Settings">⚙</button>
    </div>
  )

  // ── Mobile top bar ──────────────────────────────────────────────────────────
  const mobileBar = (
    <div className="md:hidden relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-ink-900 border-b border-ink-700">
        <button onClick={() => navigate('/lobby')} className="btn-ghost text-sm px-2 py-1 shrink-0">←</button>

        <span className="font-display text-sm text-parchment-300 tracking-wide truncate flex-1">
          {campaign?.name || 'Unnamed Campaign'}
        </span>

        {/* Compact status dots */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isDmThinking      && <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" title="DM thinking" />}
          {isSpeaking        && <span className="w-2 h-2 rounded-full bg-arcane-400 animate-pulse" title="Speaking" />}
          {isGeneratingImage && <span className="w-2 h-2 rounded-full bg-arcane-400 animate-pulse" title="Generating image" />}
          {combat && (
            <button onClick={() => setCombatOpen(true)}
              className="text-xs text-crimson-300 font-ui border border-crimson-600/40 rounded px-1.5 py-0.5 animate-pulse-slow">
              ⚔{combat.round}
            </button>
          )}
          {isNearBudget && (
            <button onClick={summariseAndCompress}
              className="text-xs text-gold-300 font-ui border border-gold-500/30 rounded px-1.5 py-0.5">
              {Math.round(budgetUsed * 100)}%
            </button>
          )}
        </div>

        <button
          onClick={() => setMenuOpen(v => !v)}
          className={clsx('shrink-0 px-2.5 py-1.5 rounded text-sm font-ui transition-all',
            menuOpen ? 'bg-ink-700 text-parchment-100' : 'text-parchment-400 hover:bg-ink-800'
          )}>
          ☰
        </button>
      </div>

      {/* Slide-down menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 z-50 bg-ink-900 border-b border-ink-700 shadow-xl p-3 grid grid-cols-3 gap-2">
          <MenuButton icon="◉" label="Voice"   onClick={() => { setTtsOpen(true);     closeMenu() }} />
          <MenuButton icon="📖" label="Codex"   onClick={() => { setCodexOpen(true);   closeMenu() }} />
          <MenuButton icon="📜" label="History" onClick={() => { setHistoryOpen(true); closeMenu() }} />
          <MenuButton icon="⏵" label="Auto"
            active={autoMode}
            onClick={() => { onToggleAutoMode(); closeMenu() }} />
          <MenuButton icon="⚙" label="Settings"
            onClick={() => { navigate('/settings'); closeMenu() }} />
        </div>
      )}
    </div>
  )

  return (
    <>
      {isMobile ? mobileBar : desktopBar}

      {ttsOpen     && <TtsControls onClose={() => setTtsOpen(false)} />}
      {combatOpen  && combat && <CombatTracker onClose={() => setCombatOpen(false)} />}
      {codexOpen   && <WorldCodex onClose={() => setCodexOpen(false)} />}
      {historyOpen && <SessionHistory campaignId={campaignId} onClose={() => setHistoryOpen(false)} />}
    </>
  )
}

function MenuButton({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick}
      className={clsx(
        'flex flex-col items-center gap-1 p-2 rounded border text-xs font-ui transition-all',
        active
          ? 'border-arcane-500/40 bg-arcane-500/15 text-arcane-300'
          : 'border-ink-600 bg-ink-800 text-parchment-400 hover:text-parchment-200 hover:border-ink-500'
      )}>
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
