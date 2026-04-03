import React, { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import usePetricoreStore from '@/store/petricoreStore'

// ── Tag parsing ───────────────────────────────────────────────────────────────

function parseTaggedText(text) {
  // Matches [TAGNAME...] and for VOICE also captures the immediately-following "quoted dialogue"
  const TAG_RE = /(\[([A-Z_]+)[^\]]*\](?:"[^"]*")?)/g
  const segments = []
  let last = 0, m
  while ((m = TAG_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) })
    segments.push({ type: 'tag', tagName: m[2], value: m[1] })
    last = TAG_RE.lastIndex
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}

function TaggedText({ text }) {
  const segments = parseTaggedText(text)
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text'
          ? <span key={i}>{seg.value}</span>
          : <span key={i} className={clsx(
              'inline rounded px-1 mx-px text-xs font-mono font-medium',
              TAG_COLORS[seg.tagName] || 'bg-zinc-600/20 text-zinc-300'
            )}>
              {seg.value}
            </span>
      )}
    </>
  )
}

const TAG_COLORS = {
  VOICE:'bg-blue-500/20 text-blue-300', ROLL:'bg-amber-500/20 text-amber-300',
  FLAG:'bg-emerald-500/20 text-emerald-300', IMAGE:'bg-violet-500/20 text-violet-300',
  COMBAT:'bg-rose-500/20 text-rose-300', QUEST:'bg-teal-500/20 text-teal-300',
  QUEST_UPDATE:'bg-teal-500/15 text-teal-200', QUEST_DONE:'bg-teal-500/25 text-teal-300',
  LOCATION:'bg-sky-500/20 text-sky-300', NPC_UPDATE:'bg-indigo-500/20 text-indigo-300',
  LORE:'bg-purple-500/20 text-purple-300', ACT_ADVANCE:'bg-pink-500/20 text-pink-300',
  OOC:'bg-zinc-500/20 text-zinc-300', GAME_OVER:'bg-rose-600/25 text-rose-300',
  ROLL_RESULTS:'bg-amber-500/15 text-amber-200',
}

const ALL_TAGS = ['VOICE','NPC_UPDATE','ROLL','ROLL_RESULTS','IMAGE','FLAG','QUEST','QUEST_UPDATE',
  'QUEST_DONE','LOCATION','LORE','COMBAT','ACT_ADVANCE','OOC','GAME_OVER']

const STATUS_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'accepted',  label: 'Accepted' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'has_errors',label: 'Errors' },
]

const SORT_OPTIONS = [
  { value: 'created_at',          label: 'Created' },
  { value: 'genre',               label: 'Genre' },
  { value: 'exchange_count',      label: 'Exchanges' },
  { value: 'response_length_tier',label: 'Length' },
  { value: 'status',              label: 'Status' },
]

