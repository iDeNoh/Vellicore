import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { characters as characterDb } from '@/services/db/database'
import {
  generateBackstory,
  generateBackstoryOptions,
  generateNames,
  generatePortrait,
  buildPortraitTags,
  finaliseCharacter,
} from '@/services/character/characterService'
import {
  ANCESTRIES, ANCESTRY_GROUPS, BACKGROUNDS, ABILITIES, STAT_INFO, CHARACTER_TRAITS,
  CREATION_BONUS_POINTS, CREATION_POINT_CAP, calcMaxHp,
} from '@/lib/rules/rules'
import clsx from 'clsx'

const STEPS = ['identity', 'ancestry', 'background', 'stats', 'abilities', 'traits', 'backstory', 'portrait', 'review']
const STEP_LABELS = {
  identity: 'Identity', ancestry: 'Ancestry', background: 'Background',
  stats: 'Stats', abilities: 'Abilities', traits: 'Traits',
  backstory: 'Backstory', portrait: 'Portrait', review: 'Review',
}
const BASE_ABILITY_PICKS = 2

export default function CharacterCreatePage() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const config = useAppStore(s => s.config)
  const setActiveCampaign = useAppStore(s => s.setActiveCampaign)

  const [step, setStep] = useState('identity')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [char, setChar] = useState({
    name: '', pronouns: '', ancestry: '', background: '',
    baseStats: { body: 2, mind: 2, spirit: 2 },
    chosenAbilities: [], traits: { personality: [], flaw: '', motivation: '', bond: '', secret: '' },
    backstory: '', personalityNote: '', hook: '',
    portraitPrompt: '', portraitBase64: null, tokenBase64: null,
    notes: '',
  })

  const update = useCallback((key, value) => setChar(c => ({ ...c, [key]: value })), [])

  const stepIndex = STEPS.indexOf(step)
  const isLastStep = step === 'review'

  function remaining() {
    const base = { body: 2, mind: 2, spirit: 2 }
    return CREATION_BONUS_POINTS - Object.entries(char.baseStats)
      .reduce((s, [k, v]) => s + (v - (base[k] || 2)), 0)
  }

  function requiredAbilities() {
    return char.ancestry === 'human' ? BASE_ABILITY_PICKS + 1 : BASE_ABILITY_PICKS
  }

  const canProceed = {
    identity:   char.name.trim().length >= 2,
    ancestry:   !!char.ancestry,
    background: !!char.background,
    stats:      remaining() === 0,
    abilities:  char.chosenAbilities.length >= requiredAbilities(),
    traits:     true,
    backstory:  true,
    portrait:   true,
    review:     true,
  }[step]

  async function saveCharacter() {
    setSaving(true); setSaveError(null)
    try {
      const finalChar = finaliseCharacter({
        campaignId, name: char.name, pronouns: char.pronouns,
        ancestry: char.ancestry, background: char.background,
        baseStats: char.baseStats, chosenAbilities: char.chosenAbilities,
        traits: char.traits,
        backstory: char.backstory, personalityNote: char.personalityNote,
        hook: char.hook, portraitBase64: char.portraitBase64,
        tokenBase64: char.tokenBase64, portraitPrompt: char.portraitPrompt,
        notes: char.notes,
      })
      await characterDb.create(finalChar)
      setActiveCampaign(campaignId)
      navigate(`/game/${campaignId}`)
    } catch (err) {
      setSaveError(err.message); setSaving(false)
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-ink-700 drag-region">
        <button onClick={() => navigate('/lobby')} className="no-drag btn-ghost text-sm px-2">
          ← Back
        </button>
        <div className="no-drag">
          <h1 className="font-display text-base text-parchment-100">
            {char.name || 'New Character'}
          </h1>
          <p className="font-body text-xs text-parchment-500">
            {[ANCESTRIES[char.ancestry]?.label, BACKGROUNDS[char.background]?.label].filter(Boolean).join(' · ') || 'Character creation'}
          </p>
        </div>
        <div className="no-drag ml-auto flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => i < stepIndex && setStep(s)}
              disabled={i >= stepIndex}
              title={STEP_LABELS[s]}
              className={clsx('transition-all rounded-full',
                i === stepIndex ? 'w-6 h-2 bg-gold-400' :
                i < stepIndex ? 'w-2 h-2 bg-parchment-500 hover:bg-parchment-300 cursor-pointer' :
                'w-2 h-2 bg-ink-600 cursor-default'
              )}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto animate-fade-in" key={step}>
          {step === 'identity'   && <IdentityStep char={char} update={update} config={config} />}
          {step === 'ancestry'   && <AncestryStep char={char} update={update} />}
          {step === 'background' && <BackgroundStep char={char} update={update} />}
          {step === 'stats'      && <StatsStep char={char} update={update} remaining={remaining} />}
          {step === 'abilities'  && <AbilitiesStep char={char} update={update} required={requiredAbilities()} />}
          {step === 'traits'     && <TraitsStep char={char} update={update} />}
          {step === 'backstory'  && <BackstoryStep char={char} update={update} config={config} />}
          {step === 'portrait'   && <PortraitStep char={char} update={update} config={config} />}
          {step === 'review'     && <ReviewStep char={char} />}

          {saveError && (
            <div className="mt-4 p-3 rounded border border-crimson-600/50 bg-crimson-600/10 text-crimson-300 text-sm font-ui">
              {saveError}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-ink-700 px-6 py-3 flex justify-between items-center bg-ink-900">
        <button className="btn-ghost" onClick={() => setStep(STEPS[stepIndex - 1])} disabled={stepIndex === 0}>
          ← Back
        </button>
        <span className="text-xs text-parchment-500 font-ui">{STEP_LABELS[step]}</span>
        {isLastStep ? (
          <button className="btn-primary" onClick={saveCharacter} disabled={saving}>
            {saving ? 'Saving…' : 'Begin Adventure →'}
          </button>
        ) : (
          <button className="btn-primary" onClick={() => setStep(STEPS[stepIndex + 1])} disabled={!canProceed}>
            Next →
          </button>
        )}
      </div>
    </div>
  )
}

const PRONOUN_PRESETS = ['she/her','he/him','they/them','she/they','he/they','fae/faer','xe/xem','any']

// ── Step: Identity ─────────────────────────────────────────────────────────────

function IdentityStep({ char, update, config }) {
  const isCustomPronoun = char.pronouns && !PRONOUN_PRESETS.includes(char.pronouns)
  const [showCustom, setShowCustom] = useState(isCustomPronoun)
  const [nameSuggestions, setNameSuggestions] = useState([])
  const [generatingNames, setGeneratingNames] = useState(false)
  const [nameError, setNameError] = useState(null)

  function handlePronounClick(p) {
    if (char.pronouns === p) { update('pronouns', ''); return }
    update('pronouns', p)
    setShowCustom(false)
  }

  function handleCustomToggle() {
    setShowCustom(v => !v)
    if (!showCustom) update('pronouns', '')
  }

  async function suggestNames() {
    setGeneratingNames(true)
    setNameError(null)
    try {
      const names = await generateNames({
        ancestry: char.ancestry || null,
        background: char.background || null,
        traits: char.traits || null,
        config,
      })
      setNameSuggestions(names)
    } catch (err) {
      setNameError('Could not generate names — check your LLM connection.')
    } finally {
      setGeneratingNames(false)
    }
  }

  return (
    <div className="space-y-5">
      <Header title="Who are you?" sub="Give your character a name and identity." />

      <div className="bg-ink-800 border border-ink-700 rounded-lg p-3 text-xs text-parchment-400 leading-relaxed">
        Your name and pronouns are used by the DM throughout the story. Traits help shape
        the AI-generated backstory. Everything here is yours to define — there are no wrong answers.
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Name</label>
          <button onClick={suggestNames} disabled={generatingNames}
            className="text-xs text-arcane-400 hover:text-arcane-300 font-ui disabled:opacity-50 transition-colors">
            {generatingNames
              ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-arcane-400 animate-pulse" />Generating…</span>
              : '✦ Suggest names'}
          </button>
        </div>
        <input className="input text-lg font-body" placeholder="Mira Ashveil, Torben Flint, River Kade…"
          value={char.name} onChange={e => update('name', e.target.value)} autoFocus />
        {nameError && <p className="text-xs text-crimson-400 font-ui mt-1">{nameError}</p>}
        {nameSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {nameSuggestions.map(n => (
              <button key={n} onClick={() => { update('name', n); setNameSuggestions([]) }}
                className="px-3 py-1 rounded border border-ink-600 bg-ink-800 text-sm font-body text-parchment-200 hover:border-gold-500 hover:bg-ink-700 transition-all">
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Pronouns <Opt /></label>
        <p className="text-xs text-parchment-500 mb-2">The DM will use these when narrating about your character.</p>
        <div className="flex gap-2 flex-wrap">
          {PRONOUN_PRESETS.map(p => (
            <button key={p} onClick={() => handlePronounClick(p)}
              className={clsx('px-3 py-1.5 rounded border text-sm font-ui transition-all',
                char.pronouns === p && !showCustom
                  ? 'border-gold-500 bg-ink-700 text-parchment-100'
                  : 'border-ink-600 bg-ink-800 text-parchment-300 hover:border-ink-500'
              )}>
              {p}
            </button>
          ))}
          <button onClick={handleCustomToggle}
            className={clsx('px-3 py-1.5 rounded border text-sm font-ui transition-all',
              showCustom
                ? 'border-gold-500 bg-ink-700 text-parchment-100'
                : 'border-ink-600 bg-ink-800 text-parchment-300 hover:border-ink-500'
            )}>
            custom…
          </button>
        </div>
        {showCustom && (
          <input className="input mt-2" placeholder="e.g. ze/zir, it/its, name-only…"
            value={isCustomPronoun ? char.pronouns : ''}
            onChange={e => update('pronouns', e.target.value)}
            autoFocus
          />
        )}
      </div>

    </div>
  )
}

// ── Step: Ancestry ─────────────────────────────────────────────────────────────

function AncestryStep({ char, update }) {
  const [filter, setFilter] = useState('')
  const selected = char.ancestry ? ANCESTRIES[char.ancestry] : null
  const q = filter.toLowerCase().trim()

  return (
    <div className="space-y-5">
      <Header title="Choose your ancestry" sub="Your ancestry shapes your innate abilities and how the world perceives you." />
      <div className="bg-ink-800 border border-ink-700 rounded-lg p-3 text-xs text-parchment-400 leading-relaxed">
        Each ancestry grants a <span className="text-gold-400">stat bonus</span> and a free <span className="text-arcane-300">ability</span> — except humans,
        who get an extra ability pick instead. Choose <span className="text-parchment-200">Custom</span> if you have
        something specific in mind; the DM will work with you.
      </div>

      <input className="input text-sm" placeholder="Filter ancestries…"
        value={filter} onChange={e => setFilter(e.target.value)} />

      {ANCESTRY_GROUPS.map(group => {
        const visible = group.keys.filter(key => {
          const anc = ANCESTRIES[key]
          if (!anc) return false
          if (!q) return true
          return anc.label.toLowerCase().includes(q) || anc.description.toLowerCase().includes(q)
        })
        if (visible.length === 0) return null
        return (
          <div key={group.label}>
            <p className="text-xs text-parchment-500 font-ui uppercase tracking-wider mb-2">{group.label}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {visible.map(key => {
                const anc = ANCESTRIES[key]
                return (
                  <button key={key} onClick={() => update('ancestry', key)}
                    className={clsx('text-left p-3.5 rounded-lg border transition-all',
                      char.ancestry === key
                        ? 'border-gold-500 bg-ink-700 shadow-glow-gold'
                        : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                    )}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="font-display text-sm text-parchment-100">{anc.label}</span>
                      {anc.rarity === 'setting-specific' && (
                        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-arcane-600/10 text-arcane-400 font-ui border border-arcane-600/20">
                          setting
                        </span>
                      )}
                      {anc.rarity === 'rare' && (
                        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-400 font-ui border border-gold-500/20">
                          rare
                        </span>
                      )}
                    </div>
                    <p className="font-body text-xs text-parchment-400 leading-relaxed">{anc.description}</p>
                    {anc.settingNote && (
                      <p className="font-body text-xs text-parchment-600 mt-1 italic">{anc.settingNote}</p>
                    )}
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {Object.entries(anc.statBonus || {}).map(([stat, bonus]) => (
                        <span key={stat} className="text-xs px-1.5 py-0.5 rounded bg-gold-500/15 text-gold-300 font-ui">
                          +{bonus} {stat}
                        </span>
                      ))}
                      {anc.bonusAbility && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-arcane-600/15 text-arcane-300 font-ui">
                          +1 ability
                        </span>
                      )}
                      {anc.ability && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-arcane-600/15 text-arcane-300 font-ui">
                          {anc.ability.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {selected && selected.flavorTraits?.length > 0 && (
        <p className="text-xs text-parchment-500 text-center">
          Common traits: {selected.flavorTraits.join(' · ')}
        </p>
      )}
    </div>
  )
}

// ── Step: Background ───────────────────────────────────────────────────────────

function BackgroundStep({ char, update }) {
  return (
    <div className="space-y-5">
      <Header title="Choose your background" sub="Your life before adventuring shapes your skills and starting gear." />
      <div className="bg-ink-800 border border-ink-700 rounded-lg p-3 text-xs text-parchment-400 leading-relaxed">
        Backgrounds give your character a <span className="text-arcane-300">narrative bonus</span> that the DM applies
        in relevant situations. They also inform your starting inventory and how NPCs react to you.
        Choose <span className="text-parchment-200">Custom</span> to define something unique.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(BACKGROUNDS).map(([key, bg]) => (
          <button key={key} onClick={() => update('background', key)}
            className={clsx('text-left p-4 rounded-lg border transition-all',
              char.background === key
                ? 'border-gold-500 bg-ink-700 shadow-glow-gold'
                : 'border-ink-600 bg-ink-800 hover:border-ink-500'
            )}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-display text-base text-parchment-100">{bg.label}</span>
              {bg.bonus && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-arcane-600/20 text-arcane-300 font-ui">
                  +{bg.bonus}
                </span>
              )}
            </div>
            <p className="font-body text-xs text-parchment-400">{bg.description}</p>
            {bg.skill && (
              <p className="font-body text-xs text-parchment-600 mt-1.5 leading-snug">
                <span className="text-parchment-500">Skill:</span> {bg.skill}
              </p>
            )}
            {bg.contact && (
              <p className="font-body text-xs text-parchment-600 mt-0.5 leading-snug">
                <span className="text-parchment-500">Contact:</span> {bg.contact}
              </p>
            )}
            {bg.hook && (
              <p className="font-body text-xs text-parchment-600 mt-0.5 italic leading-snug">{bg.hook}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step: Stats ────────────────────────────────────────────────────────────────

function StatsStep({ char, update, remaining }) {
  const rem = remaining()
  const ancestry = ANCESTRIES[char.ancestry] || {}

  function adjust(stat, delta) {
    const cur = char.baseStats[stat]
    const next = cur + delta
    if (next < 1 || next > CREATION_POINT_CAP) return
    if (delta > 0 && rem <= 0) return
    update('baseStats', { ...char.baseStats, [stat]: next })
  }

  return (
    <div className="space-y-5">
      <Header title="Allocate your stats"
        sub={`Distribute ${CREATION_BONUS_POINTS} bonus points across Body, Mind, and Spirit.`} />
      <div className="bg-ink-800 border border-ink-700 rounded-lg p-3 text-xs text-parchment-400 leading-relaxed">
        All stats start at <span className="text-parchment-200">2</span>. Spend your {CREATION_BONUS_POINTS} points however you like — no single stat above {CREATION_POINT_CAP} at creation.
        Ancestry bonuses are added on top and shown in gold. <span className="text-parchment-200">Body</span> sets your HP ({`Body × 4`}).
      </div>
      <div className={clsx('text-center py-2 rounded font-ui text-sm font-medium',
        rem > 0 ? 'text-gold-300' : 'text-forest-300 bg-forest-600/10'
      )}>
        {rem > 0 ? `${rem} point${rem !== 1 ? 's' : ''} remaining` : '✓ All points allocated'}
      </div>

      <div className="space-y-3">
        {['body','mind','spirit'].map(stat => {
          const info = STAT_INFO[stat]
          const base = char.baseStats[stat]
          const bonus = ancestry.statBonus?.[stat] || 0
          const total = base + bonus
          return (
            <div key={stat} className="panel p-4">
              <div className="flex items-center gap-4">
                <span className="text-2xl w-8 text-center">{info.icon}</span>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-base text-parchment-100 capitalize">{stat}</span>
                    <span className="font-body text-xs text-parchment-400">{info.description}</span>
                  </div>
                  <p className="font-body text-xs text-parchment-500">{info.examples}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => adjust(stat, -1)} disabled={base <= 1}
                    className="w-7 h-7 rounded border border-ink-600 bg-ink-700 text-parchment-300 hover:bg-ink-600 disabled:opacity-30 font-ui">−</button>
                  <div className="text-center w-12">
                    <span className="font-display text-2xl text-parchment-100">{total}</span>
                    {bonus > 0 && <span className="block text-xs text-gold-400 font-ui">{base}+{bonus}</span>}
                  </div>
                  <button onClick={() => adjust(stat, 1)} disabled={base >= CREATION_POINT_CAP || rem <= 0}
                    className="w-7 h-7 rounded border border-ink-600 bg-ink-700 text-parchment-300 hover:bg-ink-600 disabled:opacity-30 font-ui">+</button>
                </div>
              </div>
              <div className="flex gap-1 mt-3 ml-12">
                {[1,2,3,4,5].map(pip => (
                  <div key={pip} className={clsx('w-5 h-2 rounded-full transition-all',
                    pip <= base ? 'bg-gold-400' : pip <= total ? 'bg-gold-600/40' : 'bg-ink-600'
                  )} />
                ))}
              </div>
              {stat === 'body' && (
                <p className="text-xs text-parchment-500 font-ui mt-1.5 ml-12">HP: {calcMaxHp(total)}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Step: Abilities ────────────────────────────────────────────────────────────

const ABILITY_TABS = [
  { id: 'combat',  label: 'Combat' },
  { id: 'magic',   label: 'Magic' },
  { id: 'utility', label: 'Survival' },
  { id: 'stealth', label: 'Stealth' },
  { id: 'social',  label: 'Social' },
  { id: 'passive', label: 'Passive' },
]

function AbilitiesStep({ char, update, required }) {
  const [activeTab, setActiveTab] = useState('combat')
  const ancestry = ANCESTRIES[char.ancestry] || {}
  const ancestryAbility = ancestry.ability
  const selected = char.chosenAbilities.length
  const rem = required - selected

  const tabAbilities = Object.entries(ABILITIES).filter(([, ab]) => ab.type === activeTab)

  function toggle(key) {
    if (key === ancestryAbility) return
    const has = char.chosenAbilities.includes(key)
    if (has) update('chosenAbilities', char.chosenAbilities.filter(a => a !== key))
    else if (selected < required) update('chosenAbilities', [...char.chosenAbilities, key])
  }

  return (
    <div className="space-y-5">
      <Header title="Choose your abilities" sub={`Pick ${required} abilities${char.ancestry === 'human' ? ' (humans get a bonus pick)' : ''}. These define your special talents.`} />
      <div className="bg-ink-800 border border-ink-700 rounded-lg p-3 text-xs text-parchment-400 leading-relaxed">
        Abilities let you bend or extend the rules in specific situations. Your ancestry ability is
        already <span className="text-forest-400">locked in for free</span>. Pick {required} more from any tab —
        you can change these between sessions with DM approval.
      </div>
      <div className={clsx('text-center py-2 rounded font-ui text-sm',
        rem > 0 ? 'text-gold-300' : 'text-forest-300 bg-forest-600/10'
      )}>
        {rem > 0 ? `Choose ${rem} more` : '✓ Selection complete'}
      </div>

      {ancestryAbility && ABILITIES[ancestryAbility] && (
        <div className="panel p-3 border-gold-500/30">
          <p className="text-xs text-gold-400 font-ui uppercase tracking-wider mb-2">Ancestry ability (free)</p>
          <div className="flex items-start gap-2">
            <span className="text-forest-400">✓</span>
            <div>
              <p className="font-display text-sm text-parchment-100">{ABILITIES[ancestryAbility].label}</p>
              <p className="font-body text-xs text-parchment-400 mt-0.5">{ABILITIES[ancestryAbility].description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-700 pb-0">
        {ABILITY_TABS.map(tab => {
          const count = char.chosenAbilities.filter(k => ABILITIES[k]?.type === tab.id).length
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx('px-3 py-1.5 text-xs font-ui rounded-t transition-all -mb-px border-b-2',
                activeTab === tab.id
                  ? 'text-parchment-100 border-gold-500'
                  : 'text-parchment-400 border-transparent hover:text-parchment-200'
              )}>
              {tab.label}
              {count > 0 && <span className="ml-1 text-gold-400">·{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="space-y-2">
        {tabAbilities.map(([key, ab]) => {
          const isAncestry = key === ancestryAbility
          const isChosen = char.chosenAbilities.includes(key)
          const isFull = selected >= required && !isChosen
          return (
            <button key={key} onClick={() => toggle(key)}
              disabled={isAncestry || isFull}
              className={clsx('w-full text-left p-3 rounded border transition-all',
                isAncestry ? 'border-ink-700 bg-ink-800/50 opacity-40 cursor-not-allowed' :
                isChosen ? 'border-gold-500/60 bg-ink-700 shadow-glow-gold' :
                isFull ? 'border-ink-700 bg-ink-800/50 opacity-40 cursor-not-allowed' :
                'border-ink-600 bg-ink-800 hover:border-ink-500'
              )}>
              <div className="flex items-start gap-3">
                <span className={clsx('mt-0.5 shrink-0', isChosen ? 'text-gold-400' : 'text-ink-500')}>
                  {isChosen ? '◆' : '◇'}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm text-parchment-100">{ab.label}</span>
                    {ab.settingTags && !ab.settingTags.includes('all') && (
                      <span className="text-xs text-parchment-600 font-ui italic">
                        {ab.settingTags.join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="font-body text-xs text-parchment-400 mt-0.5">{ab.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step: Backstory ────────────────────────────────────────────────────────────

function BackstoryStep({ char, update, config }) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [options, setOptions] = useState([])   // array of backstory option objects
  const [selectedIdx, setSelectedIdx] = useState(null)

  async function generateOptions() {
    setGenerating(true)
    setGenError(null)
    setOptions([])
    setSelectedIdx(null)
    try {
      const results = await generateBackstoryOptions({
        name: char.name, ancestry: char.ancestry,
        background: char.background, traits: char.traits,
        campaign: null, config,
      })
      setOptions(results)
    } catch (err) {
      console.error(err)
      setGenError(err.message || 'Generation failed — check your LLM connection in Settings.')
    } finally {
      setGenerating(false)
    }
  }

  function pickOption(idx) {
    const opt = options[idx]
    setSelectedIdx(idx)
    update('backstory', opt.backstory)
    update('personalityNote', opt.personalityNote)
    update('hook', opt.hook)
    if (!char.portraitPrompt && opt.portraitPrompt) update('portraitPrompt', opt.portraitPrompt)
  }

  return (
    <div className="space-y-5">
      <Header title="Write your backstory" sub="Where did you come from? What drives you? Write your own or let AI craft three options." />

      <button onClick={generateOptions} disabled={generating} className="btn-secondary text-sm">
        {generating
          ? <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gold-400 animate-pulse" />Generating 3 options…</span>
          : options.length > 0 ? '↺ Regenerate options' : '✦ Generate 3 options with AI'}
      </button>

      {genError && (
        <div className="p-3 rounded border border-crimson-600/40 bg-crimson-600/10 text-crimson-300 text-xs font-ui">
          {genError}
        </div>
      )}

      {/* Option cards — shown when AI results arrive */}
      {options.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-parchment-500 font-ui">Click an option to use it — you can edit the text below afterwards.</p>
          {options.map((opt, i) => (
            <button key={i} onClick={() => pickOption(i)}
              className={clsx('w-full text-left p-4 rounded-lg border transition-all',
                selectedIdx === i
                  ? 'border-gold-500 bg-ink-700 shadow-glow-gold'
                  : 'border-ink-600 bg-ink-800 hover:border-ink-500'
              )}>
              <div className="flex items-start gap-3">
                <span className={clsx('shrink-0 mt-0.5 font-ui text-xs', selectedIdx === i ? 'text-gold-400' : 'text-parchment-500')}>
                  {selectedIdx === i ? '◆' : `${i + 1}.`}
                </span>
                <div className="min-w-0">
                  <p className="font-body text-xs text-parchment-300 leading-relaxed line-clamp-3">{opt.backstory}</p>
                  {opt.personalityNote && (
                    <p className="text-xs text-parchment-500 italic mt-1.5 line-clamp-1">{opt.personalityNote}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div>
        <label className="label">Backstory</label>
        <textarea className="input font-body text-sm leading-relaxed" rows={6}
          placeholder="Write your character's history, or generate options above…"
          value={char.backstory} onChange={e => update('backstory', e.target.value)} />
      </div>
      {char.personalityNote && (
        <div className="border-l-2 border-gold-500/40 pl-3">
          <p className="text-xs text-parchment-500 font-ui mb-0.5">Personality</p>
          <p className="font-body text-sm text-parchment-300 italic">{char.personalityNote}</p>
        </div>
      )}
      {char.hook && (
        <div className="border-l-2 border-arcane-500/40 pl-3">
          <p className="text-xs text-parchment-500 font-ui mb-0.5">Campaign hook</p>
          <p className="font-body text-sm text-parchment-300 italic">{char.hook}</p>
        </div>
      )}
      <div>
        <label className="label">Portrait description <span className="text-parchment-500 text-xs">— for image generation</span></label>
        <textarea className="input font-body text-sm" rows={2}
          placeholder="young woman, long red hair, green eyes, leather vest, smiling, freckles…"
          value={char.portraitPrompt} onChange={e => update('portraitPrompt', e.target.value)} />
      </div>
    </div>
  )
}

// ── Step: Portrait ─────────────────────────────────────────────────────────────

const PORTRAIT_SAMPLERS = ['DPM++ 2M', 'DPM++ 2M SDE', 'DPM++ 3M SDE', 'Euler', 'Euler a', 'DDIM', 'LMS']
const PORTRAIT_SCHEDULERS = ['Karras', 'Automatic', 'Exponential', 'SGM Uniform', 'Simple']
const PORTRAIT_SIZES = [
  { label: 'Portrait 512×768', width: 512, height: 768 },
  { label: 'Square 512×512', width: 512, height: 512 },
  { label: 'Tall 512×1024', width: 512, height: 1024 },
  { label: 'Large 768×1024', width: 768, height: 1024 },
  { label: 'Wide 768×512', width: 768, height: 512 },
]
const PORTRAIT_DEFAULT_NEG = '(worst quality:1.4), (low quality:1.4), blurry, deformed, ugly, extra limbs, bad anatomy, bad hands, missing fingers, extra digit, watermark, text, logo, signature, username, duplicate, mutated, disfigured, cropped, jpeg artifacts'

function PortraitStep({ char, update, config }) {
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState(null)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [posPrompt, setPosPrompt] = useState(() => buildPortraitTags(char.portraitPrompt, char.ancestry, char.background))
  const [negPrompt, setNegPrompt] = useState(PORTRAIT_DEFAULT_NEG)
  const [params, setParams] = useState({
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
    sizeKey: 'Portrait 512×768',
    steps: 28,
    cfgScale: 7,
  })

  // Rebuild posPrompt when character fields change (e.g. after backstory generation)
  useEffect(() => {
    setPosPrompt(buildPortraitTags(char.portraitPrompt, char.ancestry, char.background))
  }, [char.portraitPrompt, char.ancestry, char.background])

  function setParam(key, val) { setParams(p => ({ ...p, [key]: val })) }

  async function generate() {
    if (!config?.image?.enabled) { setErr('Image generation is disabled. Enable it in Settings.'); return }
    setGenerating(true); setErr(null)
    try {
      const size = PORTRAIT_SIZES.find(s => s.label === params.sizeKey) || PORTRAIT_SIZES[0]
      const overrides = {
        sampler: params.sampler,
        scheduler: params.scheduler,
        width: size.width,
        height: size.height,
        steps: params.steps,
        cfgScale: params.cfgScale,
      }
      const { portraitBase64, tokenBase64 } = await generatePortrait({
        portraitPrompt: char.portraitPrompt,
        ancestry: char.ancestry,
        background: char.background,
        config,
        overrides,
        promptOverride: posPrompt,
        negPromptOverride: negPrompt,
      })
      if (portraitBase64) { update('portraitBase64', portraitBase64); update('tokenBase64', tokenBase64) }
    } catch (e) { setErr(e.message) }
    finally { setGenerating(false) }
  }

  return (
    <div className="space-y-5">
      <Header title="Generate a portrait" sub="Create a visual for your character. You can skip this — portraits can be added later." />
      {!config?.image?.enabled && (
        <div className="panel p-4">
          <p className="text-sm text-parchment-400 font-ui">SDNext is not enabled. Enable it in Settings or skip this step.</p>
        </div>
      )}
      {config?.image?.enabled && (
        <>
          {char.portraitBase64 ? (
            <div className="flex gap-4 items-start">
              <img src={`data:image/png;base64,${char.portraitBase64}`} alt={char.name}
                className="w-40 h-52 object-cover rounded-lg border border-ink-600 shadow-panel" />
              {char.tokenBase64 && (
                <div className="flex flex-col items-center gap-1.5">
                  <img src={`data:image/png;base64,${char.tokenBase64}`} alt="token"
                    className="w-16 h-16 rounded-full border-2 border-gold-500/60" />
                  <span className="text-xs text-parchment-400 font-ui">Token</span>
                </div>
              )}
              <button onClick={generate} disabled={generating} className="btn-secondary text-sm self-end">
                {generating ? 'Generating…' : '↺ Regenerate'}
              </button>
            </div>
          ) : (
            <div onClick={!generating ? generate : undefined}
              className={clsx('w-full h-52 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all',
                generating ? 'border-gold-500/50 bg-ink-800' : 'border-ink-600 hover:border-ink-500 bg-ink-800/50 cursor-pointer'
              )}>
              {generating ? (
                <><div className="w-6 h-6 rounded-full border-2 border-gold-400 border-t-transparent animate-spin" />
                <p className="font-ui text-sm text-parchment-400">Generating… (~20–30s)</p></>
              ) : (
                <><span className="text-3xl text-parchment-500">◈</span>
                <p className="font-ui text-sm text-parchment-300">Click to generate portrait</p></>
              )}
            </div>
          )}
          {err && <p className="text-sm text-crimson-300 font-ui">{err}</p>}

          <div className="panel">
            <button
              onClick={() => setParamsOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-ui text-parchment-300 hover:text-parchment-100 transition-colors"
            >
              <span>Generation parameters</span>
              <span className={clsx('text-parchment-500 transition-transform', paramsOpen && 'rotate-180')}>▾</span>
            </button>
            {paramsOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-ink-600">
                <div className="pt-3 space-y-2">
                  <label className="label text-xs">Positive prompt</label>
                  <textarea className="input font-mono text-xs leading-relaxed" rows={4}
                    value={posPrompt} onChange={e => setPosPrompt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="label text-xs">Negative prompt</label>
                  <textarea className="input font-mono text-xs leading-relaxed" rows={3}
                    value={negPrompt} onChange={e => setNegPrompt(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Sampler</label>
                    <select className="input text-sm" value={params.sampler} onChange={e => setParam('sampler', e.target.value)}>
                      {PORTRAIT_SAMPLERS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Scheduler</label>
                    <select className="input text-sm" value={params.scheduler} onChange={e => setParam('scheduler', e.target.value)}>
                      {PORTRAIT_SCHEDULERS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Image size</label>
                    <select className="input text-sm" value={params.sizeKey} onChange={e => setParam('sizeKey', e.target.value)}>
                      {PORTRAIT_SIZES.map(s => <option key={s.label}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Steps <span className="text-parchment-500">({params.steps})</span></label>
                      <input type="range" min={10} max={60} step={1} value={params.steps}
                        onChange={e => setParam('steps', Number(e.target.value))}
                        className="w-full accent-gold-500" />
                    </div>
                    <div>
                      <label className="label text-xs">CFG Scale <span className="text-parchment-500">({params.cfgScale})</span></label>
                      <input type="range" min={1} max={20} step={0.5} value={params.cfgScale}
                        onChange={e => setParam('cfgScale', Number(e.target.value))}
                        className="w-full accent-gold-500" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Step: Review ───────────────────────────────────────────────────────────────

function ReviewStep({ char }) {
  const ancestry = ANCESTRIES[char.ancestry] || {}
  const finalStats = { ...char.baseStats }
  Object.entries(ancestry.statBonus || {}).forEach(([s, b]) => { finalStats[s] = (finalStats[s] || 0) + b })
  const allAbilities = [...new Set([...char.chosenAbilities, ...(ancestry.ability ? [ancestry.ability] : [])])]

  return (
    <div className="space-y-5">
      <Header title="Review your character" sub="Everything look right? Click 'Begin Adventure' to start." />
      <div className="panel p-5 space-y-4">
        <div className="flex items-start gap-4">
          {char.portraitBase64
            ? <img src={`data:image/png;base64,${char.portraitBase64}`} alt={char.name}
                className="w-20 h-24 object-cover rounded-lg border border-ink-600" />
            : <div className="w-20 h-24 rounded-lg border border-ink-600 bg-ink-700 flex items-center justify-center text-3xl">👤</div>
          }
          <div>
            <h2 className="font-display text-xl text-parchment-100">{char.name}</h2>
            <p className="font-body text-sm text-parchment-400 mt-0.5 capitalize">
              {[ancestry.label, BACKGROUNDS[char.background]?.label].filter(Boolean).join(' · ')}
            </p>
            {char.pronouns && <p className="font-body text-xs text-parchment-500 mt-0.5">{char.pronouns}</p>}
          </div>
        </div>
        <div className="divider" />
        <div className="grid grid-cols-3 gap-3">
          {['body','mind','spirit'].map(stat => (
            <div key={stat} className="text-center bg-ink-700 rounded p-2">
              <div className="text-lg">{STAT_INFO[stat].icon}</div>
              <div className="font-display text-2xl text-parchment-100">{finalStats[stat]}</div>
              <div className="text-xs text-parchment-400 font-ui capitalize">{stat}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-parchment-400 font-ui">
          HP: {calcMaxHp(finalStats.body)} · Initiative: Spirit ({finalStats.spirit}d6)
        </p>
        <div className="divider" />
        <div>
          <p className="label">Abilities</p>
          <div className="flex flex-wrap gap-1.5">
            {allAbilities.map(a => (
              <span key={a} className="text-xs px-2 py-0.5 rounded bg-arcane-600/20 text-arcane-300 border border-arcane-600/30 font-ui">
                {ABILITIES[a]?.label || a}
              </span>
            ))}
          </div>
        </div>
        {char.backstory && (
          <>
            <div className="divider" />
            <div>
              <p className="label">Backstory</p>
              <p className="font-body text-sm text-parchment-300 leading-relaxed line-clamp-4">{char.backstory}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Step: Traits ───────────────────────────────────────────────────────────────

function TraitsStep({ char, update }) {
  const t = char.traits || { personality: [], flaw: '', motivation: '', bond: '', secret: '' }

  function setField(key, value) {
    update('traits', { ...t, [key]: value })
  }

  function togglePersonality(trait) {
    const cur = t.personality || []
    if (cur.includes(trait)) setField('personality', cur.filter(x => x !== trait))
    else if (cur.length < 3) setField('personality', [...cur, trait])
  }

  return (
    <div className="space-y-6">
      <Header title="Define your character" sub="These traits give the DM material to work with. The more specific, the better." />

      {/* Personality — multi-select chips, max 3 */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="label">{CHARACTER_TRAITS.personality.label}</label>
          <span className="text-xs text-parchment-500 font-ui">{(t.personality || []).length}/3</span>
        </div>
        <p className="text-xs text-parchment-500 mb-2">{CHARACTER_TRAITS.personality.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {CHARACTER_TRAITS.personality.traits.map(trait => {
            const picked = (t.personality || []).includes(trait)
            const full = (t.personality || []).length >= 3 && !picked
            return (
              <button key={trait} onClick={() => togglePersonality(trait)}
                disabled={full}
                className={clsx('px-2.5 py-1 rounded border text-xs font-body transition-all',
                  picked ? 'border-gold-500 bg-ink-700 text-parchment-100'
                  : full ? 'border-ink-700 bg-ink-800/50 text-parchment-600 cursor-not-allowed'
                  : 'border-ink-600 bg-ink-800 text-parchment-400 hover:border-ink-500 hover:text-parchment-200'
                )}>
                {trait}
              </button>
            )
          })}
        </div>
      </div>

      {/* Single-select dropdowns for flaw, motivation, bond, secret */}
      {['flaw', 'motivation', 'bond', 'secret'].map(key => {
        const cat = CHARACTER_TRAITS[key]
        return (
          <div key={key}>
            <label className="label">{cat.label} {key === 'bond' || key === 'secret' ? <Opt /> : null}</label>
            <p className="text-xs text-parchment-500 mb-2">{cat.description}</p>
            <div className="space-y-1.5">
              {cat.traits.map(trait => (
                <button key={trait} onClick={() => setField(key, t[key] === trait ? '' : trait)}
                  className={clsx('w-full text-left px-3 py-2 rounded border text-xs font-body transition-all',
                    t[key] === trait
                      ? 'border-gold-500 bg-ink-700 text-parchment-100'
                      : 'border-ink-600 bg-ink-800 text-parchment-400 hover:border-ink-500 hover:text-parchment-200'
                  )}>
                  {trait}
                </button>
              ))}
              <input className="input text-xs mt-1" placeholder={`Custom ${key}…`}
                value={cat.traits.includes(t[key] || '') ? '' : (t[key] || '')}
                onChange={e => setField(key, e.target.value)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Header({ title, sub }) {
  return (
    <div className="mb-2">
      <h2 className="font-display text-2xl text-parchment-100 mb-1">{title}</h2>
      <p className="font-body text-parchment-400">{sub}</p>
    </div>
  )
}

function Opt() {
  return <span className="text-parchment-500 font-body text-xs normal-case">(optional)</span>
}
