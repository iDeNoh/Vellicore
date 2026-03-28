/**
 * useSessionMemory — Module 10
 *
 * Full long-campaign memory management:
 *  - Token budget tracking (approximate)
 *  - Auto-summarisation when budget runs low
 *  - Multi-session continuity (past session summaries injected into DM context)
 *  - Manual summarise-now trigger
 *  - Session history loading from DB
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore, useAppStore } from '@/store/appStore'
import { summariseSession } from '@/lib/story/storyEngine'
import { sessions as sessionDb } from '@/services/db/database'
import { storeSessionSummary } from '@/services/rag/ragService'

// Token budget constants
const TOKEN_BUDGET       = 7000   // chars / 4 ≈ tokens
const BUDGET_WARN        = 0.75   // warn at 75%
const BUDGET_AUTO_TRIM   = 0.90   // auto-trim at 90%
const CHARS_PER_TOKEN    = 4
const KEEP_RECENT        = 10     // keep last N messages live when compressing
const MIN_TO_SUMMARISE   = 18     // don't summarise tiny sessions

export function useSessionMemory(campaignId) {
  const config = useAppStore(s => s.config)
  const { messages, world, characters, story, isDmThinking } = useGameStore()

  const isSummarisingRef = useRef(false)
  const [pastSummaries, setPastSummaries] = useState([])  // from previous sessions in DB

  // ── Load past session summaries on mount ──────────────────────────────────

  useEffect(() => {
    if (!campaignId) return
    loadPastSummaries(campaignId).then(setPastSummaries)
  }, [campaignId])

  // ── Token usage estimate ──────────────────────────────────────────────────

  const estimatedTokens = messages.reduce((sum, m) => {
    return sum + Math.ceil((m.content || '').length / CHARS_PER_TOKEN)
  }, 0)

  const budgetUsed = estimatedTokens / TOKEN_BUDGET
  const isNearBudget = budgetUsed > BUDGET_WARN
  const isCritical = budgetUsed > BUDGET_AUTO_TRIM

  // ── Auto-summarise when critical ──────────────────────────────────────────

  useEffect(() => {
    if (!isCritical) return
    if (messages.length < MIN_TO_SUMMARISE) return
    if (isDmThinking) return  // wait for DM to finish
    if (isSummarisingRef.current) return

    const hasLlm = hasLlmConfigured(config)
    if (!hasLlm) return

    console.log('[SessionMemory] Auto-summarising — budget critical')
    summariseAndCompress()
  }, [messages.length, isCritical, isDmThinking])

  // ── Core summarise function ───────────────────────────────────────────────

  const summariseAndCompress = useCallback(async () => {
    if (isSummarisingRef.current) return
    isSummarisingRef.current = true

    const state = useGameStore.getState()
    const { messages: msgs, world: w, characters: c, story: s } = state

    if (msgs.length < MIN_TO_SUMMARISE) {
      isSummarisingRef.current = false
      return
    }

    try {
      // Summarise everything except the most recent messages
      const toSummarise = msgs.filter(m =>
        (m.role === 'user' || m.role === 'assistant') &&
        !m.streaming &&
        m.type !== 'session-summary'
      ).slice(0, -KEEP_RECENT)

      if (toSummarise.length < 6) {
        isSummarisingRef.current = false
        return
      }

      const summary = await summariseSession({
        messages: toSummarise,
        world: w,
        characters: c,
        story: s,
        config,
      })

      if (!summary?.text) {
        isSummarisingRef.current = false
        return
      }

      // Persist to DB
      if (campaignId) {
        await sessionDb.create({
          campaignId,
          type: 'summary',
          summary: summary.text,
          act: summary.act,
          location: summary.location,
          messageCount: toSummarise.length,
        })

        // Also store to RAG for semantic retrieval
        const appState = useAppStore.getState()
        if (appState.ragAvailable && appState.config?.rag?.enabled !== false) {
          try {
            await storeSessionSummary(campaignId, summary.text, {
              sessionNumber: s?.currentAct || 1,
              actNumber: s?.currentAct || 1,
            })
          } catch (err) {
            console.warn('[RAG] Session summary storage failed (non-fatal):', err.message)
          }
        }
      }

      // Replace summarised messages with a single summary block
      useGameStore.setState(state => {
        const remaining = state.messages.filter(m =>
          m.type === 'session-summary' ||
          m.type === 'status' ||
          !toSummarise.find(t => t.id === m.id)
        )
        // Prepend summary block if not already present
        const hasSummary = remaining.some(m => m.type === 'session-summary' && m.content === summary.text)
        if (!hasSummary) {
          state.messages = [
            ...remaining.filter(m => m.type === 'session-summary'),
            {
              id: `summary-${Date.now()}`,
              role: 'system',
              type: 'session-summary',
              content: summary.text,
              timestamp: Date.now(),
              streaming: false,
            },
            ...remaining.filter(m => m.type !== 'session-summary'),
          ]
        }
      })

      console.log('[SessionMemory] Compressed', toSummarise.length, 'messages into summary')
    } catch (err) {
      console.warn('[SessionMemory] Summarisation failed:', err.message)
    } finally {
      isSummarisingRef.current = false
    }
  }, [campaignId, config])

  // ── Context string for DM prompts ─────────────────────────────────────────

  /**
   * Build a context string from past summaries to inject into the DM system prompt.
   * This is how the DM "remembers" what happened in previous sessions.
   */
  function getSessionContext() {
    const parts = []

    // Past sessions from DB (most recent 3)
    const recent = pastSummaries.slice(0, 3)
    if (recent.length > 0) {
      parts.push('PREVIOUS SESSION EVENTS:')
      recent.forEach(s => parts.push(s.summary))
    }

    // In-session summaries from compressed history
    const inSessionSummaries = messages
      .filter(m => m.type === 'session-summary')
      .map(m => m.content)
    if (inSessionSummaries.length > 0) {
      if (parts.length === 0) parts.push('SESSION RECAP:')
      parts.push(...inSessionSummaries)
    }

    return parts.join('\n\n')
  }

  return {
    estimatedTokens,
    budgetUsed,
    isNearBudget,
    isCritical,
    pastSummaries,
    summariseAndCompress,
    getSessionContext,
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function loadPastSummaries(campaignId) {
  try {
    const all = await sessionDb.getByCampaign(campaignId)
    return all
      .filter(s => s.type === 'summary' && s.summary)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
  } catch {
    return []
  }
}

function hasLlmConfigured(config) {
  if (!config?.llm) return false
  const { provider, claudeApiKey, openAiCompatUrl } = config.llm
  if (provider === 'claude' && claudeApiKey) return true
  if (provider === 'ollama') return true       // has default URL
  if (provider === 'lmstudio') return true     // has default URL
  if (provider === 'openai-compat' && openAiCompatUrl) return true
  return false
}
