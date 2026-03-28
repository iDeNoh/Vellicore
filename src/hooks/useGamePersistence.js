/**
 * useGamePersistence — auto-saves game state to the database during play.
 *
 * Handles:
 *  - Persisting messages as they arrive (debounced)
 *  - Saving world state and story state on every change (throttled)
 *  - Saving character HP / conditions / inventory after each DM turn
 *  - Tracking the active session record
 *  - Restoring a campaign's full state on load (messages + world + characters)
 *
 * All saves are fire-and-forget — failures are logged but never block gameplay.
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/appStore'
import {
  campaigns as campaignDb,
  characters as characterDb,
  messages as messageDb,
  sessions as sessionDb,
  worldState as worldStateDb,
  npcs as npcDb,
} from '@/services/db/database'

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useGamePersistence(campaignId, loading = false) {
  const sessionIdRef = useRef(null)
  const savedMessageIdsRef = useRef(new Set())
  const worldSaveTimerRef = useRef(null)
  const worldRef = useRef(null)
  const storyRef = useRef(null)

  const {
    campaign, world, story, characters, messages, isDmThinking,
  } = useGameStore()

  // ── Session tracking ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!campaignId) return

    async function startSession() {
      try {
        const sessionId = await sessionDb.create({
          campaignId,
          type: 'play',
          startedAt: Date.now(),
        })
        sessionIdRef.current = sessionId

        // Mark campaign as recently played
        await campaignDb.update(campaignId, { lastPlayed: Date.now() })
      } catch (err) {
        console.warn('[Persist] Failed to start session:', err.message)
      }
    }

    startSession()

    return () => {
      // End session on unmount
      if (sessionIdRef.current) {
        sessionDb.end(sessionIdRef.current, null).catch(() => {})
      }
    }
  }, [campaignId])

  // ── Message persistence ────────────────────────────────────────────────────

  useEffect(() => {
    if (!campaignId || messages.length === 0 || loading) return

    // Save all finalized messages not yet saved.
    // Using a Set of saved IDs rather than a count so that streaming messages
    // are correctly handled: they're skipped when streaming, then picked up
    // once finalized (streaming=false) on the next effect run.
    const saveable = messages.filter(m =>
      !m.streaming &&
      m.type !== 'status' &&
      m.role !== undefined &&
      !savedMessageIdsRef.current.has(m.id)
    )
    if (saveable.length === 0) return

    const toSave = saveable.map(m => ({
      ...m,
      campaignId,
      sessionId: sessionIdRef.current,
    }))

    messageDb.bulkCreate(toSave).catch(err => {
      console.warn('[Persist] Failed to save messages:', err.message)
    })

    saveable.forEach(m => savedMessageIdsRef.current.add(m.id))
  }, [messages.length, isDmThinking, loading]) // loading guard prevents saving stale state on mount

  // ── World state persistence ────────────────────────────────────────────────

  // Keep a ref to world/story so the unmount cleanup can save the latest values
  worldRef.current = world
  storyRef.current = story

  useEffect(() => {
    if (!campaignId || !world?.name || loading) return

    // Throttle world saves to max once per 5 seconds
    clearTimeout(worldSaveTimerRef.current)
    worldSaveTimerRef.current = setTimeout(() => {
      saveWorldState(campaignId, world, story)
    }, 5000)

    return () => clearTimeout(worldSaveTimerRef.current)
  }, [world, story, loading])

  // Save world immediately on unmount (catches navigate-away before debounce fires)
  useEffect(() => {
    return () => {
      if (campaignId && worldRef.current?.name) {
        clearTimeout(worldSaveTimerRef.current)
        saveWorldState(campaignId, worldRef.current, storyRef.current)
      }
    }
  }, [campaignId])

  // ── Character persistence ──────────────────────────────────────────────────

  useEffect(() => {
    if (!campaignId || isDmThinking || loading) return
    if (Object.keys(characters).length === 0) return

    // Save after each DM turn completes — captures HP changes, new conditions, etc.
    const saveChars = async () => {
      for (const char of Object.values(characters)) {
        if (!char.id) continue
        try {
          await characterDb.update(char.id, {
            hp: char.hp,
            conditions: char.conditions,
            inventory: char.inventory,
            notes: char.notes,
            stats: char.stats,
            abilities: char.abilities,
          })
        } catch (err) {
          console.warn('[Persist] Failed to save character:', char.name, err.message)
        }
      }
    }

    saveChars()
  }, [isDmThinking]) // Fire when DM finishes responding

  // ── NPC persistence ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!campaignId || !world?.npcs || isDmThinking || loading) return

    const saveNpcs = async () => {
      for (const npc of Object.values(world.npcs)) {
        if (!npc.id) continue
        try {
          await npcDb.upsert({ ...npc, campaignId })
        } catch (err) {
          console.warn('[Persist] Failed to save NPC:', npc.name, err.message)
        }
      }
    }

    saveNpcs()
  }, [isDmThinking])
}

// ── Campaign restore ──────────────────────────────────────────────────────────

/**
 * Load a campaign's full persisted state back into the game store.
 * Called on GamePage mount — restores messages, world, story, and character stats.
 */
export async function restoreCampaignState(campaignId) {
  const results = {
    messages: [],
    worldData: null,
    npcList: [],
  }

  try {
    // Load persisted messages
    results.messages = await messageDb.getByCampaign(campaignId, 200, 0)

    // Load world + story state
    results.worldData = await worldStateDb.get(campaignId)

    // Load NPCs
    results.npcList = await npcDb.getByCampaign(campaignId)
  } catch (err) {
    console.warn('[Persist] Failed to restore campaign state:', err.message)
  }

  return results
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveWorldState(campaignId, world, story) {
  try {
    // Strip large base64 images from world before saving to DB
    // (portraits are saved separately as files)
    const worldToSave = stripBase64FromWorld(world)
    await worldStateDb.set(campaignId, worldToSave, story)
  } catch (err) {
    console.warn('[Persist] Failed to save world state:', err.message)
  }
}

function stripBase64FromWorld(world) {
  if (!world) return world
  const stripped = { ...world }

  // Strip base64 from locations (imageBase64 stays in memory, not DB)
  if (stripped.locations) {
    stripped.locations = Object.fromEntries(
      Object.entries(stripped.locations).map(([id, loc]) => [
        id, { ...loc, imageBase64: undefined }
      ])
    )
  }

  // Strip base64 from NPCs (saved as files separately)
  if (stripped.npcs) {
    stripped.npcs = Object.fromEntries(
      Object.entries(stripped.npcs).map(([id, npc]) => [
        id, { ...npc, portraitBase64: undefined, tokenBase64: undefined }
      ])
    )
  }

  return stripped
}