export default function DatasetViewer() {
  const { viewerFilters, setViewerFilters, setViewerPage, coverage, setCoverage } = usePetricoreStore()
  const [examples, setExamples] = useState([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [systemOpen, setSystemOpen] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [exportModal, setExportModal] = useState(null) // { scope }
  const [confirmClear, setConfirmClear] = useState(false)

  const fetchExamples = useCallback(async () => {
    if (!window.tavern?.petricore) return
    setLoading(true)
    try {
      const result = await window.tavern.petricore.getExamples(viewerFilters)
      setExamples(result.rows || [])
      setTotal(result.total || 0)
    } catch (err) {
      console.error('DatasetViewer fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [viewerFilters])

  useEffect(() => { fetchExamples() }, [fetchExamples])

  async function clearDataset() {
    await window.tavern?.petricore?.clearExamples()
    setExamples([])
    setTotal(0)
    setSelected(null)
    setConfirmClear(false)
    setCoverage({ total: 0, accepted: 0, rejected: 0, pending: 0, withErrors: 0,
                  byTag: {}, byGenre: {}, byLength: {}, byDialogue: {}, byStyle: {}, byExchange: {}, totalTokens: 0 })
  }

  async function handleStatusChange(id, status, reason) {
    await window.tavern?.petricore?.updateExample(id, { status, rejection_reason: reason || null })
    fetchExamples()
    if (selected?.id === id) setSelected(s => s ? { ...s, status, rejection_reason: reason } : null)
  }

  const totalPages = Math.ceil(total / viewerFilters.pageSize)
  const f = viewerFilters

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Filter bar */}
      <div className="flex-shrink-0 border-b border-ink-800 bg-ink-900 px-4 py-2 space-y-2">
        {/* Status tabs */}
        <div className="flex items-center gap-1">
          {STATUS_TABS.map(t => (
            <button key={t.key}
              onClick={() => setViewerFilters({ status: t.key })}
              className={clsx(
                'px-3 py-1 text-xs font-ui rounded transition-colors',
                f.status === t.key
                  ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
                  : 'text-parchment-500 hover:text-parchment-300 hover:bg-ink-800'
              )}
            >
              {t.label}
              {t.key !== 'all' && (
                <span className="ml-1 opacity-60">
                  {t.key === 'accepted' ? coverage.accepted
                   : t.key === 'rejected' ? coverage.rejected
                   : t.key === 'pending' ? coverage.pending
                   : t.key === 'has_errors' ? coverage.withErrors
                   : ''}
                </span>
              )}
            </button>
          ))}
          <button onClick={fetchExamples} className="ml-auto btn-ghost text-xs flex items-center gap-1">
            <RefreshCw size={11} className={clsx(loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Inline filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={f.genre || ''} onChange={e => setViewerFilters({ genre: e.target.value || null })}
            className="filter-select">
            <option value="">All genres</option>
            {Object.keys(usePetricoreStore.getState().plan.genres).map(g => (
              <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select value={f.responseLength || ''} onChange={e => setViewerFilters({ responseLength: e.target.value || null })}
            className="filter-select">
            <option value="">Any length</option>
            <option value="terse">Terse</option>
            <option value="normal">Normal</option>
            <option value="extended">Extended</option>
          </select>

          <select value={f.exchangeCount || ''} onChange={e => setViewerFilters({ exchangeCount: e.target.value ? Number(e.target.value) : null })}
            className="filter-select">
            <option value="">Any exchanges</option>
            {[2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <select value={f.dialogueStructure || ''} onChange={e => setViewerFilters({ dialogueStructure: e.target.value || null })}
            className="filter-select">
            <option value="">Any dialogue</option>
            <option value="none">No dialogue</option>
            <option value="single_one">Single NPC (one line)</option>
            <option value="single_multi">Single NPC (multi)</option>
            <option value="multi_npc">Multi-NPC</option>
            <option value="with_paralinguistic">With paralinguistic</option>
          </select>

          <input value={f.npcName || ''} onChange={e => setViewerFilters({ npcName: e.target.value || null })}
            placeholder="NPC name…"
            className="filter-select"
          />

          <select value={f.sortBy} onChange={e => setViewerFilters({ sortBy: e.target.value })}
            className="filter-select">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <button onClick={() => setViewerFilters({ sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' })}
            className="filter-select flex items-center gap-1">
            {f.sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* Body: list + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Example list */}
        <div className="w-72 flex-shrink-0 border-r border-ink-800 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="text-xs text-parchment-600 font-ui p-4">Loading…</p>}
            {!loading && examples.length === 0 && (
              <p className="text-xs text-parchment-600 font-ui p-4">No examples match the current filters.</p>
            )}
            {examples.map(ex => (
              <ExampleCard
                key={ex.id}
                ex={ex}
                active={selected?.id === ex.id}
                onClick={() => { setSelected(ex); setSystemOpen(false); setShowRaw(false) }}
              />
            ))}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t border-ink-800 text-xs font-ui text-parchment-500">
              <button onClick={() => setViewerPage(Math.max(0, f.page - 1))}
                disabled={f.page === 0} className="disabled:opacity-30 hover:text-parchment-200">‹ Prev</button>
              <span>{f.page + 1} / {totalPages}</span>
              <button onClick={() => setViewerPage(Math.min(totalPages - 1, f.page + 1))}
                disabled={f.page >= totalPages - 1} className="disabled:opacity-30 hover:text-parchment-200">Next ›</button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-parchment-600 text-sm font-ui">
              Select an example to inspect
            </div>
          ) : (
            <DetailPanel
              ex={selected}
              systemOpen={systemOpen}
              onToggleSystem={() => setSystemOpen(s => !s)}
              showRaw={showRaw}
              onToggleRaw={() => setShowRaw(s => !s)}
              onAccept={() => handleStatusChange(selected.id, 'accepted')}
              onReject={(reason) => handleStatusChange(selected.id, 'rejected', reason)}
              onUndo={() => handleStatusChange(selected.id, 'pending')}
            />
          )}
        </div>
      </div>

      {/* Footer bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-t border-ink-800 bg-ink-900">
        <div className="flex items-center gap-3">
          <span className="text-xs text-parchment-500 font-ui">
            {total.toLocaleString()} examples
            {f.status !== 'all' && ` (${f.status})`}
            {' / '}
            {coverage.total?.toLocaleString()} total
          </span>
          {(total > 0 || coverage.total > 0) && (
            confirmClear ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-ui text-parchment-400">Delete entire dataset?</span>
                <button onClick={clearDataset}
                  className="px-2 py-0.5 rounded text-xs font-ui bg-crimson-600 hover:bg-crimson-500 text-white transition-colors">
                  Yes, delete
                </button>
                <button onClick={() => setConfirmClear(false)}
                  className="px-2 py-0.5 rounded text-xs font-ui text-parchment-400 hover:text-parchment-200 hover:bg-ink-800 transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1 text-xs font-ui text-parchment-600
                           hover:text-crimson-400 hover:bg-crimson-500/10 px-2 py-0.5 rounded transition-colors">
                <Trash2 size={11} />
                Delete dataset
              </button>
            )
          )}
        </div>
        <div className="flex gap-2">
          <ExportButton label="Export accepted" scope="accepted" />
          <ExportButton label="Export filtered" scope="filtered" filters={viewerFilters} />
          <ExportButton label="Export all" scope="all" />
        </div>
      </div>
    </div>
  )
}

function ExampleCard({ ex, active, onClick }) {
  const dmTurns = (ex.conversations || []).filter(c => c.from === 'dm')
  const preview = dmTurns[0]?.value?.slice(0, 80) || ''

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-2.5 border-b border-ink-800 transition-colors',
        active ? 'bg-violet-900/20' : 'hover:bg-ink-800/50'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-ui text-parchment-400 capitalize">{ex.genre?.replace(/_/g, ' ')}</span>
        <StatusDot status={ex.status} hasErrors={ex.has_errors} />
      </div>
      <div className="flex flex-wrap gap-1 mb-1">
        {(ex.tags_present || []).slice(0, 4).map(tag => (
          <span key={tag} className={clsx('text-xs px-1 rounded', TAG_COLORS[tag] || 'bg-zinc-600/20 text-zinc-300')}>
            {tag}
          </span>
        ))}
        {(ex.tags_present || []).length > 4 && (
          <span className="text-xs text-parchment-600">+{ex.tags_present.length - 4}</span>
        )}
      </div>
      <p className="text-xs text-parchment-500 truncate">{preview || '—'}</p>
    </button>
  )
}

function StatusDot({ status, hasErrors }) {
  if (hasErrors) return <AlertCircle size={12} className="text-rose-400" />
  if (status === 'accepted') return <CheckCircle size={12} className="text-emerald-400" />
  if (status === 'rejected') return <XCircle size={12} className="text-rose-400" />
  return <span className="w-2 h-2 rounded-full bg-ink-600 inline-block" />
}

const REJECTION_REASONS = [
  'Wrong tag syntax', 'Missing VOICE tag', 'Bad NPC name',
  'Wrong length', 'Off genre', 'Poor quality', 'Other',
]

function DetailPanel({ ex, systemOpen, onToggleSystem, showRaw, onToggleRaw, onAccept, onReject, onUndo }) {
  const [reason, setReason] = useState('')
  const [reasonOther, setReasonOther] = useState('')

  return (
    <div className="space-y-3 max-w-2xl">
      {/* Metadata */}
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="grid grid-cols-3 gap-2 text-xs font-ui">
          <MetaItem label="Genre" value={ex.genre?.replace(/_/g, ' ')} />
          <MetaItem label="Exchanges" value={ex.exchange_count} />
          <MetaItem label="Length" value={ex.response_length_tier} />
          <MetaItem label="Style" value={ex.story_style?.replace(/_/g, ' ')} />
          <MetaItem label="Dialogue" value={ex.dialogue_structure?.replace(/_/g, ' ')} />
          <MetaItem label="Status" value={ex.status} />
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {(ex.tags_present || []).map(tag => (
            <span key={tag} className={clsx('text-xs px-1.5 py-0.5 rounded', TAG_COLORS[tag] || 'bg-zinc-600/20 text-zinc-300')}>
              {tag}
            </span>
          ))}
        </div>
        {ex.npc_names?.length > 0 && (
          <p className="text-xs text-parchment-500 mt-1">NPCs: {ex.npc_names.join(', ')}</p>
        )}
        {ex.rejection_reason && (
          <p className="text-xs text-rose-400 mt-1">Rejected: {ex.rejection_reason}</p>
        )}
      </div>

      {/* Conversations */}
      {(ex.conversations || []).map((turn, i) => {
        if (turn.from === 'system') return (
          <div key={i} className="border border-ink-700 rounded-lg overflow-hidden">
            <button onClick={onToggleSystem}
              className="w-full flex items-center justify-between px-3 py-2 bg-ink-800 text-xs font-ui text-parchment-500">
              SYSTEM PROMPT {systemOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {systemOpen && (
              <div className="px-3 py-2 bg-ink-900 text-xs text-parchment-400 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {turn.value}
              </div>
            )}
          </div>
        )
        return (
          <div key={i} className={clsx(
            'border rounded-lg px-3 py-2.5',
            turn.from === 'dm' ? 'border-violet-500/20 bg-ink-900' : 'border-ink-700 bg-ink-800/50'
          )}>
            <p className="text-xs font-ui text-parchment-500 mb-1 uppercase">{turn.from === 'player' ? 'Player' : 'DM'}</p>
            <div className="text-sm text-parchment-200 leading-relaxed whitespace-pre-wrap">
              {turn.from === 'dm' ? <TaggedText text={turn.value} /> : turn.value}
            </div>
          </div>
        )
      })}

      {/* Error list */}
      {ex.has_errors && (ex.error_messages || []).length > 0 && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg px-3 py-2">
          <p className="text-xs font-ui text-rose-400 mb-1">Validation errors</p>
          {ex.error_messages.map((e, i) => (
            <p key={i} className="text-xs text-rose-300">{e}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {ex.status !== 'accepted' && (
          <button onClick={onAccept}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700/30 hover:bg-emerald-700/50
                       border border-emerald-600/40 text-emerald-300 text-xs font-ui transition-colors">
            <CheckCircle size={12} /> Accept
          </button>
        )}
        {ex.status !== 'rejected' && (
          <>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="text-xs bg-ink-800 border border-ink-700 rounded px-2 py-1
                         text-parchment-300 focus:outline-none focus:border-rose-500">
              <option value="">Reject: reason…</option>
              {REJECTION_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
            {reason === 'Other' && (
              <input value={reasonOther} onChange={e => setReasonOther(e.target.value)}
                placeholder="Describe reason…"
                className="text-xs bg-ink-800 border border-ink-700 rounded px-2 py-1
                           text-parchment-200 focus:outline-none focus:border-rose-500 w-40"
              />
            )}
            {reason && (
              <button onClick={() => { onReject(reason === 'Other' ? reasonOther : reason); setReason('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-700/30 hover:bg-rose-700/50
                           border border-rose-600/40 text-rose-300 text-xs font-ui transition-colors">
                <XCircle size={12} /> Reject
              </button>
            )}
          </>
        )}
        {ex.status !== 'pending' && (
          <button onClick={onUndo}
            className="px-3 py-1.5 rounded bg-ink-700 hover:bg-ink-600 border border-ink-600
                       text-parchment-400 text-xs font-ui transition-colors">
            Undo
          </button>
        )}
        <button onClick={onToggleRaw}
          className="ml-auto px-2 py-1 text-xs font-ui text-parchment-500 hover:text-parchment-300 transition-colors">
          {showRaw ? 'Hide raw' : 'Show raw'}
        </button>
      </div>

      {showRaw && ex.raw_response && (
        <div className="border border-ink-700 rounded-lg p-3 bg-ink-900">
          <p className="text-xs font-ui text-parchment-500 mb-1">Raw LLM response</p>
          <pre className="text-xs text-parchment-400 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {ex.raw_response}
          </pre>
        </div>
      )}
    </div>
  )
}

function MetaItem({ label, value }) {
  return (
    <div>
      <span className="text-parchment-600">{label}: </span>
      <span className="text-parchment-300 capitalize">{value ?? '—'}</span>
    </div>
  )
}

function ExportButton({ label, scope, filters }) {
  const [loading, setLoading] = useState(false)
  const { plan } = usePetricoreStore()

  async function handleExport() {
    if (!window.tavern?.petricore) return
    setLoading(true)
    try {
      let examples = []
      if (scope === 'accepted') {
        const r = await window.tavern.petricore.getExamples({ status: 'accepted', pageSize: 100000, page: 0 })
        examples = r.rows || []
      } else if (scope === 'filtered' && filters) {
        const r = await window.tavern.petricore.getExamples({ ...filters, pageSize: 100000, page: 0 })
        examples = r.rows || []
      } else {
        const r = await window.tavern.petricore.getExamples({ status: 'all', pageSize: 100000, page: 0 })
        examples = r.rows || []
      }
      const folder = await window.tavern?.dialog?.openFolder()
      if (!folder) return
      const { defaultFilename } = await import('@/services/petricore/formatters')
      const filename = defaultFilename(plan.outputFormat)
      await window.tavern.petricore.export({ examples, format: plan.outputFormat, outputPath: folder, filename })
    } catch (err) {
      console.error('Export error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleExport} disabled={loading}
      className="px-2 py-1 text-xs font-ui rounded border border-ink-700 text-parchment-400
                 hover:border-violet-500 hover:text-violet-300 transition-colors disabled:opacity-40">
      {loading ? 'Exporting…' : label}
    </button>
  )
}
