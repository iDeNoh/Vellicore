/**
 * ServicePanel — start local backend services from within the app,
 * and reboot the app entirely.
 *
 * Shows each service only when it's relevant to the current config:
 *  - ChromaDB:   always (RAG)
 *  - SDNext:     when image generation is enabled
 *  - Kokoro:     when TTS is enabled + provider is kokoro
 *  - Chatterbox: when TTS is enabled + provider is chatterbox
 */

import React, { useState, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import clsx from 'clsx'

const isElectron = typeof window !== 'undefined' && !!window.tavern

// Health check URLs per service
const HEALTH_URLS = {
  chroma:     'http://localhost:8765/api/v1/heartbeat',
  sdnext:     'http://localhost:7860/sdapi/v1/sd-models',
  kokoro:     'http://localhost:8880/health',
  chatterbox: 'http://localhost:8004/health',
}

async function checkHealth(service) {
  const url = HEALTH_URLS[service]
  if (!url) return false
  try {
    if (isElectron && window.tavern?.health) {
      const map = { chroma: null, sdnext: 'checkSdnext', kokoro: 'checkKokoro', chatterbox: 'checkChatterbox' }
      const fn = map[service]
      if (fn) {
        const r = await window.tavern.health[fn](url.split('/').slice(0, 3).join('/'))
        return r?.ok === true
      }
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

function ServiceRow({ id, label, description, visible }) {
  const config = useAppStore(s => s.config)
  const [status, setStatus] = useState(null) // null | 'checking' | 'running' | 'stopped'
  const [launching, setLaunching] = useState(false)

  const check = useCallback(async () => {
    setStatus('checking')
    const running = await checkHealth(id)
    setStatus(running ? 'running' : 'stopped')
  }, [id])

  const launch = useCallback(async () => {
    if (!isElectron) return
    setLaunching(true)
    await window.tavern.services.launch(id, config)
    setLaunching(false)
    // Give it a moment then re-check
    setTimeout(check, 3000)
  }, [id, config, check])

  if (!visible) return null

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-ink-700 last:border-0">
      {/* Status dot */}
      <div className={clsx('w-2 h-2 rounded-full shrink-0 transition-colors', {
        'bg-ink-500':               status === null,
        'bg-gold-400 animate-pulse': status === 'checking',
        'bg-forest-400':            status === 'running',
        'bg-crimson-400':           status === 'stopped',
      })} />

      <div className="flex-1 min-w-0">
        <p className="font-ui text-sm text-parchment-200">{label}</p>
        <p className="font-body text-xs text-parchment-500">{description}</p>
      </div>

      <div className="flex gap-1.5 shrink-0">
        <button onClick={check}
          className="btn-ghost text-xs px-2 py-1"
          title="Check status">
          {status === 'checking' ? '…' : 'Check'}
        </button>
        {isElectron && status !== 'running' && (
          <button onClick={launch} disabled={launching}
            className="btn-secondary text-xs px-2 py-1 disabled:opacity-50">
            {launching ? 'Starting…' : 'Start'}
          </button>
        )}
        {status === 'running' && (
          <span className="text-xs font-ui text-forest-400 px-2 py-1">Running</span>
        )}
      </div>
    </div>
  )
}

export default function ServicePanel() {
  const config = useAppStore(s => s.config)
  const [rebooting, setRebooting] = useState(false)

  const ttsEnabled    = config?.tts?.enabled
  const ttsProvider   = config?.tts?.provider || 'kokoro'
  const imageEnabled  = config?.image?.enabled

  function relaunch() {
    if (!isElectron || !window.tavern?.app?.relaunch) return
    setRebooting(true)
    window.tavern.app.relaunch()
  }

  return (
    <div className="space-y-3">
      <div className="bg-ink-800 border border-ink-700 rounded-lg divide-y divide-ink-700">
        <ServiceRow
          id="chroma"
          label="ChromaDB"
          description="RAG memory — stores and retrieves game events"
          visible={true}
        />
        <ServiceRow
          id="sdnext"
          label="SDNext"
          description="Local image generation (Stable Diffusion)"
          visible={!!imageEnabled}
        />
        <ServiceRow
          id="kokoro"
          label="Kokoro TTS"
          description="Local voice narration"
          visible={!!(ttsEnabled && ttsProvider === 'kokoro')}
        />
        <ServiceRow
          id="chatterbox"
          label="Chatterbox TTS"
          description="Expressive local voice narration"
          visible={!!(ttsEnabled && ttsProvider === 'chatterbox')}
        />
      </div>

      {!imageEnabled && !ttsEnabled && (
        <p className="text-xs text-parchment-500 font-ui text-center py-1">
          Enable image generation or TTS in settings above to see those services here.
        </p>
      )}

      <button
        onClick={relaunch}
        disabled={rebooting || !isElectron}
        className="w-full btn-ghost text-sm text-crimson-300 hover:text-crimson-200 disabled:opacity-40 mt-1"
      >
        {rebooting ? 'Restarting…' : '↺ Restart Vellicore'}
      </button>
    </div>
  )
}
