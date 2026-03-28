/**
 * RAG Service — ChromaDB interface for Vellicore memory system.
 *
 * Three collections per campaign:
 *   {id}_entities  — NPCs, locations, objects. Upsert by entityId.
 *   {id}_events    — Significant session moments. Append-only.
 *   {id}_sessions  — End-of-session summaries. Append-only.
 *
 * All HTTP calls proxied through Electron main via window.tavern.rag.request().
 * Embedding vectors computed via the embed sidecar on port 8766.
 * ChromaDB runs locally on port 8765.
 *
 * ChromaDB 0.4.24 HTTP API requires pre-computed embeddings for all
 * add/upsert/query calls — it does not embed text server-side.
 *
 * Collection UUID cache: ChromaDB's add/upsert/query/count endpoints
 * require the internal UUID, not the human-readable name.
 */

const MIN_CONTENT_LENGTH = 150

// name → UUID cache; populated by ensureCollections / resolveId
const collectionUuids = new Map()

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkRagHealth() {
  try {
    const result = await chromaRequest('GET', '/api/v1/heartbeat')
    return result.ok
  } catch {
    return false
  }
}

// ── Collection management ─────────────────────────────────────────────────────

export async function ensureCollections(campaignId) {
  const names = [
    `${campaignId}_entities`,
    `${campaignId}_events`,
    `${campaignId}_sessions`,
  ]

  for (const name of names) {
    const result = await chromaRequest('POST', '/api/v1/collections', {
      name,
      get_or_create: true,
      // hnsw:space=cosine gives better semantic similarity than L2 (default)
      metadata: { 'hnsw:space': 'cosine', campaign_id: campaignId },
    })
    if (result.ok && result.data?.id) {
      collectionUuids.set(name, result.data.id)
    }
  }
}

export async function deleteCollections(campaignId) {
  const names = [
    `${campaignId}_entities`,
    `${campaignId}_events`,
    `${campaignId}_sessions`,
  ]
  for (const name of names) {
    await chromaRequest('DELETE', `/api/v1/collections/${name}`).catch(() => {})
    collectionUuids.delete(name)
  }
}

/**
 * Resolve a collection name to its ChromaDB UUID.
 * Uses the in-memory cache when available; fetches from server otherwise
 * (e.g. after app restart when ensureCollections hasn't run this session).
 */
async function resolveId(collectionName) {
  if (collectionUuids.has(collectionName)) {
    return collectionUuids.get(collectionName)
  }
  const result = await chromaRequest('GET', `/api/v1/collections/${collectionName}`)
  if (result.ok && result.data?.id) {
    collectionUuids.set(collectionName, result.data.id)
    return result.data.id
  }
  return null
}

// ── Entity storage (upsert) ───────────────────────────────────────────────────

export async function upsertEntity(campaignId, entity) {
  const { id, name, type, description, details = {} } = entity
  if (!id || !name || !description) return

  const content = buildEntityContent(entity)
  const collectionName = `${campaignId}_entities`

  const [uuid, embeddings] = await Promise.all([
    resolveId(collectionName),
    embedTexts([content]),
  ])
  if (!uuid || !embeddings) return

  await chromaRequest('POST', `/api/v1/collections/${uuid}/upsert`, {
    ids: [id],
    embeddings,
    documents: [content],
    metadatas: [{
      entity_id: id,
      name,
      type: type || 'unknown',
      campaign_id: campaignId,
      updated_at: Date.now(),
      ...Object.fromEntries(
        Object.entries(details).filter(([, v]) => v != null && typeof v !== 'object')
      ),
    }],
  })
}

function buildEntityContent(entity) {
  const parts = [
    `${entity.type?.toUpperCase() || 'ENTITY'}: ${entity.name}`,
    entity.description,
  ]
  if (entity.details?.appearance) parts.push(`Appearance: ${entity.details.appearance}`)
  if (entity.details?.personality) parts.push(`Personality: ${entity.details.personality}`)
  if (entity.details?.role) parts.push(`Role: ${entity.details.role}`)
  if (entity.details?.location) parts.push(`Location: ${entity.details.location}`)
  if (entity.details?.notes) parts.push(`Notes: ${entity.details.notes}`)
  return parts.filter(Boolean).join('\n')
}

