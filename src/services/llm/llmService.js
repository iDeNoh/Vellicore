/**
 * LLM Service — abstraction layer over Claude API, Ollama, and OpenAI-compatible endpoints.
 * All DM interactions go through this module. Swap provider in config; everything else
 * in the app stays identical.
 */

// ── Types / constants ─────────────────────────────────────────────────────────

export const LLM_PROVIDERS = {
  CLAUDE: 'claude',
  OLLAMA: 'ollama',
  OPENAI_COMPAT: 'openai-compat',
  LMSTUDIO: 'lmstudio',   // LM Studio — aliases to openai-compat routing
}

// LM Studio's default server address
export const LMSTUDIO_DEFAULT_URL = 'http://localhost:1234'

const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5'
const CLAUDE_QUALITY_MODEL = 'claude-sonnet-4-6'

// ── Proxy-aware HTTP helper ──────────────────────────────────────────────────
// In Electron, all LLM calls are routed through the main process via IPC
// to avoid CORS restrictions in the renderer. Outside Electron (dev browser),
// we fall back to direct fetch.

async function llmFetch(url, headers, body) {
  if (typeof window !== 'undefined' && window.tavern?.llm) {
    // Electron path — proxy through main process (no CORS)
    const result = await window.tavern.llm.send({ url, headers, body })
    if (!result.ok) {
      throw new Error(`LLM request failed ${result.status || ''}: ${result.error || 'unknown error'}`)
    }
    return result  // { ok, data?, streaming?, chunks? }
  }
  // Dev/browser fallback — direct fetch (works when CSP allows it)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`)
  }
  return { ok: true, _res: res }
}

// ── Core send function ────────────────────────────────────────────────────────

/**
 * Send a chat completion request to the configured LLM provider.
 *
 * @param {object} opts
 * @param {string} opts.system          - System prompt
 * @param {Array}  opts.messages        - [{role, content}] history
 * @param {object} opts.config          - App config.llm object
 * @param {number} [opts.maxTokens]     - Max tokens in response
 * @param {number} [opts.temperature]   - 0–1 temperature
 * @param {function} [opts.onChunk]     - Streaming callback (string chunk)
 * @returns {Promise<string>}           - Full response text
 */
export async function sendToLlm({ system, messages, config, maxTokens = 1024, temperature = 0.85, onChunk }) {
  switch (config.provider) {
    case LLM_PROVIDERS.CLAUDE:
      return sendToClaude({ system, messages, config, maxTokens, temperature, onChunk })
    case LLM_PROVIDERS.OLLAMA:
      return sendToOllama({ system, messages, config, maxTokens, temperature, onChunk })
    case LLM_PROVIDERS.OPENAI_COMPAT:
      return sendToOpenAiCompat({ system, messages, config, maxTokens, temperature, onChunk })
    case LLM_PROVIDERS.LMSTUDIO:
      // LM Studio exposes an OpenAI-compatible API — route identically
      // but use lmstudio-specific config fields with openai-compat fallbacks
      return sendToOpenAiCompat({
        system, messages,
        config: {
          ...config,
          openAiCompatUrl: config.lmstudioUrl || config.openAiCompatUrl || LMSTUDIO_DEFAULT_URL,
          openAiCompatKey: config.lmstudioKey || config.openAiCompatKey || 'lm-studio',
          openAiCompatModel: config.lmstudioModel || config.openAiCompatModel || '',
        },
        maxTokens, temperature, onChunk,
      })
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
}

// ── Claude (Anthropic) ────────────────────────────────────────────────────────

async function sendToClaude({ system, messages, config, maxTokens, temperature, onChunk }) {
  if (!config.claudeApiKey) throw new Error('Claude API key not configured')

  const model = config.claudeModel || CLAUDE_DEFAULT_MODEL
  const url = 'https://api.anthropic.com/v1/messages'
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.claudeApiKey,
    'anthropic-version': '2023-06-01',
  }
  const body = { model, max_tokens: maxTokens, temperature, system, messages, stream: !!onChunk }

  const result = await llmFetch(url, headers, body)

  // Proxied path — main process buffered the SSE chunks
  if (result.chunks) {
    return replayChunks(result.chunks, onChunk, 'claude')
  }

  // Direct path — have a real Response object
  if (onChunk) return streamResponse(result._res, onChunk, 'claude')

  const data = result.data || await result._res.json()
  return data.content[0].text
}

// ── Ollama ────────────────────────────────────────────────────────────────────

async function sendToOllama({ system, messages, config, maxTokens, temperature, onChunk }) {
  const url = `${(config.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/chat`
  const model = config.ollamaModel || 'llama3.1'
  const headers = { 'Content-Type': 'application/json' }
  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...(messages || []),
    ],
    stream: !!onChunk,
    options: { temperature, num_predict: maxTokens },
  }

  const result = await llmFetch(url, headers, body)

  if (result.chunks) return replayChunks(result.chunks, onChunk, 'ollama')
  if (onChunk) return streamResponse(result._res, onChunk, 'ollama')

  const data = result.data || await result._res.json()
  return data.message.content
}

// ── OpenAI-compatible (LM Studio, Jan, llama.cpp server, etc.) ────────────────

