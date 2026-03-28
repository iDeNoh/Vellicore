/**
 * useMapTokens — manages token images and placement on the map.
 *
 * Tokens are circular portrait crops for characters and NPCs.
 * On mount, loads all entity portraits and registers them in the map store.
 * Provides helpers for placing tokens, moving them, and syncing positions.
 */

import { useEffect, useCallback, useState } from 'react'
import { useGameStore } from '@/store/appStore'

// Default grid position for auto-placement
const START_POSITIONS = [
  { col: 5, row: 7 }, { col: 6, row: 7 }, { col: 5, row: 8 }, { col: 6, row: 8 },
]

export function useMapTokens() {
  const {
    characters, world, map,
    setTokenPosition, removeToken, revealRadius,
  } = useGameStore()

  const [tokenImages, setTokenImages] = useState({})  // entityId → HTMLImageElement

  // ── Load token images on mount ─────────────────────────────────────────────

  useEffect(() => {
    const toLoad = {}

    // Characters
    Object.values(characters).forEach(char => {
      if (char.tokenBase64 || char.portraitBase64) {
        toLoad[char.id] = {
          id: char.id,
          base64: char.tokenBase64 || char.portraitBase64,
          label: char.name,
          type: 'character',
          color: '#d4a520',  // gold border
        }
      }
    })

    // NPCs present in current location
    const locNpcs = Object.values(world.npcs || {}).filter(n => n.isPresent !== false)
    locNpcs.forEach(npc => {
      if (npc.tokenBase64 || npc.portraitBase64) {
        toLoad[npc.id] = {
          id: npc.id,
          base64: npc.tokenBase64 || npc.portraitBase64,
          label: npc.name,
          type: 'npc',
          color: npcColor(npc.disposition),
        }
      }
    })

    // Load each image
    Promise.all(
      Object.entries(toLoad).map(([id, data]) =>
        loadImage(`data:image/png;base64,${data.base64}`)
          .then(img => [id, { ...data, img }])
          .catch(() => null)
      )
    ).then(results => {
      const loaded = {}
      results.filter(Boolean).forEach(([id, data]) => { loaded[id] = data })
      setTokenImages(loaded)
    })
  }, [characters, world.npcs, world.currentLocation])

  // ── Auto-place tokens that have no position ────────────────────────────────

  useEffect(() => {
    const charList = Object.values(characters)
    charList.forEach((char, i) => {
      if (!map.tokenPositions[char.id]) {
        const pos = START_POSITIONS[i % START_POSITIONS.length]
        setTokenPosition(char.id, {
          col: pos.col, row: pos.row,
          x: pos.col * map.gridSize,
          y: pos.row * map.gridSize,
          visible: true,
          type: 'character',
          label: char.name,
        })
        // Reveal fog around starting position
        revealRadius(pos.col, pos.row, 3)
      }
    })
  }, [Object.keys(characters).join(',')])

  // ── Move token ─────────────────────────────────────────────────────────────

  const moveToken = useCallback((entityId, newCol, newRow) => {
    const x = newCol * map.gridSize
    const y = newRow * map.gridSize
    setTokenPosition(entityId, { col: newCol, row: newRow, x, y })
    revealRadius(newCol, newRow, 3)
  }, [map.gridSize])

  // ── Place NPC token ────────────────────────────────────────────────────────

  const placeNpcToken = useCallback((npc, col, row) => {
    setTokenPosition(npc.id, {
      col, row,
      x: col * map.gridSize,
      y: row * map.gridSize,
      visible: true,
      type: 'npc',
      label: npc.name,
      color: npcColor(npc.disposition),
    })
  }, [map.gridSize])

  // ── Build token list for rendering ────────────────────────────────────────

  const tokens = Object.entries(map.tokenPositions).map(([id, pos]) => ({
    id,
    ...pos,
    imageData: tokenImages[id] || null,
    label: pos.label || tokenImages[id]?.label || id,
    color: pos.color || tokenImages[id]?.color || '#888',
  }))

  return { tokens, tokenImages, moveToken, placeNpcToken }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function npcColor(disposition) {
  const colors = {
    devoted: '#5dab7a', friendly: '#5dab7a',
    neutral: '#888780', suspicious: '#e8c14d',
    hostile: '#e05c5c', fearful: '#9b7fe8',
  }
  return colors[disposition] || '#888780'
}
