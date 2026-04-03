const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { applyNameFilter } = require('./nameFilter')

// pdfjs-dist (bundled inside pdf-parse) references browser canvas globals at load time.
// Stub them out so the module loads cleanly in the main process.
if (!global.DOMMatrix)  global.DOMMatrix  = class DOMMatrix  { constructor() { return this } }
if (!global.ImageData)  global.ImageData  = class ImageData  {}
if (!global.Path2D)     global.Path2D     = class Path2D     {}
const { PDFParse } = require('pdf-parse')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Session logger ─────────────────────────────────────────────────────────────
// Writes everything to logs/session.log, overwritten on each launch.
// All external service calls (LLM, RAG, embed, TTS, image) are logged here.
// Renderer can push additional entries via the log:write IPC handler.

const LOG_DIR  = path.join(__dirname, '..', 'logs')
const LOG_PATH = path.join(LOG_DIR, 'session.log')
let   logStream = null

function initLogger() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    logStream = fs.createWriteStream(LOG_PATH, { flags: 'w', encoding: 'utf8' })
    const bar = '═'.repeat(60)
    logStream.write(`${bar}\n  VELLICORE SESSION LOG\n  ${new Date().toISOString()}\n${bar}\n\n`)
  } catch (e) {
    console.error('[Logger] init failed:', e.message)
  }
}

function ts() {
  return new Date().toTimeString().slice(0, 12) // HH:MM:SS.mmm
}

/** One-line entry: [HH:MM:SS.mmm] [LEVEL] [CAT] message */
function log(cat, msg, level = 'INFO') {
  try {
    const line = `[${ts()}] [${level.padEnd(5)}] [${cat.padEnd(9)}] ${msg}\n`
    logStream?.write(line)
  } catch {}
}

/** Multi-line block with a header and body — used for LLM prompts/responses */
function logBlock(cat, header, body, level = 'INFO') {
  try {
    const div = '─'.repeat(60)
    logStream?.write(`\n${div}\n[${ts()}] [${level.padEnd(5)}] [${cat.padEnd(9)}] ${header}\n${div}\n${body}\n`)
  } catch {}
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    backgroundColor: '#0d0d0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
    icon: path.join(__dirname, '../resources/icon.png'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  initLogger()
  log('STARTUP', `Vellicore starting — isDev=${isDev}`)
  initDb()
  createWindow()
  // Start companion HTTP API so the UI is accessible from phones on the LAN
  try {
    const startApiServer = require('./apiServer')
    // Pass a proxy so routes always hit the live tavernDb (set by initDb above)
    const dbProxy = new Proxy({}, { get: (_, key) => tavernDb?.[key] })
    startApiServer({ db: dbProxy, log, fetch })
  } catch (e) {
    log('API', `Companion API server failed to start: ${e.message}`, 'WARN')
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  tavernDb?.close()
  if (process.platform !== 'darwin') app.quit()
})

// ── Database setup ────────────────────────────────────────────────────────────

let tavernDb = null
const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'tavern.db')

function initDb() {
  try {
    tavernDb = require('./db')
    tavernDb.setUserDataPath(userDataPath)
    tavernDb.init(dbPath)
  } catch (err) {
    console.error('[DB] Failed to initialise:', err.message)
    // App continues — renderer will fall back to in-memory store
  }
}

// ── IPC: Config ───────────────────────────────────────────────────────────────

const configPath = path.join(userDataPath, 'config.json')

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch (e) { console.error('Failed to load config:', e) }
  return getDefaultConfig()
}

function getDefaultConfig() {
  return {
    llm: {
      provider: 'claude', claudeApiKey: '',
      ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1',
      openAiCompatUrl: '', openAiCompatKey: '', openAiCompatModel: '',
    },
    image: { enabled: true, sdnextUrl: 'http://localhost:7860', defaultModel: '', style: 'fantasy art, detailed illustration' },
    tts: {
      enabled: true,
      provider: 'kokoro',
      // Kokoro
      kokoroUrl: 'http://localhost:8880', dmVoice: 'bm_george', speed: 1.0,
      // Chatterbox
      chatterboxUrl: 'http://localhost:8004',
      chatterboxDmVoice: '',
      chatterboxTurbo: true,
      chatterboxExaggeration: 0.5,
      chatterboxCfgWeight: 0.5,
    },
    app: { theme: 'dark', fontSize: 'md', mapGridVisible: true, autoTts: true, autoImage: true },
    rag: {
      enabled: true,
      threshold: 0.65,
      maxResults: 5,
      storeAllResponses: false,
    },
  }
}

