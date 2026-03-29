/**
 * electron/db.js — SQLite database layer for the Electron main process.
 *
 * Runs entirely in the main process (Node.js context) where better-sqlite3 works.
 * The renderer communicates via IPC — see ipcMain handlers in main.js.
 *
 * Schema:
 *   campaigns      — campaign metadata, world JSON, story state
 *   characters     — character sheets, stats, inventory, portrait paths
 *   messages       — chat history per campaign (paginated)
 *   sessions       — session logs and summaries
 *   world_state    — serialised world JSON (locations, NPCs, factions)
 *   assets         — file path index for portraits, tokens, scene images
 */

let db = null
let dbAvailable = false

// ── Init / migrations ─────────────────────────────────────────────────────────

function init(dbPath) {
  try {
    const Database = require('better-sqlite3')
    db = new Database(dbPath, { verbose: null })

    // WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    runMigrations()
    dbAvailable = true
    console.log('[DB] Initialised at', dbPath)
    return db
  } catch (err) {
    console.error('[DB] Failed to load better-sqlite3:', err.message)
    console.error('[DB] Run "npm run rebuild" to recompile native modules for Electron.')
    console.error('[DB] App will use in-memory storage as fallback — data will not persist.')
    db = null
    dbAvailable = false
    return null
  }
}

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)

  const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v || 0

  if (currentVersion < 1) applyMigration(1, migration_001)
  if (currentVersion < 2) applyMigration(2, migration_002)
  if (currentVersion < 3) applyMigration(3, migration_003)
  if (currentVersion < 4) applyMigration(4, migration_004)
  if (currentVersion < 5) applyMigration(5, migration_005)
}

function applyMigration(version, fn) {
  const apply = db.transaction(() => {
    fn()
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, Date.now())
  })
  apply()
  console.log('[DB] Applied migration', version)
}

// ── Migration 001: Core schema ────────────────────────────────────────────────

function migration_001() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      atmosphere  TEXT,
      tone        TEXT,
      themes      TEXT,              -- JSON array
      danger_level TEXT,
      session_count INTEGER DEFAULT 0,
      last_played INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS characters (
      id              TEXT PRIMARY KEY,
      campaign_id     TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      pronouns        TEXT,
      ancestry        TEXT,
      background      TEXT,
      stats           TEXT NOT NULL,  -- JSON {body, mind, spirit}
      hp              INTEGER NOT NULL,
      max_hp          INTEGER NOT NULL,
      conditions      TEXT DEFAULT '[]',  -- JSON array
      abilities       TEXT DEFAULT '[]',  -- JSON array
      inventory       TEXT DEFAULT '[]',  -- JSON array of {name, type, qty, notable, description}
      backstory       TEXT DEFAULT '',
      personality_note TEXT DEFAULT '',
      hook            TEXT DEFAULT '',
      notes           TEXT DEFAULT '',
      portrait_path   TEXT,
      token_path      TEXT,
      portrait_prompt TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      session_id  TEXT,
      role        TEXT NOT NULL,      -- 'user' | 'assistant' | 'system'
      type        TEXT,               -- null | 'roll-request' | 'roll-result' | 'session-summary' | 'status'
      content     TEXT NOT NULL DEFAULT '',
      metadata    TEXT,               -- JSON: rolls, images, oocNotes, rollData, etc.
      timestamp   INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id, timestamp);

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      type         TEXT DEFAULT 'play',  -- 'play' | 'summary'
      summary      TEXT,
      act          INTEGER,
      location     TEXT,
      message_count INTEGER DEFAULT 0,
      started_at   INTEGER NOT NULL,
      ended_at     INTEGER,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_state (
      campaign_id  TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
      world_json   TEXT NOT NULL,     -- Full serialised world object
      story_json   TEXT NOT NULL,     -- Full serialised story object
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
      entity_id   TEXT,               -- character id, npc id, location id, etc.
      entity_type TEXT,               -- 'character' | 'npc' | 'location' | 'item'
      asset_type  TEXT,               -- 'portrait' | 'token' | 'scene' | 'map' | 'item'
      file_path   TEXT NOT NULL,
      prompt      TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_entity ON assets(entity_id, asset_type);
  `)
}

// ── Migration 003: Story style ────────────────────────────────────────────────

function migration_003() {
  // ALTER TABLE ignores duplicate column errors — safe to re-run
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN story_style TEXT DEFAULT '["guided_fate"]'`)
  } catch {}
}

// ── Migration 004: Structured traits ─────────────────────────────────────────

