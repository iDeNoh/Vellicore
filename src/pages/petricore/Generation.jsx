import React, { useEffect, useRef, useState } from 'react'
import { Pause, Play, Square, ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import usePetricoreStore from '@/store/petricoreStore'
import {
  startGeneration, pauseGeneration, resumeGeneration, stopGeneration, isRunning,
} from '@/services/petricore/petricoreService'
import { refreshCoverage, estimateTimeRemaining } from '@/services/petricore/coverageTracker'

// ── Tag highlight colours ──────────────────────────────────────────────────────

const TAG_COLORS = {
  VOICE:       'bg-blue-500/20 text-blue-300 border-blue-500/40',
  ROLL:        'bg-amber-500/20 text-amber-300 border-amber-500/40',
  ROLL_RESULTS:'bg-amber-500/15 text-amber-200 border-amber-500/30',
  FLAG:        'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  IMAGE:       'bg-violet-500/20 text-violet-300 border-violet-500/40',
  COMBAT:      'bg-rose-500/20 text-rose-300 border-rose-500/40',
  QUEST:       'bg-teal-500/20 text-teal-300 border-teal-500/40',
  QUEST_UPDATE:'bg-teal-500/15 text-teal-200 border-teal-500/30',
  QUEST_DONE:  'bg-teal-500/25 text-teal-300 border-teal-500/50',
  LOCATION:    'bg-sky-500/20 text-sky-300 border-sky-500/40',
  NPC_UPDATE:  'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  LORE:        'bg-purple-500/20 text-purple-300 border-purple-500/40',
  ACT_ADVANCE: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  OOC:         'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
  GAME_OVER:   'bg-rose-600/25 text-rose-300 border-rose-600/50',
}

const TAG_RE = /\[(VOICE:[^\]]+|ROLL_RESULTS:[^\]]*|ROLL:[^\]]+|IMAGE:[^\]]+|FLAG:[^\]]+|QUEST_UPDATE:[^\]]+|QUEST_DONE:[^\]]+|QUEST:[^\]]+|COMBAT:[^\]]+|LOCATION:[^\]]+|NPC_UPDATE:[^\]]+|LORE:[^\]]+|ACT_ADVANCE|OOC:[^\]]+|GAME_OVER:[^\]]+)\](?:"[^"]*")?/g

function HighlightedText({ text }) {
  if (!text) return null
  const parts = []
  let last = 0
  let match
  TAG_RE.lastIndex = 0
  const re = new RegExp(TAG_RE.source, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    const inner = match[1]
    const tagName = inner.split(':')[0]
    const colorClass = TAG_COLORS[tagName] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40'
    parts.push({ type: 'tag', value: match[0], colorClass })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })

  return (
    <>
      {parts.map((p, i) =>
        p.type === 'text'
          ? <span key={i}>{p.value}</span>
          : <span key={i} className={clsx('inline-block px-1 py-0.5 rounded border text-xs font-mono mx-0.5 align-middle', p.colorClass)}>
              {p.value}
            </span>
      )}
    </>
  )
}

