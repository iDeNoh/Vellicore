import React, { useState, useRef, useEffect } from 'react'
import { useGameStore } from '@/store/appStore'
import MapCanvas from './MapCanvas'
import MapToolbar from './MapToolbar'
import AddTokenModal from './AddTokenModal'

export default function MapPanel() {
  const containerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [showAddToken, setShowAddToken] = useState(false)

  const world = useGameStore(s => s.world)
  const map = useGameStore(s => s.map)
  const currentLoc = world.locations?.[world.currentLocation]

  // ── Track container size for Konva Stage ──────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width: Math.floor(width), height: Math.floor(height) })
      }
    })

    observer.observe(containerRef.current)
    const { width, height } = containerRef.current.getBoundingClientRect()
    setDimensions({ width: Math.floor(width), height: Math.floor(height) })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex flex-col h-full bg-ink-950">
      {/* Toolbar */}
      <MapToolbar onAddToken={() => setShowAddToken(true)} />

      {/* Location info bar */}
      {currentLoc && (
        <div className="flex items-center gap-3 px-4 py-2 bg-ink-900 border-b border-ink-700">
          <span className="font-display text-sm text-parchment-200">{currentLoc.name}</span>
          {currentLoc.type && (
            <span className="text-xs text-parchment-500 font-ui capitalize">{currentLoc.type}</span>
          )}
          {currentLoc.atmosphere && (
            <span className="text-xs text-parchment-500 font-body italic truncate max-w-xs">
              {currentLoc.atmosphere}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-parchment-500 font-ui">
            <span>{map.mapWidth}×{map.mapHeight} grid</span>
            <span>·</span>
            <span>{Object.keys(map.tokenPositions).length} token{Object.keys(map.tokenPositions).length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        {dimensions.width > 0 && (
          <MapCanvas
            width={dimensions.width}
            height={dimensions.height}
          />
        )}

        {/* No location placeholder */}
        {!currentLoc && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center panel p-8 max-w-sm">
              <div className="text-4xl mb-4">🗺</div>
              <h3 className="font-display text-lg text-parchment-100 mb-2">No location set</h3>
              <p className="font-body text-parchment-400 text-sm">
                The map will populate as the DM establishes your location.
                Switch to the Narrative panel to begin your adventure.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Token placement modal */}
      {showAddToken && (
        <AddTokenModal onClose={() => setShowAddToken(false)} />
      )}
    </div>
  )
}
