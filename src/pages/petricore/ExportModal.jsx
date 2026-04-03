import React, { useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import usePetricoreStore from '@/store/petricoreStore'
import { FORMAT_LABELS, defaultFilename } from '@/services/petricore/formatters'

const INCLUDE_OPTIONS = [
  { value: 'accepted',         label: 'Accepted only' },
  { value: 'accepted_pending', label: 'Accepted + Pending' },
  { value: 'all',              label: 'All examples' },
]

export default function ExportModal({ onClose }) {
  const { plan } = usePetricoreStore()
  const [format, setFormat]     = useState(plan.outputFormat || 'sharegpt')
  const [include, setInclude]   = useState('accepted')
  const [filename, setFilename] = useState(defaultFilename(plan.outputFormat))
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)

  async function handleExport() {
    if (!window.tavern?.petricore) return
    setLoading(true)
    setResult(null)
    try {
      const statusFilter = include === 'accepted' ? 'accepted'
        : include === 'accepted_pending' ? null
        : 'all'

      const filters = statusFilter ? { status: statusFilter } : { status: 'all' }
      const r = await window.tavern.petricore.getExamples({ ...filters, pageSize: 100000, page: 0 })
      let examples = r.rows || []

      if (include === 'accepted_pending') {
        examples = examples.filter(e => e.status !== 'rejected')
      }

      const folder = await window.tavern?.dialog?.openFolder()
      if (!folder) { setLoading(false); return }

      const out = await window.tavern.petricore.export({ examples, format, outputPath: folder, filename })
      if (out.ok) {
        setResult({ ok: true, path: out.path, count: out.count, removed: out.removed || 0 })
      } else {
        setResult({ ok: false, error: out.error })
      }
    } catch (err) {
      setResult({ ok: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-900 border border-ink-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
          <h2 className="text-sm font-ui text-parchment-200 flex items-center gap-2">
            <Download size={15} className="text-violet-400" />
            Export Dataset
          </h2>
          <button onClick={onClose} className="text-parchment-500 hover:text-parchment-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-ui text-parchment-500">Format</span>
            <select value={format} onChange={e => { setFormat(e.target.value); setFilename(defaultFilename(e.target.value)) }}
              className="input-field">
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-ui text-parchment-500">Include</span>
            <select value={include} onChange={e => setInclude(e.target.value)} className="input-field">
              {INCLUDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-ui text-parchment-500">Filename</span>
            <input value={filename} onChange={e => setFilename(e.target.value)} className="input-field" />
          </label>

          <p className="text-xs text-parchment-600 font-ui">
            Output folder will be selected via system dialog.
          </p>

          {result && (
            <div className={`px-3 py-2 rounded text-xs font-ui ${result.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
              {result.ok
                ? `✓ Exported ${result.count} examples${result.removed ? ` (${result.removed} purged by name filter)` : ''} → ${result.path}`
                : `Error: ${result.error}`}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-800">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={handleExport} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500
                       text-white text-sm font-ui transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {loading ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