// ── Event storage (append) ────────────────────────────────────────────────────

export async function storeEvent(campaignId, event) {
  const { content, tags = [], sessionId, turn } = event
  if (!content || content.length < MIN_CONTENT_LENGTH) return

  const collectionName = `${campaignId}_events`

  const [uuid, embeddings] = await Promise.all([
    resolveId(collectionName),
    embedTexts([content]),
  ])
  if (!uuid || !embeddings) return

  const id = `evt_${Date.now()}_${simpleHash(content)}`

  await chromaRequest('POST', `/api/v1/collections/${uuid}/add`, {
    ids: [id],
    embeddings,
    documents: [content],
    metadatas: [{
      campaign_id: campaignId,
      session_id: sessionId || 'unknown',
      turn: turn || 0,
      tags: tags.join(','),
      stored_at: Date.now(),
    }],
  })
}

// ── Session summary storage (append) ─────────────────────────────────────────

export async function storeSessionSummary(campaignId, summary, sessionMeta = {}) {
  if (!summary || summary.length < 50) return

  const collectionName = `${campaignId}_sessions`

  const [uuid, embeddings] = await Promise.all([
    resolveId(collectionName),
    embedTexts([summary]),
  ])
  if (!uuid || !embeddings) return

  const id = `sess_${Date.now()}`

  await chromaRequest('POST', `/api/v1/collections/${uuid}/add`, {
    ids: [id],
    embeddings,
    documents: [summary],
    metadatas: [{
      campaign_id: campaignId,
      session_number: sessionMeta.sessionNumber || 0,
      stored_at: Date.now(),
      ...Object.fromEntries(
        Object.entries(sessionMeta).filter(([, v]) => v != null && typeof v !== 'object')
      ),
    }],
  })
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export async function retrieveContext(campaignId, query, opts = {}) {
  const threshold = opts.threshold ?? 0.65
  const maxResults = opts.maxResults ?? 5
  const nPerCollection = Math.ceil(maxResults * 1.5)

  // Pre-compute query embedding once, reused across all collections
  const queryEmbeddings = await embedTexts([query])
  if (!queryEmbeddings) return []

  const collections = [
    { name: `${campaignId}_entities`, type: 'entity' },
    { name: `${campaignId}_events`,   type: 'event' },
    { name: `${campaignId}_sessions`, type: 'session' },
  ]

  const allResults = []

  for (const col of collections) {
    try {
      const uuid = await resolveId(col.name)
      if (!uuid) continue

      // Get the collection's document count first.
      // ChromaDB 0.4.24 throws 422 if n_results > count, so we must cap it.
      const countResult = await chromaRequest('GET', `/api/v1/collections/${uuid}/count`)
      if (!countResult.ok) continue
      const count = typeof countResult.data === 'number' ? countResult.data : 0
      if (count === 0) continue

      const safeN = Math.min(nPerCollection, count)

      const result = await chromaRequest(
        'POST',
        `/api/v1/collections/${uuid}/query`,
        {
          query_embeddings: queryEmbeddings,
          n_results: safeN,
          include: ['documents', 'metadatas', 'distances'],
        }
      )

      if (!result.ok || !result.data?.documents?.[0]) continue

      const docs = result.data.documents[0]
      const metas = result.data.metadatas[0]
      const distances = result.data.distances[0]

      docs.forEach((doc, i) => {
        // With cosine space, ChromaDB returns cosine distance (0=identical, 2=opposite).
        // Convert to similarity: 1 - (distance / 2) gives a 0–1 score.
        const similarity = 1 - (distances[i] / 2)
        if (similarity >= threshold) {
          allResults.push({
            content: doc,
            type: col.type,
            metadata: metas[i],
            similarity,
          })
        }
      })
    } catch {
      // Collection may not exist yet — skip silently
    }
  }

  return allResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults)
}