// ── Progress ring ──────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 100, stroke = 8 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#1f1f2e" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#7c3aed" strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.3s' }}
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle"
        fill="#d4c9b0" fontSize={size * 0.18} fontFamily="monospace">
        {pct}%
      </text>
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Generation() {
  const { generation, coverage, plan } = usePetricoreStore()
  const [systemOpen, setSystemOpen] = useState(false)
  const startTimeRef = useRef(null)
  const [eta, setEta] = useState(null)

  useEffect(() => {
    if (generation.running && !startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
    if (!generation.running) startTimeRef.current = null
  }, [generation.running])

  useEffect(() => {
    if (!generation.running) { setEta(null); return }
    const interval = setInterval(() => {
      setEta(estimateTimeRemaining(generation, startTimeRef.current))
    }, 2000)
    return () => clearInterval(interval)
  }, [generation.running, generation.generated])

  useEffect(() => {
    const interval = setInterval(refreshCoverage, 5000)
    return () => clearInterval(interval)
  }, [])

  function handleStart() {
    startTimeRef.current = Date.now()
    startGeneration()
  }

  const ex = generation.currentExample

  const REJECTION_REASONS = [
    'Wrong tag syntax', 'Missing VOICE tag', 'Bad NPC name',
    'Wrong length', 'Off genre', 'Poor quality', 'Other',
  ]
  const [rejectReason, setRejectReason] = useState('')
  const [rejectOther, setRejectOther] = useState('')

  async function handleAccept() {
    if (!ex?.id) return
    await window.tavern?.petricore?.updateExample(ex.id, { status: 'accepted' })
  }

  async function handleReject() {
    if (!ex?.id) return
    const reason = rejectReason === 'Other' ? rejectOther : rejectReason
    await window.tavern?.petricore?.updateExample(ex.id, { status: 'rejected', rejection_reason: reason })
    setRejectReason('')
    setRejectOther('')
  }

  return (
    <div className="h-full flex overflow-hidden">

      {/* Left: controls */}
      <div className="w-56 flex-shrink-0 border-r border-ink-800 bg-ink-900 flex flex-col p-4 gap-4 overflow-y-auto">
        <div className="flex justify-center">
          <ProgressRing pct={generation.progress} size={110} />
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-center text-xs font-ui">
          <Stat label="Generated" value={generation.generated} color="text-emerald-400" />
          <Stat label="Failed"    value={generation.failed}    color="text-rose-400" />
          <Stat label="Rejected"  value={generation.rejected}  color="text-amber-400" />
          <Stat label="Total"     value={plan.totalExamples}   color="text-parchment-400" />
        </div>

        {eta && (
          <p className="text-xs text-parchment-500 font-ui text-center">ETA {eta}</p>
        )}

        <div className="space-y-2">
          {!generation.running ? (
            <button onClick={handleStart}
              className="w-full flex items-center justify-center gap-2 py-2 rounded
                         bg-violet-600 hover:bg-violet-500 text-white text-sm font-ui transition-colors">
              <Play size={14} /> Start
            </button>
          ) : generation.paused ? (
            <button onClick={resumeGeneration}
              className="w-full flex items-center justify-center gap-2 py-2 rounded
                         bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-ui transition-colors">
              <Play size={14} /> Resume
            </button>
          ) : (
            <button onClick={pauseGeneration}
              className="w-full flex items-center justify-center gap-2 py-2 rounded
                         bg-amber-700 hover:bg-amber-600 text-white text-sm font-ui transition-colors">
              <Pause size={14} /> Pause
            </button>
          )}
          {generation.running && (
            <button onClick={stopGeneration}
              className="w-full flex items-center justify-center gap-2 py-2 rounded
                         bg-ink-700 hover:bg-ink-600 text-parchment-300 text-sm font-ui transition-colors">
              <Square size={14} /> Stop
            </button>
          )}
        </div>

        {/* Speed control */}
        <div>
          <p className="text-xs text-parchment-500 font-ui mb-1">Call delay (ms)</p>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={2000} step={100}
              value={generation.callDelay ?? 500}
              onChange={e => usePetricoreStore.getState().setGeneration({ callDelay: Number(e.target.value) })}
              className="flex-1 accent-violet-500"
            />
            <span className="text-xs text-parchment-400 w-10 text-right">{generation.callDelay ?? 500}ms</span>
          </div>
        </div>

        {generation.errors.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-rose-400 font-ui">Recent errors</p>
            {generation.errors.slice(-5).map((e, i) => (
              <p key={i} className="text-xs text-rose-300/70 break-words">{e}</p>
            ))}
          </div>
        )}
      </div>

      {/* Center: live preview */}
      <div className="flex-1 overflow-y-auto p-4">
        {!ex ? (
          <div className="h-full flex items-center justify-center text-parchment-600 text-sm font-ui">
            {generation.running ? 'Generating first example…' : 'Start generation to see live preview'}
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {/* Header */}
            <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-ui text-parchment-400">
                    Example #{generation.generated} — <span className="text-violet-300 capitalize">{ex.genre?.replace(/_/g, ' ')}</span>
                    {' '}— {ex.exchange_count} exchanges
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(ex.tags_present || []).map(tag => (
                      <span key={tag}
                        className={clsx('text-xs px-1.5 py-0.5 rounded border', TAG_COLORS[tag] || 'bg-zinc-600/20 text-zinc-300 border-zinc-500/30')}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-parchment-500 mt-1 font-ui">
                    NPCs: {(ex.npc_names || []).join(', ') || '—'} &nbsp;|&nbsp;
                    {ex.response_length_tier} &nbsp;|&nbsp; {ex.dialogue_structure?.replace(/_/g, ' ')}
                  </p>
                </div>
                {ex.has_errors && (
                  <span className="flex items-center gap-1 text-xs text-rose-400 shrink-0">
                    <AlertCircle size={12} /> Errors
                  </span>
                )}
              </div>
            </div>

            {/* Conversations */}
            {(ex.conversations || []).map((turn, i) => {
              if (turn.from === 'system') {
                return (
                  <div key={i} className="border border-ink-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setSystemOpen(s => !s)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-ink-800 text-xs font-ui text-parchment-500"
                    >
                      SYSTEM {systemOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {systemOpen && (
                      <div className="px-3 py-2 bg-ink-900 text-xs text-parchment-400 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {turn.value}
                      </div>
                    )}
                  </div>
                )
              }
              const iDm = turn.from === 'dm'
              return (
                <div key={i} className={clsx(
                  'border rounded-lg px-3 py-2.5',
                  iDm ? 'border-violet-500/20 bg-ink-900' : 'border-ink-700 bg-ink-800/50'
                )}>
                  <p className="text-xs font-ui text-parchment-500 mb-1 uppercase tracking-wide">
                    {turn.from === 'player' ? 'Player' : 'DM'}
                  </p>
                  <p className="text-sm text-parchment-200 leading-relaxed">
                    {iDm ? <HighlightedText text={turn.value} /> : turn.value}
                  </p>
                </div>
              )
            })}

            {/* Error callouts */}
            {ex.has_errors && (ex.error_messages || []).length > 0 && (
              <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg px-3 py-2">
                <p className="text-xs font-ui text-rose-400 mb-1">Validation errors</p>
                {ex.error_messages.map((e, i) => (
                  <p key={i} className="text-xs text-rose-300">{e}</p>
                ))}
              </div>
            )}

            {/* Accept / Reject */}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleAccept}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700/30 hover:bg-emerald-700/50
                           border border-emerald-600/40 text-emerald-300 text-xs font-ui transition-colors">
                <CheckCircle size={12} /> Accept
              </button>
              <button onClick={handleReject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-700/30 hover:bg-rose-700/50
                           border border-rose-600/40 text-rose-300 text-xs font-ui transition-colors">
                <XCircle size={12} /> Reject
              </button>
              {rejectReason === '' && (
                <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  className="text-xs bg-ink-800 border border-ink-700 rounded px-2 py-1
                             text-parchment-300 focus:outline-none focus:border-rose-500">
                  <option value="">Rejection reason…</option>
                  {REJECTION_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              )}
              {rejectReason === 'Other' && (
                <input value={rejectOther} onChange={e => setRejectOther(e.target.value)}
                  placeholder="Describe reason…"
                  className="text-xs bg-ink-800 border border-ink-700 rounded px-2 py-1
                             text-parchment-200 focus:outline-none focus:border-rose-500 flex-1"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: coverage */}
      <div className="w-56 flex-shrink-0 border-l border-ink-800 bg-ink-900 overflow-y-auto p-3 space-y-4">
        <p className="text-xs font-ui text-parchment-400 uppercase tracking-wide">Coverage</p>

        {/* Tag coverage */}
        <div className="space-y-1">
          {Object.entries(coverage.byTag || {}).map(([tag, data]) => (
            <div key={tag}>
              <div className="flex justify-between text-xs font-ui mb-0.5">
                <span className="text-parchment-400 truncate">{tag}</span>
                <span className="text-parchment-500 shrink-0 ml-1">{data.count}/{data.targetCount}</span>
              </div>
              <div className="bg-ink-700 rounded-full h-1">
                <div
                  className={clsx('h-1 rounded-full transition-all',
                    data.status === 'ok' ? 'bg-emerald-500' : data.status === 'low' ? 'bg-amber-500' : 'bg-rose-500')}
                  style={{ width: `${data.pct || 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {Object.keys(coverage.byGenre || {}).length > 0 && (
          <div>
            <p className="text-xs font-ui text-parchment-500 mb-1">Genre</p>
            <div className="space-y-0.5">
              {Object.entries(coverage.byGenre).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g, n]) => (
                <div key={g} className="flex justify-between text-xs">
                  <span className="text-parchment-400 truncate capitalize">{g.replace(/_/g, ' ')}</span>
                  <span className="text-parchment-500 ml-1">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.keys(coverage.byLength || {}).length > 0 && (
          <div>
            <p className="text-xs font-ui text-parchment-500 mb-1">Length</p>
            {Object.entries(coverage.byLength).map(([k, n]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-parchment-400 capitalize">{k}</span>
                <span className="text-parchment-500">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-ink-800 rounded p-1.5">
      <div className={clsx('text-base font-mono', color)}>{value}</div>
      <div className="text-parchment-600 text-xs">{label}</div>
    </div>
  )
}