ipcMain.handle('config:load', () => loadConfig())
ipcMain.handle('config:save', (_, config) => {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('config:get-user-data-path', () => userDataPath)
ipcMain.handle('db:get-path', () => dbPath)

// ── IPC: Campaigns ────────────────────────────────────────────────────────────

ipcMain.handle('db:campaigns:all',    ()        => { try { return tavernDb?.campaigns.getAll() ?? [] } catch(e) { return [] } })
ipcMain.handle('db:campaigns:get',    (_, id)   => { try { return tavernDb?.campaigns.getById(id) ?? null } catch(e) { return null } })
ipcMain.handle('db:campaigns:create', (_, data) => { try { return tavernDb?.campaigns.create(data) ?? data } catch(e) { return data } })
ipcMain.handle('db:campaigns:update', (_, id, data) => { try { tavernDb?.campaigns.update(id, data) } catch(e) {} return { ok: true } })
ipcMain.handle('db:campaigns:delete', (_, id)   => { try { tavernDb?.campaigns.delete(id) } catch(e) {} return { ok: true } })

// ── IPC: Characters ───────────────────────────────────────────────────────────

ipcMain.handle('db:characters:by-campaign', (_, campaignId) => tavernDb?.characters.getByCampaign(campaignId) ?? [])
ipcMain.handle('db:characters:get',         (_, id)          => tavernDb?.characters.getById(id) ?? null)
ipcMain.handle('db:characters:create',      (_, data)        => tavernDb?.characters.create(data) ?? data)
ipcMain.handle('db:characters:update',      (_, id, data)    => { tavernDb?.characters.update(id, data); return { ok: true } })

// ── IPC: Messages ─────────────────────────────────────────────────────────────

ipcMain.handle('db:messages:by-campaign', (_, campaignId, limit, offset) =>
  tavernDb?.messages.getByCampaign(campaignId, limit, offset) ?? [])
ipcMain.handle('db:messages:create',      (_, data)  => tavernDb?.messages.create(data) ?? data.id)
ipcMain.handle('db:messages:bulk-create', (_, msgs)  => { tavernDb?.messages.bulkCreate(msgs); return { ok: true } })

// ── IPC: Sessions ─────────────────────────────────────────────────────────────

ipcMain.handle('db:sessions:by-campaign', (_, campaignId) => tavernDb?.sessions.getByCampaign(campaignId) ?? [])
ipcMain.handle('db:sessions:create',      (_, data)       => tavernDb?.sessions.create(data) ?? data.id)
ipcMain.handle('db:sessions:end',         (_, id, summary) => { tavernDb?.sessions.end(id, summary); return { ok: true } })

// ── IPC: World state ──────────────────────────────────────────────────────────

ipcMain.handle('db:world:get',  (_, campaignId)          => tavernDb?.worldState.get(campaignId) ?? null)
ipcMain.handle('db:world:set',  (_, campaignId, world, story) => {
  tavernDb?.worldState.set(campaignId, world, story)
  return { ok: true }
})

// ── IPC: NPCs ─────────────────────────────────────────────────────────────────

ipcMain.handle('db:npcs:by-campaign', (_, campaignId) => tavernDb?.npcs.getByCampaign(campaignId) ?? [])
ipcMain.handle('db:npcs:upsert',      (_, data)       => tavernDb?.npcs.upsert(data) ?? data.id)

// ── IPC: PDF extraction ───────────────────────────────────────────────────────

ipcMain.handle('fs:parse-pdf', async (_, buffer) => {
  try {
    const parser = new PDFParse({ data: Buffer.from(buffer) })
    const result = await parser.getText()
    const info   = await parser.getInfo()
    await parser.destroy()
    return { ok: true, text: result.text, pages: info.total }
  } catch (err) {
    log('PDF', `Parse failed: ${err.message}`, 'WARN')
    return { ok: false, error: err.message }
  }
})

// ── IPC: Resources ────────────────────────────────────────────────────────────

ipcMain.handle('db:resources:by-campaign', (_, campaignId) => tavernDb?.resources.getByCampaign(campaignId) ?? [])
ipcMain.handle('db:resources:get',         (_, id)         => tavernDb?.resources.getById(id) ?? null)
ipcMain.handle('db:resources:create',      (_, data)       => tavernDb?.resources.create(data) ?? data)
ipcMain.handle('db:resources:delete',      (_, id)         => { tavernDb?.resources.delete(id); return { ok: true } })
ipcMain.handle('db:resources:set-indexed', (_, id, count)  => { tavernDb?.resources.setIndexed(id, count); return { ok: true } })

// ── IPC: File system ──────────────────────────────────────────────────────────

ipcMain.handle('fs:save-asset', async (_, { data, filename, subfolder }) => {
  const assetDir = path.join(userDataPath, 'assets', subfolder || '')
  fs.mkdirSync(assetDir, { recursive: true })
  const filePath = path.join(assetDir, filename)
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
  return filePath
})

ipcMain.handle('fs:read-asset', async (_, filePath) => {
  try { return fs.readFileSync(filePath).toString('base64') } catch { return null }
})

ipcMain.handle('fs:open-external', (_, url) => shell.openExternal(url))

// ── IPC: Health checks ────────────────────────────────────────────────────────

ipcMain.handle('health:check-ollama', async (_, url) => {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json()
    return { ok: true, models: data.models?.map(m => m.name) || [] }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('health:check-sdnext', async (_, url) => {
  try {
    const res = await fetch(`${url}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json()
    return { ok: true, models: data.map(m => m.model_name) }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('health:check-kokoro', async (_, url) => {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
    return { ok: res.ok }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('health:check-chatterbox', async (_, url) => {
  try {
    const base = url.replace(/\/$/, '')
    const [statusRes, voicesRes] = await Promise.all([
      fetch(`${base}/api/ui/initial-data`, { signal: AbortSignal.timeout(4000) }),
      fetch(`${base}/get_predefined_voices`,  { signal: AbortSignal.timeout(4000) }),
    ])
    if (!statusRes.ok) return { ok: false, error: `HTTP ${statusRes.status}` }
    let voices = []
    if (voicesRes.ok) {
      const data = await voicesRes.json().catch(() => null)
      voices = Array.isArray(data) ? data : (data?.voices || [])
    }
    return { ok: true, voices }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('health:check-lmstudio', async (_, url) => {
  try {
    const base = url.replace(/\/$/, '')
    const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    const models = (data.data || []).map(m => m.id)
    return { ok: true, models }
  } catch (e) { return { ok: false, error: e.message } }
})

// ── IPC: Dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: LLM proxy ────────────────────────────────────────────────────────────
// All LLM HTTP calls are proxied through the main process to avoid CORS
// restrictions that apply to Electron's renderer (which behaves like a browser).

ipcMain.handle('llm:get', async (_, { url, headers }) => {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('llm:send', async (_, { url, headers, body }) => {
  const t0 = Date.now()
  const provider = url.includes('anthropic') ? 'Claude'
    : url.includes('openai') ? 'OpenAI'
    : url.includes('ollama') ? 'Ollama'
    : url.includes('lmstudio') ? 'LMStudio'
    : 'LLM'
  const msgCount = body.messages?.length ?? 0
  // system may be a string or an array of cache blocks — normalise for logging
  const sysText = Array.isArray(body.system)
    ? body.system.map(b => b.text || '').join('\n\n')
    : (body.system || '')
  const sysLen  = sysText.length
  const label   = `${provider} | ${body.model || '?'} | ${msgCount} msgs | sys=${sysLen}ch | max_tokens=${body.max_tokens}`

  // Log full outbound prompt (system + messages)
  const parts = []
  if (body.system) parts.push(`── SYSTEM (${sysLen} chars) ──\n${sysText}`)
  ;(body.messages || []).forEach(m => parts.push(`── ${m.role.toUpperCase()} ──\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`))
  logBlock('LLM-OUT', label, parts.join('\n\n'))

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const contentType = res.headers.get('content-type') || ''

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      log('LLM-IN', `${provider} → HTTP ${res.status} (${Date.now()-t0}ms): ${errText.slice(0, 300)}`, 'ERROR')
      return { ok: false, status: res.status, error: errText.slice(0, 500) }
    }

    // Non-streaming: return full JSON
    if (!body.stream) {
      const data = await res.json()
      if (data.choices?.[0]?.message?.content === '' &&
          data.choices?.[0]?.message?.reasoning_content) {
        data.choices[0].message.content = data.choices[0].message.reasoning_content
      }
      const responseText = data.choices?.[0]?.message?.content || data.content?.[0]?.text || ''
      logBlock('LLM-IN', `${provider} → OK (${Date.now()-t0}ms, ${responseText.length}ch)`, responseText)
      return { ok: true, data }
    }

    // Streaming: collect full text and return it
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const chunks = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value))
    }

    logBlock('LLM-IN', `${provider} → OK streaming (${Date.now()-t0}ms, ${chunks.length} chunks, ${chunks.join('').length}ch raw)`, chunks.join(''))
    return { ok: true, streaming: true, chunks }
  } catch (err) {
    log('LLM-IN', `${provider} → ERROR (${Date.now()-t0}ms): ${err.message}`, 'ERROR')
    return { ok: false, error: err.message }
  }
})

// ── IPC: SDNext image generation proxy ────────────────────────────────────────
// Routes image generation through the main process to avoid CORS restrictions
// in the renderer. SDNext's API doesn't send CORS headers that satisfy the
// renderer's browser-like fetch, so all calls must come from Node.js.

ipcMain.handle('sdnext:generate', async (_, { url, payload }) => {
  const t0 = Date.now()
  const prompt = (payload.prompt || '').slice(0, 120)
  log('IMAGE', `SDNext → "${prompt}…" (${payload.width}x${payload.height})`)
  try {
    const res = await fetch(`${url}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      log('IMAGE', `SDNext → HTTP ${res.status} (${Date.now()-t0}ms): ${err.slice(0, 200)}`, 'ERROR')
      return { ok: false, error: `SDNext ${res.status}: ${err.slice(0, 300)}` }
    }
    const data = await res.json()
    if (!data.images?.[0]) {
      log('IMAGE', `SDNext → no images returned (${Date.now()-t0}ms)`, 'WARN ')
      return { ok: false, error: 'SDNext returned no images' }
    }
    log('IMAGE', `SDNext → OK (${Date.now()-t0}ms)`)
    return { ok: true, image: data.images[0] }
  } catch (e) {
    log('IMAGE', `SDNext → ERROR: ${e.message}`, 'ERROR')
    return { ok: false, error: e.message }
  }
})

// ── IPC: Image generation proxy ────────────────────────────────────────────────
// SDNext calls proxied through main process to avoid CORS in renderer.

ipcMain.handle('image:generate', async (_, { url, payload }) => {
  const t0 = Date.now()
  const prompt = (payload.prompt || '').slice(0, 120)
  log('IMAGE', `generate → "${prompt}…"`)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      log('IMAGE', `generate → HTTP ${res.status} (${Date.now()-t0}ms): ${err.slice(0, 200)}`, 'ERROR')
      return { ok: false, status: res.status, error: err.slice(0, 500) }
    }
    const data = await res.json()
    log('IMAGE', `generate → OK, ${data.images?.length ?? 0} image(s) (${Date.now()-t0}ms)`)
    return { ok: true, images: data.images || [] }
  } catch (err) {
    log('IMAGE', `generate → ERROR: ${err.message}`, 'ERROR')
    return { ok: false, error: err.message }
  }
})

// ── IPC: Kokoro TTS proxy ─────────────────────────────────────────────────────
// Routes TTS synthesis through the main process to avoid CORS preflight (OPTIONS)
// that Kokoro doesn't handle. Returns audio as base64 so the renderer can play it.

ipcMain.handle('tts:speak', async (_, { url, body, endpoint, timeout: timeoutMs }) => {
  const t0 = Date.now()
  const fullUrl = `${url}${endpoint || '/v1/audio/speech'}`
  const textPreview = (body.input || '').slice(0, 80)
  log('TTS', `"${textPreview}…" | voice=${body.voice || '?'} | model=${body.model || '?'}`)
  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || 30_000),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      log('TTS', `→ HTTP ${res.status} (${Date.now()-t0}ms): ${err.slice(0, 200)}`, 'ERROR')
      return { ok: false, error: `TTS ${res.status}: ${err.slice(0, 200)}` }
    }
    const buffer = await res.arrayBuffer()
    const audio = Buffer.from(buffer).toString('base64')
    const contentType = res.headers.get('content-type') || 'audio/mpeg'
    log('TTS', `→ OK (${Date.now()-t0}ms, ${buffer.byteLength} bytes)`)
    return { ok: true, audio, contentType }
  } catch (e) {
    log('TTS', `→ ERROR: ${e.message}`, 'ERROR')
    return { ok: false, error: e.message }
  }
})