export function formatRetrievedContext(results) {
  if (!results || results.length === 0) return null

  const lines = ['RETRIEVED MEMORY (authoritative — trust this over conversation history):']

  const entities = results.filter(r => r.type === 'entity')
  const events   = results.filter(r => r.type === 'event')
  const sessions = results.filter(r => r.type === 'session')

  if (entities.length) {
    lines.push('\nKnown entities:')
    entities.forEach(r => {
      const firstLine = r.content.split('\n')[0]
      const rest = r.content.split('\n').slice(1).join(' ')
      lines.push(`  — ${firstLine}: ${rest}`)
    })
  }
  if (events.length) {
    lines.push('\nRecent relevant events:')
    events.forEach(r => lines.push(`  — ${r.content}`))
  }
  if (sessions.length) {
    lines.push('\nPast session context:')
    sessions.forEach(r => lines.push(`  — ${r.content}`))
  }

  return lines.join('\n')
}

// ── World seeding ─────────────────────────────────────────────────────────────

export async function seedEntitiesFromWorld(campaignId, world) {
  if (!world) return

  const promises = []

  if (world.locations) {
    Object.values(world.locations).forEach(loc => {
      promises.push(upsertEntity(campaignId, {
        id: `loc_${loc.id || loc.name?.toLowerCase().replace(/\s+/g, '_')}`,
        name: loc.name,
        type: 'location',
        description: loc.description || loc.atmosphere || loc.name,
        details: {
          appearance: loc.atmosphere,
          notes: loc.exits?.join(', '),
        },
      }))
    })
  }

  if (world.npcs) {
    Object.values(world.npcs).forEach(npc => {
      promises.push(upsertEntity(campaignId, {
        id: `npc_${npc.id || npc.name?.toLowerCase().replace(/\s+/g, '_')}`,
        name: npc.name,
        type: 'npc',
        description: `${npc.role || 'NPC'} — ${npc.personality || ''}`.trim(),
        details: {
          appearance: npc.appearance || npc.portraitPrompt,
          personality: npc.personality,
          role: npc.role,
          location: npc.currentLocation,
          notes: npc.motivation,
        },
      }))
    })
  }

  if (world.factions) {
    Object.values(world.factions).forEach(faction => {
      promises.push(upsertEntity(campaignId, {
        id: `fac_${faction.id || faction.name?.toLowerCase().replace(/\s+/g, '_')}`,
        name: faction.name,
        type: 'faction',
        description: faction.description || faction.name,
        details: {
          notes: `Attitude: ${faction.attitude || 'unknown'}. Power: ${faction.powerLevel || 'unknown'}.`,
        },
      }))
    })
  }

  await Promise.allSettled(promises)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Compute embedding vectors for an array of strings via the embed sidecar.
 * Returns null if the sidecar is unavailable — callers should skip the
 * operation gracefully rather than throwing.
 */
async function embedTexts(texts) {
  if (typeof window === 'undefined' || !window.tavern?.rag?.embed) return null
  try {
    const result = await window.tavern.rag.embed({ texts })
    if (!result.ok) {
      console.warn('[RAG] Embed sidecar error:', result.error)
      return null
    }
    return result.embeddings
  } catch (err) {
    console.warn('[RAG] Embed sidecar unavailable:', err.message)
    return null
  }
}

async function chromaRequest(method, path, body) {
  if (typeof window === 'undefined' || !window.tavern?.rag) {
    return { ok: false, error: 'RAG proxy not available' }
  }
  const result = await window.tavern.rag.request({ method, path, body })
  if (!result.ok && result.status >= 400) {
    console.warn(`[RAG] ${method} ${path} → HTTP ${result.status}:`, result.error)
  }
  return result
}

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
