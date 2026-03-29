/**
 * useAutopilot — fully automatic story mode.
 *
 * When enabled:
 *  - After each DM response finishes (and TTS stops speaking),
 *    generates a short in-character player action and submits it.
 *  - Pending dice rolls are auto-rolled with the character's relevant stat.
 *  - Stops automatically on GAME_OVER.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import { generatePlayerAction } from '@/lib/world/dmEngine'
import { rollDice } from '@/lib/rules/rules'

export function useAutopilot({ sendPlayerAction, submitRolls }) {
  const [autoMode, setAutoMode] = useState(false)
  const config     = useAppStore(s => s.config)
  const isDmThinking = useGameStore(s => s.isDmThinking)
  const isSpeaking   = useGameStore(s => s.isSpeaking)
  const gameOver     = useGameStore(s => s.gameOver)
  const messages     = useGameStore(s => s.messages)

  const timerRef   = useRef(null)
  const runningRef = useRef(false)

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const toggle = useCallback(() => setAutoMode(v => !v), [])

  useEffect(() => {
    if (!autoMode) { clearTimer(); return }
    if (gameOver)  { setAutoMode(false); return }

    // Still busy — clear any pending fire and wait
    if (isDmThinking || isSpeaking) { clearTimer(); return }

    // Check for a pending roll request — auto-roll it
    const pendingRoll = [...messages].reverse().find(m => m.type === 'roll-request' && m.awaitingRolls)
    if (pendingRoll) {
      clearTimer()
      timerRef.current = setTimeout(() => {
        const { characters } = useGameStore.getState()
        const rollResults = pendingRoll.rolls.map(r => {
          const char = Object.values(characters).find(c => c.name === r.character)
          const statVal = char?.stats?.[r.stat] || 2
          const { rolls, successes, result } = rollDice(statVal)
          return { character: r.character, stat: r.stat, reason: r.reason, rolls, successes, result }
        })
        submitRolls(rollResults)
      }, 800)
      return clearTimer
    }

    // Schedule player response — only if not already generating one
    if (runningRef.current) return
    clearTimer()
    timerRef.current = setTimeout(async () => {
      if (!autoMode || runningRef.current) return
      runningRef.current = true
      try {
        const { campaign, characters, messages: currentMessages } = useGameStore.getState()
        const action = await generatePlayerAction({ campaign, characters, messages: currentMessages, config })
        if (action && autoMode) sendPlayerAction(action)
      } catch (err) {
        console.warn('[Autopilot] Player action failed:', err.message)
      } finally {
        runningRef.current = false
      }
    }, 1500)

    return clearTimer
  }, [isDmThinking, isSpeaking, autoMode, messages, gameOver])

  // Clean up on unmount
  useEffect(() => clearTimer, [])

  return { autoMode, setAutoMode, toggleAutoMode: toggle }
}
