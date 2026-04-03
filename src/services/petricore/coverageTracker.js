/**
 * coverageTracker.js — fetches aggregate coverage statistics from the DB.
 * Used by both the Generation page and Dataset Viewer.
 */

import usePetricoreStore from '@/store/petricoreStore'

/**
 * Fetches coverage stats from SQLite via IPC and updates the store.
 */
export async function refreshCoverage() {
  if (!window.tavern?.petricore) return

  try {
    const raw = await window.tavern.petricore.getCoverage()
    if (!raw) return

    // Merge with plan target counts for tag progress display
    const plan = usePetricoreStore.getState().plan
    const byTag = {}
    Object.entries(plan.tags).forEach(([tag, cfg]) => {
      const count = raw.byTag?.[tag] || 0
      byTag[tag] = {
        count,
        targetCount: cfg.targetCount,
        pct: cfg.targetCount > 0 ? Math.min(100, Math.round(count / cfg.targetCount * 100)) : 0,
        status: count >= cfg.targetCount ? 'ok' : count >= cfg.targetCount * 0.5 ? 'low' : 'critical',
      }
    })

    usePetricoreStore.getState().setCoverage({
      ...raw,
      byTag,
    })
  } catch (err) {
    console.error('[coverageTracker] Failed to refresh coverage:', err)
  }
}

/**
 * Returns a summary string for the generation status badge.
 */
export function getStatusLabel(generation) {
  if (generation.running && generation.paused) return 'Paused'
  if (generation.running) return 'Generating'
  if (generation.progress >= 100) return 'Complete'
  return 'Idle'
}

/**
 * Estimates remaining time based on average generation time per example.
 */
export function estimateTimeRemaining(generation, startTime) {
  if (!generation.running || generation.generated === 0 || !startTime) return null
  const elapsed = (Date.now() - startTime) / 1000
  const rate = generation.generated / elapsed // examples per second
  const remaining = (generation.progress < 100)
    ? ((100 - generation.progress) / 100) * (generation.generated / rate)
    : 0
  if (!isFinite(remaining)) return null
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  return mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`
}