// ── IPC: RAG / ChromaDB proxy + embedding sidecar ────────────────────────────

const CHROMA_BASE = 'http://localhost:8765'
const EMBED_BASE  = 'http://127.0.0.1:8766'

ipcMain.handle('rag:request', async (_, { method, path, body }) => {
  const t0 = Date.now()
  try {
    const url = `${CHROMA_BASE}${path}`
    const opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    }
    if (body) opts.body = JSON.stringify(body)

    const res = await fetch(url, opts)
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      log('CHROMA', `${method} ${path} → HTTP ${res.status} (${Date.now()-t0}ms): ${err.slice(0, 200)}`, 'ERROR')
      return { ok: false, status: res.status, error: err.slice(0, 300) }
    }

    const data = await res.json().catch(() => null)
    log('CHROMA', `${method} ${path} → 200 (${Date.now()-t0}ms)`)
    return { ok: true, data }
  } catch (err) {
    log('CHROMA', `${method} ${path} → ERROR: ${err.message}`, 'ERROR')
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('rag:embed', async (_, { texts }) => {
  const t0 = Date.now()
  try {
    const res = await fetch(`${EMBED_BASE}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      log('EMBED', `${texts.length} texts → HTTP ${res.status} (${Date.now()-t0}ms): ${err.slice(0, 200)}`, 'ERROR')
      return { ok: false, error: err.slice(0, 200) }
    }
    const data = await res.json()
    log('EMBED', `${texts.length} texts → ${data.embeddings?.length} vectors, dim=${data.embeddings?.[0]?.length} (${Date.now()-t0}ms)`)
    return { ok: true, embeddings: data.embeddings }
  } catch (err) {
    log('EMBED', `${texts.length} texts → ERROR: ${err.message}`, 'ERROR')
    return { ok: false, error: err.message }
  }
})

// ── IPC: renderer → log file passthrough ──────────────────────────────────────

ipcMain.handle('log:write', (_, { level, cat, msg }) => {
  log(cat || 'APP', msg, level || 'INFO')
})

ipcMain.handle('log:get-path', () => LOG_PATH)

// ── IPC: App control ──────────────────────────────────────────────────────────

ipcMain.handle('app:relaunch', () => {
  log('APP', 'Relaunch requested by renderer')
  app.relaunch()
  app.exit(0)
})

// ── IPC: Service launcher ─────────────────────────────────────────────────────
// Spawns local backend services (ChromaDB, SDNext, Kokoro, Chatterbox) in a
// new detached console window. Uses paths from config.services if set.

// ── IPC: Petricore ────────────────────────────────────────────────────────────

ipcMain.handle('petricore:save-example',   (_, data)        => { try { tavernDb?.petricore.saveExample(data);    return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:update-example', (_, id, updates) => { try { tavernDb?.petricore.updateExample(id, updates); return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:get-examples',   (_, filters)     => { try { return tavernDb?.petricore.getExamples(filters) ?? { rows: [], total: 0 } } catch(e) { return { rows: [], total: 0 } } })
ipcMain.handle('petricore:get-coverage',   ()               => { try { return tavernDb?.petricore.getCoverage() ?? {} } catch(e) { return {} } })
ipcMain.handle('petricore:save-names',     (_, names)       => { try { tavernDb?.petricore.saveNames(names);    return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:get-names',      (_, opts)        => { try { return tavernDb?.petricore.getNames(opts) ?? [] } catch(e) { return [] } })
ipcMain.handle('petricore:update-name-usage', (_, id)       => { try { tavernDb?.petricore.updateNameUsage(id); return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:update-name',       (_, { id, updates }) => { try { tavernDb?.petricore.updateName(id, updates); return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:delete-name',       (_, id)       => { try { tavernDb?.petricore.deleteName(id);    return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:delete-names',      (_, ids)      => { try { tavernDb?.petricore.deleteNames(ids);  return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:clear-names',       ()            => { try { tavernDb?.petricore.clearNames();      return { ok: true } } catch(e) { return { ok: false, error: e.message } } })
ipcMain.handle('petricore:clear-examples',    ()            => { try { tavernDb?.petricore.clearExamples();   return { ok: true } } catch(e) { return { ok: false, error: e.message } } })

ipcMain.handle('petricore:export', async (_, { examples, format, outputPath, filename }) => {
  try {
    const outDir = outputPath || path.join(userDataPath, 'exports')
    fs.mkdirSync(outDir, { recursive: true })
    const outFile = path.join(outDir, filename || `vellicore_dataset_${Date.now()}.json`)

    // Two-pass name filter: purge entries where any NPC name token appears > 3×
    const { filtered, removed } = applyNameFilter(examples)
    if (removed > 0) log('PETRICORE', `Name filter removed ${removed} entries (${examples.length} → ${filtered.length})`)

    let content = ''
    if (format === 'sharegpt') {
      content = JSON.stringify(filtered.map(e => ({ conversations: e.conversations })), null, 2)
    } else if (format === 'jsonl' || format === 'unsloth') {
      content = filtered.map(e => JSON.stringify({ conversations: e.conversations })).join('\n')
    } else if (format === 'chatml') {
      content = filtered.map(e => {
        const roleMap = { system: 'system', player: 'user', dm: 'assistant' }
        return (e.conversations || []).map(turn =>
          `<|im_start|>${roleMap[turn.from] || turn.from}\n${turn.value}<|im_end|>`
        ).join('\n')
      }).join('\n\n')
    } else if (format === 'alpaca') {
      const alpaca = filtered.map(e => {
        const convs = e.conversations || []
        const sys   = convs.find(c => c.from === 'system')?.value || ''
        const turns = convs.filter(c => c.from !== 'system')
        const lastPlayer = [...turns].reverse().find(c => c.from === 'player')?.value || ''
        const lastDm     = [...turns].reverse().find(c => c.from === 'dm')?.value || ''
        return { instruction: sys, input: lastPlayer, output: lastDm }
      })
      content = JSON.stringify(alpaca, null, 2)
    }

    fs.writeFileSync(outFile, content, 'utf-8')
    log('PETRICORE', `Exported ${filtered.length} examples → ${outFile}`)
    return { ok: true, path: outFile, count: filtered.length, removed }
  } catch(e) {
    log('PETRICORE', `Export failed: ${e.message}`, 'ERROR')
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('services:launch', async (_, { service, config }) => {
  const svc = config?.services || {}

  const commands = {
    chroma:      { title: 'ChromaDB',      dir: svc.chromaPath    || 'C:\\AI\\chromadb',     cmd: 'start.bat' },
    sdnext:      { title: 'SDNext',        dir: svc.sdnextPath    || 'E:\\AI\\SDNext',         cmd: `webui.bat ${svc.sdnextArgs || '--api --listen'}` },
    kokoro:      { title: 'Kokoro TTS',    dir: svc.kokoroPath    || 'C:\\AI\\kokoro',         cmd: `venv\\Scripts\\activate && python ${svc.kokoroScript || 'serve.py'}` },
    chatterbox:  { title: 'Chatterbox',    dir: svc.chatterboxPath || 'C:\\AI\\chatterbox',   cmd: `venv\\Scripts\\activate && python ${svc.chatterboxScript || 'app.py'}` },
    ollama:      { title: 'Ollama',        dir: svc.ollamaPath    || 'C:\\Program Files\\Ollama', cmd: 'ollama serve' },
  }

  const def = commands[service]
  if (!def) return { ok: false, error: `Unknown service: ${service}` }

  try {
    // Launch in a new cmd window so output is visible and the process is independent
    const child = spawn('cmd', ['/c', `start "${def.title}" cmd /k "cd /d ${def.dir} && ${def.cmd}"`], {
      detached: true,
      shell: true,
      stdio: 'ignore',
    })
    child.unref()
    log('APP', `Launched service: ${service} (${def.title})`)
    return { ok: true }
  } catch (err) {
    log('APP', `Failed to launch service ${service}: ${err.message}`, 'ERROR')
    return { ok: false, error: err.message }
  }
})
