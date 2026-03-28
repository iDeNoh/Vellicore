/**
 * useImagePipeline — manages all image generation during play.
 *
 * Orchestrates:
 *  - Auto-portrait generation for new NPCs
 *  - Location image generation on first visit
 *  - Background NPC portrait queue
 *  - Retrying failed generations
 *  - Image storage and retrieval
 */

import { useCallback, useEffect, useRef } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import {
  generateNpcPortrait,
  generateLocationImage,
  generateMissingNpcPortraits,
  buildDmTagPrompt,
  generateImage,
  cropToToken,
  getQueueDepth,
} from '@/services/image/imageService'

export function useImagePipeline() {
  const config = useAppStore(s => s.config)
  const { campaign, world, setGeneratingImage } = useGameStore()

  const pendingNpcs = useRef(new Set())
  const pendingLocations = useRef(new Set())

  const isEnabled = config?.image?.enabled

  // ── Auto-generate NPC portraits when new NPCs appear ──────────────────────

  useEffect(() => {
    if (!isEnabled || !world.npcs) return

    const npcsNeedingPortraits = Object.values(world.npcs).filter(npc =>
      !npc.portraitBase64 &&
      !npc.portraitPath &&
      !pendingNpcs.current.has(npc.id)
    )

    if (npcsNeedingPortraits.length === 0) return

    npcsNeedingPortraits.forEach(npc => {
      pendingNpcs.current.add(npc.id)
      generateNpcPortrait({ npc, campaign, config })
        .then(result => {
          if (result) {
            useGameStore.setState(state => {
              if (state.world.npcs[npc.id]) {
                state.world.npcs[npc.id].portraitBase64 = result.portraitBase64
                state.world.npcs[npc.id].tokenBase64 = result.tokenBase64
              }
            })
          }
        })
        .catch(err => console.warn('[ImagePipeline] NPC portrait failed:', npc.name, err.message))
        .finally(() => pendingNpcs.current.delete(npc.id))
    })
  }, [Object.keys(world.npcs || {}).join(',')])

  // ── Auto-generate location image on first visit ────────────────────────────

  useEffect(() => {
    if (!isEnabled || !world.currentLocation) return

    const loc = world.locations?.[world.currentLocation]
    if (!loc || loc.imageBase64 || pendingLocations.current.has(world.currentLocation)) return

    pendingLocations.current.add(world.currentLocation)
    setGeneratingImage(true)

    generateLocationImage({ location: loc, campaign, config })
      .then(base64 => {
        if (base64) {
          useGameStore.setState(state => {
            const location = state.world.locations[world.currentLocation]
            if (location) {
              location.imageBase64 = base64
            }
            // Also set as map background
            state.map.backgroundImage = `data:image/png;base64,${base64}`
          })
        }
      })
      .catch(err => console.warn('[ImagePipeline] Location image failed:', loc.name, err.message))
      .finally(() => {
        pendingLocations.current.delete(world.currentLocation)
        setGeneratingImage(false)
      })
  }, [world.currentLocation])

  // ── Manual regeneration ────────────────────────────────────────────────────

  const regenerateNpcPortrait = useCallback(async (npcId) => {
    const npc = useGameStore.getState().world.npcs?.[npcId]
    if (!npc || !isEnabled) return

    setGeneratingImage(true)
    try {
      const result = await generateNpcPortrait({ npc, campaign, config })
      if (result) {
        useGameStore.setState(state => {
          if (state.world.npcs[npcId]) {
            state.world.npcs[npcId].portraitBase64 = result.portraitBase64
            state.world.npcs[npcId].tokenBase64 = result.tokenBase64
          }
        })
      }
    } finally {
      setGeneratingImage(false)
    }
  }, [campaign, config, isEnabled])

  const regenerateLocationImage = useCallback(async (locationId) => {
    const loc = useGameStore.getState().world.locations?.[locationId]
    if (!loc || !isEnabled) return

    setGeneratingImage(true)
    try {
      const base64 = await generateLocationImage({ location: loc, campaign, config })
      if (base64) {
        useGameStore.setState(state => {
          if (state.world.locations[locationId]) {
            state.world.locations[locationId].imageBase64 = base64
          }
          state.map.backgroundImage = `data:image/png;base64,${base64}`
        })
      }
    } finally {
      setGeneratingImage(false)
    }
  }, [campaign, config, isEnabled])

  const generateCustomImage = useCallback(async ({ prompt, type, onResult }) => {
    if (!isEnabled) return
    setGeneratingImage(true)
    try {
      const base64 = await generateImage({
        prompt,
        type,
        sdnextUrl: config.image.sdnextUrl,
        model: config.image.defaultModel,
        style: config.image.style,
      })
      onResult?.(base64)
      return base64
    } finally {
      setGeneratingImage(false)
    }
  }, [config, isEnabled])

  return {
    isEnabled,
    regenerateNpcPortrait,
    regenerateLocationImage,
    generateCustomImage,
    queueDepth: getQueueDepth(),
  }
}
