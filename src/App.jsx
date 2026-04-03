import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { initDatabase } from '@/services/db/database'
import { setChatterboxVoicesCache, checkChatterbox, checkKokoro } from '@/services/tts/ttsService'
import { checkRagHealth } from '@/services/rag/ragService'
import { remoteTavern, probeApiServer } from '@/lib/remoteTavern'

// Pages
import SetupPage from '@/pages/SetupPage'
import LobbyPage from '@/pages/LobbyPage'
import CharacterCreatePage from '@/pages/CharacterCreatePage'
import GamePage from '@/pages/GamePage'
import SettingsPage from '@/pages/SettingsPage'
import PetricorePage from '@/pages/PetricorePage'

// Layout
import AppShell from '@/components/layout/AppShell'
import LoadingScreen from '@/components/ui/LoadingScreen'

function defaultConfig() {
  return {
    llm: {
      provider: 'claude',
      claudeApiKey: '',
      claudeModel: '',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.1',
      lmstudioUrl: 'http://localhost:1234',
      lmstudioModel: '',
      openAiCompatUrl: '',
      openAiCompatKey: '',
      openAiCompatModel: '',
      geminiApiKey: '',
      geminiModel: 'gemini-2.0-flash',
    },
    image: {
      enabled: false,
      sdnextUrl: 'http://localhost:7860',
      style: 'fantasy art, detailed, dramatic lighting',
    },
    tts: {
      enabled: false,
      kokoroUrl: 'http://localhost:8880',
      dmVoice: 'af_sky',
      playerVoice: '',
      chatterboxPlayerVoice: '',
      speed: 1.0,
    },
    app: {
      autoImage: false,
      autoTts: false,
      mapGridVisible: true,
      adultContent: false,
      goreLevel: 'moderate',  // 'none' | 'moderate' | 'explicit'
    },
    rag: {
      enabled: true,
      threshold: 0.65,
      maxResults: 5,
      storeAllResponses: false,
    },
    services: {
      chromaPath:       'C:\\AI\\chromadb',
      sdnextPath:       'E:\\AI\\SDNext',
      sdnextArgs:       '--api --listen',
      kokoroPath:       'C:\\AI\\kokoro',
      kokoroScript:     'serve.py',
      chatterboxPath:   'C:\\AI\\chatterbox',
      chatterboxScript: 'app.py',
    },
  }
}

/**
 * Silently probe configured local services on boot.
 * - If TTS is enabled: verify the provider is reachable; for Chatterbox, also fetch voices.
 * - If Ollama/LM Studio is configured: do a health probe so connection errors surface early.
 * All failures are silent — never blocks the UI.
 */
async function autoConnectLocalServices(cfg) {
  const tts = cfg?.tts
  const llm = cfg?.llm

  if (tts?.enabled) {
    const provider = tts.provider || 'kokoro'
    if (provider === 'chatterbox') {
      const url = tts.chatterboxUrl || 'http://localhost:8004'
      try {
        // checkChatterbox proxies through window.tavern so it works on mobile too
        const r = await checkChatterbox(url)
        if (r.ok && r.voices?.length > 0) {
          setChatterboxVoicesCache(r.voices)
          console.info(`[AutoConnect] Chatterbox: loaded ${r.voices.length} voices from ${url}`)
        }
      } catch {
        // silent
      }
    } else if (provider === 'kokoro') {
      checkKokoro(tts.kokoroUrl || 'http://localhost:8880').catch(() => {})
    }
  }

  // Probe LLM providers for early error detection (does not change config)
  if (llm?.provider === 'ollama' && llm.ollamaUrl) {
    try {
      await fetch(`${llm.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    } catch {
      // silent
    }
  }
  if (llm?.provider === 'lmstudio' && llm.lmstudioUrl) {
    try {
      await fetch(`${llm.lmstudioUrl}/v1/models`, { signal: AbortSignal.timeout(3000) })
    } catch {
      // silent
    }
  }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const { config, setConfig, isFirstRun, setFirstRun, setRagAvailable } = useAppStore()

  useEffect(() => {
    async function boot() {
      // If not running inside Electron, probe the companion API server.
      // If reachable, wire up remoteTavern so all services work transparently.
      if (!window.tavern) {
        const reachable = await probeApiServer()
        if (reachable) {
          window.tavern = remoteTavern
          console.info('[Boot] Remote mode: companion API server found — using REST bridge')
        } else {
          console.info('[Boot] Browser mode: no companion server — using local fallbacks')
        }
      }

      const wlog = (level, cat, msg) => {
        console.log(`[${cat}] ${msg}`)
        window.tavern?.log?.write(level, cat, msg)
      }

      try {
        // Print log path once so it's easy to find
        const logPath = await window.tavern?.log?.getPath?.()
        if (logPath) console.log(`[LOG] Session log: ${logPath}`)

        // Load config — from Electron if available, otherwise localStorage
        let cfg
        if (window.tavern) {
          cfg = await window.tavern.config.load()
        } else {
          const stored = localStorage.getItem('vellicore-config')
          cfg = stored ? JSON.parse(stored) : defaultConfig()
        }
        setConfig(cfg)
        wlog('INFO', 'BOOT', `Config loaded — provider=${cfg.llm?.provider || '?'}`)

        // First run = no API key set and no ollama configured
        const hasLlm = cfg.llm.claudeApiKey || cfg.llm.geminiApiKey || cfg.llm.ollamaUrl || cfg.llm.lmstudioUrl || cfg.llm.openAiCompatUrl
        setFirstRun(!hasLlm)

        // Initialize SQLite database
        await initDatabase()
        wlog('INFO', 'BOOT', 'SQLite database ready')

        // Auto-connect to configured local services — fire and forget, never blocks boot
        autoConnectLocalServices(cfg)

        // Check RAG/ChromaDB availability
        try {
          const ragHealthy = await checkRagHealth()
          useAppStore.getState().setRagAvailable(ragHealthy)
          wlog(ragHealthy ? 'INFO' : 'WARN ', 'BOOT',
            ragHealthy ? 'ChromaDB connected on port 8765' : 'ChromaDB not available — memory features disabled')
        } catch (err) {
          useAppStore.getState().setRagAvailable(false)
          wlog('ERROR', 'BOOT', `RAG health check threw: ${err.message}`)
        }
      } catch (err) {
        console.error('Boot error:', err)
        window.tavern?.log?.write('ERROR', 'BOOT', `Boot failed: ${err.message}`)
      } finally {
        setBooting(false)
      }
    }

    boot()
  }, [])

  if (booting) return <LoadingScreen />

  return (
    <HashRouter>
      <Routes>
        {/* First-run setup wizard */}
        <Route path="/setup" element={<SetupPage />} />

        {/* Main app shell wraps all in-app routes */}
        <Route element={<AppShell />}>
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/character/create/:campaignId" element={<CharacterCreatePage />} />
          <Route path="/game/:campaignId" element={<GamePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/petricore" element={<PetricorePage />} />
        </Route>

        {/* Root redirect */}
        <Route
          path="/"
          element={<Navigate to={isFirstRun ? '/setup' : '/lobby'} replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
