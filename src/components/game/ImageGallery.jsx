import React, { useState, useMemo } from 'react'
import { useGameStore } from '@/store/appStore'
import { useImagePipeline } from '@/hooks/useImagePipeline'
import clsx from 'clsx'

const TABS = ['scenes', 'portraits', 'locations']

export default function ImageGallery({ onClose }) {
  const [tab, setTab] = useState('scenes')
  const [selected, setSelected] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const { world, messages, campaign } = useGameStore()
  const { regenerateNpcPortrait, regenerateLocationImage, isEnabled } = useImagePipeline()

  // ── Collect images by category ─────────────────────────────────────────────

  const sceneImages = useMemo(() => {
    const imgs = []
    messages.forEach(msg => {
      if (!msg.images) return
      msg.images.forEach(img => {
        if (img.base64) {
          imgs.push({
            id: `${msg.id}-${img.raw}`,
            base64: img.base64,
            label: img.description || 'Scene',
            type: img.type || 'scene',
            timestamp: msg.timestamp,
          })
        }
      })
    })
    return imgs.reverse()
  }, [messages])

  const portraitImages = useMemo(() => {
    const imgs = []
    // Player characters
    Object.values(world.characters || {}).forEach(c => {
      if (c?.portraitBase64) {
        imgs.push({ id: `char-${c.id}`, base64: c.portraitBase64, label: c.name, type: 'character', entityId: c.id, entityType: 'character' })
      }
    })
    // NPCs
    Object.values(world.npcs || {}).forEach(npc => {
      if (npc?.portraitBase64) {
        imgs.push({ id: `npc-${npc.id}`, base64: npc.portraitBase64, label: npc.name, sublabel: npc.role, type: 'npc', entityId: npc.id, entityType: 'npc' })
      }
    })
    return imgs
  }, [world.npcs])

  const locationImages = useMemo(() => {
    return Object.values(world.locations || {})
      .filter(l => l.imageBase64)
      .map(l => ({
        id: `loc-${l.id}`,
        base64: l.imageBase64,
        label: l.name,
        sublabel: l.type,
        type: 'location',
        entityId: l.id,
        entityType: 'location',
      }))
  }, [world.locations])

  const allImages = { scenes: sceneImages, portraits: portraitImages, locations: locationImages }
  const currentImages = allImages[tab] || []

  // ── Download ───────────────────────────────────────────────────────────────

  function downloadImage(img) {
    const a = document.createElement('a')
    a.href = `data:image/png;base64,${img.base64}`
    a.download = `${img.label.replace(/\s+/g, '_')}_${Date.now()}.png`
    a.click()
  }

  async function handleRegenerate(img) {
    if (!isEnabled) return
    if (img.entityType === 'npc') await regenerateNpcPortrait(img.entityId)
    if (img.entityType === 'location') await regenerateLocationImage(img.entityId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>

      {lightbox && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/95 cursor-zoom-out"
          onClick={() => setLightbox(null)}>
          <img src={`data:image/png;base64,${lightbox.base64}`}
            alt={lightbox.label}
            className="max-w-full max-h-full object-contain rounded shadow-panel-lg" />
          <div className="absolute bottom-6 text-center">
            <p className="font-display text-sm text-parchment-200">{lightbox.label}</p>
            {lightbox.sublabel && <p className="font-body text-xs text-parchment-400">{lightbox.sublabel}</p>}
          </div>
        </div>
      )}

      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <div>
            <h2 className="font-display text-lg text-parchment-100">Image Gallery</h2>
            <p className="font-body text-xs text-parchment-400 mt-0.5">
              {campaign?.name} — {sceneImages.length + portraitImages.length + locationImages.length} images
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-700 px-4 pt-3 gap-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-4 py-1.5 rounded-t text-sm font-ui capitalize transition-colors',
                tab === t
                  ? 'bg-ink-700 text-parchment-100 border border-b-ink-700 border-ink-600'
                  : 'text-parchment-400 hover:text-parchment-200'
              )}>
              {t} ({allImages[t]?.length || 0})
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {currentImages.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🖼</div>
              <p className="font-body text-parchment-400">No {tab} generated yet</p>
              <p className="font-body text-xs text-parchment-500 mt-1">
                {tab === 'scenes' && 'Images appear here as the DM generates them during play.'}
                {tab === 'portraits' && 'Character and NPC portraits appear here once generated.'}
                {tab === 'locations' && 'Location images appear here as you explore the world.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {currentImages.map(img => (
                <ImageCard
                  key={img.id}
                  img={img}
                  selected={selected === img.id}
                  onSelect={() => setSelected(selected === img.id ? null : img.id)}
                  onLightbox={() => setLightbox(img)}
                  onDownload={() => downloadImage(img)}
                  onRegenerate={
                    img.entityType && isEnabled ? () => handleRegenerate(img) : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Image card ────────────────────────────────────────────────────────────────

function ImageCard({ img, selected, onSelect, onLightbox, onDownload, onRegenerate }) {
  return (
    <div className={clsx('rounded-lg overflow-hidden border transition-all cursor-pointer group',
      selected ? 'border-gold-500 ring-1 ring-gold-500/40' : 'border-ink-700 hover:border-ink-500'
    )}>
      <div className="relative aspect-square bg-ink-900" onClick={onLightbox}>
        <img
          src={`data:image/png;base64,${img.base64}`}
          alt={img.label}
          className="w-full h-full object-cover"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={e => { e.stopPropagation(); onDownload() }}
            className="p-1.5 rounded bg-ink-800/80 text-parchment-300 hover:text-parchment-100 text-xs"
            title="Download">↓</button>
          {onRegenerate && (
            <button onClick={e => { e.stopPropagation(); onRegenerate() }}
              className="p-1.5 rounded bg-ink-800/80 text-parchment-300 hover:text-parchment-100 text-xs"
              title="Regenerate">↺</button>
          )}
        </div>
      </div>
      <div className="px-2 py-1.5 bg-ink-800">
        <p className="font-ui text-xs text-parchment-200 truncate">{img.label}</p>
        {img.sublabel && (
          <p className="font-body text-xs text-parchment-500 capitalize truncate">{img.sublabel}</p>
        )}
      </div>
    </div>
  )
}
