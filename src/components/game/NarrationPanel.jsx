import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/appStore'
import clsx from 'clsx'

const ROLE_STYLES = {
  system:    { label: 'system',    border: 'border-arcane-600',  bg: 'bg-arcane-600/10',  text: 'text-arcane-400'  },
  user:      { label: 'user',      border: 'border-forest-600',  bg: 'bg-forest-600/10',  text: 'text-forest-400'  },
  assistant: { label: 'assistant', border: 'border-gold-500',    bg: 'bg-gold-500/10',    text: 'text-gold-300'    },
}

const DIR_ICON = { outbound: '→', inbound: '←' }

export default function NarrationPanel() {
  const llmLog = useGameStore(s => s.llmLog)
  const clearLlmLog = useGameStore(s => s.clearLlmLog)
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('all')   // 'all' | 'system' | 'user' | 'assistant'

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [llmLog.length, autoScroll])

  const visible = filter === 'all' ? llmLog : llmLog.filter(e => e.role === filter)

  // Pre-compute which entries start a new group (avoids side-effects in render)
  const groupStarts = new Set()
  let seenGroup = null
  visible.forEach((entry, idx) => {
    if (entry.group && entry.group !== seenGroup) {
      groupStarts.add(idx)
      seenGroup = entry.group
    }
  })

  return (
    <div className="flex flex-col h-full bg-ink-950 font-mono text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-700 bg-ink-900 flex-shrink-0">
        <span className="text-parchment-400 font-ui text-xs uppercase tracking-wider">Raw LLM Narration</span>
        <div className="flex gap-1 ml-2">
          {['all', 'system', 'user', 'assistant'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-ui transition-all capitalize',
                filter === f
                  ? 'bg-ink-600 text-parchment-100'
                  : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-parchment-500 hover:text-parchment-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="accent-gold-500"
          />
          <span className="font-ui text-xs">Auto-scroll</span>
        </label>
        <button
          onClick={clearLlmLog}
          className="px-2 py-0.5 rounded text-xs font-ui text-parchment-500 hover:text-crimson-300 hover:bg-ink-800 transition-all"
          title="Clear log"
        >
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visible.length === 0 && (
          <div className="text-center py-16 text-parchment-600 font-ui">
            <p>No LLM exchanges yet.</p>
            <p className="mt-1 text-parchment-700">Start the adventure to see raw messages here.</p>
          </div>
        )}

        {visible.map((entry, idx) => {
          const style = ROLE_STYLES[entry.role] || ROLE_STYLES.user
          const isNewGroup = groupStarts.has(idx)

          return (
            <React.Fragment key={entry.id}>
              {/* Exchange divider */}
              {isNewGroup && idx > 0 && (
                <div className="flex items-center gap-2 py-2 my-1">
                  <div className="flex-1 h-px bg-ink-700" />
                  <span className="text-ink-500 font-ui text-xs">{entry.label || 'Exchange'}</span>
                  <div className="flex-1 h-px bg-ink-700" />
                </div>
              )}
              {isNewGroup && idx === 0 && entry.label && (
                <div className="flex items-center gap-2 pb-1">
                  <span className="text-ink-400 font-ui text-xs uppercase tracking-wider">{entry.label}</span>
                </div>
              )}

              <div className={clsx('border-l-2 pl-3 py-1 rounded-r', style.border, style.bg)}>
                {/* Header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={clsx('font-ui font-medium', style.text)}>
                    {DIR_ICON[entry.direction]} [{entry.role}]
                  </span>
                  <span className="text-ink-500 text-xs">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-ink-600 text-xs ml-auto">
                    {entry.content.length.toLocaleString()} chars
                  </span>
                </div>
                {/* Raw content */}
                <pre className="whitespace-pre-wrap break-words text-parchment-300 leading-relaxed text-xs overflow-hidden">
                  {entry.content}
                </pre>
              </div>
            </React.Fragment>
          )
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
