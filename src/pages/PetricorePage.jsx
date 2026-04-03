import React, { useState } from 'react'
import { FlaskConical, Sliders, Play, Table, Download } from 'lucide-react'
import clsx from 'clsx'
import usePetricoreStore from '@/store/petricoreStore'
import { isRunning } from '@/services/petricore/petricoreService'
import PlanBuilder from './petricore/PlanBuilder'
import Generation from './petricore/Generation'
import DatasetViewer from './petricore/DatasetViewer'
import ExportModal from './petricore/ExportModal'

const PAGES = [
  { id: 'plan',    label: 'Plan Builder',    Icon: Sliders },
  { id: 'gen',     label: 'Generation',      Icon: Play },
  { id: 'viewer',  label: 'Dataset Viewer',  Icon: Table },
]

export default function PetricorePage() {
  const [activePage, setActivePage] = useState('plan')
  const [exportOpen, setExportOpen] = useState(false)
  const { datasetName, setDatasetName, generation, coverage, plan } = usePetricoreStore()

  const statusLabel = generation.running && generation.paused ? 'Paused'
    : generation.running ? 'Generating'
    : generation.progress >= 100 ? 'Complete'
    : 'Idle'

  const statusColor = generation.running && !generation.paused
    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    : generation.paused
    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
    : generation.progress >= 100
    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    : 'bg-ink-700 text-parchment-400 border border-ink-600'

  function handleStartGeneration() {
    setActivePage('gen')
  }

  return (
    <div className="flex flex-col h-full bg-ink-950">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-ink-800 bg-ink-900">
        <FlaskConical size={18} className="text-violet-400 flex-shrink-0" />
        <input
          className="bg-transparent text-parchment-200 font-display text-sm tracking-wide outline-none
                     border-b border-transparent hover:border-ink-600 focus:border-violet-500 transition-colors
                     min-w-0 flex-1 max-w-xs"
          value={datasetName}
          onChange={e => setDatasetName(e.target.value)}
          spellCheck={false}
          title="Click to rename dataset"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-parchment-500 text-xs font-ui">
            {coverage.total.toLocaleString()} / {plan.totalExamples.toLocaleString()} examples
          </span>
          <span className={clsx('text-xs font-ui px-2 py-0.5 rounded-full', statusColor)}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-44 flex-shrink-0 bg-ink-900 border-r border-ink-800 flex flex-col py-3 gap-1">
          {PAGES.map(({ id, label, Icon }) => (
            <SidebarButton
              key={id}
              active={activePage === id}
              onClick={() => setActivePage(id)}
              Icon={Icon}
            >
              {label}
            </SidebarButton>
          ))}
          <div className="mt-auto px-3 pt-3 border-t border-ink-800">
            <SidebarButton
              active={false}
              onClick={() => setExportOpen(true)}
              Icon={Download}
            >
              Export
            </SidebarButton>
          </div>
        </nav>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {activePage === 'plan'   && <PlanBuilder onStartGeneration={handleStartGeneration} />}
          {activePage === 'gen'    && <Generation />}
          {activePage === 'viewer' && <DatasetViewer />}
        </div>
      </div>

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </div>
  )
}

function SidebarButton({ children, active, onClick, Icon }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2.5 px-3 py-2 mx-2 rounded text-xs font-ui text-left transition-colors',
        active
          ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
          : 'text-parchment-400 hover:text-parchment-200 hover:bg-ink-800'
      )}
    >
      <Icon size={14} className="flex-shrink-0" />
      {children}
    </button>
  )
}
