import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/appStore'
import { rollDice, RESULT_LABELS, STAT_INFO } from '@/lib/rules/rules'
import { stopSpeaking } from '@/services/tts/ttsService'
import { useTts } from '@/hooks/useTts'
import { RichNarrativeText } from '@/components/game/RichText'
import clsx from 'clsx'

export default function ChatPanel({ onSendAction, onSubmitRolls }) {
  const messages = useGameStore(s => s.messages)
  const isDmThinking = useGameStore(s => s.isDmThinking)
  const isSpeaking = useGameStore(s => s.isSpeaking)
  const characters = useGameStore(s => s.characters)

  const { speak: ttsSpeak, isEnabled: ttsEnabled } = useTts()
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const text = input.trim()
    if (!text || isDmThinking) return
    setInput('')
    onSendAction(text)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 text-parchment-400 font-body">
            <div className="text-4xl mb-3">🕯</div>
            <p>Your adventure awaits…</p>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            characters={characters}
            onSubmitRolls={onSubmitRolls}
            ttsEnabled={ttsEnabled}
            ttsSpeak={ttsSpeak}
          />
        ))}

        {/* DM thinking indicator */}
        {isDmThinking && !messages.some(m => m.streaming) && (
          <div className="flex items-center gap-2 text-parchment-400">
            <ThinkingDots />
            <span className="font-body text-sm italic">The DM ponders…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* TTS indicator */}
      {isSpeaking && (
        <div className="px-4 py-1 flex items-center gap-2 text-xs text-parchment-400 bg-ink-800 border-t border-ink-700">
          <span className="animate-pulse">◉</span>
          <span>Narrating…</span>
          <button
            onClick={stopSpeaking}
            className="ml-auto text-parchment-400 hover:text-parchment-200 transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-ink-700 p-3 bg-ink-900">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDmThinking ? 'The DM is responding…' : 'What do you do?'}
            disabled={isDmThinking}
            rows={2}
            className={clsx(
              'flex-1 input resize-none min-h-[60px] max-h-40 font-body text-base',
              isDmThinking && 'opacity-50 cursor-not-allowed'
            )}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isDmThinking}
            className="btn-primary h-[60px] px-5 self-end"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-ink-400 mt-1.5 font-ui">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, characters, onSubmitRolls, ttsEnabled, ttsSpeak }) {
  const { role, type, content, streaming, rollData, rolls, images, oocNotes, awaitingRolls } = message

  if (type === 'session-summary') {
    return (
      <div className="my-2 px-3 py-2 rounded border border-ink-600 bg-ink-800/50">
        <p className="text-xs font-ui text-parchment-500 mb-1 uppercase tracking-wider">Session recap</p>
        <p className="font-body text-xs text-parchment-400 italic">{content}</p>
      </div>
    )
  }

  if (type === 'status') {
    return (
      <div className="flex items-center gap-2 text-parchment-500 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
        <span className="font-ui text-xs italic">{content}</span>
      </div>
    )
  }

  if (type === 'roll-request') {
    return (
      <RollRequest
        rolls={rolls}
        characters={characters}
        awaiting={awaitingRolls}
        onSubmit={onSubmitRolls}
      />
    )
  }

  if (type === 'roll-result') {
    return <RollResult rollData={rollData} content={content} />
  }

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-ink-700 rounded-lg px-4 py-3 border border-ink-600">
          <p className="font-body text-parchment-200 text-base">{content}</p>
        </div>
      </div>
    )
  }

  if (role === 'assistant') {
    return (
      <div className="space-y-3">
        {/* Scene image if generated */}
        {images?.map((img, i) =>
          img.base64 ? (
            <SceneImage key={i} base64={img.base64} description={img.description} />
          ) : null
        )}

        {/* Narrative text */}
        <div className="narrative-block">
          <RichNarrativeText text={content} streaming={streaming} />
        </div>

        {/* OOC notes */}
        {oocNotes?.map((note, i) => (
          <div key={i} className="text-xs text-parchment-400 italic border-l-2 border-ink-500 pl-3 font-ui">
            [DM: {note}]
          </div>
        ))}

        {/* Manual TTS replay */}
        {ttsEnabled && !streaming && content && (
          <div className="flex justify-end mt-1">
            <button
              onClick={() => ttsSpeak(content)}
              className="text-xs text-parchment-500 hover:text-parchment-300 font-ui flex items-center gap-1 transition-colors"
              title="Play narration"
            >
              ▶ narrate
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
}

// ── Roll request ──────────────────────────────────────────────────────────────

function RollRequest({ rolls, characters, awaiting, onSubmit }) {
  const [results, setResults] = useState({})
  const [rolled, setRolled] = useState(false)
  const charList = Object.values(characters)

  function rollAll() {
    const newResults = {}
    rolls.forEach((roll, i) => {
      // Find the character's actual stat value
      const char = charList.find(c =>
        c.name.toLowerCase() === roll.character.toLowerCase()
      ) || charList[0]

      const statValue = char?.stats?.[roll.stat] || 2
      const result = rollDice(statValue)
      newResults[i] = {
        ...result,
        character: roll.character,
        stat: roll.stat,
        reason: roll.reason,
        statValue,
      }
    })
    setResults(newResults)
    setRolled(true)
  }

  function confirm() {
    onSubmit(Object.values(results))
  }

  if (!awaiting) {
    return null // Already resolved, roll results are shown separately
  }

  return (
    <div className="border border-gold-500/40 bg-ink-800/80 rounded-lg p-4 space-y-3 shadow-glow-gold">
      <div className="flex items-center gap-2">
        <span className="text-gold-400">🎲</span>
        <span className="font-display text-sm text-gold-300 tracking-wide">Dice Required</span>
      </div>

      <div className="space-y-2">
        {rolls.map((roll, i) => {
          const char = charList.find(c => c.name.toLowerCase() === roll.character.toLowerCase()) || charList[0]
          const statValue = char?.stats?.[roll.stat] || 2
          const res = results[i]

          return (
            <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-ink-700 last:border-0">
              <div>
                <span className="font-ui text-sm text-parchment-200">{roll.character}</span>
                <span className="text-parchment-500 mx-2">·</span>
                <span className="font-ui text-sm text-gold-400 capitalize">{roll.stat}</span>
                <span className="font-body text-xs text-parchment-400 ml-2 italic">({roll.reason})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-parchment-400 font-ui">{statValue}d6</span>
                {res && (
                  <span className={clsx(
                    'text-sm font-ui font-medium px-2 py-0.5 rounded',
                    res.result === 'failure' ? 'bg-crimson-600/30 text-crimson-300' :
                    res.result === 'partial' ? 'bg-gold-500/20 text-gold-300' :
                    res.result === 'success' ? 'bg-forest-600/30 text-forest-300' :
                    'bg-arcane-600/30 text-arcane-300'
                  )}>
                    {res.successes} — {RESULT_LABELS[res.result]?.label}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!rolled ? (
        <button onClick={rollAll} className="btn-primary w-full">
          🎲 Roll the Dice
        </button>
      ) : (
        <div className="space-y-2">
          {/* Show individual dice */}
          {Object.values(results).map((res, i) => (
            <div key={i} className="flex gap-1.5 items-center flex-wrap">
              <span className="text-xs text-parchment-400 font-ui w-20">{res.character}:</span>
              {res.rolls.map((die, j) => (
                <DieDisplay key={j} value={die} />
              ))}
            </div>
          ))}
          <button onClick={confirm} className="btn-primary w-full mt-2">
            Confirm Results
          </button>
        </div>
      )}
    </div>
  )
}

function DieDisplay({ value }) {
  const isSuccess = value >= 5
  return (
    <span className={clsx(
      'inline-flex items-center justify-center w-8 h-8 rounded font-ui font-medium text-sm border',
      isSuccess
        ? 'bg-forest-600/30 border-forest-500/50 text-forest-200'
        : 'bg-ink-700 border-ink-600 text-parchment-400'
    )}>
      {value}
    </span>
  )
}

// ── Roll result display ───────────────────────────────────────────────────────

function RollResult({ rollData, content }) {
  if (!rollData) return (
    <div className="text-xs text-parchment-400 italic font-ui py-1">{content}</div>
  )

  const tier = RESULT_LABELS[rollData.result]

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex gap-1">
        {rollData.rolls?.map((die, i) => <DieDisplay key={i} value={die} />)}
      </div>
      <span className={clsx(
        'font-ui text-sm font-medium px-2 py-0.5 rounded',
        rollData.result === 'failure' ? 'text-crimson-300 bg-crimson-600/20' :
        rollData.result === 'partial' ? 'text-gold-300 bg-gold-500/15' :
        rollData.result === 'success' ? 'text-forest-300 bg-forest-600/20' :
        'text-arcane-300 bg-arcane-600/20'
      )}>
        {tier?.label}
      </span>
      <span className="text-xs text-parchment-400 font-ui">{rollData.reason}</span>
    </div>
  )
}

// ── Scene image ───────────────────────────────────────────────────────────────

function SceneImage({ base64, description }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg overflow-hidden border border-ink-600">
      <img
        src={`data:image/png;base64,${base64}`}
        alt={description}
        onClick={() => setExpanded(true)}
        className="w-full max-h-64 object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
      />
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setExpanded(false)}
        >
          <img
            src={`data:image/png;base64,${base64}`}
            alt={description}
            className="max-w-full max-h-full rounded-lg shadow-panel-lg"
          />
        </div>
      )}
    </div>
  )
}

// ── Thinking dots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-parchment-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}
