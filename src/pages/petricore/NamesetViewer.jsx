import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Trash2, RefreshCw, Users, List } from 'lucide-react'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenize(name) {
  return name.toLowerCase().split(/[\s\-_'.,]+/).filter(t => t.length > 1)
}

function buildClusters(names) {
  const map = new Map()
  for (const n of names) {
    for (const token of tokenize(n.name)) {
      if (!map.has(token)) map.set(token, [])
      map.get(token).push(n.id)
    }
  }
  return [...map.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([token, ids]) => ({ token, ids }))
}

const GENDERS = ['m', 'f', 'n']
const GENDER_LABEL = { m: 'M', f: 'F', n: '–' }
const GENDER_COLOR  = { m: 'text-sky-400', f: 'text-rose-400', n: 'text-parchment-500' }

// ── Main component ────────────────────────────────────────────────────────────

export default function NamesetViewer() {
  const [names, setNames]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [view, setView]           = useState('all')   // 'all' | 'clusters'
  const [search, setSearch]       = useState('')
  const [genderFilter, setGenderFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [editBuf, setEditBuf]     = useState({})
  const nameInputRef              = useRef(null)

  const load = useCallback(async () => {
    if (!window.tavern?.petricore) return
    setLoading(true)
    try {
      const rows = await window.tavern.petricore.getNames()
      setNames(Array.isArray(rows) ? rows : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Focus name input when editing starts
  useEffect(() => {
    if (editingId && nameInputRef.current) nameInputRef.current.focus()
  }, [editingId])

  // ── Edit helpers ─────────────────────────────────────────────────────────

  function startEdit(n) {
    setEditingId(n.id)
    setEditBuf({ name: n.name, gender: n.gender || 'n', cultural_origin: n.cultural_origin || '' })
  }

  async function commitEdit() {
    if (!editingId) return
    const updates = { ...editBuf }
    setNames(prev => prev.map(n => n.id === editingId ? { ...n, ...updates } : n))
    setEditingId(null)
    await window.tavern?.petricore?.updateName(editingId, updates)
  }

  function cancelEdit() { setEditingId(null) }

  async function deleteName(id, e) {
    e.stopPropagation()
    setNames(prev => prev.filter(n => n.id !== id))
    if (editingId === id) setEditingId(null)
    await window.tavern?.petricore?.deleteName(id)
  }

  function cycleGender(e) {
    e.stopPropagation()
    setEditBuf(prev => {
      const idx = GENDERS.indexOf(prev.gender)
      return { ...prev, gender: GENDERS[(idx + 1) % GENDERS.length] }
    })
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const clusters = useMemo(() => buildClusters(names), [names])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return names.filter(n => {
      if (genderFilter !== 'all' && n.gender !== genderFilter) return false
      if (q && !n.name.toLowerCase().includes(q) && !n.cultural_origin?.toLowerCase().includes(q)) return false
      return true
    })
  }, [names, search, genderFilter])

  const unusedCount = useMemo(() => names.filter(n => !n.use_count).length, [names])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-ink-950">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-800 bg-ink-900 flex-shrink-0">
        <span className="text-xs font-ui text-parchment-500">
          {names.length} names · {unusedCount} unused · {clusters.length} clusters
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <ViewToggle view={view} onChange={setView} />
        </div>

        {view === 'all' && (
          <>
            <select
              className="filter-select"
              value={genderFilter}
              onChange={e => setGenderFilter(e.target.value)}
            >
              <option value="all">All genders</option>
              <option value="m">Male</option>
              <option value="f">Female</option>
              <option value="n">Neutral</option>
            </select>
            <input
              className="input-field w-44 py-1 text-xs"
              placeholder="Search names…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </>
        )}

        <button
          className="p-1.5 rounded text-parchment-500 hover:text-parchment-200 hover:bg-ink-800 transition-colors"
          onClick={load}
          title="Reload"
        >
          <RefreshCw size={13} className={clsx(loading && 'animate-spin')} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && names.length === 0 ? (
          <div className="flex items-center justify-center h-full text-parchment-600 text-xs font-ui">
            Loading…
          </div>
        ) : view === 'all' ? (
          <AllNamesView
            names={filtered}
            editingId={editingId}
            editBuf={editBuf}
            nameInputRef={nameInputRef}
            onSelect={startEdit}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            onDelete={deleteName}
            onEditBuf={setEditBuf}
            onCycleGender={cycleGender}
          />
        ) : (
          <ClustersView
            names={names}
            clusters={clusters}
            editingId={editingId}
            editBuf={editBuf}
            nameInputRef={nameInputRef}
            onSelect={startEdit}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            onDelete={deleteName}
            onEditBuf={setEditBuf}
            onCycleGender={cycleGender}
          />
        )}
      </div>
    </div>
  )
}

// ── View toggle ───────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }) {
  return (
    <div className="flex items-center bg-ink-800 rounded p-0.5 gap-0.5">
      {[
        { id: 'all',      Icon: List,  label: 'All Names' },
        { id: 'clusters', Icon: Users, label: 'Clusters'  },
      ].map(({ id, Icon, label }) => (
        <button
          key={id}
          title={label}
          onClick={() => onChange(id)}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-ui transition-colors',
            view === id
              ? 'bg-violet-600/30 text-violet-300'
              : 'text-parchment-500 hover:text-parchment-300'
          )}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  )
}

// ── All Names view ────────────────────────────────────────────────────────────

function AllNamesView({ names, ...editProps }) {
  if (names.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-parchment-600 text-xs font-ui">
        No names match the current filter.
      </div>
    )
  }

  return (
    <div className="divide-y divide-ink-800/60">
      {names.map(n => (
        <NameRow key={n.id} name={n} {...editProps} />
      ))}
    </div>
  )
}

// ── Clusters view ─────────────────────────────────────────────────────────────

function ClustersView({ names, clusters, ...editProps }) {
  const nameById = useMemo(() => Object.fromEntries(names.map(n => [n.id, n])), [names])

  if (clusters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-parchment-600 text-xs font-ui">
        No clusters found — all names are unique.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5">
      {clusters.map(({ token, ids }) => {
        const members = ids.map(id => nameById[id]).filter(Boolean)
        return (
          <div key={token}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-ui font-semibold text-violet-400 uppercase tracking-wider">
                {token}
              </span>
              <span className="text-xs text-parchment-600 font-ui">×{members.length}</span>
              <div className="flex-1 h-px bg-ink-800" />
            </div>
            <div className="divide-y divide-ink-800/40 rounded border border-ink-800">
              {members.map(n => (
                <NameRow key={n.id} name={n} compact {...editProps} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Name row (shared by both views) ──────────────────────────────────────────

function NameRow({ name: n, compact = false, editingId, editBuf, nameInputRef,
                   onSelect, onCommit, onCancel, onDelete, onEditBuf, onCycleGender }) {
  const isEditing = editingId === n.id

  function handleKeyDown(e) {
    if (e.key === 'Enter')  { e.preventDefault(); onCommit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div
      onClick={() => !isEditing && onSelect(n)}
      className={clsx(
        'group flex items-center gap-3 px-4 transition-colors cursor-pointer select-none',
        compact ? 'py-1.5' : 'py-2.5',
        isEditing
          ? 'bg-violet-600/10 cursor-default'
          : 'hover:bg-ink-800/60'
      )}
    >
      {/* Gender badge — clickable when editing */}
      <button
        onClick={isEditing ? onCycleGender : e => { e.stopPropagation(); onSelect(n) }}
        title="Click to cycle gender"
        className={clsx(
          'w-5 text-center text-xs font-ui font-bold flex-shrink-0 transition-colors',
          isEditing ? GENDER_COLOR[editBuf.gender] + ' hover:opacity-70' : GENDER_COLOR[n.gender || 'n']
        )}
      >
        {isEditing ? GENDER_LABEL[editBuf.gender] : GENDER_LABEL[n.gender || 'n']}
      </button>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={nameInputRef}
            className="bg-transparent text-parchment-100 text-sm font-ui outline-none w-full
                       border-b border-violet-500 focus:border-violet-400 pb-px"
            value={editBuf.name}
            onChange={e => onEditBuf(prev => ({ ...prev, name: e.target.value }))}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm text-parchment-200 font-ui truncate block">{n.name}</span>
        )}
      </div>

      {/* Cultural origin */}
      <div className="w-32 flex-shrink-0 hidden sm:block">
        {isEditing ? (
          <input
            className="bg-transparent text-parchment-400 text-xs font-ui outline-none w-full
                       border-b border-ink-600 focus:border-violet-500 pb-px"
            value={editBuf.cultural_origin}
            placeholder="origin…"
            onChange={e => onEditBuf(prev => ({ ...prev, cultural_origin: e.target.value }))}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs text-parchment-500 font-ui truncate block">{n.cultural_origin || ''}</span>
        )}
      </div>

      {/* Use count */}
      <span className={clsx(
        'text-xs font-ui w-6 text-right flex-shrink-0',
        n.use_count > 0 ? 'text-parchment-500' : 'text-ink-600'
      )}>
        {n.use_count || 0}
      </span>

      {/* Delete */}
      <button
        onClick={e => onDelete(n.id, e)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-parchment-600
                   hover:text-crimson-400 hover:bg-crimson-500/10 transition-all flex-shrink-0"
        title="Delete name"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
