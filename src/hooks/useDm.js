/**
 * useDm — React hook that wires the DM engine to the game store.
 *
 * Handles:
 *  - Campaign initialisation
 *  - Player input → streaming DM response
 *  - Roll request lifecycle
 *  - Image generation side-effects
 *  - TTS side-effects
 */

import { useCallback, useRef } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import {
  initialiseCampaign,
  playerTurn,
  resolveRolls,
  parseDmResponse,
  generateResponseImages,
  speakDmMessage,
  summariseForMemory,
} from '@/lib/world/dmEngine'
import { stopSpeaking } from '@/services/tts/ttsService'
import { parseStoryTags, applyStoryUpdates, createQuest } from '@/lib/story/storyEngine'
import { useSessionMemory } from '@/hooks/useSessionMemory'
import {
  retrieveContext, formatRetrievedContext, storeEvent, ensureCollections,
} from '@/services/rag/ragService'

export function useDm() {
  const { config, ragAvailable } = useAppStore(s => ({ config: s.config, ragAvailable: s.ragAvailable }))
  const campaignId = useGameStore(s => s.campaign?.id)
  const { getSessionContext } = useSessionMemory(campaignId)
  const {
    campaign, world, characters, story, messages,
    addMessage, setDmThinking, setSpeaking,
    setGlobalFlag, setCurrentLocation,
    setWorld, setStory, addQuest, addLore, updateNpc, advanceAct: doAdvanceAct,
    setMapBackground, revealRadius, clearFog, map,
    setGameOver,
  } = useGameStore()

  // Track the streaming message id so we can update it in place
  const streamingIdRef = useRef(null)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const gameState = { campaign, world, characters, story, messages }

  function applyParsedSideEffects(parsed, rawText) {
    // Apply [FLAG:] world flags
    parsed.flags?.forEach(({ key, value }) => {
      setGlobalFlag(key, value === 'true' ? true : value === 'false' ? false : value)
    })

    // Apply [QUEST:] new quests discovered
    parsed.quests?.forEach(({ title, objective }) => {
      addQuest(createQuest({ title, objective }))
    })

    // Parse and apply extended story tags
    if (rawText) {
      const storyTags = parseStoryTags(rawText)
      const { story: updatedStory, world: updatedWorld } = applyStoryUpdates(
        storyTags,
        useGameStore.getState().story,
        useGameStore.getState().world
      )
      setStory(updatedStory)
      setWorld(updatedWorld)

      // If location changed, reset map fog for new area
      if (storyTags.locationChange) {
        useGameStore.setState(state => {
          state.map.tokenPositions = {}
          state.map.revealedCells = {}
          state.map.backgroundImage = null
        })
      }
    }

    // Handle [COMBAT:] tags — signal to GamePage to open combat tracker
    if (parsed.combat?.length > 0) {
      useGameStore.setState(state => {
        state._pendingCombat = parsed.combat
      })
    }

    // Handle [GAME_OVER:] — trigger end screen
    if (parsed.gameOver) {
      setGameOver(parsed.gameOver)
    }
  }

  // ── Start streaming DM message ─────────────────────────────────────────────

  function startStreamingMessage(role = 'assistant') {
    const id = crypto.randomUUID()
    streamingIdRef.current = id
    addMessage({ id, role, content: '', streaming: true })
    return id
  }

  function appendToStreamingMessage(chunk) {
    const id = streamingIdRef.current
    if (!id) return
    useGameStore.setState(state => {
      const msg = state.messages.find(m => m.id === id)
      if (msg) msg.content += chunk
    })
  }

  function finaliseStreamingMessage(parsed) {
    const id = streamingIdRef.current
    if (!id) return
    useGameStore.setState(state => {
      const msg = state.messages.find(m => m.id === id)
      if (msg) {
        msg.content = parsed.displayText
        msg.streaming = false
        msg.rolls = parsed.rolls
        msg.images = parsed.images
        msg.oocNotes = parsed.oocNotes
      }
    })
    streamingIdRef.current = null
  }

  // ── Init campaign ──────────────────────────────────────────────────────────

  const initCampaign = useCallback(async () => {
    setDmThinking(true)
    // Show a status message during world generation (can take 10-30s)
    addMessage({
      id: 'world-gen-status',
      role: 'system',
      type: 'status',
      content: 'Generating world…',
      streaming: false,
    })

    startStreamingMessage('assistant')

    try {
      const result = await initialiseCampaign({
        campaign,
        characters,
        config,
        onChunk: appendToStreamingMessage,

        // Phase 1 complete: world is ready, store it
        onWorldReady: (world) => {
          // Remove status message
          useGameStore.setState(state => {
            state.messages = state.messages.filter(m => m.id !== 'world-gen-status')
          })
          setWorld(world)
          setStory({
            currentAct: 1,
            activeQuests: world.startingQuests || [],
            completedQuests: [],
            globalFlags: {},
            tension: 1,
            storyActs: world.storyActs || [],
          })
        },

        // Phase 2 complete: opening narrative streamed
        onComplete: ({ parsed, world, story, storyTags }) => {
          finaliseStreamingMessage(parsed)
          applyParsedSideEffects(parsed, parsed.raw)

          generateResponseImages({
            parsed, config, campaign,
            onImage: ({ tag, base64 }) => {
              useGameStore.setState(state => {
                const msgs = state.messages
                for (let i = msgs.length - 1; i >= 0; i--) {
                  const imgEntry = msgs[i].images?.find(img => img.raw === tag.raw)
                  if (imgEntry) { imgEntry.base64 = base64; break }
                }
              })
            },
          })

          if (parsed.speakableText) {
            speakDmMessage({ text: parsed.speakableText, config, npcs: useGameStore.getState().world?.npcs || {}, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })
          }
        },
      })

      return result
    } catch (err) {
      console.error('[DM] initCampaign failed:', err)
      // Remove the status message
      useGameStore.setState(state => {
        state.messages = state.messages.filter(m => m.id !== 'world-gen-status')
      })
      // Cancel any streaming message in progress
      useGameStore.setState(state => {
        state.messages = state.messages.filter(m => !m.streaming)
      })
      // Show a fallback message so the screen isn't blank
      addMessage({
        role: 'assistant',
        content: `Welcome to **${campaign?.name || 'your adventure'}**.\n\nI had trouble generating the world — this is usually a connection issue with your LLM.\n\n**To try again:** type anything in the chat and I'll begin the adventure.\n\n*(Error: ${err.message})*`,
        streaming: false,
      })
    } finally {
      setDmThinking(false)
    }
  }, [campaign, characters, config])

  // ── Player sends action ────────────────────────────────────────────────────

  const sendPlayerAction = useCallback(async (input) => {
    if (!input.trim()) return

    // Stop any current TTS before processing new input
    stopSpeaking()

    // Add player message
    addMessage({ role: 'user', content: input.trim() })

    setDmThinking(true)
    startStreamingMessage('assistant')

    let pendingRolls = null

    try {
      // ── RAG retrieval ──────────────────────────────────────────────────────
      let ragContext = null
      if (ragAvailable && config.rag?.enabled !== false && campaignId) {
        try {
          const results = await retrieveContext(campaignId, input, {
            threshold: config.rag?.threshold ?? 0.65,
            maxResults: config.rag?.maxResults ?? 5,
          })
          ragContext = formatRetrievedContext(results)
        } catch (err) {
          console.warn('[RAG] Retrieval failed (non-fatal):', err.message)
        }
      }

      const parsed = await playerTurn({
        input,
        gameState,
        config,
        sessionContext: getSessionContext(),
        ragContext,
        onChunk: appendToStreamingMessage,
        onRollRequest: (rolls) => { pendingRolls = rolls },
        onComplete: (p) => {
          finaliseStreamingMessage(p)
          applyParsedSideEffects(p)

          generateResponseImages({
            parsed: p, config, campaign,
            onImage: ({ tag, base64 }) => {
              useGameStore.setState(state => {
                const msgs = state.messages
                for (let i = msgs.length - 1; i >= 0; i--) {
                  const imgEntry = msgs[i].images?.find(img => img.raw === tag.raw)
                  if (imgEntry) { imgEntry.base64 = base64; break }
                }
                // Use scene images as map background
                if (tag.type?.toLowerCase().includes('scene') || tag.type?.toLowerCase().includes('location')) {
                  state.map.backgroundImage = `data:image/png;base64,${base64}`
                }
              })
            },
          })

          if (p.speakableText) {
            setSpeaking(true)
            speakDmMessage({ text: p.speakableText, config, npcs: useGameStore.getState().world?.npcs || {}, onEnd: () => setSpeaking(false) })
          }
        },
      })

      // If DM requested rolls, add a roll-request message
      if (pendingRolls?.length) {
        addMessage({
          role: 'system',
          type: 'roll-request',
          content: '',
          rolls: pendingRolls,
          awaitingRolls: true,
        })
      }

      // ── RAG event storage ──────────────────────────────────────────────────
      if (parsed && campaignId && ragAvailable && config.rag?.enabled !== false) {
        const dmResponse = parsed.raw || ''
        const shouldStore = dmResponse.length >= 150 && (
          config.rag?.storeAllResponses ||
          dmResponse.includes('[FLAG:') ||
          dmResponse.includes('[QUEST:') ||
          dmResponse.includes('[COMBAT:') ||
          dmResponse.length >= 400
        )
        if (shouldStore) {
          // Summarise into facts before storing — raw prose retrieval is just noise
          summariseForMemory(input, dmResponse, config)
            .then(summary => {
              if (!summary) return
              storeEvent(campaignId, {
                content: summary,
                tags: extractTags(dmResponse),
                turn: messages.length,
              })
            })
            .catch(err => console.warn('[RAG] Memory summarisation failed:', err.message))
        }
      }

      return parsed
    } finally {
      setDmThinking(false)
    }
  }, [gameState, config, campaign])

  // ── Submit roll results ────────────────────────────────────────────────────

  const submitRolls = useCallback(async (rollResults) => {
    // Mark roll-request message as resolved
    useGameStore.setState(state => {
      const req = [...state.messages].reverse().find(m => m.type === 'roll-request' && m.awaitingRolls)
      if (req) req.awaitingRolls = false
    })

    // Add roll result messages
    rollResults.forEach(r => {
      addMessage({
        role: 'system',
        type: 'roll-result',
        content: `${r.character} — ${r.stat}: ${r.rolls.join(', ')} → ${r.successes} success${r.successes !== 1 ? 'es' : ''} (${r.result})`,
        rollData: r,
      })
    })

    setDmThinking(true)
    startStreamingMessage('assistant')

    try {
      await resolveRolls({
        rollResults,
        gameState,
        config,
        sessionContext: getSessionContext(),
        onChunk: appendToStreamingMessage,
        onComplete: (p) => {
          finaliseStreamingMessage(p)
          applyParsedSideEffects(p)

          if (p.speakableText) {
            setSpeaking(true)
            speakDmMessage({ text: p.speakableText, config, npcs: useGameStore.getState().world?.npcs || {}, onEnd: () => setSpeaking(false) })
          }
        },
      })
    } finally {
      setDmThinking(false)
    }
  }, [gameState, config])

  return { initCampaign, sendPlayerAction, submitRolls }
}

function extractTags(text) {
  const tagPattern = /\[(\w+):/g
  const tags = []
  let match
  while ((match = tagPattern.exec(text)) !== null) {
    tags.push(match[1].toLowerCase())
  }
  return [...new Set(tags)]
}
