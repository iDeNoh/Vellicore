/**
 * useTts — React hook that manages TTS playback during the game.
 *
 * Responsibilities:
 *  - Auto-speak DM responses when they arrive (if autoTts enabled)
 *  - Track speaking state in the game store
 *  - Expose manual play/stop controls
 *  - Sync per-NPC voice assignments with world state
 */

import { useCallback, useEffect, useRef } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import {
  speakDmResponse,
  stopSpeaking,
  isSpeaking,
  onSpeakingStateChange,
  setVolume,
  getVolume,
  getNpcVoice,
  setNpcVoice,
  KOKORO_VOICES,
} from '@/services/tts/ttsService'

export function useTts() {
  const config = useAppStore(s => s.config)
  const { world, setSpeaking } = useGameStore()

  const isEnabled = config?.tts?.enabled
  const isAuto = config?.app?.autoTts

  // ── Sync speaking state to game store ─────────────────────────────────────

  useEffect(() => {
    onSpeakingStateChange((speaking) => setSpeaking(speaking))
    return () => onSpeakingStateChange(null)
  }, [])

  // ── Speak a DM message ─────────────────────────────────────────────────────

  const speak = useCallback(async (text) => {
    if (!isEnabled || !text?.trim()) return

    await speakDmResponse({
      text,
      config,
      npcs: world.npcs || {},
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
  }, [config, world.npcs, isEnabled])

  // ── Stop ───────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    stopSpeaking()
    setSpeaking(false)
  }, [])

  // ── Voice assignment helpers ───────────────────────────────────────────────

  const getVoiceForNpc = useCallback((npc) => {
    return getNpcVoice(npc, config?.tts?.dmVoice)
  }, [config?.tts?.dmVoice])

  const assignVoice = useCallback((npcId, voiceId) => {
    setNpcVoice(npcId, voiceId)
  }, [])

  // ── Volume ─────────────────────────────────────────────────────────────────

  const updateVolume = useCallback((vol) => {
    setVolume(vol)
  }, [])

  return {
    isEnabled,
    isAuto,
    speak,
    stop,
    getVoiceForNpc,
    assignVoice,
    updateVolume,
    voices: KOKORO_VOICES,
  }
}
