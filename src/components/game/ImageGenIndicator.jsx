import React, { useState } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import { getQueueDepth } from '@/services/image/imageService'
import ImageGallery from './ImageGallery'
import clsx from 'clsx'

/**
 * Compact indicator shown in the GameToolbar when images are being generated.
 * Click to open the full ImageGallery.
 */
export default function ImageGenIndicator() {
  const isGenerating = useGameStore(s => s.isGeneratingImage)
  const messages = useGameStore(s => s.messages)
  const config = useAppStore(s => s.config)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const imageCount = messages.reduce((sum, m) =>
    sum + (m.images?.filter(i => i.base64).length || 0), 0)

  if (!config?.image?.enabled) return null

  return (
    <>
      <button
        onClick={() => setGalleryOpen(true)}
        className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-ui transition-all',
          isGenerating
            ? 'text-arcane-300 bg-arcane-600/10 border border-arcane-600/30'
            : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
        )}
        title="Open image gallery"
      >
        {isGenerating ? (
          <>
            <span className="w-2 h-2 rounded-full bg-arcane-400 animate-pulse" />
            <span>Generating…</span>
          </>
        ) : (
          <>
            <span>◈</span>
            <span>{imageCount} image{imageCount !== 1 ? 's' : ''}</span>
          </>
        )}
      </button>

      {galleryOpen && <ImageGallery onClose={() => setGalleryOpen(false)} />}
    </>
  )
}