async function sendToOpenAiCompat({ system, messages, config, maxTokens, temperature, onChunk }) {
  const baseUrl = (config.openAiCompatUrl || '').replace(/\/$/, '')
  const url = `${baseUrl}/v1/chat/completions`
  const headers = {
    'Content-Type': 'application/json',
    ...(config.openAiCompatKey && { Authorization: `Bearer ${config.openAiCompatKey}` }),
  }

  // Build messages — only include system when non-empty
  // LM Studio errors on null/undefined system content
  const builtMessages = [
    ...(system && system.trim() ? [{ role: 'system', content: system }] : []),
    ...(messages || []),
  ]

  const body = {
    messages: builtMessages,
    max_tokens: maxTokens,
    temperature,
    stream: !!onChunk,
  }

  // Omit model when not set — LM Studio uses its actively loaded model
  // and will error if given an unrecognised model name
  const modelName = (config.openAiCompatModel || '').trim()
  if (modelName) body.model = modelName

  const result = await llmFetch(url, headers, body)

  if (result.chunks) return replayChunks(result.chunks, onChunk, 'openai')
  if (onChunk) return streamResponse(result._res, onChunk, 'openai')

  const data = result.data || await result._res.json()
  return data.choices[0].message.content
}

// ── Streaming reader (direct fetch path) ─────────────────────────────────────

async function streamResponse(res, onChunk, format) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let reasoningFull = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const lines = decoder.decode(value).split('\n').filter(Boolean)

    for (const line of lines) {
      let chunk = ''
      let reasoningChunk = ''

      if (format === 'claude') {
        if (!line.startsWith('data: ')) continue
        try {
          const parsed = JSON.parse(line.slice(6))
          if (parsed.type === 'content_block_delta') {
            chunk = parsed.delta?.text || ''
          }
        } catch { continue }
      } else if (format === 'ollama') {
        try {
          const parsed = JSON.parse(line)
          chunk = parsed.message?.content || ''
        } catch { continue }
      } else if (format === 'openai') {
        if (!line.startsWith('data: ')) continue
        if (line.includes('[DONE]')) continue
        try {
          const parsed = JSON.parse(line.slice(6))
          const delta = parsed.choices?.[0]?.delta || {}
          chunk = delta.content || ''
          reasoningChunk = delta.reasoning_content || ''
        } catch { continue }
      }

      if (chunk) {
        full += chunk
        onChunk(chunk)
      }
      if (reasoningChunk) {
        reasoningFull += reasoningChunk
      }
    }
  }

  // Thinking model fallback
  if (!full && reasoningFull) {
    onChunk(reasoningFull)
    return reasoningFull
  }

  return full
}

// ── Buffered chunk replayer (IPC proxy path) ──────────────────────────────────
// When LLM calls are proxied through the main process, they return raw SSE
// line arrays. This replays them through the same parser as streamResponse,
// calling onChunk for each piece of content.

function replayChunks(chunks, onChunk, format) {
  let full = ''
  let reasoningFull = ''  // collects reasoning_content separately
  const lines = chunks.join('').split('\n').filter(Boolean)

  for (const line of lines) {
    let chunk = ''
    let reasoningChunk = ''

    if (format === 'claude') {
      if (!line.startsWith('data: ')) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        if (parsed.type === 'content_block_delta') chunk = parsed.delta?.text || ''
      } catch { continue }
    } else if (format === 'ollama') {
      try {
        const parsed = JSON.parse(line)
        chunk = parsed.message?.content || ''
      } catch { continue }
    } else if (format === 'openai') {
      if (!line.startsWith('data: ')) continue
      if (line.includes('[DONE]')) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        const delta = parsed.choices?.[0]?.delta || {}
        chunk = delta.content || ''
        // Collect reasoning_content from thinking models (Qwen3, DeepSeek-R1, etc.)
        reasoningChunk = delta.reasoning_content || ''
      } catch { continue }
    }

    if (chunk) {
      full += chunk
      onChunk?.(chunk)
    }
    if (reasoningChunk) {
      reasoningFull += reasoningChunk
    }
  }

  // If thinking model returned nothing in content but has reasoning, use reasoning
  if (!full && reasoningFull) {
    onChunk?.(reasoningFull)
    return reasoningFull
  }

  return full
}

// ── LM Studio helpers ────────────────────────────────────────────────────────

/**
 * Fetch the list of loaded models from LM Studio's /v1/models endpoint.
 * LM Studio only lists models that are currently loaded.
 */
export async function fetchLmStudioModels(baseUrl) {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return { ok: false, models: [] }
    const data = await res.json()
    const models = (data.data || []).map(m => m.id)
    return { ok: true, models }
  } catch (e) {
    return { ok: false, error: e.message, models: [] }
  }
}

// ── Utility: build a DM context packet ───────────────────────────────────────

/**
 * Build the structured JSON context that gets injected into every DM prompt.
 * Keeps Claude aware of the full game state without blowing the context window.
 */
export function buildContextPacket({ campaign, world, characters, story, recentMessages }) {
  return {
    campaign: {
      name: campaign?.name,
      setting: campaign?.setting,
      tone: campaign?.tone,
      currentAct: story?.currentAct,
    },
    currentLocation: world?.locations?.[world?.currentLocation] || null,
    activeCharacters: Object.values(characters || {}).map(c => ({
      name: c.name,
      ancestry: c.ancestry,
      body: c.stats?.body,
      mind: c.stats?.mind,
      spirit: c.stats?.spirit,
      hp: c.hp,
      maxHp: c.maxHp,
      conditions: c.conditions || [],
      inventory: (c.inventory || []).slice(0, 10),  // cap for token budget
    })),
    activeQuests: story?.activeQuests?.slice(0, 5) || [],
    recentFlags: Object.entries(story?.globalFlags || {})
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .slice(-20),
    recentHistory: recentMessages?.slice(-8) || [],
  }
}
