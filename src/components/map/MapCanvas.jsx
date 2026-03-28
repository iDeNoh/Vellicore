/**
 * MapCanvas — the Konva.js interactive map canvas.
 *
 * Layers (bottom to top):
 *   1. Background  — location scene image or parchment texture
 *   2. Grid        — configurable cell grid overlay
 *   3. Fog         — dark overlay with revealed cells cut out
 *   4. Tokens      — character and NPC tokens (draggable)
 *   5. UI          — labels, selection rings, context info
 *
 * Features:
 *   - Mouse wheel zoom (0.25× – 4×)
 *   - Click-drag pan
 *   - Drag-and-drop token movement with grid snapping
 *   - Click token to select / see info
 *   - Right-click token for context menu
 *   - Fog of war with smooth reveal radius
 */

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Image, Line, Circle, Text, Group } from 'react-konva'
import { useGameStore } from '@/store/appStore'
import { useMapTokens } from '@/hooks/useMapTokens'

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_SPEED = 0.001

export default function MapCanvas({ width, height }) {
  const stageRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [bgImage, setBgImage] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)  // { x, y, tokenId }

  const {
    map, world, config: appConfig,
    setMapStage, setTokenPosition, revealRadius, clearFog, toggleFog,
  } = useGameStore()

  const { tokens, moveToken } = useMapTokens()

  const { gridSize, fogEnabled, stageX, stageY, stageScale,
          mapWidth, mapHeight, revealedCells, backgroundImage } = map

  const canvasW = mapWidth * gridSize
  const canvasH = mapHeight * gridSize

  // ── Load background image ──────────────────────────────────────────────────

  useEffect(() => {
    const src = backgroundImage ||
      world.locations?.[world.currentLocation]?.imageBase64

    if (!src) { setBgImage(null); return }

    const img = new window.Image()
    img.onload = () => setBgImage(img)
    img.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`
  }, [backgroundImage, world.currentLocation, world.locations])

  // ── Zoom ───────────────────────────────────────────────────────────────────

  function handleWheel(e) {
    e.evt.preventDefault()
    const stage = stageRef.current
    const oldScale = stageScale
    const pointer = stage.getPointerPosition()

    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
      oldScale * (1 - e.evt.deltaY * ZOOM_SPEED)
    ))

    const mousePointTo = {
      x: (pointer.x - stageX) / oldScale,
      y: (pointer.y - stageY) / oldScale,
    }

    const newX = pointer.x - mousePointTo.x * newScale
    const newY = pointer.y - mousePointTo.y * newScale

    setMapStage(newX, newY, newScale)
  }

  // ── Stage drag ────────────────────────────────────────────────────────────

  function handleStageDragEnd(e) {
    setMapStage(e.target.x(), e.target.y(), stageScale)
  }

  // ── Token drag ────────────────────────────────────────────────────────────

  function handleTokenDragEnd(e, tokenId) {
    // Snap to grid
    const x = e.target.x()
    const y = e.target.y()
    const col = Math.round(x / gridSize)
    const row = Math.round(y / gridSize)
    const snappedX = col * gridSize
    const snappedY = row * gridSize

    e.target.position({ x: snappedX, y: snappedY })
    moveToken(tokenId, col, row)
  }

  // ── Context menu ──────────────────────────────────────────────────────────

  function handleTokenRightClick(e, token) {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    setContextMenu({ x: pos.x, y: pos.y, token })
  }

  // ── Fog geometry ──────────────────────────────────────────────────────────

  // Build fog rects: all cells minus revealed ones
  const fogRects = []
  if (fogEnabled && revealedCells) {
    for (let c = 0; c < mapWidth; c++) {
      for (let r = 0; r < mapHeight; r++) {
        if (!revealedCells[`${c},${r}`]) {
          fogRects.push({ x: c * gridSize, y: r * gridSize })
        }
      }
    }
  }

  // ── Grid lines ────────────────────────────────────────────────────────────

  const gridLines = []
  if (appConfig?.app?.mapGridVisible !== false) {
    for (let c = 0; c <= mapWidth; c++) {
      gridLines.push(
        <Line key={`v${c}`} points={[c * gridSize, 0, c * gridSize, canvasH]}
          stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} listening={false} />
      )
    }
    for (let r = 0; r <= mapHeight; r++) {
      gridLines.push(
        <Line key={`h${r}`} points={[0, r * gridSize, canvasW, r * gridSize]}
          stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} listening={false} />
      )
    }
  }

  return (
    <div className="relative w-full h-full select-none" style={{ cursor: 'grab' }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        x={stageX}
        y={stageY}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
        onClick={() => { setSelectedId(null); setContextMenu(null) }}
      >
        {/* ── Layer 1: Background ── */}
        <Layer>
          {bgImage ? (
            <Image
              image={bgImage}
              x={0} y={0}
              width={canvasW}
              height={canvasH}
              listening={false}
            />
          ) : (
            <Rect
              x={0} y={0} width={canvasW} height={canvasH}
              fill="#1a1814"
              listening={false}
            />
          )}
        </Layer>

        {/* ── Layer 2: Grid ── */}
        <Layer listening={false}>
          {gridLines}
        </Layer>

        {/* ── Layer 3: Fog of war ── */}
        {fogEnabled && (
          <Layer listening={false}>
            {fogRects.map(({ x, y }) => (
              <Rect key={`${x},${y}`}
                x={x} y={y} width={gridSize} height={gridSize}
                fill="rgba(0,0,0,0.82)"
                listening={false}
              />
            ))}
          </Layer>
        )}

        {/* ── Layer 4: Tokens ── */}
        <Layer>
          {tokens.map(token => (
            <TokenShape
              key={token.id}
              token={token}
              gridSize={gridSize}
              selected={selectedId === token.id}
              onClick={() => setSelectedId(token.id)}
              onDragEnd={(e) => handleTokenDragEnd(e, token.id)}
              onContextMenu={(e) => handleTokenRightClick(e, token)}
            />
          ))}
        </Layer>
      </Stage>

      {/* ── Context menu ── */}
      {contextMenu && (
        <TokenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          token={contextMenu.token}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Token info panel (selected) ── */}
      {selectedId && (
        <TokenInfoPanel
          tokenId={selectedId}
          tokens={tokens}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ── Token shape ───────────────────────────────────────────────────────────────

function TokenShape({ token, gridSize, selected, onClick, onDragEnd, onContextMenu }) {
  const r = gridSize / 2 - 3
  const cx = token.x + gridSize / 2
  const cy = token.y + gridSize / 2

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable
      onClick={onClick}
      onTap={onClick}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
    >
      {/* Shadow */}
      <Circle
        x={gridSize / 2 + 2} y={gridSize / 2 + 2}
        radius={r}
        fill="rgba(0,0,0,0.5)"
        listening={false}
      />

      {/* Portrait clip circle */}
      {token.imageData?.img ? (
        <Image
          image={token.imageData.img}
          x={gridSize / 2 - r}
          y={gridSize / 2 - r}
          width={r * 2}
          height={r * 2}
          cornerRadius={r}
          listening={false}
        />
      ) : (
        /* Fallback coloured circle with initial */
        <Circle
          x={gridSize / 2} y={gridSize / 2}
          radius={r}
          fill={token.color || '#555'}
          listening={false}
        />
      )}

      {/* Border ring */}
      <Circle
        x={gridSize / 2} y={gridSize / 2}
        radius={r}
        stroke={selected ? '#fff' : (token.color || '#d4a520')}
        strokeWidth={selected ? 2.5 : 2}
        fill="transparent"
        listening={false}
      />

      {/* Selection pulse ring */}
      {selected && (
        <Circle
          x={gridSize / 2} y={gridSize / 2}
          radius={r + 4}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1.5}
          fill="transparent"
          listening={false}
        />
      )}

      {/* Name label */}
      <Text
        x={0} y={gridSize - 2}
        width={gridSize}
        text={token.label?.split(' ')[0] || '?'}
        fontSize={9}
        fontFamily="Inter, sans-serif"
        fill="rgba(255,255,255,0.9)"
        align="center"
        shadowColor="black"
        shadowBlur={3}
        shadowOpacity={0.8}
        listening={false}
      />
    </Group>
  )
}

// ── Token context menu ────────────────────────────────────────────────────────

function TokenContextMenu({ x, y, token, onClose }) {
  const { removeToken, revealRadius, map } = useGameStore()

  const actions = [
    {
      label: 'Reveal area', icon: '👁',
      action: () => {
        if (token.col !== undefined && token.row !== undefined) {
          revealRadius(token.col, token.row, 4)
        }
        onClose()
      },
    },
    {
      label: 'Remove token', icon: '✕',
      action: () => { removeToken(token.id); onClose() },
    },
  ]

  return (
    <div
      className="absolute z-50 panel shadow-panel-lg min-w-[140px] py-1"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-ink-700">
        <p className="font-ui text-xs text-parchment-300 font-medium truncate">{token.label}</p>
        <p className="font-ui text-xs text-parchment-500 capitalize">{token.type}</p>
      </div>
      {actions.map(a => (
        <button
          key={a.label}
          onClick={a.action}
          className="w-full text-left px-3 py-1.5 text-xs font-ui text-parchment-300 hover:bg-ink-700 flex items-center gap-2"
        >
          <span>{a.icon}</span>{a.label}
        </button>
      ))}
    </div>
  )
}

// ── Token info panel ──────────────────────────────────────────────────────────

function TokenInfoPanel({ tokenId, tokens, onClose }) {
  const { characters, world } = useGameStore()
  const token = tokens.find(t => t.id === tokenId)
  if (!token) return null

  const char = characters[tokenId]
  const npc = world.npcs?.[tokenId]
  const entity = char || npc

  if (!entity) return null

  return (
    <div className="absolute bottom-4 left-4 panel p-3 w-56 shadow-panel-lg z-30 animate-slide-up">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-display text-sm text-parchment-100">{entity.name}</p>
          {entity.role && <p className="font-body text-xs text-parchment-400">{entity.role}</p>}
          {entity.ancestry && !entity.role && (
            <p className="font-body text-xs text-parchment-400 capitalize">{entity.ancestry}</p>
          )}
        </div>
        <button onClick={onClose} className="text-parchment-500 hover:text-parchment-300 text-xs ml-2">✕</button>
      </div>

      {/* HP bar for characters */}
      {char && (
        <div>
          <div className="flex justify-between text-xs font-ui mb-1">
            <span className="text-parchment-400">HP</span>
            <span className="text-parchment-300">{char.hp}/{char.maxHp}</span>
          </div>
          <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-forest-500 transition-all"
              style={{ width: `${Math.max(0, (char.hp / char.maxHp) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Disposition for NPCs */}
      {npc?.disposition && (
        <p className="text-xs font-ui text-parchment-400 capitalize mt-1">
          {npc.disposition}
        </p>
      )}

      {/* Active conditions */}
      {entity.conditions?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entity.conditions.map(c => (
            <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-crimson-600/20 text-crimson-300 font-ui">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
