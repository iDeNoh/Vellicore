/**
 * EndScreen — full-screen overlay shown when the DM emits [GAME_OVER:].
 *
 * Displays outcome (victory / defeat / ambiguous), the DM's closing epilogue,
 * a few session stats, and options to return to the lobby or keep playing.
 */

import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useAppStore } from '@/store/appStore'
import { stopSpeaking } from '@/services/tts/ttsService'

// ── Outcome config ────────────────────────────────────────────────────────────

const OUTCOMES = {
  victory: {
    icon: '✦',
    title: 'VICTORY',
    subtitle: 'Your legend is written in stars.',
    titleColor: '#c8a84b',   // gold
    borderColor: 'rgba(200, 168, 75, 0.35)',
    glowColor: 'rgba(200, 168, 75, 0.08)',
  },
  defeat: {
    icon: '☽',
    title: 'FALLEN',
    subtitle: 'The story ends here, in silence.',
    titleColor: '#c0444a',   // crimson
    borderColor: 'rgba(192, 68, 74, 0.35)',
    glowColor: 'rgba(192, 68, 74, 0.08)',
  },
  ambiguous: {
    icon: '◈',
    title: 'THE END',
    subtitle: 'Not all tales have clean endings.',
    titleColor: '#9b8ec4',   // arcane violet
    borderColor: 'rgba(155, 142, 196, 0.35)',
    glowColor: 'rgba(155, 142, 196, 0.08)',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EndScreen({ gameOver, onContinue }) {
  const navigate = useNavigate()
  const { campaign, story, messages, characters, clearGameOver } = useGameStore()
  const { setActiveCampaign } = useAppStore()

  const cfg = OUTCOMES[gameOver?.outcome] || OUTCOMES.ambiguous

  // Stop any in-progress TTS when end screen appears
  useEffect(() => { stopSpeaking() }, [])

  // Session stats
  const turns           = messages.filter(m => m.role === 'user').length
  const questsDone      = story?.completedQuests?.length || 0
  const actsReached     = story?.currentAct || 1
  const characterNames  = Object.values(characters || {}).map(c => c.name).join(' & ')

  function handleReturnToLobby() {
    clearGameOver()
    setActiveCampaign(null)
    navigate('/lobby')
  }

  function handleContinue() {
    onContinue?.()
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: `radial-gradient(ellipse at center, ${cfg.glowColor} 0%, rgba(10,10,18,0.97) 70%)`,
        animation: 'fadeIn 0.8s ease-out',
      }}
    >
      {/* Outer vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)' }}
      />

      <div
        className="relative max-w-lg w-full rounded-xl p-10 text-center backdrop-blur-sm"
        style={{
          background: 'rgba(16, 14, 26, 0.92)',
          border: `1px solid ${cfg.borderColor}`,
          boxShadow: `0 0 60px ${cfg.glowColor}, 0 20px 60px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Outcome icon */}
        <div
          className="font-display text-6xl mb-5 select-none"
          style={{ color: cfg.titleColor, textShadow: `0 0 40px ${cfg.titleColor}` }}
        >
          {cfg.icon}
        </div>

        {/* Title + subtitle */}
        <h1
          className="font-display text-4xl tracking-widest mb-1"
          style={{ color: cfg.titleColor }}
        >
          {cfg.title}
        </h1>
        <p className="font-ui text-xs text-parchment-500 uppercase tracking-widest mb-8">
          {cfg.subtitle}
        </p>

        {/* Campaign name + characters */}
        <p className="font-display text-xl text-parchment-200 mb-1">
          {campaign?.name || 'Your Adventure'}
        </p>
        {characterNames && (
          <p className="font-body text-sm text-parchment-400 italic mb-6">
            Played as {characterNames}
          </p>
        )}

        {/* DM epilogue */}
        {gameOver?.epilogue && (
          <div
            className="my-6 py-6 px-2"
            style={{ borderTop: `1px solid ${cfg.borderColor}`, borderBottom: `1px solid ${cfg.borderColor}` }}
          >
            <p className="narrative text-parchment-200 text-base leading-relaxed italic">
              {gameOver.epilogue}
            </p>
          </div>
        )}

        {/* Stats row */}
        <div className="flex justify-center gap-10 my-6">
          <Stat value={turns} label="Turns" />
          <Stat value={questsDone} label="Quests" />
          <Stat value={`${actsReached}/5`} label="Acts" />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center mt-2">
          <button
            className="btn-ghost text-sm"
            onClick={handleContinue}
            title="Dismiss this screen and keep playing"
          >
            Continue Playing
          </button>
          <button
            className="btn-primary"
            onClick={handleReturnToLobby}
          >
            Return to Lobby
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <div className="font-display text-2xl text-parchment-100">{value}</div>
      <div className="font-ui text-xs text-parchment-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}
