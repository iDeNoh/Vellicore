/**
 * QuickStartFlow
 *
 * A full-screen flow that generates a complete campaign + character in one shot.
 * States: hint → generating → preview (portrait loading async) → saving
 */

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { campaigns as campaignDb, characters as characterDb } from '@/services/db/database'
import { generateQuickStart } from '@/services/character/quickStartService'
import { generatePortrait, buildPortraitTags, finaliseCharacter } from '@/services/character/characterService'
import { ATMOSPHERE_PRESETS, DANGER_LEVELS } from '@/lib/world/dmPrompts'
import { ANCESTRIES, BACKGROUNDS, ABILITIES } from '@/lib/rules/rules'
import clsx from 'clsx'

const PROGRESS_MESSAGES = [
  'Weaving the threads of fate…',
  'Shaping the world…',
  'Breathing life into your character…',
  'Consulting the ancient tomes…',
]

export default function QuickStartFlow({ onCancel }) {
  const navigate = useNavigate()
  const config = useAppStore(s => s.config)
  const setActiveCampaign = useAppStore(s => s.setActiveCampaign)

  const [phase, setPhase]       = useState('hint')   // hint | generating | preview | saving
  const [hint, setHint]         = useState('')
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)     // { campaign, character }
  const [portrait, setPortrait] = useState(null)     // { portraitBase64, tokenBase64 }
  const [portraitLoading, setPortraitLoading] = useState(false)
  const [progressMsg, setProgressMsg] = useState(PROGRESS_MESSAGES[0])
  const [saving, setSaving]     = useState(false)
  const progressTimer = useRef(null)

  // Cycle progress messages while generating
  useEffect(() => {
    if (phase !== 'generating') return
    let i = 0
    progressTimer.current = setInterval(() => {
      i = (i + 1) % PROGRESS_MESSAGES.length
      setProgressMsg(PROGRESS_MESSAGES[i])
    }, 2200)
    return () => clearInterval(progressTimer.current)
  }, [phase])

  async function generate() {
    setError(null)
    setPhase('generating')
    setProgressMsg(PROGRESS_MESSAGES[0])
    setPortrait(null)

    try {
      const data = await generateQuickStart({ config, hint: hint.trim() })
      setResult(data)
      setPhase('preview')

      // Generate portrait in background if image is enabled
      if (config?.image?.enabled) {
        setPortraitLoading(true)
        generatePortrait({
          portraitPrompt: data.character.portraitPrompt,
          ancestry: data.character.ancestry,
          background: data.character.background,
          config,
        }).then(p => {
          setPortrait(p)
          setPortraitLoading(false)
        }).catch(() => setPortraitLoading(false))
      }
    } catch (err) {
      setError(err.message)
      setPhase('hint')
    }
  }

  async function beginAdventure() {
    if (!result) return
    setSaving(true)
    setPhase('saving')

    try {
      const { campaign: campData, character: charData } = result

      // Save campaign
      const campaign = await campaignDb.create({
        name: campData.name,
        atmosphere: campData.atmosphere,
        tone: campData.tone,
        themes: campData.themes || [],
        dangerLevel: campData.dangerLevel || 'moderate',
        sessionCount: 0,
        createdAt: Date.now(),
      })

      // Finalise and save character
      const finalChar = finaliseCharacter({
        campaignId: campaign.id,
        name: charData.name,
        ancestry: charData.ancestry,
        background: charData.background,
        baseStats: charData.baseStats,
        chosenAbilities: charData.abilities || [],
        backstory: charData.backstory || '',
        personalityNote: charData.personalityNote || '',
        hook: charData.hook || '',
        portraitBase64: portrait?.portraitBase64 || null,
        tokenBase64: portrait?.tokenBase64 || null,
        portraitPrompt: charData.portraitPrompt || '',
        notes: '',
      })
      await characterDb.create(finalChar)

      setActiveCampaign(campaign.id)
      navigate(`/game/${campaign.id}`)
    } catch (err) {
      setError(err.message)
      setPhase('preview')
      setSaving(false)
    }
  }

  // ── Hint screen ──────────────────────────────────────────────────────────────

  if (phase === 'hint') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
        <div className="w-full max-w-lg">
          <div className="text-5xl text-center mb-5">✦</div>
          <h2 className="font-display text-3xl text-parchment-100 text-center mb-2 tracking-wide">
            Generate Everything
          </h2>
          <p className="font-body text-parchment-400 text-center text-sm mb-8">
            The AI will create a complete campaign world and a character made to inhabit it.
            Optionally drop a hint, or leave it blank for a full surprise.
          </p>

          <div className="space-y-4">
            <div>
              <label className="label">Hint <span className="text-parchment-500 text-xs font-body normal-case">(optional)</span></label>
              <input
                className="input text-base"
                placeholder="e.g. a wandering knight haunted by betrayal, a nautical adventure, dark political intrigue…"
                value={hint}
                onChange={e => setHint(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generate()}
                autoFocus
              />
              <p className="text-xs text-parchment-500 font-body mt-1.5">
                Any theme, character archetype, or tone you have in mind.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded border border-crimson-600/50 bg-crimson-600/10 text-crimson-300 text-sm font-ui">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button className="btn-ghost flex-none" onClick={onCancel}>Cancel</button>
              <button className="btn-primary flex-1 text-base py-2.5" onClick={generate}>
                ✦ Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Generating screen ────────────────────────────────────────────────────────

  if (phase === 'generating') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-6 animate-pulse">✦</div>
          <p className="font-display text-xl text-parchment-100 mb-3 tracking-wide">
            {progressMsg}
          </p>
          <p className="font-body text-xs text-parchment-500">
            This may take a moment depending on your LLM…
          </p>
        </div>
      </div>
    )
  }

  // ── Saving screen ────────────────────────────────────────────────────────────

  if (phase === 'saving') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-6 animate-pulse">⚔</div>
          <p className="font-display text-xl text-parchment-100 tracking-wide">
            Preparing your adventure…
          </p>
        </div>
      </div>
    )
  }

  // ── Preview screen ───────────────────────────────────────────────────────────

  if (phase === 'preview' && result) {
    const { campaign: campData, character: charData } = result
    const preset = ATMOSPHERE_PRESETS[campData.atmosphere] || ATMOSPHERE_PRESETS.classic_fantasy
    const ancestryInfo = ANCESTRIES[charData.ancestry] || {}
    const backgroundInfo = BACKGROUNDS[charData.background] || {}
    const statsTotal = (charData.baseStats.body + charData.baseStats.mind + charData.baseStats.spirit)
    const promptTags = buildPortraitTags(charData.portraitPrompt, charData.ancestry, charData.background)

    return (
      <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-parchment-100 tracking-wide">Your Adventure</h2>
            <div className="flex gap-2">
              <button className="btn-ghost text-sm" onClick={() => { setResult(null); setPhase('hint') }}>
                ← Regenerate
              </button>
              <button
                className="btn-primary text-sm px-5"
                onClick={beginAdventure}
                disabled={saving}
              >
                {saving ? 'Saving…' : '▶ Begin Adventure'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded border border-crimson-600/50 bg-crimson-600/10 text-crimson-300 text-sm font-ui">
              {error}
            </div>
          )}

          {/* Campaign card */}
          <div className="panel p-5">
            <p className="label mb-2">Campaign</p>
            <div className="flex items-start gap-4">
              <span className="text-4xl shrink-0 mt-0.5">{preset.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-xl text-parchment-100">{campData.name}</h3>
                <p className="font-body text-sm text-gold-400 italic mt-0.5">{campData.tone}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui capitalize">
                    {preset.label}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-300 font-ui capitalize">
                    {DANGER_LEVELS[campData.dangerLevel]?.label || campData.dangerLevel}
                  </span>
                  {(campData.themes || []).map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-ink-700 border border-ink-600 text-parchment-400 font-body">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Character card */}
          <div className="panel p-5">
            <p className="label mb-3">Character</p>
            <div className="flex gap-4">

              {/* Portrait column */}
              <div className="shrink-0">
                {portraitLoading ? (
                  <div className="w-24 h-32 rounded border border-ink-600 bg-ink-800 flex items-center justify-center">
                    <span className="text-xs text-parchment-500 font-ui animate-pulse">Painting…</span>
                  </div>
                ) : portrait?.portraitBase64 ? (
                  <img
                    src={`data:image/png;base64,${portrait.portraitBase64}`}
                    alt={charData.name}
                    className="w-24 h-32 rounded border border-ink-600 object-cover"
                  />
                ) : (
                  <div className="w-24 h-32 rounded border border-ink-700 bg-ink-800 flex items-center justify-center">
                    <span className="text-3xl">{charData.name?.[0] || '?'}</span>
                  </div>
                )}
              </div>

              {/* Info column */}
              <div className="flex-1 min-w-0 space-y-2.5">
                <div>
                  <h3 className="font-display text-xl text-parchment-100">{charData.name}</h3>
                  <p className="font-body text-sm text-parchment-400 capitalize mt-0.5">
                    {ancestryInfo.label || charData.ancestry} {backgroundInfo.label || charData.background}
                    {charData.pronouns && ` · ${charData.pronouns}`}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex gap-3">
                  {['body', 'mind', 'spirit'].map(stat => (
                    <div key={stat} className="text-center">
                      <div className="font-display text-xl text-parchment-100">{charData.baseStats[stat]}</div>
                      <div className="font-ui text-xs text-parchment-500 capitalize">{stat}</div>
                    </div>
                  ))}
                </div>

                {/* Abilities */}
                {charData.abilities?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {charData.abilities.map(key => (
                      <span key={key} className="text-xs px-2 py-0.5 rounded bg-gold-500/15 border border-gold-500/30 text-gold-300 font-ui">
                        {ABILITIES[key]?.label || key}
                      </span>
                    ))}
                  </div>
                )}

                {/* Hook */}
                {charData.hook && (
                  <p className="font-body text-xs text-parchment-400 italic">"{charData.hook}"</p>
                )}
              </div>
            </div>

            {/* Backstory */}
            {charData.backstory && (
              <div className="mt-4 pt-4 border-t border-ink-700">
                <p className="label mb-1.5">Backstory</p>
                <div className="font-body text-sm text-parchment-300 leading-relaxed space-y-2">
                  {charData.backstory.split(/\n\n+/).map((para, i) => (
                    <p key={i}>{para.trim()}</p>
                  ))}
                </div>
                {charData.personalityNote && (
                  <p className="font-body text-xs text-parchment-400 italic mt-2">{charData.personalityNote}</p>
                )}
              </div>
            )}

            {/* Portrait prompt (shown if image disabled) */}
            {!config?.image?.enabled && charData.portraitPrompt && (
              <div className="mt-3 pt-3 border-t border-ink-700">
                <p className="label mb-1">Portrait prompt</p>
                <p className="font-body text-xs text-parchment-400">{promptTags}</p>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex gap-3 pb-4">
            <button className="btn-ghost flex-none" onClick={() => { setResult(null); setPhase('hint') }}>
              ← Regenerate
            </button>
            <button
              className="btn-primary flex-1 text-base py-2.5"
              onClick={beginAdventure}
              disabled={saving}
            >
              {saving ? 'Saving…' : '▶ Begin Adventure'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
