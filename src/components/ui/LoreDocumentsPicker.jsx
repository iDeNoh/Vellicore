/**
 * LoreDocumentsPicker
 *
 * Manages a list of pending lore documents before a campaign exists.
 * Collects { id, name, type, content } objects and calls onChange(docs).
 * Actual DB save + indexing happens in the parent after campaign creation.
 */

import React, { useState } from 'react'
import clsx from 'clsx'

const RESOURCE_TYPES = [
  { value: 'lore',      label: 'Lore / Setting' },
  { value: 'adventure', label: 'Adventure / Module' },
  { value: 'rulebook',  label: 'Rulebook' },
  { value: 'character', label: 'Character Stories' },
  { value: 'text',      label: 'Other' },
]

export default function LoreDocumentsPicker({ docs = [], onChange }) {
  const [showAdd, setShowAdd] = useState(false)

  function remove(id) { onChange(docs.filter(d => d.id !== id)) }
  function add(doc)   { onChange([...docs, doc]); setShowAdd(false) }

  return (
    <div className="space-y-2">
      {docs.map(doc => {
        const typeLabel = RESOURCE_TYPES.find(t => t.value === doc.type)?.label || doc.type
        return (
          <div key={doc.id} className="flex items-center gap-2 px-3 py-2 rounded border border-ink-600 bg-ink-800">
            <div className="flex-1 min-w-0">
              <p className="font-ui text-xs text-parchment-200 truncate">{doc.name}</p>
              <p className="font-body text-xs text-parchment-500">{typeLabel} · {doc.content.length.toLocaleString()} chars</p>
            </div>
            <button onClick={() => remove(doc.id)} className="text-xs text-crimson-400 hover:text-crimson-300 shrink-0">✕</button>
          </div>
        )
      })}

      {showAdd ? (
        <PendingAddForm onAdd={add} onCancel={() => setShowAdd(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full py-2 rounded border border-dashed border-ink-600 text-xs text-parchment-500 hover:text-parchment-300 hover:border-ink-500 font-ui transition-colors"
        >
          + Add source document
        </button>
      )}
    </div>
  )
}

function PendingAddForm({ onAdd, onCancel }) {
  const [name, setName]       = useState('')
  const [type, setType]       = useState('lore')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!name) setName(file.name.replace(/\.[^.]+$/, ''))

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setError('')
      setLoading(true)
      try {
        const buffer = await file.arrayBuffer()
        const result = await window.tavern.fs.parsePdf(buffer)
        if (!result.ok) throw new Error(result.error || 'PDF extraction failed')
        setContent(result.text)
      } catch (err) {
        setError(`PDF error: ${err.message}`)
      } finally {
        setLoading(false)
      }
    } else {
      setContent(await file.text())
    }
  }

  function submit() {
    if (!name.trim())    { setError('Name is required.'); return }
    if (!content.trim()) { setError('Content is required.'); return }
    onAdd({ id: `pending_${Date.now()}`, name: name.trim(), type, content: content.trim() })
  }

  return (
    <div className="rounded border border-ink-600 bg-ink-800 p-3 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">Name</label>
          <input className="input text-sm" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Campaign Setting, Adventure Module…" />
        </div>
        <div className="w-36">
          <label className="label">Type</label>
          <select className="input text-sm" value={type} onChange={e => setType(e.target.value)}>
            {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Content</label>
          <label className={clsx('text-xs font-ui cursor-pointer', loading ? 'text-parchment-600' : 'text-parchment-500 hover:text-parchment-300')}>
            {loading ? 'Reading…' : 'Upload file (.txt, .md, .pdf)'}
            <input type="file" accept=".txt,.md,.pdf" className="hidden" onChange={handleFileUpload} disabled={loading} />
          </label>
        </div>
        <textarea className="input text-sm font-mono h-24 resize-none" value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Paste lore text, or upload a file above…" />
        {content && (
          <p className="text-xs text-parchment-500 mt-1 font-ui">{content.length.toLocaleString()} characters</p>
        )}
      </div>

      {error && <p className="text-xs text-crimson-400 font-ui">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className="btn-ghost text-sm flex-1" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="button" className="btn-secondary text-sm flex-1" onClick={submit} disabled={loading || !content.trim()}>
          Add Document
        </button>
      </div>
    </div>
  )
}
