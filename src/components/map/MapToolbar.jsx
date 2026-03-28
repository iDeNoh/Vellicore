import React, { useState } from 'react'
import { useGameStore } from '@/store/appStore'
import clsx from 'clsx'

export default function MapToolbar({ onAddToken }) {
  const {
    map, toggleFog, clearFog, resetMap, setMapStage,
  } = useGameStore()

  const { fogEnabled, stageScale } = map

  function zoomIn() {
    const newScale = Math.min(4, stageScale * 1.25)
    setMapStage(map.stageX, map.stageY, newScale)
  }

  function zoomOut() {
    const newScale = Math.max(0.25, stageScale / 1.25)
    setMapStage(map.stageX, map.stageY, newScale)
  }

  function resetView() {
    setMapStage(0, 0, 1)
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-ink-900 border-b border-ink-700">
      {/* Fog controls */}
      <ToolGroup label="Fog">
        <ToolBtn
          active={fogEnabled}
          onClick={toggleFog}
          title={fogEnabled ? 'Fog on — click to disable' : 'Fog off — click to enable'}
        >
          {fogEnabled ? '🌫' : '☀'}
        </ToolBtn>
        <ToolBtn onClick={clearFog} title="Reveal entire map">
          👁 All
        </ToolBtn>
      </ToolGroup>

      <Divider />

      {/* Zoom */}
      <ToolGroup label="Zoom">
        <ToolBtn onClick={zoomOut} title="Zoom out">−</ToolBtn>
        <span className="text-xs font-ui text-parchment-400 w-10 text-center">
          {Math.round(stageScale * 100)}%
        </span>
        <ToolBtn onClick={zoomIn} title="Zoom in">+</ToolBtn>
        <ToolBtn onClick={resetView} title="Reset view">⌂</ToolBtn>
      </ToolGroup>

      <Divider />

      {/* Token placement */}
      <ToolGroup label="Tokens">
        <ToolBtn onClick={onAddToken} title="Place token on map">
          + Token
        </ToolBtn>
      </ToolGroup>

      <div className="flex-1" />

      {/* Reset map */}
      <ToolBtn
        onClick={() => { if (confirm('Clear all token positions?')) resetMap() }}
        title="Reset map"
        className="text-crimson-400 hover:text-crimson-300"
      >
        ↺ Reset
      </ToolBtn>
    </div>
  )
}

function ToolGroup({ label, children }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-parchment-500 font-ui mr-1">{label}</span>
      {children}
    </div>
  )
}

function ToolBtn({ children, onClick, title, active, className }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'px-2 py-1 rounded text-xs font-ui transition-all',
        active
          ? 'bg-gold-500/20 text-gold-300 border border-gold-500/40'
          : 'text-parchment-400 hover:text-parchment-200 hover:bg-ink-700',
        className
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-4 bg-ink-700 mx-1" />
}
