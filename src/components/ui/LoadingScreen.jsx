import React, { useEffect, useState } from 'react'

const LOADING_LINES = [
  'Lighting the torches…',
  'Consulting the ancient tomes…',
  'Waking the dungeon master…',
  'Rolling for atmosphere…',
  'Sharpening the pencils…',
]

export default function LoadingScreen() {
  const [line, setLine] = useState(LOADING_LINES[0])

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      i = (i + 1) % LOADING_LINES.length
      setLine(LOADING_LINES[i])
    }, 900)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-full flex flex-col items-center justify-center bg-ink-950 gap-6">
      {/* Animated flame */}
      <div className="relative w-12 h-16 flex items-end justify-center">
        <div className="w-3 h-8 bg-gold-500 rounded-full animate-flicker opacity-90" />
        <div className="absolute bottom-0 w-5 h-5 bg-ink-700 rounded-full" />
      </div>

      <div className="text-center">
        <h1 className="font-display text-3xl text-parchment-200 tracking-widest mb-3">
          TAVERN AI
        </h1>
        <p className="font-body text-parchment-400 text-sm animate-pulse-slow">
          {line}
        </p>
      </div>
    </div>
  )
}