function migration_004() {
  try {
    db.exec(`ALTER TABLE characters ADD COLUMN traits TEXT DEFAULT '{}'`)
  } catch {}
}

// ── Migration 005: Campaign resources ─────────────────────────────────────────

function migration_005() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_resources (
      id           TEXT PRIMARY KEY,
      campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'text',
      content      TEXT NOT NULL DEFAULT '',
      chunk_count  INTEGER DEFAULT 0,
      indexed      INTEGER DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_resources_campaign ON campaign_resources(campaign_id);
  `)
}

// ── Migration 002: NPC & faction tracking ─────────────────────────────────────

function migration_002() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS npcs (
      id           TEXT PRIMARY KEY,
      campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      role         TEXT,
      location_id  TEXT,
      ancestry     TEXT,
      appearance   TEXT,
      personality  TEXT,
      speech       TEXT,
      motivation   TEXT,
      secret       TEXT,
      disposition  TEXT DEFAULT 'neutral',
      current_mood TEXT,
      memories     TEXT DEFAULT '[]',   -- JSON array
      stats        TEXT,                -- JSON {body, mind, spirit}
      hp           INTEGER,
      max_hp       INTEGER,
      portrait_path TEXT,
      token_path    TEXT,
      portrait_prompt TEXT,
      voice_id     TEXT,
      is_present   INTEGER DEFAULT 1,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_npcs_campaign ON npcs(campaign_id);

    CREATE TABLE IF NOT EXISTS factions (
      id           TEXT PRIMARY KEY,
      campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      type         TEXT,
      description  TEXT,
      attitude     TEXT DEFAULT 'neutral',
      power_level  INTEGER DEFAULT 1,
      player_standing TEXT DEFAULT 'neutral',
      created_at   INTEGER NOT NULL
    );
  `)
}

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

function campaignGetAll() {
  if (!db) return []
  return db.prepare(`
    SELECT *, 
      (SELECT COUNT(*) FROM sessions WHERE campaign_id = campaigns.id AND type = 'play') as session_count
    FROM campaigns 
    ORDER BY COALESCE(last_played, created_at) DESC
  `).all().map(parseCampaign)
}

function campaignGetById(id) {
  if (!db) return null
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id)
  return row ? parseCampaign(row) : null
}

function campaignCreate(data) {
  if (!db) return { id: require('crypto').randomUUID(), ...data, createdAt: Date.now() }
  const id = data.id || require('crypto').randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO campaigns (id, name, atmosphere, tone, themes, danger_level, story_style, session_count, created_at)
    VALUES (@id, @name, @atmosphere, @tone, @themes, @dangerLevel, @storyStyle, 0, @now)
  `).run({
    id, now,
    name: data.name,
    atmosphere: data.atmosphere || null,
    tone: data.tone || null,
    themes: JSON.stringify(data.themes || []),
    dangerLevel: data.dangerLevel || 'moderate',
    storyStyle: JSON.stringify(data.storyStyle || ['guided_fate']),
  })
  return campaignGetById(id)
}

function campaignUpdate(id, data) {
  if (!db) return
  const sets = []
  const params = { id, now: Date.now() }

  if (data.name !== undefined)        { sets.push('name = @name');               params.name = data.name }
  if (data.tone !== undefined)        { sets.push('tone = @tone');               params.tone = data.tone }
  if (data.themes !== undefined)      { sets.push('themes = @themes');           params.themes = JSON.stringify(data.themes) }
  if (data.storyStyle !== undefined)  { sets.push('story_style = @storyStyle'); params.storyStyle = JSON.stringify(data.storyStyle) }
  if (data.lastPlayed !== undefined)  { sets.push('last_played = @lastPlayed');  params.lastPlayed = data.lastPlayed }
  if (data.sessionCount !== undefined){ sets.push('session_count = @sc');        params.sc = data.sessionCount }

  if (sets.length === 0) return
  sets.push('updated_at = @now')
  db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

function campaignDelete(id) {
  if (!db) return
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
}

function parseCampaign(row) {
  return {
    ...row,
    themes: tryParse(row.themes, []),
    storyStyle: tryParse(row.story_style, ['guided_fate']),
    sessionCount: row.session_count || 0,
    lastPlayed: row.last_played,
    dangerLevel: row.danger_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Character CRUD ────────────────────────────────────────────────────────────

function characterGetByCampaign(campaignId) {
  if (!db) return []
  return db.prepare('SELECT * FROM characters WHERE campaign_id = ? ORDER BY created_at ASC').all(campaignId).map(parseCharacter)
}

function characterGetById(id) {
  if (!db) return null
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
  return row ? parseCharacter(row) : null
}

function characterCreate(data) {
  if (!db) return { id: require('crypto').randomUUID(), ...data }
  const id = data.id || require('crypto').randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO characters (
      id, campaign_id, name, pronouns, ancestry, background,
      stats, hp, max_hp, conditions, abilities, inventory,
      backstory, personality_note, hook, notes, traits,
      portrait_path, token_path, portrait_prompt, created_at
    ) VALUES (
      @id, @campaignId, @name, @pronouns, @ancestry, @background,
      @stats, @hp, @maxHp, @conditions, @abilities, @inventory,
      @backstory, @personalityNote, @hook, @notes, @traits,
      @portraitPath, @tokenPath, @portraitPrompt, @now
    )
  `).run({
    id, now,
    campaignId: data.campaignId,
    name: data.name,
    pronouns: data.pronouns || null,
    ancestry: data.ancestry || 'human',
    background: data.background || 'custom',
    stats: JSON.stringify(data.stats || { body: 2, mind: 2, spirit: 2 }),
    hp: data.hp || 8,
    maxHp: data.maxHp || 8,
    conditions: JSON.stringify(data.conditions || []),
    abilities: JSON.stringify(data.abilities || []),
    inventory: JSON.stringify(data.inventory || []),
    backstory: data.backstory || '',
    personalityNote: data.personalityNote || '',
    hook: data.hook || '',
    notes: data.notes || '',
    traits: typeof data.traits === 'object' ? JSON.stringify(data.traits) : (data.traits || '{}'),
    portraitPath: data.portraitBase64 ? savePortraitToFile(id, data.portraitBase64, 'portrait') : null,
    tokenPath: data.tokenBase64 ? savePortraitToFile(id, data.tokenBase64, 'token') : null,
    portraitPrompt: data.portraitPrompt || '',
  })
  return characterGetById(id)
}

