/**
 * remoteTavern.js — REST client that mirrors the window.tavern IPC interface.
 *
 * When the app is loaded in a phone/browser (no Electron), this module provides
 * an identical API surface to window.tavern by calling the companion HTTP server
 * running on port 3717 of the PC that's serving the app.
 *
 * Usage: imported and wired up by AppShell before any services initialise.
 */

export const API_PORT = 3717

function apiBase() {
  return `http://${window.location.hostname}:${API_PORT}`
}

async function parseJsonSafe(res) {
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const text = await res.text()
    throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0, 120)}`)
  }
  return res.json()
}

async function get(path) {
  const res = await fetch(`${apiBase()}${path}`)
  return parseJsonSafe(res)
}

async function post(path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJsonSafe(res)
}

async function patch(path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJsonSafe(res)
}

async function del(path) {
  const res = await fetch(`${apiBase()}${path}`, { method: 'DELETE' })
  return parseJsonSafe(res)
}

// ── remoteTavern object — mirrors window.tavern exactly ──────────────────────

export const remoteTavern = {
  config: {
    load:            async ()       => { const r = await get('/api/config'); return r.config },
    save:            async (config) => post('/api/config', config),
    getUserDataPath: async ()       => null,
  },

  campaigns: {
    all:    async ()       => { const r = await get('/api/campaigns'); return r.data },
    get:    async (id)     => { const r = await get(`/api/campaigns/${id}`); return r.data },
    create: async (data)   => { const r = await post('/api/campaigns', data); return r.data },
    update: async (id, d)  => { const r = await patch(`/api/campaigns/${id}`, d); return r.data },
    delete: async (id)     => del(`/api/campaigns/${id}`),
  },

  characters: {
    byCampaign: async (cid)    => { const r = await get(`/api/campaigns/${cid}/characters`); return r.data },
    get:        async (id)     => { const r = await get(`/api/characters/${id}`); return r.data },
    create:     async (data)   => { const r = await post('/api/characters', data); return r.data },
    update:     async (id, d)  => { const r = await patch(`/api/characters/${id}`, d); return r.data },
  },

  messages: {
    byCampaign: async (cid, limit = 200, offset = 0) => {
      const r = await get(`/api/campaigns/${cid}/messages?limit=${limit}&offset=${offset}`)
      return r.data
    },
    create:     async (data) => { const r = await post('/api/messages', data); return r.data },
    bulkCreate: async (msgs) => { const r = await post('/api/messages/bulk', msgs); return r.data },
  },

  sessions: {
    byCampaign: async (cid)          => { const r = await get(`/api/campaigns/${cid}/sessions`); return r.data },
    create:     async (data)          => { const r = await post('/api/sessions', data); return r.data },
    end:        async (id, summary)   => patch(`/api/sessions/${id}/end`, { summary }),
  },

  world: {
    get: async (cid)              => { const r = await get(`/api/campaigns/${cid}/world`); return r.data },
    set: async (cid, world, story) => post(`/api/campaigns/${cid}/world`, { world, story }),
  },

  npcs: {
    byCampaign: async (cid)  => { const r = await get(`/api/campaigns/${cid}/npcs`); return r.data },
    upsert:     async (data) => { const r = await post('/api/npcs', data); return r.data },
  },

  resources: {
    byCampaign: async (cid)          => { const r = await get(`/api/campaigns/${cid}/resources`); return r.data },
    get:        async (id)            => { const r = await get(`/api/resources/${id}`); return r.data },
    create:     async (data)          => { const r = await post('/api/resources', data); return r.data },
    delete:     async (id)            => del(`/api/resources/${id}`),
    setIndexed: async (id, chunkCount) => patch(`/api/resources/${id}/indexed`, { chunkCount }),
  },

  db: {
    getPath: async () => null,
  },

  fs: {
    saveAsset:    async ()    => null,
    readAsset:    async ()    => null,
    openExternal: async (url) => window.open(url, '_blank'),
    parsePdf:     async (buffer) => {
      // Convert ArrayBuffer → base64 for JSON transport to companion server
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      return post('/api/fs/parse-pdf', { data: base64 })
    },
  },

  health: {
    checkOllama:     async (url) => { const r = await post('/api/health', { type: 'ollama',      url }); return r },
    checkSdnext:     async (url) => { const r = await post('/api/health', { type: 'sdnext',     url }); return r },
    checkKokoro:     async (url) => { const r = await post('/api/health', { type: 'kokoro',     url }); return r },
    checkLmStudio:   async (url) => { const r = await post('/api/health', { type: 'lmstudio',   url }); return r },
    checkChatterbox: async (url) => { const r = await post('/api/health', { type: 'chatterbox', url }); return r },
  },

  dialog: {
    openFolder: async () => null,
  },

  sdnext: {
    generate: async () => ({ ok: false, error: 'Image generation not supported on mobile' }),
  },

  image: {
    generate: async () => ({ ok: false, error: 'Image generation not supported on mobile' }),
  },

  llm: {
    send: async (opts) => {
      const r = await post('/api/llm', opts)
      return r
    },
  },

  tts: {
    speak: async (opts) => {
      // Build the TTS URL and body the same way ttsService does, then proxy through the server
      const r = await post('/api/tts', opts)
      return r
    },
  },

  rag: {
    request: async ({ method, path, body }) => {
      const r = await post('/api/rag/request', { method, path, body })
      return r
    },
    embed: async ({ texts }) => {
      const r = await post('/api/rag/embed', { texts })
      return r
    },
  },

  log: {
    write:   async () => {},
    getPath: async () => null,
  },

  app: {
    version:  '0.1.0',
    platform: 'browser',
    relaunch: () => window.location.reload(),
  },

  services: {
    launch: async () => null,
  },
}

/**
 * Test if the companion API server is reachable.
 * Called by AppShell before deciding whether to use remoteTavern.
 */
export async function probeApiServer() {
  try {
    const res = await fetch(`http://${window.location.hostname}:${API_PORT}/api/ping`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}
