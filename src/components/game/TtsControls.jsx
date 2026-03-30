import React, { useState, useCallback } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import { useTts } from '@/hooks/useTts'
import {
  KOKORO_VOICES, getNpcVoice, setNpcVoice,
  getChatterboxVoices, getNpcVoiceChatterbox, chatterboxVoiceLabel, stopSpeaking,
  getPlayerVoice,
} from '@/services/tts/ttsService'
import clsx from 'clsx'

/**
 * TTS control panel — accessible from the GameToolbar.
 * Provides volume, speed, DM voice, and per-NPC voice assignment.
 * Supports both Kokoro and Chatterbox providers.
 */
export default function TtsControls({ onClose }) {
  const { config, saveConfig } = useAppStore()
  const isSpeaking = useGameStore(s => s.isSpeaking)
  const world = useGameStore(s => s.world)

  const provider = config?.tts?.provider || 'kokoro'
  const isChatterbox = provider === 'chatterbox'

  const [saved, setSaved] = useState(false)

  const npcs = Object.values(world.npcs || {})
  const chatterboxVoices = getChatterboxVoices()

  const [local, setLocal] = useState({
    speed:        config?.tts?.speed || 1.0,
    dmVoice:      isChatterbox
                    ? (config?.tts?.chatterboxDmVoice || '')
                    : (config?.tts?.dmVoice || 'bm_george'),
    playerVoice:  isChatterbox
                    ? (config?.tts?.chatterboxPlayerVoice || '')
                    : (config?.tts?.playerVoice || ''),
    autoTts:      config?.app?.autoTts ?? true,
  })

  function update(key, val) {
    setLocal(l => ({ ...l, [key]: val }))
  }

  async function save() {
    const ttsPatch = isChatterbox
      ? { speed: local.speed, chatterboxDmVoice: local.dmVoice, chatterboxPlayerVoice: local.playerVoice }
      : { speed: local.speed, dmVoice: local.dmVoice, playerVoice: local.playerVoice }
    await saveConfig({
      tts: { ...config.tts, ...ttsPatch },
      app: { ...config.app, autoTts: local.autoTts },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/80 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-full max-w-md max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <div className="flex items-center gap-2">
            <span className="text-gold-400">◉</span>
            <h3 className="font-display text-base text-parchment-100">Voice & Audio</h3>
            <span className="text-xs font-ui text-parchment-500 ml-1">
              {isChatterbox ? 'Chatterbox' : 'Kokoro'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isSpeaking && (
              <button onClick={stopSpeaking}
                className="btn-secondary text-xs px-2 py-1 text-crimson-300">
                ■ Stop
              </button>
            )}
            <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Auto-narrate toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="font-ui text-sm text-parchment-200">Auto-narrate</p>
              <p className="font-body text-xs text-parchment-400">Speak DM responses automatically</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer"
                checked={local.autoTts}
                onChange={e => update('autoTts', e.target.checked)} />
              <div className="w-9 h-5 bg-ink-600 peer-focus:ring-1 peer-focus:ring-gold-500 rounded-full peer peer-checked:bg-gold-500 transition-colors" />
              <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4" />
            </label>
          </div>

          <div className="divider" />

          {/* Speed */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="label m-0">Narration speed</label>
              <span className="text-xs text-parchment-300 font-ui">{local.speed.toFixed(1)}×</span>
            </div>
            <input type="range" min="0.6" max="1.6" step="0.1"
              value={local.speed}
              onChange={e => update('speed', parseFloat(e.target.value))}
              className="w-full accent-gold-500" />
            <div className="flex justify-between text-xs text-parchment-500 font-ui mt-1">
              <span>0.6× slow</span>
              <span>1.0× normal</span>
              <span>1.6× fast</span>
            </div>
          </div>

          {/* DM Voice */}
          <div>
            <label className="label">DM narrator voice</label>
            {isChatterbox ? (
              <ChatterboxVoicePicker
                voices={chatterboxVoices}
                selected={local.dmVoice}
                onSelect={v => update('dmVoice', v)}
              />
            ) : (
              <VoiceGrid
                selected={local.dmVoice}
                onSelect={v => update('dmVoice', v)}
              />
            )}
          </div>

          {/* Player character voice */}
          <div>
            <label className="label">Player character voice</label>
            <p className="font-body text-xs text-parchment-400 mb-2">
              Used when auto-narrate speaks your actions. Leave unset to auto-pick based on your character.
            </p>
            {isChatterbox ? (
              <ChatterboxVoicePicker
                voices={chatterboxVoices}
                selected={local.playerVoice}
                onSelect={v => update('playerVoice', v)}
                allowAuto
              />
            ) : (
              <PlayerVoiceGrid
                selected={local.playerVoice}
                onSelect={v => update('playerVoice', v)}
                dmVoice={local.dmVoice}
              />
            )}
          </div>

          {/* NPC voice assignments */}
          {npcs.length > 0 && (
            <div>
              <label className="label">NPC voices</label>
              <div className="space-y-2">
                {npcs.slice(0, 8).map(npc => (
                  isChatterbox ? (
                    <NpcVoiceRowChatterbox
                      key={npc.id}
                      npc={npc}
                      dmVoice={local.dmVoice}
                      voices={chatterboxVoices}
                    />
                  ) : (
                    <NpcVoiceRow
                      key={npc.id}
                      npc={npc}
                      dmVoice={local.dmVoice}
                    />
                  )
                ))}
                {npcs.length > 8 && (
                  <p className="text-xs text-parchment-500 font-ui text-center py-1">
                    +{npcs.length - 8} more NPCs auto-assigned
                  </p>
                )}
              </div>
            </div>
          )}

          {npcs.length === 0 && (
            <div className="text-center py-4">
              <p className="font-body text-xs text-parchment-500">
                NPC voices will appear here as characters are introduced in the story.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} className="btn-primary text-sm">
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Player voice grid (Kokoro) — same as VoiceGrid but with an Auto option ─────

function PlayerVoiceGrid({ selected, onSelect, dmVoice }) {
  const groups = {
    'British':  Object.entries(KOKORO_VOICES).filter(([, v]) => v.accent === 'british'),
    'American': Object.entries(KOKORO_VOICES).filter(([, v]) => v.accent === 'american'),
  }

  return (
    <div className="space-y-2">
      {/* Auto option */}
      <button onClick={() => onSelect('')}
        className={clsx('w-full text-left px-3 py-2 rounded border text-xs transition-all',
          !selected
            ? 'border-gold-500/60 bg-ink-700 shadow-glow-gold'
            : 'border-ink-600 bg-ink-800 hover:border-ink-500'
        )}>
        <span className={clsx('font-ui font-medium', !selected ? 'text-gold-300' : 'text-parchment-200')}>
          Auto
        </span>
        <p className="font-body text-parchment-400 mt-0.5 text-xs">
          Pick based on character gender, distinct from DM voice
        </p>
      </button>
      {Object.entries(groups).map(([accent, voices]) => (
        <div key={accent}>
          <p className="text-xs text-parchment-500 font-ui mb-1">{accent}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {voices.map(([id, voice]) => (
              <button key={id} onClick={() => onSelect(id)}
                className={clsx('text-left px-3 py-2 rounded border text-xs transition-all',
                  selected === id
                    ? 'border-gold-500/60 bg-ink-700 shadow-glow-gold'
                    : 'border-ink-600 bg-ink-800 hover:border-ink-500',
                  id === dmVoice && 'opacity-40'
                )}
                title={id === dmVoice ? 'Same as DM voice' : undefined}>
                <span className={clsx('font-ui font-medium', selected === id ? 'text-gold-300' : 'text-parchment-200')}>
                  {voice.label}
                </span>
                <span className="ml-1 text-parchment-500">
                  {voice.gender === 'f' ? '♀' : '♂'}
                </span>
                <p className="font-body text-parchment-400 mt-0.5 text-xs">{voice.description}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Kokoro voice grid ──────────────────────────────────────────────────────────

function VoiceGrid({ selected, onSelect }) {
  const groups = {
    'British':  Object.entries(KOKORO_VOICES).filter(([, v]) => v.accent === 'british'),
    'American': Object.entries(KOKORO_VOICES).filter(([, v]) => v.accent === 'american'),
  }

  return (
    <div className="space-y-2">
      {Object.entries(groups).map(([accent, voices]) => (
        <div key={accent}>
          <p className="text-xs text-parchment-500 font-ui mb-1">{accent}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {voices.map(([id, voice]) => (
              <button key={id} onClick={() => onSelect(id)}
                className={clsx('text-left px-3 py-2 rounded border text-xs transition-all',
                  selected === id
                    ? 'border-gold-500/60 bg-ink-700 shadow-glow-gold'
                    : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                )}>
                <span className={clsx('font-ui font-medium', selected === id ? 'text-gold-300' : 'text-parchment-200')}>
                  {voice.label}
                </span>
                <span className="ml-1 text-parchment-500">
                  {voice.gender === 'f' ? '♀' : '♂'}
                </span>
                <p className="font-body text-parchment-400 mt-0.5 text-xs">{voice.description}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Chatterbox voice picker ────────────────────────────────────────────────────

function ChatterboxVoicePicker({ voices, selected, onSelect, allowAuto = false }) {
  if (!voices.length) {
    return (
      <p className="text-xs text-parchment-500 font-body py-2">
        No voices loaded — test the connection in Settings to populate the list.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {allowAuto && (
        <button onClick={() => onSelect('')}
          className={clsx('text-left px-3 py-2 rounded border text-xs transition-all col-span-2',
            !selected
              ? 'border-gold-500/60 bg-ink-700 shadow-glow-gold'
              : 'border-ink-600 bg-ink-800 hover:border-ink-500'
          )}>
          <span className={clsx('font-ui font-medium', !selected ? 'text-gold-300' : 'text-parchment-200')}>
            Auto — pick based on character gender
          </span>
        </button>
      )}
      {voices.map(v => {
        const id    = typeof v === 'string' ? v : (v.filename || v.display_name || '')
        const label = chatterboxVoiceLabel(v)
        return (
          <button key={id} onClick={() => onSelect(id)}
            className={clsx('text-left px-3 py-2 rounded border text-xs transition-all',
              selected === id
                ? 'border-gold-500/60 bg-ink-700 shadow-glow-gold'
                : 'border-ink-600 bg-ink-800 hover:border-ink-500'
            )}>
            <span className={clsx('font-ui font-medium', selected === id ? 'text-gold-300' : 'text-parchment-200')}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Kokoro NPC voice row ───────────────────────────────────────────────────────

function NpcVoiceRow({ npc, dmVoice }) {
  const currentVoice = getNpcVoice(npc, dmVoice)
  const [selected, setSelected] = useState(currentVoice)

  function change(voiceId) {
    setSelected(voiceId)
    setNpcVoice(npc.id, voiceId)
  }

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-ink-700 last:border-0">
      <div className="w-8 h-8 rounded-full border border-ink-600 bg-ink-700 overflow-hidden shrink-0 flex items-center justify-center text-xs font-ui">
        {npc.tokenBase64
          ? <img src={`data:image/png;base64,${npc.tokenBase64}`} className="w-full h-full object-cover" alt="" />
          : npc.name?.[0]
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-ui text-xs text-parchment-200 truncate">{npc.name}</p>
        <p className="font-body text-xs text-parchment-500 capitalize truncate">{npc.role || npc.disposition}</p>
      </div>
      <select value={selected} onChange={e => change(e.target.value)}
        className="input text-xs py-1 w-32 shrink-0">
        {Object.entries(KOKORO_VOICES).map(([id, v]) => (
          <option key={id} value={id}>{v.label} {v.gender === 'f' ? '♀' : '♂'}</option>
        ))}
      </select>
    </div>
  )
}

// ── Chatterbox NPC voice row ───────────────────────────────────────────────────

function NpcVoiceRowChatterbox({ npc, dmVoice, voices }) {
  const currentVoice = getNpcVoiceChatterbox(npc, dmVoice, voices)
  const [selected, setSelected] = useState(currentVoice || (voices[0] ?? ''))

  function change(voiceId) {
    setSelected(voiceId)
    setNpcVoice(npc.id, voiceId)
  }

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-ink-700 last:border-0">
      <div className="w-8 h-8 rounded-full border border-ink-600 bg-ink-700 overflow-hidden shrink-0 flex items-center justify-center text-xs font-ui">
        {npc.tokenBase64
          ? <img src={`data:image/png;base64,${npc.tokenBase64}`} className="w-full h-full object-cover" alt="" />
          : npc.name?.[0]
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-ui text-xs text-parchment-200 truncate">{npc.name}</p>
        <p className="font-body text-xs text-parchment-500 capitalize truncate">{npc.role || npc.disposition}</p>
      </div>
      <select value={selected} onChange={e => change(e.target.value)}
        className="input text-xs py-1 w-32 shrink-0"
        disabled={!voices.length}>
        {voices.map(v => {
          const id    = typeof v === 'string' ? v : (v.filename || v.display_name || '')
          const label = chatterboxVoiceLabel(v)
          return <option key={id} value={id}>{label}</option>
        })}
      </select>
    </div>
  )
}
