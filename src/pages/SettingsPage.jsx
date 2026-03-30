import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { checkRagHealth } from '@/services/rag/ragService'
import { campaigns as campaignDb } from '@/services/db/database'
import { KOKORO_VOICES, setChatterboxVoicesCache, clearTtsCircuitBreaker } from '@/services/tts/ttsService'
import { STORY_STYLES } from '@/lib/world/dmPrompts'
import ServicePanel from '@/components/ui/ServicePanel'
import clsx from 'clsx'

export default function SettingsPage() {
  // Evaluated at render time so it's true on mobile after remoteTavern is wired up
  const isElectron = !!window.tavern
  const navigate = useNavigate()
  const { config, saveConfig, activeCampaignId } = useAppStore()
  const [local, setLocal] = useState(null)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState({})
  const [campaignStyle, setCampaignStyle] = useState(null)
  const [chatterboxVoices, setChatterboxVoices] = useState([])
  const [ragStatus, setRagStatus] = useState(null) // null | 'checking' | 'ok' | 'error'
  const ragAvailable = useAppStore(s => s.ragAvailable)

  useEffect(() => {
    if (config) setLocal(JSON.parse(JSON.stringify(config)))
  }, [config])

  useEffect(() => {
    if (!activeCampaignId) return
    campaignDb.getById(activeCampaignId).then(c => {
      if (c) setCampaignStyle(c.storyStyle || ['guided_fate'])
    })
  }, [activeCampaignId])

  useEffect(() => {
    setRagStatus('checking')
    checkRagHealth().then(ok => setRagStatus(ok ? 'ok' : 'error')).catch(() => setRagStatus('error'))
  }, [])

  async function toggleCampaignStyle(id) {
    if (!activeCampaignId) return
    setCampaignStyle(prev => {
      const current = prev || ['guided_fate']
      let next
      if (current.includes(id)) next = current.filter(s => s !== id)
      else if (current.length < 2) next = [...current, id]
      else next = [current[1], id]
      if (next.length === 0) next = ['guided_fate']
      campaignDb.update(activeCampaignId, { storyStyle: next })
      return next
    })
  }

  if (!local) return null

  function update(path, value) {
    const keys = path.split('.')
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  async function save() {
    await saveConfig(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function testService(key, fn) {
    setStatus(s => ({ ...s, [key]: 'checking' }))
    try {
      const r = await fn()
      setStatus(s => ({ ...s, [key]: r.ok ? 'ok' : 'error', [key + '_detail']: r }))
      if (r.ok && (key === 'kokoro' || key === 'chatterbox')) clearTtsCircuitBreaker()
    } catch (e) {
      setStatus(s => ({ ...s, [key]: 'error', [key + '_detail']: { error: e.message } }))
    }
  }

  const Dot = ({ k }) => (
    <span className={clsx('status-dot inline-block mr-1.5', {
      'bg-ink-500': !status[k],
      'bg-gold-400 animate-pulse': status[k] === 'checking',
      'bg-forest-400': status[k] === 'ok',
      'bg-crimson-400': status[k] === 'error',
    })} />
  )

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button className="btn-ghost text-sm" onClick={() => navigate(-1)}>← Back</button>
          <h1 className="font-display text-3xl text-parchment-100">Settings</h1>
        </div>

        <div className="space-y-6">

          {/* LLM */}
          <Section title="AI Brain" icon="✦">
            <div className="space-y-4">
              <div>
                <label className="label">Provider</label>
                <select className="input" value={local.llm.provider}
                  onChange={e => update('llm.provider', e.target.value)}>
                  <option value="ollama">Ollama (local, free)</option>
                  <option value="lmstudio">LM Studio (local, free)</option>
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai-compat">OpenAI / OpenAI-compatible</option>
                  <option value="gemini">Gemini (Google)</option>
                </select>
              </div>

              {local.llm.provider === 'ollama' && (
                <>
                  <Field label="Ollama URL">
                    <div className="flex gap-2">
                      <input className="input" value={local.llm.ollamaUrl}
                        onChange={e => update('llm.ollamaUrl', e.target.value)} />
                      {isElectron && (
                        <button className="btn-secondary" onClick={() =>
                          testService('ollama', () => window.tavern.health.checkOllama(local.llm.ollamaUrl))}>
                          Test
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-parchment-400 mt-1"><Dot k="ollama" />{statusText(status.ollama)}</p>
                  </Field>
                  <Field label="Model">
                    <input className="input" value={local.llm.ollamaModel}
                      onChange={e => update('llm.ollamaModel', e.target.value)} />
                  </Field>
                </>
              )}

              {local.llm.provider === 'lmstudio' && (
                <>
                  <Field label="LM Studio server URL">
                    <div className="flex gap-2">
                      <input className="input" value={local.llm.lmstudioUrl || 'http://localhost:1234'}
                        onChange={e => update('llm.lmstudioUrl', e.target.value)} />
                      {isElectron && (
                        <button className="btn-secondary" onClick={() =>
                          testService('lmstudio', () => window.tavern.health.checkLmStudio(local.llm.lmstudioUrl || 'http://localhost:1234'))}>
                          Test
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-parchment-400 mt-1">
                      <Dot k="lmstudio" />{statusText(status.lmstudio)}
                      {status.lmstudio === 'ok' && status.lmstudio_detail?.models?.length > 0
                        ? ` — ${status.lmstudio_detail.models.length} model(s) loaded`
                        : ''}
                    </p>
                  </Field>
                  <Field label="Model (leave blank to use active model)">
                    {status.lmstudio_detail?.models?.length > 0 ? (
                      <select className="input" value={local.llm.lmstudioModel || ''}
                        onChange={e => update('llm.lmstudioModel', e.target.value)}>
                        <option value="">Auto (use active model)</option>
                        {status.lmstudio_detail.models.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="input" placeholder="Leave blank for auto"
                        value={local.llm.lmstudioModel || ''}
                        onChange={e => update('llm.lmstudioModel', e.target.value)} />
                    )}
                  </Field>
                  <div className="text-xs text-parchment-500 font-ui bg-ink-900 rounded px-3 py-2 space-y-0.5">
                    <p className="text-parchment-400 font-medium">To enable LM Studio's server:</p>
                    <p>Open LM Studio → click the plug icon (Local Server) → load a model → Start Server</p>
                  </div>
                </>
              )}

              {local.llm.provider === 'claude' && (
                <Field label="API Key">
                  <input className="input font-mono" type="password"
                    value={local.llm.claudeApiKey}
                    onChange={e => update('llm.claudeApiKey', e.target.value)} />
                </Field>
              )}

              {local.llm.provider === 'openai-compat' && (
                <>
                  <Field label="Base URL">
                    <input className="input" value={local.llm.openAiCompatUrl}
                      onChange={e => update('llm.openAiCompatUrl', e.target.value)} />
                  </Field>
                  <Field label="Model">
                    <input className="input" value={local.llm.openAiCompatModel}
                      onChange={e => update('llm.openAiCompatModel', e.target.value)} />
                  </Field>
                  <Field label="API Key (optional)">
                    <input className="input font-mono" type="password"
                      value={local.llm.openAiCompatKey}
                      onChange={e => update('llm.openAiCompatKey', e.target.value)} />
                  </Field>
                </>
              )}

              {local.llm.provider === 'gemini' && (
                <>
                  <Field label="API Key">
                    <input className="input font-mono" type="password"
                      placeholder="Get one free at aistudio.google.com"
                      value={local.llm.geminiApiKey || ''}
                      onChange={e => update('llm.geminiApiKey', e.target.value)} />
                  </Field>
                  <Field label="Model">
                    <select className="input" value={local.llm.geminiModel || 'gemini-2.0-flash'}
                      onChange={e => update('llm.geminiModel', e.target.value)}>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (fast, free tier)</option>
                      <option value="gemini-2.5-flash-preview-04-17">Gemini 2.5 Flash (thinking)</option>
                      <option value="gemini-2.5-pro-preview-03-25">Gemini 2.5 Pro (best quality)</option>
                    </select>
                  </Field>
                </>
              )}
            </div>
          </Section>

          {/* Image generation */}
          <Section title="Image Generation" icon="◈">
            <div className="space-y-4">
              <Toggle label="Enable image generation" checked={local.image.enabled}
                onChange={v => update('image.enabled', v)} />
              {local.image.enabled && (
                <>
                  <Field label="SDNext URL">
                    <div className="flex gap-2">
                      <input className="input" value={local.image.sdnextUrl}
                        onChange={e => update('image.sdnextUrl', e.target.value)} />
                      {isElectron && (
                        <button className="btn-secondary" onClick={() =>
                          testService('sdnext', () => window.tavern.health.checkSdnext(local.image.sdnextUrl))}>
                          Test
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-parchment-400 mt-1"><Dot k="sdnext" />{statusText(status.sdnext)}</p>
                  </Field>
                  <Field label="Style suffix (appended to all prompts)">
                    <input className="input" value={local.image.style}
                      onChange={e => update('image.style', e.target.value)} />
                  </Field>
                </>
              )}
            </div>
          </Section>

          {/* TTS */}
          <Section title="Voice Narration" icon="◉">
            <div className="space-y-4">
              <Toggle label="Enable TTS narration" checked={local.tts.enabled}
                onChange={v => update('tts.enabled', v)} />
              {local.tts.enabled && (
                <>
                  <Field label="Provider">
                    <select className="input" value={local.tts.provider || 'kokoro'}
                      onChange={e => update('tts.provider', e.target.value)}>
                      <option value="kokoro">Kokoro (local)</option>
                      <option value="chatterbox">Chatterbox (local)</option>
                    </select>
                  </Field>

                  {(local.tts.provider || 'kokoro') === 'kokoro' && (
                    <>
                      <Field label="Kokoro URL">
                        <div className="flex gap-2">
                          <input className="input" value={local.tts.kokoroUrl}
                            onChange={e => update('tts.kokoroUrl', e.target.value)} />
                          {isElectron && (
                            <button className="btn-secondary" onClick={() =>
                              testService('kokoro', () => window.tavern.health.checkKokoro(local.tts.kokoroUrl))}>
                              Test
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-parchment-400 mt-1"><Dot k="kokoro" />{statusText(status.kokoro)}</p>
                      </Field>
                      <Field label="DM Voice">
                        <select className="input" value={local.tts.dmVoice}
                          onChange={e => update('tts.dmVoice', e.target.value)}>
                          {Object.entries(KOKORO_VOICES).map(([id, v]) => (
                            <option key={id} value={id}>{v.label} — {v.description}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Player Voice">
                        <select className="input" value={local.tts.playerVoice || ''}
                          onChange={e => update('tts.playerVoice', e.target.value)}>
                          <option value="">Auto (based on character gender)</option>
                          {Object.entries(KOKORO_VOICES).map(([id, v]) => (
                            <option key={id} value={id}>{v.label} — {v.description}</option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}

                  {local.tts.provider === 'chatterbox' && (
                    <>
                      <Field label="Chatterbox URL">
                        <div className="flex gap-2">
                          <input className="input" value={local.tts.chatterboxUrl || 'http://localhost:8004'}
                            onChange={e => update('tts.chatterboxUrl', e.target.value)} />
                          {isElectron && (
                            <button className="btn-secondary" onClick={async () => {
                              setStatus(s => ({ ...s, chatterbox: 'checking' }))
                              try {
                                const r = await window.tavern.health.checkChatterbox(local.tts.chatterboxUrl || 'http://localhost:8004')
                                setStatus(s => ({ ...s, chatterbox: r.ok ? 'ok' : 'error', chatterbox_detail: r }))
                                if (r.ok && r.voices?.length > 0) {
                                  setChatterboxVoices(r.voices)
                                  setChatterboxVoicesCache(r.voices)
                                }
                              } catch (e) {
                                setStatus(s => ({ ...s, chatterbox: 'error', chatterbox_detail: { error: e.message } }))
                              }
                            }}>
                              Test
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-parchment-400 mt-1">
                          <Dot k="chatterbox" />{statusText(status.chatterbox)}
                          {status.chatterbox === 'ok' && chatterboxVoices.length > 0
                            ? ` — ${chatterboxVoices.length} voice(s) available`
                            : ''}
                        </p>
                      </Field>
                      <Field label="DM Voice">
                        {chatterboxVoices.length > 0 ? (
                          <select className="input" value={local.tts.chatterboxDmVoice || ''}
                            onChange={e => update('tts.chatterboxDmVoice', e.target.value)}>
                            <option value="">— select a voice —</option>
                            {chatterboxVoices.map(v => {
                              const id    = typeof v === 'string' ? v : (v.filename || v.display_name || '')
                              const label = typeof v === 'string' ? v : (v.display_name || v.filename || '')
                              return <option key={id} value={id}>{label}</option>
                            })}
                          </select>
                        ) : (
                          <input className="input" placeholder="Test connection to load voices"
                            value={local.tts.chatterboxDmVoice || ''}
                            onChange={e => update('tts.chatterboxDmVoice', e.target.value)} />
                        )}
                      </Field>
                      <Field label="Player Voice">
                        {chatterboxVoices.length > 0 ? (
                          <select className="input" value={local.tts.chatterboxPlayerVoice || ''}
                            onChange={e => update('tts.chatterboxPlayerVoice', e.target.value)}>
                            <option value="">Auto (based on character gender)</option>
                            {chatterboxVoices.map(v => {
                              const id    = typeof v === 'string' ? v : (v.filename || v.display_name || '')
                              const label = typeof v === 'string' ? v : (v.display_name || v.filename || '')
                              return <option key={id} value={id}>{label}</option>
                            })}
                          </select>
                        ) : (
                          <input className="input" placeholder="Auto (test connection to load voices)"
                            value={local.tts.chatterboxPlayerVoice || ''}
                            onChange={e => update('tts.chatterboxPlayerVoice', e.target.value)} />
                        )}
                      </Field>
                      <Toggle label="Turbo model (faster, fewer options)"
                        checked={local.tts.chatterboxTurbo ?? true}
                        onChange={v => update('tts.chatterboxTurbo', v)} />
                      {!(local.tts.chatterboxTurbo ?? true) && (
                        <>
                          <Field label={`Emotion exaggeration: ${(local.tts.chatterboxExaggeration ?? 0.5).toFixed(2)}`}>
                            <input type="range" min="0" max="1" step="0.05"
                              value={local.tts.chatterboxExaggeration ?? 0.5}
                              onChange={e => update('tts.chatterboxExaggeration', parseFloat(e.target.value))}
                              className="w-full accent-gold-500" />
                            <p className="text-xs text-parchment-500 mt-0.5">Lower = neutral, higher = expressive</p>
                          </Field>
                          <Field label={`CFG weight: ${(local.tts.chatterboxCfgWeight ?? 0.5).toFixed(2)}`}>
                            <input type="range" min="0" max="1" step="0.05"
                              value={local.tts.chatterboxCfgWeight ?? 0.5}
                              onChange={e => update('tts.chatterboxCfgWeight', parseFloat(e.target.value))}
                              className="w-full accent-gold-500" />
                            <p className="text-xs text-parchment-500 mt-0.5">Higher = closer to reference voice</p>
                          </Field>
                        </>
                      )}
                    </>
                  )}

                  <Field label={`Narration speed: ${local.tts.speed}×`}>
                    <input type="range" min="0.6" max="1.6" step="0.1"
                      value={local.tts.speed}
                      onChange={e => update('tts.speed', parseFloat(e.target.value))}
                      className="w-full accent-gold-500" />
                  </Field>
                  <Toggle label="Auto-narrate DM messages" checked={local.app.autoTts}
                    onChange={v => update('app.autoTts', v)} />
                </>
              )}
            </div>
          </Section>

          {/* App */}
          <Section title="App" icon="⚙">
            <div className="space-y-3">
              <Toggle label="Auto-generate images for scenes"
                checked={local.app.autoImage}
                onChange={v => update('app.autoImage', v)} />
              <Toggle label="Show map grid"
                checked={local.app.mapGridVisible}
                onChange={v => update('app.mapGridVisible', v)} />
            </div>
          </Section>

          {/* Content */}
          <Section title="Content" icon="◈">
            <div className="space-y-4">
              <Toggle
                label="Adult content"
                description="Permits romantic and sexual content between consenting characters when dramatically appropriate."
                checked={local.app?.adultContent ?? false}
                onChange={v => update('app.adultContent', v)}
              />
              <Field label="Violence & gore">
                <div className="flex gap-2">
                  {[
                    { value: 'none',     label: 'None',     desc: 'Abstract — outcomes only' },
                    { value: 'moderate', label: 'Moderate', desc: 'Vivid but not gratuitous' },
                    { value: 'explicit', label: 'Explicit', desc: 'Full visceral detail' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => update('app.goreLevel', opt.value)}
                      title={opt.desc}
                      className={clsx(
                        'flex-1 py-2 px-3 rounded border font-ui text-sm transition-colors',
                        (local.app?.goreLevel ?? 'moderate') === opt.value
                          ? 'border-gold-500 bg-gold-500/10 text-gold-300'
                          : 'border-ink-600 text-parchment-400 hover:border-ink-500'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-parchment-500 mt-1.5 font-ui">
                  {(local.app?.goreLevel ?? 'moderate') === 'none' && 'Combat and injury stay abstract — no graphic descriptions.'}
                  {(local.app?.goreLevel ?? 'moderate') === 'moderate' && 'Wounds and deaths can be described with some detail, but not dwelt upon.'}
                  {(local.app?.goreLevel ?? 'moderate') === 'explicit' && 'Injuries, deaths, and violence may be described in full graphic detail.'}
                </p>
              </Field>
              <p className="text-xs text-parchment-500 font-ui">These settings affect the AI DM and world generation. They are applied immediately.</p>
            </div>
          </Section>

          {/* Memory */}
          <Section title="Memory" icon="◈">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={clsx('w-2 h-2 rounded-full', {
                  'bg-ink-500': ragStatus === null || ragStatus === 'checking',
                  'bg-gold-400 animate-pulse': ragStatus === 'checking',
                  'bg-forest-400': ragStatus === 'ok',
                  'bg-crimson-400': ragStatus === 'error',
                })} />
                <span className="font-ui text-xs text-parchment-400">
                  {ragStatus === 'ok'
                    ? 'Memory service connected'
                    : ragStatus === 'error'
                    ? 'Memory service offline — start ChromaDB to enable'
                    : ragStatus === 'checking'
                    ? 'Checking memory service\u2026'
                    : 'Memory service status unknown'}
                </span>
              </div>

              <Toggle
                label="Enable RAG memory"
                checked={local.rag?.enabled ?? true}
                onChange={v => update('rag.enabled', v)}
              />

              {(local.rag?.enabled ?? true) && (
                <>
                  <Field label="Retrieval sensitivity">
                    <div className="flex gap-2">
                      {[
                        { label: 'Broad', value: 0.50 },
                        { label: 'Balanced', value: 0.65 },
                        { label: 'Precise', value: 0.80 },
                      ].map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => update('rag.threshold', opt.value)}
                          className={clsx(
                            'flex-1 py-1.5 rounded text-xs font-ui border transition-all',
                            (local.rag?.threshold ?? 0.65) === opt.value
                              ? 'bg-ink-600 border-gold-500 text-parchment-100'
                              : 'bg-ink-800 border-ink-600 text-parchment-400 hover:border-ink-500'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-parchment-500 mt-1">
                      Broad = more context but noisier. Precise = only highly relevant memories.
                    </p>
                  </Field>

                  <Field label={`Memories injected per turn: ${local.rag?.maxResults ?? 5}`}>
                    <input
                      type="range" min="2" max="10" step="1"
                      value={local.rag?.maxResults ?? 5}
                      onChange={e => update('rag.maxResults', parseInt(e.target.value))}
                      className="w-full accent-gold-500"
                    />
                  </Field>

                  <Toggle
                    label="Store all DM responses (vs. significant only)"
                    checked={local.rag?.storeAllResponses ?? false}
                    onChange={v => update('rag.storeAllResponses', v)}
                  />
                </>
              )}
            </div>
          </Section>

          {activeCampaignId && campaignStyle && (
            <Section title="Story Style" icon="🎭">
              <p className="font-body text-xs text-parchment-500 mb-3">
                Changes take effect on the next DM response. Choose one or two — second choice flavours the first.
              </p>
              <div className="flex gap-2">
                {Object.values(STORY_STYLES).map(style => {
                  const idx = campaignStyle.indexOf(style.id)
                  const isPrimary = idx === 0
                  const isSecondary = idx === 1
                  return (
                    <button key={style.id} onClick={() => toggleCampaignStyle(style.id)}
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
            </Section>
          )}

          <Section title="Services" icon="⚙">
            <ServicePanel />
          </Section>

          <div className="flex justify-end gap-3 pb-8">
            <button className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
            <button className="btn-primary" onClick={save}>
              {saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon, children }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="text-gold-400 text-sm">{icon}</span>
        <h2 className="font-display text-base text-parchment-200">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-gold-500 mt-0.5 shrink-0" />
      <div>
        <span className="font-ui text-sm text-parchment-200">{label}</span>
        {description && <p className="text-xs text-parchment-500 mt-0.5 font-ui">{description}</p>}
      </div>
    </label>
  )
}

function statusText(s) {
  if (!s) return 'Not tested'
  if (s === 'checking') return 'Checking…'
  if (s === 'ok') return 'Connected'
  return 'Connection failed'
}