function characterUpdate(id, data) {
  if (!db) return
  const sets = []
  const params = { id, now: Date.now() }

  const fields = {
    name: 'name', pronouns: 'pronouns', ancestry: 'ancestry',
    background: 'background', hp: 'hp', notes: 'notes',
    backstory: 'backstory',
  }
  Object.entries(fields).forEach(([k, col]) => {
    if (data[k] !== undefined) { sets.push(`${col} = @${k}`); params[k] = data[k] }
  })

  const jsonFields = { stats: 'stats', conditions: 'conditions', abilities: 'abilities', inventory: 'inventory' }
  Object.entries(jsonFields).forEach(([k, col]) => {
    if (data[k] !== undefined) { sets.push(`${col} = @${k}`); params[k] = JSON.stringify(data[k]) }
  })

  if (data.traits !== undefined) {
    sets.push('traits = @traits')
    params.traits = typeof data.traits === 'object' ? JSON.stringify(data.traits) : (data.traits || '{}')
  }

  if (data.portraitBase64) {
    const path = savePortraitToFile(id, data.portraitBase64, 'portrait')
    sets.push('portrait_path = @portraitPath'); params.portraitPath = path
  }
  if (data.tokenBase64) {
    const path = savePortraitToFile(id, data.tokenBase64, 'token')
    sets.push('token_path = @tokenPath'); params.tokenPath = path
  }

  if (sets.length === 0) return
  sets.push('updated_at = @now')
  db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

function parseCharacter(row) {
  const char = {
    ...row,
    campaignId: row.campaign_id,
    maxHp: row.max_hp,
    stats: tryParse(row.stats, { body: 2, mind: 2, spirit: 2 }),
    conditions: tryParse(row.conditions, []),
    abilities: tryParse(row.abilities, []),
    inventory: tryParse(row.inventory, []),
    traits: tryParse(row.traits, {}),
    personalityNote: row.personality_note,
    portraitPath: row.portrait_path,
    tokenPath: row.token_path,
    portraitPrompt: row.portrait_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  // Load portrait as base64 if path exists
  if (char.portraitPath) {
    try { char.portraitBase64 = require('fs').readFileSync(char.portraitPath).toString('base64') } catch {}
  }
  if (char.tokenPath) {
    try { char.tokenBase64 = require('fs').readFileSync(char.tokenPath).toString('base64') } catch {}
  }
  return char
}

// ── Messages CRUD ─────────────────────────────────────────────────────────────

function messageGetByCampaign(campaignId, limit = 100, offset = 0) {
  if (!db) return []
  return db.prepare(`
    SELECT * FROM messages
    WHERE campaign_id = ?
    ORDER BY timestamp ASC
    LIMIT ? OFFSET ?
  `).all(campaignId, limit, offset).map(parseMessage)
}

function messageCreate(data) {
  if (!db) return data.id || require('crypto').randomUUID()
  const id = data.id || require('crypto').randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO messages (id, campaign_id, session_id, role, type, content, metadata, timestamp, created_at)
    VALUES (@id, @campaignId, @sessionId, @role, @type, @content, @metadata, @timestamp, @now)
  `).run({
    id, now,
    campaignId: data.campaignId,
    sessionId: data.sessionId || null,
    role: data.role,
    type: data.type || null,
    content: data.content || '',
    metadata: data.rolls || data.images || data.rollData
      ? JSON.stringify({ rolls: data.rolls, images: data.images, rollData: data.rollData, oocNotes: data.oocNotes })
      : null,
    timestamp: data.timestamp || now,
  })
  return id
}

function messageBulkCreate(messages) {
  if (!db) return
  const insert = db.prepare(`
    INSERT OR IGNORE INTO messages (id, campaign_id, session_id, role, type, content, metadata, timestamp, created_at)
    VALUES (@id, @campaignId, @sessionId, @role, @type, @content, @metadata, @timestamp, @now)
  `)
  const insertMany = db.transaction((msgs) => {
    for (const m of msgs) insert.run({
      id: m.id || require('crypto').randomUUID(),
      now: Date.now(),
      campaignId: m.campaignId,
      sessionId: m.sessionId || null,
      role: m.role,
      type: m.type || null,
      content: m.content || '',
      metadata: m.rolls || m.images ? JSON.stringify({ rolls: m.rolls, images: m.images, rollData: m.rollData }) : null,
      timestamp: m.timestamp || Date.now(),
    })
  })
  insertMany(messages)
}

function parseMessage(row) {
  const meta = tryParse(row.metadata, {})
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    role: row.role,
    type: row.type,
    content: row.content,
    timestamp: row.timestamp,
    ...meta,
  }
}

// ── Session CRUD ──────────────────────────────────────────────────────────────

function sessionGetByCampaign(campaignId) {
  if (!db) return []
  return db.prepare(`
    SELECT * FROM sessions WHERE campaign_id = ? ORDER BY started_at DESC
  `).all(campaignId).map(row => ({
    ...row,
    campaignId: row.campaign_id,
    messageCount: row.message_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  }))
}

function sessionCreate(data) {
  if (!db) return data.id || require('crypto').randomUUID()
  const id = data.id || require('crypto').randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO sessions (id, campaign_id, type, summary, act, location, message_count, started_at, created_at)
    VALUES (@id, @campaignId, @type, @summary, @act, @location, @messageCount, @startedAt, @now)
  `).run({
    id, now,
    campaignId: data.campaignId,
    type: data.type || 'play',
    summary: data.summary || null,
    act: data.act || null,
    location: data.location || null,
    messageCount: data.messageCount || 0,
    startedAt: data.startedAt || now,
  })
  return id
}

function sessionEnd(id, summary) {
  if (!db) return
  db.prepare(`
    UPDATE sessions SET ended_at = @now, summary = @summary WHERE id = @id
  `).run({ id, now: Date.now(), summary: summary || null })
}

// ── World state ───────────────────────────────────────────────────────────────

function worldStateGet(campaignId) {
  if (!db) return null
  const row = db.prepare('SELECT * FROM world_state WHERE campaign_id = ?').get(campaignId)
  if (!row) return null
  return {
    world: tryParse(row.world_json, null),
    story: tryParse(row.story_json, null),
    updatedAt: row.updated_at,
  }
}

function worldStateSet(campaignId, world, story) {
  if (!db) return
  const now = Date.now()
  db.prepare(`
    INSERT INTO world_state (campaign_id, world_json, story_json, updated_at)
    VALUES (@campaignId, @worldJson, @storyJson, @now)
    ON CONFLICT(campaign_id) DO UPDATE SET
      world_json = @worldJson,
      story_json = @storyJson,
      updated_at = @now
  `).run({
    campaignId,
    worldJson: JSON.stringify(world),
    storyJson: JSON.stringify(story),
    now,
  })
}

// ── NPC CRUD ──────────────────────────────────────────────────────────────────

function npcGetByCampaign(campaignId) {
  if (!db) return []
  return db.prepare('SELECT * FROM npcs WHERE campaign_id = ? ORDER BY created_at ASC').all(campaignId).map(parseNpc)
}

function npcUpsert(data) {
  if (!db) return data.id
  const id = data.id || require('crypto').randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO npcs (
      id, campaign_id, name, role, location_id, ancestry, appearance,
      personality, speech, motivation, secret, disposition, current_mood,
      memories, stats, hp, max_hp, portrait_path, token_path, portrait_prompt,
      voice_id, is_present, created_at, updated_at
    ) VALUES (
      @id, @campaignId, @name, @role, @locationId, @ancestry, @appearance,
      @personality, @speech, @motivation, @secret, @disposition, @currentMood,
      @memories, @stats, @hp, @maxHp, @portraitPath, @tokenPath, @portraitPrompt,
      @voiceId, @isPresent, @now, @now
    )
    ON CONFLICT(id) DO UPDATE SET
      disposition = @disposition, current_mood = @currentMood,
      memories = @memories, location_id = @locationId,
      is_present = @isPresent, updated_at = @now
  `).run({
    id, now,
    campaignId: data.campaignId,
    name: data.name || 'Unknown',
    role: data.role || null,
    locationId: data.locationId || null,
    ancestry: data.ancestry || 'human',
    appearance: data.appearance || null,
    personality: data.personality || null,
    speech: data.speech || null,
    motivation: data.motivation || null,
    secret: data.secret || null,
    disposition: data.disposition || 'neutral',
    currentMood: data.currentMood || null,
    memories: JSON.stringify(data.memories || []),
    stats: JSON.stringify(data.stats || { body: 2, mind: 2, spirit: 2 }),
    hp: data.hp || 8,
    maxHp: data.maxHp || data.hp || 8,
    portraitPath: data.portraitPath || null,
    tokenPath: data.tokenPath || null,
    portraitPrompt: data.portraitPrompt || null,
    voiceId: data.voiceId || null,
    isPresent: data.isPresent !== false ? 1 : 0,
  })
  return id
}

function parseNpc(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    role: row.role,
    locationId: row.location_id,
    ancestry: row.ancestry,
    appearance: row.appearance,
    personality: row.personality,
    speech: row.speech,
    motivation: row.motivation,
    secret: row.secret,
    disposition: row.disposition,
    currentMood: row.current_mood,
    memories: tryParse(row.memories, []),
    stats: tryParse(row.stats, { body: 2, mind: 2, spirit: 2 }),
    hp: row.hp,
    maxHp: row.max_hp,
    isPresent: !!row.is_present,
    voiceId: row.voice_id,
    portraitPrompt: row.portrait_prompt,
  }
}

// ── Asset helpers ─────────────────────────────────────────────────────────────

let _userDataPath = null

function setUserDataPath(p) { _userDataPath = p }

function savePortraitToFile(entityId, base64, type) {
  if (!_userDataPath || !base64) return null
  const path = require('path')
  const fs = require('fs')
  const dir = path.join(_userDataPath, 'assets', 'portraits')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${entityId}_${type}.png`
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return filePath
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function tryParse(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function close() {
  if (db) { db.close(); db = null }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  init, close, setUserDataPath,
  campaigns: { getAll: campaignGetAll, getById: campaignGetById, create: campaignCreate, update: campaignUpdate, delete: campaignDelete },
  characters: { getByCampaign: characterGetByCampaign, getById: characterGetById, create: characterCreate, update: characterUpdate },
  messages: { getByCampaign: messageGetByCampaign, create: messageCreate, bulkCreate: messageBulkCreate },
  sessions: { getByCampaign: sessionGetByCampaign, create: sessionCreate, end: sessionEnd },
  worldState: { get: worldStateGet, set: worldStateSet },
  npcs: { getByCampaign: npcGetByCampaign, upsert: npcUpsert },
  resources: {
    getByCampaign(campaignId) {
      return db.prepare(`SELECT id, campaign_id, name, type, chunk_count, indexed, created_at,
        substr(content, 1, 500) as preview FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at DESC`)
        .all(campaignId)
    },
    getById(id) {
      return db.prepare('SELECT * FROM campaign_resources WHERE id = ?').get(id)
    },
    create(data) {
      const id = data.id || `res_${Date.now()}`
      db.prepare(`INSERT INTO campaign_resources (id, campaign_id, name, type, content, chunk_count, indexed, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?)`)
        .run(id, data.campaignId, data.name, data.type || 'text', data.content || '', Date.now())
      return { id, ...data }
    },
    delete(id) {
      db.prepare('DELETE FROM campaign_resources WHERE id = ?').run(id)
    },
    setIndexed(id, chunkCount) {
      db.prepare('UPDATE campaign_resources SET indexed = 1, chunk_count = ?, updated_at = ? WHERE id = ?')
        .run(chunkCount, Date.now(), id)
    },
  },
}
