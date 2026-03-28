/**
 * Database service — renderer process side.
 *
 * In Electron: proxies all calls to the main process via window.tavern IPC.
 *   - better-sqlite3 runs in main (Node context), never in the renderer.
 *   - All data is serialised/deserialised across the IPC bridge.
 *
 * Outside Electron (dev browser): uses an in-memory store backed by
 *   localStorage so data survives page refreshes during development.
 *
 * The API surface is identical regardless of mode — components never
 * need to know which backend is active.
 */

const IS_ELECTRON = typeof window !== 'undefined' && !!window.tavern?.campaigns

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function initDatabase() {
  if (!IS_ELECTRON) {
    console.info('[DB] Electron not detected — using in-memory store with localStorage persistence')
    loadMemoryStore()
  } else {
    console.info('[DB] Connected to SQLite via Electron IPC')
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const campaigns = {
  async getAll() {
    if (IS_ELECTRON) return window.tavern.campaigns.all()
    return Object.values(mem.campaigns).sort((a, b) =>
      (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt))
  },

  async getById(id) {
    if (IS_ELECTRON) return window.tavern.campaigns.get(id)
    return mem.campaigns[id] || null
  },

  async create(data) {
    if (IS_ELECTRON) return window.tavern.campaigns.create(data)
    const c = { id: uid(), createdAt: Date.now(), sessionCount: 0, ...data }
    mem.campaigns[c.id] = c
    saveMemoryStore()
    return c
  },

  async update(id, partial) {
    if (IS_ELECTRON) return window.tavern.campaigns.update(id, partial)
    if (mem.campaigns[id]) {
      mem.campaigns[id] = { ...mem.campaigns[id], ...partial, updatedAt: Date.now() }
      saveMemoryStore()
    }
  },

  async delete(id) {
    if (IS_ELECTRON) return window.tavern.campaigns.delete(id)
    delete mem.campaigns[id]
    // Cascade: remove characters, messages, world state
    Object.keys(mem.characters).forEach(k => { if (mem.characters[k].campaignId === id) delete mem.characters[k] })
    mem.messages = (mem.messages || []).filter(m => m.campaignId !== id)
    delete mem.worldStates[id]
    saveMemoryStore()
  },
}

// ── Characters ────────────────────────────────────────────────────────────────

export const characters = {
  async getByCampaign(campaignId) {
    if (IS_ELECTRON) return window.tavern.characters.byCampaign(campaignId)
    return Object.values(mem.characters).filter(c => c.campaignId === campaignId)
  },

  async getById(id) {
    if (IS_ELECTRON) return window.tavern.characters.get(id)
    return mem.characters[id] || null
  },

  async create(data) {
    if (IS_ELECTRON) return window.tavern.characters.create(data)
    const c = { id: uid(), createdAt: Date.now(), ...data }
    mem.characters[c.id] = c
    saveMemoryStore()
    return c
  },

  async update(id, partial) {
    if (IS_ELECTRON) return window.tavern.characters.update(id, partial)
    if (mem.characters[id]) {
      mem.characters[id] = { ...mem.characters[id], ...partial, updatedAt: Date.now() }
      saveMemoryStore()
    }
  },
}

// ── Messages ──────────────────────────────────────────────────────────────────

export const messages = {
  async getByCampaign(campaignId, limit = 200, offset = 0) {
    if (IS_ELECTRON) return window.tavern.messages.byCampaign(campaignId, limit, offset)
    return (mem.messages || [])
      .filter(m => m.campaignId === campaignId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(offset, offset + limit)
  },

  async create(data) {
    if (IS_ELECTRON) return window.tavern.messages.create(data)
    const m = { id: uid(), createdAt: Date.now(), timestamp: Date.now(), ...data }
    mem.messages = [...(mem.messages || []), m]
    saveMemoryStore()
    return m.id
  },

  async bulkCreate(msgs) {
    if (IS_ELECTRON) return window.tavern.messages.bulkCreate(msgs)
    const now = Date.now()
    const newMsgs = msgs.map(m => ({ id: uid(), createdAt: now, timestamp: now, ...m }))
    mem.messages = [...(mem.messages || []), ...newMsgs]
    saveMemoryStore()
  },
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessions = {
  async getByCampaign(campaignId) {
    if (IS_ELECTRON) return window.tavern.sessions.byCampaign(campaignId)
    return (mem.sessions || []).filter(s => s.campaignId === campaignId).sort((a, b) => b.createdAt - a.createdAt)
  },

  async create(data) {
    if (IS_ELECTRON) return window.tavern.sessions.create(data)
    const s = { id: uid(), createdAt: Date.now(), startedAt: Date.now(), ...data }
    mem.sessions = [...(mem.sessions || []), s]
    saveMemoryStore()
    return s.id
  },

  async end(id, summary) {
    if (IS_ELECTRON) return window.tavern.sessions.end(id, summary)
    const s = (mem.sessions || []).find(s => s.id === id)
    if (s) { s.endedAt = Date.now(); s.summary = summary }
    saveMemoryStore()
  },
}

// ── World state ───────────────────────────────────────────────────────────────

export const worldState = {
  async get(campaignId) {
    if (IS_ELECTRON) return window.tavern.world.get(campaignId)
    return mem.worldStates[campaignId] || null
  },

  async set(campaignId, world, story) {
    if (IS_ELECTRON) return window.tavern.world.set(campaignId, world, story)
    mem.worldStates[campaignId] = { world, story, updatedAt: Date.now() }
    saveMemoryStore()
  },
}

// ── NPCs ──────────────────────────────────────────────────────────────────────

export const npcs = {
  async getByCampaign(campaignId) {
    if (IS_ELECTRON) return window.tavern.npcs.byCampaign(campaignId)
    return (mem.npcs || []).filter(n => n.campaignId === campaignId)
  },

  async upsert(data) {
    if (IS_ELECTRON) return window.tavern.npcs.upsert(data)
    const existing = (mem.npcs || []).findIndex(n => n.id === data.id)
    if (existing >= 0) mem.npcs[existing] = { ...mem.npcs[existing], ...data }
    else mem.npcs = [...(mem.npcs || []), { id: uid(), createdAt: Date.now(), ...data }]
    saveMemoryStore()
    return data.id
  },
}

// ── In-memory store (dev / non-Electron fallback) ─────────────────────────────

let mem = { campaigns: {}, characters: {}, messages: [], sessions: [], worldStates: {}, npcs: [] }

function loadMemoryStore() {
  try {
    const saved = localStorage.getItem('tavern-db-v2')
    if (saved) mem = JSON.parse(saved)
  } catch { mem = { campaigns: {}, characters: {}, messages: [], sessions: [], worldStates: {}, npcs: [] } }
}

function saveMemoryStore() {
  try { localStorage.setItem('tavern-db-v2', JSON.stringify(mem)) } catch {}
}

function uid() { return crypto.randomUUID() }
