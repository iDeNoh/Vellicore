import React, { useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Play, Save, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import usePetricoreStore from '@/store/petricoreStore'
import { generateNamePool } from '@/services/petricore/nameGenerator'
import { useAppStore } from '@/store/appStore'
import { FORMAT_LABELS } from '@/services/petricore/formatters'

const PRESET_TAGS = {
  all:   null,
  core:  ['VOICE', 'ROLL', 'FLAG', 'IMAGE'],
  story: ['QUEST', 'LORE', 'ACT_ADVANCE', 'GAME_OVER'],
}

const TAG_ROWS = [
  'VOICE','NPC_UPDATE','ROLL','ROLL_RESULTS','IMAGE','FLAG',
  'QUEST','QUEST_UPDATE','QUEST_DONE','LOCATION','LORE',
  'COMBAT','ACT_ADVANCE','OOC','GAME_OVER',
]

export default function PlanBuilder({ onStartGeneration }) {
  const { plan, setPlan, setTagConfig, setGenreConfig, setNamePool, coverage } = usePetricoreStore()
  const { config } = useAppStore()

  const [open, setOpen] = useState({ overview: true, tags: true, genres: false, params: false })
  const toggle = (k) => setOpen(s => ({ ...s, [k]: !s[k] }))

  const [nameStatus, setNameStatus] = useState(
    plan.namePool.generated ? `${plan.namePool.names.length} names ready` : 'Not generated'
  )
  const [nameLoading, setNameLoading] = useState(false)

  async function handleGenerateNames() {
    setNameLoading(true)
    setNameStatus('Generating…')
    try {
      const names = await generateNamePool(plan.namePool, config.llm, msg => setNameStatus(msg))
      setNamePool({ ...plan.namePool, generated: true, names })
      setNameStatus(`${names.length} names ready`)
    } catch (err) {
      setNameStatus(`Error: ${err.message}`)
    } finally {
      setNameLoading(false)
    }
  }

  function setOriginConfig(origin, updates) {
    setNamePool({ ...plan.namePool, origins: { ...plan.namePool.origins, [origin]: { ...plan.namePool.origins[origin], ...updates } } })
  }

  function setStyleConfig(style, updates) {
    setNamePool({ ...plan.namePool, styles: { ...plan.namePool.styles, [style]: { ...plan.namePool.styles[style], ...updates } } })
  }

  function setTagPreset(preset) {
    TAG_ROWS.forEach(tag => {
      if (preset === null) {
        setTagConfig(tag, { enabled: true })
      } else {
        setTagConfig(tag, { enabled: preset.includes(tag) })
      }
    })
  }

  function setAllGenres(enabled) {
    Object.keys(plan.genres).forEach(g => setGenreConfig(g, { enabled }))
  }

  function balanceWeights() {
    Object.keys(plan.genres).forEach(g => setGenreConfig(g, { weight: 1 }))
  }

  // Stacked bar for sum-to-100 distributions
  function DistBar({ values, colors }) {
    const total = Object.values(values).reduce((s, v) => s + v, 0)
    return (
      <div className="flex h-3 rounded overflow-hidden mt-1">
        {Object.entries(values).map(([k, v], i) => (
          <div
            key={k}
            style={{ flex: total > 0 ? v / total : 1 / Object.keys(values).length }}
            className={colors[i % colors.length]}
            title={`${k}: ${v}%`}
          />
        ))}
      </div>
    )
  }

  const distColors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']

  return (
    <div className="h-full overflow-y-auto px-6 py-4 space-y-3">

      {/* Section 1: Overview */}
      <Section title="Overview" open={open.overview} onToggle={() => toggle('overview')}>
        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-parchment-500 font-ui">Total examples target</span>
            <input type="number" min={1} max={50000}
              value={plan.totalExamples}
              onChange={e => setPlan({ totalExamples: Number(e.target.value) })}
              className="input-field w-32"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-parchment-500 font-ui">Output format</span>
            <select value={plan.outputFormat}
              onChange={e => setPlan({ outputFormat: e.target.value })}
              className="input-field"
            >
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 mt-3">
          <span className="text-xs text-parchment-500 font-ui">
            Additional instructions for the LLM — appended to every generation prompt
          </span>
          <textarea
            rows={3}
            value={plan.additionalNotes}
            onChange={e => setPlan({ additionalNotes: e.target.value })}
            placeholder="e.g. Always include a moral dilemma. Keep NPC dialogue grounded and realistic."
            className="input-field resize-none"
          />
        </label>
      </Section>

      {/* Section 2: Tags */}
      <Section title="Tags" open={open.tags} onToggle={() => toggle('tags')}>
        <div className="flex gap-2 mb-3 flex-wrap">
          <span className="text-xs text-parchment-500 font-ui self-center">Preset:</span>
          {[['All', null], ['Core only', 'core'], ['Story tags', 'story']].map(([label, preset]) => (
            <button key={label} onClick={() => setTagPreset(preset === null ? null : PRESET_TAGS[preset])}
              className="px-2 py-0.5 text-xs rounded border border-ink-600 text-parchment-400
                         hover:border-violet-500 hover:text-violet-300 transition-colors">
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-ui">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="text-left py-1 pr-3 text-parchment-500 font-normal w-4">En</th>
                <th className="text-left py-1 pr-4 text-parchment-500 font-normal">Tag</th>
                <th className="text-left py-1 pr-3 text-parchment-500 font-normal">Target</th>
                <th className="text-left py-1 pr-3 text-parchment-500 font-normal">Min</th>
                <th className="text-left py-1 pr-3 text-parchment-500 font-normal">Max</th>
                <th className="text-left py-1 text-parchment-500 font-normal min-w-32">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {TAG_ROWS.map(tag => {
                const cfg = plan.tags[tag]
                const cov = coverage.byTag?.[tag]
                const pct = cov ? Math.min(100, Math.round((cov.count / cov.targetCount) * 100)) : 0
                return (
                  <tr key={tag} className={clsx('border-b border-ink-800', !cfg.enabled && 'opacity-40')}>
                    <td className="py-1.5 pr-3">
                      <input type="checkbox" checked={cfg.enabled}
                        onChange={e => setTagConfig(tag, { enabled: e.target.checked })}
                        className="accent-violet-500"
                      />
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-parchment-300">{tag}</td>
                    <td className="py-1.5 pr-3">
                      <input type="number" min={0} max={10000}
                        value={cfg.targetCount}
                        onChange={e => setTagConfig(tag, { targetCount: Number(e.target.value) })}
                        className="w-16 bg-ink-800 border border-ink-700 rounded px-1.5 py-0.5
                                   text-parchment-200 focus:outline-none focus:border-violet-500"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" min={1} max={10}
                        value={cfg.minPerExample}
                        onChange={e => setTagConfig(tag, { minPerExample: Number(e.target.value) })}
                        className="w-12 bg-ink-800 border border-ink-700 rounded px-1.5 py-0.5
                                   text-parchment-200 focus:outline-none focus:border-violet-500"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" min={1} max={10}
                        value={cfg.maxPerExample}
                        onChange={e => setTagConfig(tag, { maxPerExample: Number(e.target.value) })}
                        className="w-12 bg-ink-800 border border-ink-700 rounded px-1.5 py-0.5
                                   text-parchment-200 focus:outline-none focus:border-violet-500"
                      />
                    </td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-ink-700 rounded-full h-1.5 min-w-20">
                          <div
                            className={clsx('h-1.5 rounded-full transition-all',
                              pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-parchment-500 w-10 text-right shrink-0">
                          {cov?.count ?? 0}/{cfg.targetCount}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Section 3: Genres */}
      <Section title="Genres" open={open.genres} onToggle={() => toggle('genres')}>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setAllGenres(true)} className="btn-ghost text-xs">Enable all</button>
          <button onClick={() => setAllGenres(false)} className="btn-ghost text-xs">Disable all</button>
          <button onClick={balanceWeights} className="btn-ghost text-xs">Balance weights</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(plan.genres).map(([genre, cfg]) => (
            <div key={genre}
              className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded border transition-colors',
                cfg.enabled
                  ? 'border-ink-600 bg-ink-800/50'
                  : 'border-ink-800 opacity-50'
              )}
            >
              <input type="checkbox" checked={cfg.enabled}
                onChange={e => setGenreConfig(genre, { enabled: e.target.checked })}
                className="accent-violet-500 flex-shrink-0"
              />
              <span className="text-xs text-parchment-300 flex-1 truncate capitalize font-ui">
                {genre.replace(/_/g, ' ')}
              </span>
              <input type="range" min={1} max={5} step={1}
                value={cfg.weight}
                onChange={e => setGenreConfig(genre, { weight: Number(e.target.value) })}
                disabled={!cfg.enabled}
                className="w-16 accent-violet-500"
                title={`Weight: ${cfg.weight}`}
              />
              <span className="text-xs text-parchment-500 w-3">{cfg.weight}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 4: Generation Parameters */}
      <Section title="Generation Parameters" open={open.params} onToggle={() => toggle('params')}>
        <div className="space-y-6">

          {/* Length controls */}
          <div>
            <h4 className="text-xs font-ui text-parchment-400 mb-2 uppercase tracking-wide">Exchange length</h4>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-parchment-500">Min exchanges</span>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={4} value={plan.length.minExchanges}
                    onChange={e => setPlan({ length: { ...plan.length, minExchanges: Number(e.target.value) } })}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs text-parchment-300 w-4">{plan.length.minExchanges}</span>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-parchment-500">Max exchanges</span>
                <div className="flex items-center gap-2">
                  <input type="range" min={4} max={10} value={plan.length.maxExchanges}
                    onChange={e => setPlan({ length: { ...plan.length, maxExchanges: Number(e.target.value) } })}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs text-parchment-300 w-4">{plan.length.maxExchanges}</span>
                </div>
              </label>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-parchment-500">Length tier distribution</span>
              {['terse', 'normal', 'extended'].map(tier => (
                <div key={tier} className="flex items-center gap-2">
                  <span className="text-xs text-parchment-400 w-16 capitalize">{tier}</span>
                  <input type="range" min={0} max={100}
                    value={plan.length.tierWeights[tier]}
                    onChange={e => setPlan({ length: { ...plan.length, tierWeights: { ...plan.length.tierWeights, [tier]: Number(e.target.value) } } })}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs text-parchment-400 w-8 text-right">{plan.length.tierWeights[tier]}%</span>
                </div>
              ))}
              <DistBar values={plan.length.tierWeights} colors={distColors} />
            </div>
          </div>

          {/* Dialogue distribution */}
          <div>
            <h4 className="text-xs font-ui text-parchment-400 mb-2 uppercase tracking-wide">Dialogue distribution</h4>
            <div className="space-y-1">
              {[
                ['noDialogue',     'No dialogue'],
                ['singleNpcOne',   'Single NPC, one line'],
                ['singleNpcMulti', 'Single NPC, multi-line'],
                ['multiNpc',       'Multi-NPC'],
                ['withParaling',   'With paralinguistic cues'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-parchment-400 w-40 truncate">{label}</span>
                  <input type="range" min={0} max={100}
                    value={plan.dialogue[key]}
                    onChange={e => setPlan({ dialogue: { ...plan.dialogue, [key]: Number(e.target.value) } })}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs text-parchment-400 w-8 text-right">{plan.dialogue[key]}%</span>
                </div>
              ))}
              <DistBar values={plan.dialogue} colors={distColors} />
            </div>
          </div>

          {/* Name pool */}
          <div className="space-y-4">
            <h4 className="text-xs font-ui text-parchment-400 uppercase tracking-wide">Name pool</h4>

            {/* Count + generate */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2">
                <span className="text-xs text-parchment-500">Total names</span>
                <input type="number" min={50} max={1000}
                  value={plan.namePool.totalNames}
                  onChange={e => setNamePool({ ...plan.namePool, totalNames: Number(e.target.value) })}
                  className="w-20 bg-ink-800 border border-ink-700 rounded px-2 py-0.5 text-xs
                             text-parchment-200 focus:outline-none focus:border-violet-500"
                />
              </label>
              <button onClick={handleGenerateNames} disabled={nameLoading}
                className="btn-ghost text-xs flex items-center gap-1.5">
                {nameLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {plan.namePool.generated ? 'Regenerate' : 'Generate Name Pool'}
              </button>
              <span className={clsx('text-xs font-ui',
                plan.namePool.generated ? 'text-emerald-400' : nameStatus.startsWith('Error') ? 'text-rose-400' : 'text-parchment-500')}>
                {nameStatus}
              </span>
            </div>

            {/* Cultural origins */}
            <div>
              <p className="text-xs text-parchment-500 mb-2">
                Cultural origins
                <span className="text-parchment-600 ml-1">— weight controls relative frequency (1–5)</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(plan.namePool.origins || {}).map(([origin, cfg]) => {
                  const label = {
                    european: 'European', east_asian: 'East Asian',
                    middle_eastern: 'Middle Eastern', african: 'African',
                    latin_american: 'Latin American', slavic: 'Slavic',
                    norse: 'Norse / Germanic', invented: 'Invented / Fantastical',
                  }[origin] || origin
                  return (
                    <div key={origin} className={clsx(
                      'flex items-center gap-2 px-2 py-1.5 rounded border transition-colors',
                      cfg.enabled ? 'border-ink-600 bg-ink-800/50' : 'border-ink-800 opacity-40'
                    )}>
                      <input type="checkbox" checked={cfg.enabled}
                        onChange={e => setOriginConfig(origin, { enabled: e.target.checked })}
                        className="accent-violet-500 flex-shrink-0"
                      />
                      <span className="text-xs text-parchment-300 flex-1 truncate font-ui">{label}</span>
                      <input type="range" min={1} max={5} step={1}
                        value={cfg.weight}
                        disabled={!cfg.enabled}
                        onChange={e => setOriginConfig(origin, { weight: Number(e.target.value) })}
                        className="w-16 accent-violet-500"
                        title={`Weight: ${cfg.weight}`}
                      />
                      <span className="text-xs text-parchment-500 w-3">{cfg.weight}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Gender distribution */}
            <div>
              <p className="text-xs text-parchment-500 mb-2">Gender distribution target</p>
              <div className="space-y-1">
                {[['m', 'Male'], ['f', 'Female'], ['n', 'Neutral / Ambiguous']].map(([key, label]) => {
                  const val = plan.namePool.genderSplit?.[key] ?? (key === 'n' ? 20 : 40)
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-parchment-400 w-36">{label}</span>
                      <input type="range" min={0} max={100}
                        value={val}
                        onChange={e => setNamePool({ ...plan.namePool, genderSplit: { ...plan.namePool.genderSplit, [key]: Number(e.target.value) } })}
                        className="flex-1 accent-violet-500"
                      />
                      <span className="text-xs text-parchment-400 w-8 text-right">{val}%</span>
                    </div>
                  )
                })}
                <DistBar
                  values={{ Male: plan.namePool.genderSplit?.m ?? 40, Female: plan.namePool.genderSplit?.f ?? 40, Neutral: plan.namePool.genderSplit?.n ?? 20 }}
                  colors={['bg-sky-500', 'bg-rose-500', 'bg-parchment-600']}
                />
                <p className="text-xs text-parchment-600">Used as approximate targets — the LLM will do its best to match.</p>
              </div>
            </div>

            {/* Name styles */}
            <div>
              <p className="text-xs text-parchment-500 mb-2">
                Name feel / style
                <span className="text-parchment-600 ml-1">— weight controls relative frequency (1–5)</span>
              </p>
              <div className="space-y-1">
                {Object.entries(plan.namePool.styles || {}).map(([style, cfg]) => {
                  const label = {
                    mythic: 'Mythic & ancient', grounded: 'Grounded & realistic',
                    futuristic: 'Futuristic & coined', gritty: 'Gritty & streetwise',
                  }[style] || style
                  return (
                    <div key={style} className={clsx('flex items-center gap-2', !cfg.enabled && 'opacity-40')}>
                      <input type="checkbox" checked={cfg.enabled}
                        onChange={e => setStyleConfig(style, { enabled: e.target.checked })}
                        className="accent-violet-500"
                      />
                      <span className="text-xs text-parchment-300 w-40 font-ui">{label}</span>
                      <input type="range" min={1} max={5} step={1}
                        value={cfg.weight}
                        disabled={!cfg.enabled}
                        onChange={e => setStyleConfig(style, { weight: Number(e.target.value) })}
                        className="flex-1 accent-violet-500"
                        title={`Weight: ${cfg.weight}`}
                      />
                      <span className="text-xs text-parchment-500 w-3">{cfg.weight}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Additional instructions */}
            <div>
              <p className="text-xs text-parchment-500 mb-1">Additional instructions for name generation</p>
              <textarea
                rows={2}
                value={plan.namePool.nameInstructions || ''}
                onChange={e => setNamePool({ ...plan.namePool, nameInstructions: e.target.value })}
                placeholder="e.g. Avoid names ending in -us or -ia. Include more single-syllable surnames. Prefer names that work in cyberpunk settings."
                className="input-field resize-none w-full text-xs"
              />
            </div>

            {/* Preview */}
            {plan.namePool.generated && plan.namePool.names.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pt-1">
                {plan.namePool.names.slice(0, 40).map((n, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-ink-800 rounded text-xs text-parchment-400 font-ui">
                    {n.name}
                  </span>
                ))}
                {plan.namePool.names.length > 40 && (
                  <span className="text-xs text-parchment-500 self-center">
                    +{plan.namePool.names.length - 40} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Story styles */}
          <div>
            <h4 className="text-xs font-ui text-parchment-400 mb-2 uppercase tracking-wide">Story styles</h4>
            <div className="space-y-1">
              {[
                ['living_world', 'Living World'],
                ['guided_fate',  'Guided Fate'],
                ['open_road',    'Open Road'],
              ].map(([key, label]) => {
                const cfg = plan.storyStyles?.[key] || { enabled: true, weight: 1 }
                return (
                  <div key={key} className="flex items-center gap-3">
                    <input type="checkbox" checked={cfg.enabled}
                      onChange={e => setPlan({ storyStyles: { ...plan.storyStyles, [key]: { ...cfg, enabled: e.target.checked } } })}
                      className="accent-violet-500"
                    />
                    <span className="text-xs text-parchment-300 w-28">{label}</span>
                    <input type="range" min={1} max={5} value={cfg.weight} disabled={!cfg.enabled}
                      onChange={e => setPlan({ storyStyles: { ...plan.storyStyles, [key]: { ...cfg, weight: Number(e.target.value) } } })}
                      className="flex-1 accent-violet-500"
                    />
                    <span className="text-xs text-parchment-500 w-3">{cfg.weight}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Footer actions */}
      <div className="flex items-center gap-3 pt-2 pb-6">
        <button className="btn-ghost flex items-center gap-1.5 text-sm">
          <Save size={14} />
          Save Plan
        </button>
        <button
          onClick={onStartGeneration}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500
                     text-white text-sm font-ui transition-colors"
        >
          <Play size={14} />
          Start Generation
        </button>
      </div>
    </div>
  )
}

function Section({ title, open, onToggle, children }) {
  return (
    <div className="border border-ink-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-ink-900 hover:bg-ink-800
                   text-left text-sm font-ui text-parchment-200 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="px-4 py-4 bg-ink-950">{children}</div>}
    </div>
  )
}
