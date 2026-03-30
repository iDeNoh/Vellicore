/**
 * apiServer.js — Companion HTTP API for phone/browser access.
 *
 * Mirrors every Electron IPC handler as a REST endpoint so the Vite UI can
 * be loaded on a phone over the local network and still hit the real SQLite
 * database, LLM proxy, TTS, and RAG services.
 *
 * Runs on port 3717 alongside the Electron renderer.
 * The frontend detects the absence of window.tavern and falls back to this.
 */

const http    = require('http')
const express = require('express')
const cors    = require('cors')

const API_PORT = 3717

module.exports = function startApiServer({ db, log, fetch: nodeFetch }) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '50mb' }))

  // ── Utility ──────────────────────────────────────────────────────────────────

  function ok(res, data)  { res.json({ ok: true,  ...data }) }
  function err(res, msg, status = 500) { res.status(status).json({ ok: false, error: msg }) }

  function wrap(fn) {
    return async (req, res) => {
      try { await fn(req, res) }
      catch (e) { err(res, e.message) }
    }
  }

  // ── Config ───────────────────────────────────────────────────────────────────

  const path = require('path')
  const fs   = require('fs')
  const { app: electronApp } = require('electron')

  function configPath() {
    return path.join(electronApp.getPath('userData'), 'config.json')
  }

  app.get('/api/config', wrap((req, res) => {
    try {
      const raw = fs.readFileSync(configPath(), 'utf8')
      ok(res, { config: JSON.parse(raw) })
    } catch {
      ok(res, { config: {} })
    }
  }))

  app.post('/api/config', wrap((req, res) => {
    fs.writeFileSync(configPath(), JSON.stringify(req.body, null, 2), 'utf8')
    ok(res, {})
  }))

  // ── Campaigns ────────────────────────────────────────────────────────────────

  app.get('/api/campaigns', wrap((req, res) => {
    ok(res, { data: db.campaigns.getAll() })
  }))

  app.get('/api/campaigns/:id', wrap((req, res) => {
    ok(res, { data: db.campaigns.getById(req.params.id) })
  }))

  app.post('/api/campaigns', wrap((req, res) => {
    ok(res, { data: db.campaigns.create(req.body) })
  }))

  app.patch('/api/campaigns/:id', wrap((req, res) => {
    ok(res, { data: db.campaigns.update(req.params.id, req.body) })
  }))

  app.delete('/api/campaigns/:id', wrap((req, res) => {
    ok(res, { data: db.campaigns.delete(req.params.id) })
  }))

  // ── Characters ───────────────────────────────────────────────────────────────

  app.get('/api/campaigns/:id/characters', wrap((req, res) => {
    ok(res, { data: db.characters.getByCampaign(req.params.id) })
  }))

  app.get('/api/characters/:id', wrap((req, res) => {
    ok(res, { data: db.characters.getById(req.params.id) })
  }))

  app.post('/api/characters', wrap((req, res) => {
    ok(res, { data: db.characters.create(req.body) })
  }))

  app.patch('/api/characters/:id', wrap((req, res) => {
    ok(res, { data: db.characters.update(req.params.id, req.body) })
  }))

  // ── Messages ─────────────────────────────────────────────────────────────────

  app.get('/api/campaigns/:id/messages', wrap((req, res) => {
    const limit  = parseInt(req.query.limit)  || 200
    const offset = parseInt(req.query.offset) || 0
    ok(res, { data: db.messages.getByCampaign(req.params.id, limit, offset) })
  }))

  app.post('/api/messages', wrap((req, res) => {
    ok(res, { data: db.messages.create(req.body) })
  }))

  app.post('/api/messages/bulk', wrap((req, res) => {
    ok(res, { data: db.messages.bulkCreate(req.body) })
  }))

  // ── Sessions ─────────────────────────────────────────────────────────────────

  app.get('/api/campaigns/:id/sessions', wrap((req, res) => {
    ok(res, { data: db.sessions.getByCampaign(req.params.id) })
  }))

  app.post('/api/sessions', wrap((req, res) => {
    ok(res, { data: db.sessions.create(req.body) })
  }))

  app.patch('/api/sessions/:id/end', wrap((req, res) => {
    ok(res, { data: db.sessions.end(req.params.id, req.body.summary) })
  }))

  // ── World state ──────────────────────────────────────────────────────────────

  app.get('/api/campaigns/:id/world', wrap((req, res) => {
    ok(res, { data: db.worldState.get(req.params.id) })
  }))

  app.post('/api/campaigns/:id/world', wrap((req, res) => {
    const { world, story } = req.body
    ok(res, { data: db.worldState.set(req.params.id, world, story) })
  }))

  // ── NPCs ─────────────────────────────────────────────────────────────────────

  app.get('/api/campaigns/:id/npcs', wrap((req, res) => {
    ok(res, { data: db.npcs.getByCampaign(req.params.id) })
  }))

  app.post('/api/npcs', wrap((req, res) => {
    ok(res, { data: db.npcs.upsert(req.body) })
  }))

  // ── Resources ────────────────────────────────────────────────────────────────

  app.get('/api/campaigns/:id/resources', wrap((req, res) => {
    ok(res, { data: db.resources.getByCampaign(req.params.id) })
  }))

  app.get('/api/resources/:id', wrap((req, res) => {
    ok(res, { data: db.resources.getById(req.params.id) })
  }))

  app.post('/api/resources', wrap((req, res) => {
    ok(res, { data: db.resources.create(req.body) })
  }))

  app.delete('/api/resources/:id', wrap((req, res) => {
    ok(res, { data: db.resources.delete(req.params.id) })
  }))

  app.patch('/api/resources/:id/indexed', wrap((req, res) => {
    ok(res, { data: db.resources.setIndexed(req.params.id, req.body.chunkCount) })
  }))

  // ── LLM proxy ────────────────────────────────────────────────────────────────
  // Proxies LLM calls through the main process to avoid CORS on the phone.
  // - SSE / streaming responses  → returns { ok, chunks } for replayChunks
  // - JSON / non-streaming       → returns { ok, data } for direct data path

  app.post('/api/llm', wrap(async (req, res) => {
    const { url, headers, body } = req.body

    const response = await nodeFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      return err(res, `LLM ${response.status}: ${text.slice(0, 300)}`, response.status)
    }

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      // Streaming SSE — buffer all chunks and return for replayChunks
      const chunks = []
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }
      return ok(res, { chunks })
    }

    // Non-streaming JSON response — parse and return as data
    const data = await response.json()
    ok(res, { data })
  }))

  // ── TTS proxy ────────────────────────────────────────────────────────────────

  app.post('/api/tts', wrap(async (req, res) => {
    const { url, body, endpoint, timeout: timeoutMs } = req.body
    const fullUrl = `${url}${endpoint || '/v1/audio/speech'}`
    const response = await nodeFetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || 30_000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      return err(res, `TTS ${response.status}: ${errText.slice(0, 200)}`, response.status)
    }

    const buffer = await response.arrayBuffer()
    const base64  = Buffer.from(buffer).toString('base64')
    ok(res, { audio: base64, contentType: response.headers.get('content-type') || 'audio/wav' })
  }))

  // ── RAG proxy ────────────────────────────────────────────────────────────────

  const CHROMA_BASE = 'http://localhost:8765'
  const EMBED_BASE  = 'http://127.0.0.1:8766'

  app.post('/api/rag/request', wrap(async (req, res) => {
    const { method = 'GET', path: ragPath, body } = req.body
    const response = await nodeFetch(`${CHROMA_BASE}${ragPath}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      return ok(res, { ok: false, status: response.status, error: errText.slice(0, 300) })
    }
    const data = await response.json().catch(() => ({}))
    ok(res, { ok: true, status: response.status, data })
  }))

  app.post('/api/rag/embed', wrap(async (req, res) => {
    const { texts } = req.body
    const response = await nodeFetch(`${EMBED_BASE}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      return ok(res, { ok: false, error: errText.slice(0, 200) })
    }
    const data = await response.json().catch(() => ({}))
    ok(res, { ok: true, data })
  }))

  // ── Health checks ────────────────────────────────────────────────────────────

  app.post('/api/health', wrap(async (req, res) => {
    const { type, url } = req.body
    const base = (url || '').replace(/\/$/, '')
    try {
      if (type === 'ollama') {
        const r = await nodeFetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) })
        const data = await r.json().catch(() => ({}))
        return ok(res, { ok: r.ok, models: data.models?.map(m => m.name) || [] })
      }
      if (type === 'sdnext') {
        const r = await nodeFetch(`${base}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(3000) })
        const data = await r.json().catch(() => [])
        return ok(res, { ok: r.ok, models: Array.isArray(data) ? data.map(m => m.model_name) : [] })
      }
      if (type === 'kokoro') {
        const r = await nodeFetch(`${base}/health`, { signal: AbortSignal.timeout(3000) })
        return ok(res, { ok: r.ok })
      }
      if (type === 'chatterbox') {
        const [statusRes, voicesRes] = await Promise.all([
          nodeFetch(`${base}/api/ui/initial-data`, { signal: AbortSignal.timeout(4000) }),
          nodeFetch(`${base}/get_predefined_voices`,  { signal: AbortSignal.timeout(4000) }),
        ])
        if (!statusRes.ok) return ok(res, { ok: false, error: `HTTP ${statusRes.status}` })
        const data = await voicesRes.json().catch(() => null)
        const voices = Array.isArray(data) ? data : (data?.voices || [])
        return ok(res, { ok: true, voices })
      }
      if (type === 'lmstudio') {
        const r = await nodeFetch(`${base}/v1/models`, { signal: AbortSignal.timeout(4000) })
        const data = await r.json().catch(() => ({}))
        return ok(res, { ok: r.ok, models: (data.data || []).map(m => m.id) })
      }
      err(res, `Unknown health check type: ${type}`, 400)
    } catch (e) {
      ok(res, { ok: false, error: e.message })
    }
  }))

  // ── PDF parsing ───────────────────────────────────────────────────────────────

  app.post('/api/fs/parse-pdf', wrap(async (req, res) => {
    const { PDFParse } = require('pdf-parse')
    const { data: base64 } = req.body
    if (!base64) return err(res, 'Missing data', 400)
    const buffer = Buffer.from(base64, 'base64')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    const info   = await parser.getInfo()
    await parser.destroy()
    ok(res, { text: result.text, pages: info.total })
  }))

  app.get('/api/ping', (req, res) => res.json({ ok: true, version: '1' }))

  // ── Start ─────────────────────────────────────────────────────────────────────

  const server = http.createServer(app)
  server.listen(API_PORT, '0.0.0.0', () => {
    log('API', `Companion API server listening on port ${API_PORT}`)
  })
  server.on('error', (e) => {
    log('API', `Failed to start companion API server: ${e.message}`, 'WARN')
  })

  return server
}
