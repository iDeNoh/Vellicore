import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import clsx from 'clsx'

const STEPS = ['welcome', 'llm', 'image', 'tts', 'done']

export default function SetupPage() {
  const navigate = useNavigate()
  const { config, setConfig, saveConfig, setFirstRun } = useAppStore()
  const [step, setStep] = useState('welcome')
  const [local, setLocal] = useState(null)
  const [status, setStatus] = useState({})

  useEffect(() => {
    if (config) setLocal(JSON.parse(JSON.stringify(config)))
  }, [config])

  if (!local) return null

  const stepIndex = STEPS.indexOf(step)

  function update(path, value) {
    const keys = path.split('.')
    setLocal(prev => {
      const next = { ...prev }
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  async function checkService(key, fn) {
    setStatus(s => ({ ...s, [key]: 'checking' }))
    try {
      const result = await fn()
      setStatus(s => ({ ...s, [key]: result.ok ? 'ok' : 'error', [key + '_detail']: result }))
    } catch (e) {
      setStatus(s => ({ ...s, [key]: 'error', [key + '_detail']: { error: e.message } }))
    }
  }

  async function finish() {
    await saveConfig(local)
    setFirstRun(false)
    navigate('/lobby')
  }

  const StatusDot = ({ k }) => {
    const s = status[k]
    return (
      <span className={clsx('status-dot inline-block mr-2', {
        'bg-ink-500': !s,
        'bg-gold-400 animate-pulse': s === 'checking',
        'bg-forest-400': s === 'ok',
        'bg-crimson-400': s === 'error',
      })} />
    )
  }

  return (
    <div className="h-full flex items-center justify-center bg-ink-950 p-6">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={clsx('w-2 h-2 rounded-full transition-colors', {
              'bg-gold-400': i <= stepIndex,
              'bg-ink-600': i > stepIndex,
            })} />
          ))}
        </div>

        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <div className="text-center animate-fade-in">
            <div className="text-5xl mb-4">⚔</div>
            <h1 className="font-display text-4xl text-parchment-100 mb-3 tracking-wide">
              Welcome to Vellicore
            </h1>
            <p className="font-body text-parchment-300 text-lg mb-2">
              An AI-powered tabletop RPG that runs entirely on your machine.
            </p>
            <p className="font-body text-parchment-400 mb-8">
              Let's connect your local services. This only takes a minute.
            </p>
            <button className="btn-primary text-base px-8 py-3" onClick={() => setStep('llm')}>
              Begin Setup
            </button>
          </div>
        )}

        {/* ── LLM ── */}
        {step === 'llm' && (
          <div className="animate-fade-in">
            <h2 className="font-display text-2xl text-parchment-100 mb-1">AI Brain</h2>
            <p className="font-body text-parchment-400 mb-6">
              Choose how the Dungeon Master thinks. Ollama is free and local.
              Claude API gives the best narration quality.
            </p>

            <div className="space-y-2 mb-6">
              {[
                { id: 'ollama',       label: 'Ollama',                  sub: 'Local · free · pull any model',         icon: '🦙' },
                { id: 'lmstudio',     label: 'LM Studio',               sub: 'Local · free · GUI model manager',      icon: '🖥' },
                { id: 'claude',       label: 'Claude API',              sub: 'Cloud · best narrative quality',         icon: '✦' },
                { id: 'openai-compat',label: 'OpenAI-compatible',       sub: 'Jan, llama.cpp server, etc.',            icon: '⚡' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => update('llm.provider', opt.id)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3',
                    local.llm.provider === opt.id
                      ? 'border-gold-500 bg-ink-700 shadow-glow-gold'
                      : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                  )}
                >
                  <span className="text-xl w-8 text-center shrink-0">{opt.icon}</span>
                  <div>
                    <span className="font-ui text-sm text-parchment-200 block">{opt.label}</span>
                    <span className="font-body text-xs text-parchment-500">{opt.sub}</span>
                  </div>
                </button>
              ))}
            </div>

            {local.llm.provider === 'ollama' && (
              <div className="space-y-3">
                <div>
                  <label className="label">Ollama URL</label>
                  <div className="flex gap-2">
                    <input className="input" value={local.llm.ollamaUrl}
                      onChange={e => update('llm.ollamaUrl', e.target.value)} />
                    <button className="btn-secondary whitespace-nowrap"
                      onClick={() => checkService('ollama', () => window.tavern.health.checkOllama(local.llm.ollamaUrl))}>
                      Test
                    </button>
                  </div>
                </div>
                {status.ollama_detail?.models?.length > 0 && (
                  <div>
                    <label className="label">Model</label>
                    <select className="input" value={local.llm.ollamaModel}
                      onChange={e => update('llm.ollamaModel', e.target.value)}>
                      {status.ollama_detail.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-parchment-400">
                  <StatusDot k="ollama" />
                  {status.ollama === 'ok' ? `Connected — ${status.ollama_detail?.models?.length} model(s) available` :
                   status.ollama === 'error' ? 'Could not connect. Is Ollama running?' :
                   'Recommended: llama3.1 or mistral-nemo'}
                </p>
              </div>
            )}

            {local.llm.provider === 'claude' && (
              <div className="space-y-3">
                <div>
                  <label className="label">Anthropic API Key</label>
                  <input className="input font-mono" type="password"
                    placeholder="sk-ant-..."
                    value={local.llm.claudeApiKey}
                    onChange={e => update('llm.claudeApiKey', e.target.value)} />
                </div>
                <p className="text-xs text-parchment-400">
                  Get a key at{' '}
                  <button className="text-gold-400 hover:underline"
                    onClick={() => window.tavern?.fs.openExternal('https://console.anthropic.com')}>
                    console.anthropic.com
                  </button>
                  . Claude Haiku is recommended for cost — ~$0.20–0.40 per 2hr session.
                </p>
              </div>
            )}

            {local.llm.provider === 'lmstudio' && (
              <div className="space-y-3">
                <div>
                  <label className="label">LM Studio server URL</label>
                  <div className="flex gap-2">
                    <input className="input" placeholder="http://localhost:1234"
                      value={local.llm.lmstudioUrl || 'http://localhost:1234'}
                      onChange={e => update('llm.lmstudioUrl', e.target.value)} />
                    <button className="btn-secondary whitespace-nowrap"
                      onClick={() => checkService('lmstudio', () => window.tavern.health.checkLmStudio(local.llm.lmstudioUrl || 'http://localhost:1234'))}>
                      Test
                    </button>
                  </div>
                </div>
                {status.lmstudio_detail?.models?.length > 0 && (
                  <div>
                    <label className="label">Loaded model</label>
                    <select className="input" value={local.llm.lmstudioModel}
                      onChange={e => update('llm.lmstudioModel', e.target.value)}>
                      <option value="">Auto (use active model)</option>
                      {status.lmstudio_detail.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-parchment-400">
                  <StatusDot k="lmstudio" />
                  {status.lmstudio === 'ok'
                    ? `Connected — ${status.lmstudio_detail?.models?.length || 0} model(s) loaded`
                    : status.lmstudio === 'error'
                    ? 'Could not connect. Is LM Studio running with the local server enabled?'
                    : 'Enable the local server in LM Studio: Local Server tab → Start Server'}
                </p>
                <div className="text-xs text-parchment-500 font-ui bg-ink-900 rounded px-3 py-2 space-y-1">
                  <p className="font-medium text-parchment-400">LM Studio setup:</p>
                  <p>1. Open LM Studio → Local Server tab (the plug icon)</p>
                  <p>2. Load a model in the model dropdown at the top</p>
                  <p>3. Click Start Server — default port is 1234</p>
                </div>
              </div>
            )}

            {local.llm.provider === 'openai-compat' && (
              <div className="space-y-3">
                <div>
                  <label className="label">Base URL</label>
                  <input className="input" placeholder="http://localhost:1234"
                    value={local.llm.openAiCompatUrl}
                    onChange={e => update('llm.openAiCompatUrl', e.target.value)} />
                </div>
                <div>
                  <label className="label">Model name</label>
                  <input className="input" placeholder="local-model"
                    value={local.llm.openAiCompatModel}
                    onChange={e => update('llm.openAiCompatModel', e.target.value)} />
                </div>
                <div>
                  <label className="label">API Key (optional)</label>
                  <input className="input font-mono" type="password"
                    value={local.llm.openAiCompatKey}
                    onChange={e => update('llm.openAiCompatKey', e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button className="btn-ghost" onClick={() => setStep('welcome')}>Back</button>
              <button className="btn-primary" onClick={() => setStep('image')}>Continue</button>
            </div>
          </div>
        )}

        {/* ── Image generation ── */}
        {step === 'image' && (
          <div className="animate-fade-in">
            <h2 className="font-display text-2xl text-parchment-100 mb-1">Image Generation</h2>
            <p className="font-body text-parchment-400 mb-6">
              SDNext generates portraits, scenes, maps, and tokens locally.
              Run it with <code className="text-gold-400 text-xs">--api</code> flag.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <input type="checkbox" id="img-enabled" checked={local.image.enabled}
                  onChange={e => update('image.enabled', e.target.checked)}
                  className="w-4 h-4 accent-gold-500" />
                <label htmlFor="img-enabled" className="font-ui text-sm text-parchment-200">
                  Enable image generation
                </label>
              </div>

              {local.image.enabled && (
                <>
                  <div>
                    <label className="label">SDNext URL</label>
                    <div className="flex gap-2">
                      <input className="input" value={local.image.sdnextUrl}
                        onChange={e => update('image.sdnextUrl', e.target.value)} />
                      <button className="btn-secondary whitespace-nowrap"
                        onClick={() => checkService('sdnext', () => window.tavern.health.checkSdnext(local.image.sdnextUrl))}>
                        Test
                      </button>
                    </div>
                    <p className="text-xs text-parchment-400 mt-1">
                      <StatusDot k="sdnext" />
                      {status.sdnext === 'ok' ? `Connected — ${status.sdnext_detail?.models?.length} model(s) found` :
                       status.sdnext === 'error' ? 'Could not connect. Is SDNext running with --api?' :
                       'Default: http://localhost:7860'}
                    </p>
                  </div>

                  {status.sdnext_detail?.models?.length > 0 && (
                    <div>
                      <label className="label">Default model</label>
                      <select className="input" value={local.image.defaultModel}
                        onChange={e => update('image.defaultModel', e.target.value)}>
                        <option value="">Auto (use current)</option>
                        {status.sdnext_detail.models.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-between mt-8">
              <button className="btn-ghost" onClick={() => setStep('llm')}>Back</button>
              <button className="btn-primary" onClick={() => setStep('tts')}>Continue</button>
            </div>
          </div>
        )}

        {/* ── TTS ── */}
        {step === 'tts' && (
          <div className="animate-fade-in">
            <h2 className="font-display text-2xl text-parchment-100 mb-1">Voice Narration</h2>
            <p className="font-body text-parchment-400 mb-6">
              Kokoro TTS gives the DM a voice. Run it with{' '}
              <code className="text-gold-400 text-xs">python -m kokoro.api</code>.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <input type="checkbox" id="tts-enabled" checked={local.tts.enabled}
                  onChange={e => update('tts.enabled', e.target.checked)}
                  className="w-4 h-4 accent-gold-500" />
                <label htmlFor="tts-enabled" className="font-ui text-sm text-parchment-200">
                  Enable voice narration
                </label>
              </div>

              {local.tts.enabled && (
                <>
                  <div>
                    <label className="label">Kokoro URL</label>
                    <div className="flex gap-2">
                      <input className="input" value={local.tts.kokoroUrl}
                        onChange={e => update('tts.kokoroUrl', e.target.value)} />
                      <button className="btn-secondary whitespace-nowrap"
                        onClick={() => checkService('kokoro', () => window.tavern.health.checkKokoro(local.tts.kokoroUrl))}>
                        Test
                      </button>
                    </div>
                    <p className="text-xs text-parchment-400 mt-1">
                      <StatusDot k="kokoro" />
                      {status.kokoro === 'ok' ? 'Connected' :
                       status.kokoro === 'error' ? 'Could not connect. Is Kokoro running?' :
                       'Default: http://localhost:8880'}
                    </p>
                  </div>

                  <div>
                    <label className="label">DM Voice</label>
                    <select className="input" value={local.tts.dmVoice}
                      onChange={e => update('tts.dmVoice', e.target.value)}>
                      <option value="bm_george">George (British male) — recommended</option>
                      <option value="bm_lewis">Lewis (British male)</option>
                      <option value="am_michael">Michael (American male)</option>
                      <option value="af_sarah">Sarah (American female)</option>
                      <option value="bf_emma">Emma (British female)</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-between mt-8">
              <button className="btn-ghost" onClick={() => setStep('image')}>Back</button>
              <button className="btn-primary" onClick={() => setStep('done')}>Continue</button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className="text-center animate-fade-in">
            <div className="text-5xl mb-4">🎲</div>
            <h2 className="font-display text-3xl text-parchment-100 mb-3">Ready to play</h2>
            <p className="font-body text-parchment-400 mb-2">
              Your setup is complete. You can change any of these settings later.
            </p>
            <p className="font-body text-parchment-300 mb-8">
              Create your first campaign and let the adventure begin.
            </p>
            <button className="btn-primary text-base px-10 py-3" onClick={finish}>
              Enter the Tavern
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
