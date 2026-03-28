import React, { useEffect, useState } from 'react'

const STAGES = [
  { label: 'Naming the world…',         duration: 2000 },
  { label: 'Carving the geography…',    duration: 2500 },
  { label: 'Seeding the factions…',     duration: 2000 },
  { label: 'Breathing life into NPCs…', duration: 2500 },
  { label: 'Weaving the story arcs…',   duration: 2000 },
  { label: 'Opening the first scene…',  duration: 99999 },
]

export default function WorldGenStatus({ visible }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (!visible) { setStageIndex(0); return }

    let i = 0
    function advance() {
      i++
      if (i < STAGES.length - 1) {
        setStageIndex(i)
        setTimeout(advance, STAGES[i].duration)
      } else {
        setStageIndex(STAGES.length - 1)
      }
    }

    const timer = setTimeout(advance, STAGES[0].duration)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ink-950/95 backdrop-blur-sm">
      {/* Animated flame */}
      <div className="relative mb-8">
        <div className="w-6 h-12 bg-gold-400 rounded-full animate-flicker opacity-90 mx-auto" />
        <div className="w-10 h-3 bg-ink-800 rounded-full mt-1 mx-auto" />
      </div>

      <h2 className="font-display text-2xl text-parchment-100 mb-3 tracking-wider">
        Building Your World
      </h2>

      {/* Stage list */}
      <div className="space-y-2 w-64">
        {STAGES.slice(0, stageIndex + 1).map((stage, i) => (
          <div
            key={i}
            className="flex items-center gap-3 text-sm font-ui animate-fade-in"
          >
            {i < stageIndex ? (
              <span className="text-forest-400 shrink-0">✓</span>
            ) : (
              <span className="w-3 h-3 rounded-full bg-gold-400 animate-pulse shrink-0" />
            )}
            <span className={i < stageIndex ? 'text-parchment-500 line-through' : 'text-parchment-200'}>
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      <p className="font-body text-xs text-parchment-500 mt-8 max-w-xs text-center">
        The AI is crafting a unique world for your campaign.
        This takes 15–30 seconds depending on your LLM.
      </p>
    </div>
  )
}
