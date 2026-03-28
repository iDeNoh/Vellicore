import React, { useEffect, useState } from 'react'
import { sessions as sessionDb, messages as messageDb } from '@/services/db/database'
import clsx from 'clsx'

export default function SessionHistory({ campaignId, onClose }) {
  const [sessionList, setSessionList] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId) return
    sessionDb.getByCampaign(campaignId)
      .then(list => {
        setSessionList(list)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [campaignId])

  const playSessions = sessionList.filter(s => s.type === 'play')
  const summaries = sessionList.filter(s => s.type === 'summary')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-ink-800 border border-ink-600 rounded-xl shadow-panel-lg w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <div>
            <h2 className="font-display text-lg text-parchment-100">Session History</h2>
            <p className="font-body text-xs text-parchment-400 mt-0.5">
              {playSessions.length} session{playSessions.length !== 1 ? 's' : ''} played
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Session list */}
          <div className="w-52 border-r border-ink-700 overflow-y-auto py-2 shrink-0">
            {loading && (
              <p className="px-4 py-4 text-xs text-parchment-500 font-ui">Loading…</p>
            )}
            {!loading && playSessions.length === 0 && (
              <p className="px-4 py-4 text-xs text-parchment-500 font-ui text-center">No sessions yet</p>
            )}
            {playSessions.map((session, i) => (
              <button key={session.id}
                onClick={() => setSelected(session)}
                className={clsx('w-full text-left px-3 py-2.5 border-b border-ink-700/50 transition-colors last:border-0',
                  selected?.id === session.id ? 'bg-ink-700' : 'hover:bg-ink-700/50'
                )}>
                <p className="font-ui text-xs text-parchment-200">
                  Session {playSessions.length - i}
                </p>
                <p className="font-body text-xs text-parchment-500 mt-0.5">
                  {formatDate(session.startedAt || session.createdAt)}
                </p>
                {session.location && (
                  <p className="font-body text-xs text-parchment-500 truncate">{session.location}</p>
                )}
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="flex-1 overflow-y-auto p-5">
            {selected ? (
              <SessionDetail session={selected} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  {/* Stats overview */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Sessions played" value={playSessions.length} />
                    <StatCard label="Summaries saved" value={summaries.length} />
                  </div>
                  {summaries.length > 0 && (
                    <div className="text-left space-y-3 mt-4">
                      <p className="font-display text-sm text-parchment-300">Campaign recaps</p>
                      {summaries.slice(0, 4).map(s => (
                        <div key={s.id} className="border-l-2 border-ink-600 pl-3">
                          <p className="font-body text-xs text-parchment-400 leading-relaxed">{s.summary}</p>
                          <p className="font-ui text-xs text-parchment-600 mt-1">{formatDate(s.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {playSessions.length === 0 && summaries.length === 0 && (
                    <p className="font-body text-sm text-parchment-500">Select a session to view details</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionDetail({ session }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg text-parchment-100">
          {formatDate(session.startedAt || session.createdAt)}
        </h3>
        {session.location && (
          <p className="font-body text-sm text-parchment-400">{session.location}</p>
        )}
        {session.act && (
          <p className="font-body text-xs text-parchment-500">Act {session.act}</p>
        )}
      </div>

      {session.summary && (
        <div className="panel p-4">
          <p className="label mb-2">Session summary</p>
          <p className="font-body text-sm text-parchment-300 leading-relaxed">{session.summary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {session.startedAt && <StatCard label="Started" value={formatTime(session.startedAt)} />}
        {session.endedAt && <StatCard label="Ended" value={formatTime(session.endedAt)} />}
        {session.messageCount > 0 && <StatCard label="Exchanges" value={session.messageCount} />}
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="panel p-3 text-center">
      <p className="font-display text-2xl text-parchment-100">{value}</p>
      <p className="font-ui text-xs text-parchment-400 mt-0.5">{label}</p>
    </div>
  )
}

function formatDate(ts) {
  if (!ts) return 'Unknown date'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
